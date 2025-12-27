# AgentCommander V1.1
## Multi-Agent Architecture with Redis Coordination

This folder contains the V1.1 prototype: **12 parallel Claude Code agents** coordinated by a God-Tier orchestrator via Redis pub/sub.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      CONTROL SURFACES                            │
│         Telegram  │  Slack  │  Web Dashboard  │  Browser Ext    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │    ORCHESTRATOR   │  (1 container)
                    │                   │
                    │  • Task Queue     │
                    │  • Agent Pool     │
                    │  • Verification   │
                    │  • Recovery       │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │       REDIS       │  (message bus)
                    │                   │
                    │  • task:dispatch  │  ← orchestrator publishes
                    │  • task:result    │  ← agents publish
                    │  • agent:status   │  ← heartbeats
                    └─────────┬─────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
┌──────▼──────┐        ┌──────▼──────┐        ┌──────▼──────┐
│   AGENT 1   │        │   AGENT 2   │        │   AGENT N   │
│             │        │             │        │             │
│ • Claude SDK│        │ • Claude SDK│        │ • Claude SDK│
│ • Worktree  │        │ • Worktree  │        │ • Worktree  │
│ • Isolated  │        │ • Isolated  │        │ • Isolated  │
└─────────────┘        └─────────────┘        └─────────────┘
      │                      │                      │
      └──────────────────────┴──────────────────────┘
                    Shared Volume: /worktrees
```

---

## Quick Start

```bash
# From repo root
cd V1.1

# Start with 3 agents (default)
docker-compose -f docker-compose.multi-agent.yml up -d

# Start with 12 agents
AGENT_COUNT=12 docker-compose -f docker-compose.multi-agent.yml up -d

# Scale agents dynamically
docker-compose -f docker-compose.multi-agent.yml up -d --scale agent=6

# View logs
docker-compose -f docker-compose.multi-agent.yml logs -f orchestrator
docker-compose -f docker-compose.multi-agent.yml logs -f agent

# Stop everything
docker-compose -f docker-compose.multi-agent.yml down
```

---

## Directory Structure

```
V1.1/
├── README.md                      # This file
├── docker-compose.multi-agent.yml # Multi-container setup
├── Dockerfile.orchestrator        # Orchestrator container
├── Dockerfile.agent               # Agent container
│
├── orchestrator/                  # Orchestrator-specific code
│   ├── pool-manager.ts           # Manages agent pool via Redis
│   ├── task-queue.ts             # Priority queue for tasks
│   ├── verification.ts           # Verifies agent work (git, tests)
│   └── recovery.ts               # Handles failures, escalation
│
├── agent/                         # Agent worker code
│   ├── worker.ts                 # Main agent loop
│   ├── claude-session.ts         # Claude SDK wrapper
│   └── heartbeat.ts              # Reports status to orchestrator
│
├── redis/                         # Redis messaging layer
│   ├── client.ts                 # Redis connection
│   ├── channels.ts               # Channel definitions
│   └── messages.ts               # Message types
│
└── docs/
    ├── PRD-v1.1-AgentCommander.md # Full PRD
    ├── ARCHITECTURE.md            # Detailed architecture
    └── REDIS-PROTOCOL.md          # Message formats
```

---

## Redis Channels

| Channel | Publisher | Subscriber | Purpose |
|---------|-----------|------------|---------|
| `task:dispatch` | Orchestrator | Agents | New task assignment |
| `task:result` | Agent | Orchestrator | Task completion/failure |
| `agent:register` | Agent | Orchestrator | Agent comes online |
| `agent:heartbeat` | Agent | Orchestrator | Agent still alive |
| `agent:status` | Agent | Orchestrator | Current task status |
| `control:stop` | Orchestrator | Agent | Stop current task |
| `control:kill` | Orchestrator | Agent | Terminate agent |

---

## Environment Variables

```env
# Required
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...  # OAuth for Claude Max
DATABASE_URL=postgresql://...              # Postgres connection

# Optional - Control Surfaces
TELEGRAM_BOT_TOKEN=...
TELEGRAM_ALLOWED_USER_IDS=123456789
SLACK_BOT_TOKEN=...

# Scaling
AGENT_COUNT=3                              # Default agent count (1-12)

# Timeouts
TASK_TIMEOUT_MS=600000                     # 10 min per task
HEARTBEAT_INTERVAL_MS=5000                 # 5 sec heartbeat
AGENT_IDLE_TIMEOUT_MS=300000               # 5 min idle before scale down
```

---

## How It Works

### 1. Task Dispatch

```
User: "Add user authentication"
         │
         ▼
┌─────────────────┐
│   Orchestrator  │
│                 │
│ 1. Parse task   │
│ 2. Create entry │
│ 3. Find agent   │
│ 4. Publish task │
└────────┬────────┘
         │ Redis: task:dispatch
         ▼
┌─────────────────┐
│     Agent 3     │
│                 │
│ 1. Receive task │
│ 2. Run Claude   │
│ 3. Publish done │
└─────────────────┘
```

### 2. Verification

After agent claims "done":

```typescript
// Orchestrator verification (doesn't trust agent)
const verified = await verificationEngine.verify({
  claimedCommits: result.commits,
  claimedFiles: result.filesChanged,
  taskType: 'implementation'
});

// Checks:
// ✓ git log - did commits actually happen?
// ✓ git diff - did files actually change?
// ✓ npm test - do tests pass?
// ✓ tsc --noEmit - does it compile?
```

### 3. Recovery

```
Attempt 1: Agent fails
         │
         ▼
┌─────────────────┐
│ Recovery Manager│
│                 │
│ Record failure  │
│ Extract hints   │
│ Retry with ctx  │
└────────┬────────┘
         │
         ▼
Attempt 2: Agent fails again
         │
         ▼
Attempt 3: Agent fails
         │
         ▼
┌─────────────────┐
│   ESCALATION    │
│                 │
│ → Telegram msg  │
│ → Slack alert   │
│ → Dashboard     │
└─────────────────┘
```

---

## Comparison: V1.0 vs V1.1

| Feature | V1.0 | V1.1 |
|---------|------|------|
| Agents | 1 | 1-12 |
| Isolation | Shared process | Container per agent |
| Coordination | None | Redis pub/sub |
| Verification | Trust agent | External checks |
| Recovery | Manual | Automatic (3 attempts) |
| Memory | None | Dual-layer |
| Control | Telegram only | Multi-surface |

---

## Next Steps

See `docs/PRD-v1.1-AgentCommander.md` for full roadmap.
