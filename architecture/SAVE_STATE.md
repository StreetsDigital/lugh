# Save State / Checkpoint System

**Purpose:** Never lose progress. Restore to any point.

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CHECKPOINT                                    │
│                                                                      │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│   │   Git State │  │  DB Snapshot│  │ Agent State │                │
│   │             │  │             │  │             │                │
│   │ • Branch    │  │ • Tables    │  │ • Sessions  │                │
│   │ • Commit    │  │ • Rows      │  │ • Memory    │                │
│   │ • Worktrees │  │ • Metadata  │  │ • Context   │                │
│   └─────────────┘  └─────────────┘  └─────────────┘                │
│          │                │                │                         │
│          └────────────────┼────────────────┘                         │
│                           ▼                                          │
│                  ┌─────────────────┐                                │
│                  │  checkpoint.json │                                │
│                  │  + data files    │                                │
│                  └─────────────────┘                                │
│                           │                                          │
│                           ▼                                          │
│              ~/.lugh/checkpoints/{id}/                              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Checkpoint Contents

### checkpoint.json

```json
{
  "id": "chk_20241227_143022",
  "created_at": "2024-12-27T14:30:22Z",
  "trigger": "manual",
  "description": "Before major refactor",
  "environment": "staging",

  "git": {
    "branch": "develop",
    "commit": "abc123def",
    "dirty_files": ["src/index.ts"],
    "worktrees": [
      { "name": "issue-42", "branch": "fix/issue-42", "path": "/.lugh/worktrees/issue-42" }
    ]
  },

  "database": {
    "snapshot_file": "db_snapshot.sql",
    "tables": ["conversations", "sessions", "codebases"],
    "row_counts": {
      "conversations": 15,
      "sessions": 8,
      "codebases": 3
    }
  },

  "agents": {
    "active_count": 2,
    "sessions": [
      { "id": "sess_123", "conversation_id": "conv_456", "assistant_session_id": "claude_789" }
    ]
  },

  "knowledge": {
    "projects": ["my-app", "another-project"],
    "document_count": 42
  }
}
```

---

## Directory Structure

```
~/.lugh/checkpoints/
├── chk_20241227_143022/
│   ├── checkpoint.json       # Metadata
│   ├── db_snapshot.sql       # Full database dump
│   ├── git_bundle.bundle     # Git bundle of all branches
│   ├── worktrees.tar.gz      # Worktree contents
│   ├── agent_states.json     # Active agent contexts
│   └── knowledge_index.json  # RAG index snapshot
│
├── chk_20241227_120000/
│   └── ...
│
└── latest -> chk_20241227_143022  # Symlink to latest
```

---

## Commands

### Create Checkpoint

```
/checkpoint [description]

Examples:
/checkpoint
/checkpoint "Before adding Stripe"
/checkpoint "Working state after auth fix"
```

**Response:**

```
✅ Checkpoint created: chk_20241227_143022

Contents:
• Git: develop @ abc123d (2 dirty files)
• Database: 15 conversations, 8 sessions
• Agents: 2 active sessions
• Knowledge: 42 documents

Restore with: /restore chk_20241227_143022
```

### List Checkpoints

```
/checkpoints [limit]

Examples:
/checkpoints
/checkpoints 10
```

**Response:**

```
📁 Checkpoints (5 total):

1. chk_20241227_143022 (latest)
   "Before adding Stripe"
   2 hours ago | 15 conversations | develop @ abc123d

2. chk_20241227_120000
   "After auth fix"
   5 hours ago | 12 conversations | develop @ 789xyz

3. chk_20241226_180000
   Auto-checkpoint (end of day)
   1 day ago | 10 conversations | develop @ 456def

[Show more: /checkpoints 10]
```

### Restore Checkpoint

```
/restore <checkpoint_id> [--dry-run]

Examples:
/restore chk_20241227_143022
/restore chk_20241227_143022 --dry-run
```

**Dry Run Response:**

```
🔍 Restore Preview: chk_20241227_143022

Would restore:
• Git: Reset to abc123d (lose 3 commits)
• Database: Overwrite 15 conversations (current: 18)
• Agents: Terminate 2 active sessions
• Worktrees: Restore 1 worktree

⚠️ This will lose current state!
Proceed? Use: /restore chk_20241227_143022 --confirm
```

### Delete Checkpoint

```
/checkpoint-delete <checkpoint_id>
```

---

## Auto-Checkpoints

### Triggers

