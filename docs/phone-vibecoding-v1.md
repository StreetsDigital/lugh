# Phone Vibecoding V1

Control Claude Code from your phone. Get real-time visibility into what it's doing. Know when to `/stop`.

## Overview

Phone Vibecoding V1 gives you mobile visibility into Claude Code sessions:

- **Real-time tool streaming** - See each tool call as it happens (Read, Write, Edit, Bash, etc.)
- **CLI-like display** - Familiar terminal-style feedback with emojis and context
- **Session control** - Use `/stop` to abort a runaway session
- **OAuth authentication** - Uses your Claude Max subscription (no API billing)

## Setup

### 1. Generate OAuth Token

Run the setup command to generate a 1-year OAuth token:

```bash
claude setup-token
```

This outputs a token like:
```
sk-ant-oat01-XXXXXXXXXXXXXXX...
```

### 2. Configure Environment

Add to your `.env`:

```env
# OAuth token (uses Max subscription, no API billing)
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-your-token-here

# Telegram
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_STREAMING_MODE=stream

# Optional: Restrict to specific users
TELEGRAM_ALLOWED_USER_IDS=123456789
```

### 3. Start the Agent

```bash
# With Docker (production)
docker-compose --profile with-db up -d

# Or locally (development with hot reload)
docker-compose --profile with-db up -d postgres
bun run dev
```

## Tool Streaming

When Claude Code runs tools, you see real-time feedback:

```
⚡ **Bash**
└─ Install dependencies
`npm install`

📖 **Read**
└─ package.json

✏️ **Write**
└─ src/index.ts (42 lines)

🔧 **Edit**
└─ config.ts
   replacing: "old config↵value..."

🔍 **Glob**
└─ **/*.ts in /src

🔎 **Grep**
└─ "TODO" in /src

🤖 **Task**
└─ Explore: Find authentication files

📝 **TodoWrite**
  ✓ Setup database
  ○ Add API endpoints
  ○ Write tests
```

### Tool Icons

| Icon | Tool | Description |
|------|------|-------------|
| ⚡ | Bash | Shell commands |
| 📖 | Read | Reading files |
| ✏️ | Write | Creating files |
| 🔧 | Edit | Modifying files |
| 🔍 | Glob | File pattern search |
| 🔎 | Grep | Content search |
| 🤖 | Task | Sub-agent spawning |
| 📝 | TodoWrite | Task tracking |
| 🌐 | WebFetch | HTTP requests |

## Session Control

### `/stop` - Emergency Abort

Use `/stop` when Claude Code is doing something you don't want:

```
You: /stop
Bot: ⏹️ Session aborted.
```

Common reasons to stop:
- Wrong direction on implementation
- Running too long
- About to modify wrong files
- Excessive iterations on failed approach

### `/status` - Check Sessions

```
You: /status
Bot: **Active Sessions:**
     📊 Session abc12345
        Working directory: /project
        Duration: 5m 32s
```

## Why OAuth Instead of API Key?

| Feature | API Key | OAuth Token |
|---------|---------|-------------|
| Billing | Pay-per-use | Max subscription |
| Cost | $0.03+ per message | Included |
| Validity | Permanent | 1 year |
| Best for | One-off tasks | Heavy usage |

If you have a Claude Max subscription, OAuth is preferred - unlimited usage at no extra cost.

## Notification Mode vs Blocking Approvals

V1 uses **notification-only** mode. You see what Claude Code is doing, but it doesn't wait for approval.

**Why not blocking approvals?**

The Claude Agent SDK's internal stream management has timeouts that are shorter than human response time. If we block for approval, the SDK times out before you can respond.

Future versions may implement async approval with:
- Request queuing
- Batch approval (`/approve all`)
- Auto-approve for trusted operations

For now, use `/stop` if you see something you don't want.

## Best Practices

### 1. Start with Clear Prompts

Good prompts reduce the need for `/stop`:
```
"Add a logout button to the header. Only modify Header.tsx."
```

### 2. Watch the Tool Stream

The first few tool calls tell you if Claude is on the right track:
- Reading correct files?
- Looking in right directories?
- Understanding the codebase structure?

### 3. Stop Early

Don't wait for a bad implementation to complete. If tool calls look wrong, `/stop` and redirect.

### 4. Use Worktrees for Parallel Work

Git worktrees let you work on multiple features simultaneously without conflicts. Each worktree is an isolated checkout of the same repo on a different branch.

**Perfect for:**
- Multiple AI sessions working on independent features
- Reviewing PRs while continuing development
- Hotfixes that can't wait

```
# Create worktrees for parallel work
/worktree feature-auth
/worktree feature-dashboard

# List active worktrees
/worktree list

# Clean up after merging
/worktree cleanup merged
```

Each conversation gets isolated workspace under `~/.archon/worktrees/`. No conflicts between sessions.

**Recommended for codebases where features are independent.** Avoid for tightly coupled code where changes frequently conflict.

## Troubleshooting

### "Balance too low" Error

You're using an API key instead of OAuth token:
```bash
# Generate OAuth token
claude setup-token

# Update .env
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
# Remove or comment out:
# CLAUDE_API_KEY=sk-ant-api03-...
```

### No Tool Messages Appearing

Check streaming mode is enabled:
```env
TELEGRAM_STREAMING_MODE=stream
```

### Session Not Responding

Check if Claude Code is actually running:
```bash
docker-compose --profile with-db logs -f app-with-db
```

Look for errors in the logs.

### Container Not Picking Up Changes

Recreate the container:
```bash
docker-compose --profile with-db up -d --force-recreate app-with-db
```