| Event                 | Auto-Checkpoint? | Retention |
| --------------------- | ---------------- | --------- |
| PR merged to main     | ✅ Yes           | 30 days   |
| End of day (midnight) | ✅ Yes           | 7 days    |
| Before major command  | ✅ Yes           | 24 hours  |
| Manual /checkpoint    | ✅ Yes           | Forever   |
| Every hour            | ❌ No            | -         |

### Before Major Commands

These commands auto-create checkpoint before running:

- `/restore` (before restoring)
- `/reset` (before clearing)
- `/worktree remove` (before deleting)
- Any destructive operation

---

## Implementation

### Create Checkpoint

```typescript
async function createCheckpoint(
  description?: string,
  trigger: 'manual' | 'auto' | 'pre-operation' = 'manual'
): Promise<Checkpoint> {
  const id = `chk_${formatTimestamp(new Date())}`;
  const dir = join(LUGH_HOME, 'checkpoints', id);

  await mkdir(dir, { recursive: true });

  // 1. Git state
  const gitState = await captureGitState();
  await exec(`git bundle create ${dir}/git_bundle.bundle --all`);

  // 2. Database snapshot
  await exec(`pg_dump ${DATABASE_URL} > ${dir}/db_snapshot.sql`);
  const dbStats = await getDatabaseStats();

  // 3. Agent states
  const agentStates = await captureAgentStates();
  await writeFile(`${dir}/agent_states.json`, JSON.stringify(agentStates));

  // 4. Worktrees
  await exec(`tar -czf ${dir}/worktrees.tar.gz ${LUGH_HOME}/worktrees`);

  // 5. Knowledge index (if using Lugh)
  const knowledgeState = await captureKnowledgeState();

  // 6. Write metadata
  const checkpoint = {
    id,
    created_at: new Date().toISOString(),
    trigger,
    description,
    git: gitState,
    database: dbStats,
    agents: agentStates,
    knowledge: knowledgeState,
  };

  await writeFile(`${dir}/checkpoint.json`, JSON.stringify(checkpoint, null, 2));

  // Update latest symlink
  await exec(`ln -sfn ${id} ${LUGH_HOME}/checkpoints/latest`);

  return checkpoint;
}
```

### Restore Checkpoint

```typescript
async function restoreCheckpoint(id: string, dryRun = false): Promise<RestoreResult> {
  const dir = join(LUGH_HOME, 'checkpoints', id);
  const checkpoint = JSON.parse(await readFile(`${dir}/checkpoint.json`, 'utf-8'));

  if (dryRun) {
    return previewRestore(checkpoint);
  }

  // Auto-checkpoint before restore
  await createCheckpoint('Pre-restore auto-save', 'pre-operation');

  // 1. Stop active agents
  await terminateAllAgents();

  // 2. Restore database
  await exec(`psql ${DATABASE_URL} < ${dir}/db_snapshot.sql`);

  // 3. Restore git state
  await exec(`git reset --hard ${checkpoint.git.commit}`);

  // 4. Restore worktrees
  await exec(`rm -rf ${LUGH_HOME}/worktrees`);
  await exec(`tar -xzf ${dir}/worktrees.tar.gz -C /`);

  // 5. Restore agent sessions
  const agentStates = JSON.parse(await readFile(`${dir}/agent_states.json`, 'utf-8'));
  await restoreAgentSessions(agentStates);

  return { success: true, checkpoint };
}
```

---

## Cleanup Policy

| Checkpoint Type | Retention | Max Count |
| --------------- | --------- | --------- |
| Manual          | Forever   | Unlimited |
| PR merged       | 30 days   | 50        |
| End of day      | 7 days    | 7         |
| Pre-operation   | 24 hours  | 10        |

### Cleanup Command

```
/checkpoint-cleanup [--dry-run]
```

Removes checkpoints according to retention policy.

---

## Edge Cases

### Large Databases

For DBs > 1GB:

- Use incremental backups
- Only store diff from previous checkpoint
- Compress heavily

### Active Operations

If checkpoint during active agent work:

- Wait for current tool to complete
- Capture mid-stream state
- Mark as "partial" in metadata

### Concurrent Checkpoints

- Queue checkpoint requests
- Only one checkpoint at a time
- Return existing if < 1 minute old

---

## Future: Time-Travel Debugging

```
/replay chk_20241227_143022

Bot: Entering replay mode for chk_20241227_143022
Bot: State restored. All actions are read-only.
Bot:
Bot: Available commands:
Bot: • /replay-step - Advance one action
Bot: • /replay-agents - Show agent states
Bot: • /replay-memory - Show memory at this point
Bot: • /replay-exit - Return to current state
```
