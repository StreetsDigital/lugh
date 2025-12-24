# Claude Code Hooks

Pre-built hooks for common automation tasks.

## Available Hooks

| Hook | File | What It Does |
|------|------|--------------|
| **notify-complete.py** | Notification | macOS notification when Claude awaits input |
| **safety-check.sh** | PreToolUse/Bash | Blocks dangerous commands (rm -rf /, etc.) |
| **log-commands.sh** | PreToolUse/Bash | Logs all commands to ~/.claude/logs/commands.log |
| **auto-format.sh** | PostToolUse/Edit | Auto-formats Go, Python, TS/JS, JSON |
| **auto-test.sh** | PostToolUse/Edit | Runs tests when test files are edited |
| **session-context.sh** | SessionStart | Shows git status at session start |
| **slack-notify.sh** | Notification | Slack notification (needs webhook) |

## Quick Enable

1. Open Claude Code
2. Run `/hooks`
3. Add hooks from the menu

Or copy the config manually:

```bash
# Backup existing settings
cp ~/.claude/settings.json ~/.claude/settings.json.backup

# View recommended config
cat ~/.claude/hooks-config.json

# Copy hooks config (you'll need to review in /hooks menu)
cp ~/.claude/hooks-config.json ~/.claude/settings.json
```

**Important:** After editing settings.json directly, you must review changes in the `/hooks` menu before they take effect.

## Hook Details

### 🔔 notify-complete.py
Sends a macOS notification with sound when Claude stops and waits for input.

### 🛡️ safety-check.sh
Blocks dangerous commands before execution:
- `rm -rf /` and similar
- `mkfs.` commands
- Fork bombs
- Warns about DROP DATABASE, kubectl delete, etc.

Exit code 2 = block the action.

### 📝 log-commands.sh
Logs every bash command to `~/.claude/logs/commands.log`:
```
[2025-12-20 10:30:45] [~/myproject] ls -la | List files
```

### ✨ auto-format.sh
Auto-formats files after Claude edits them:
- `.go` → gofmt
- `.py` → ruff (or black)
- `.ts/.js/.tsx/.jsx` → prettier
- `.json` → jq

### 🧪 auto-test.sh
Runs tests when you edit test files:
- `*_test.go` → go test
- `test_*.py` / `*_test.py` → pytest
- `*.test.ts` / `*.spec.js` → npm test

### 📋 session-context.sh
Shows at session start:
- Git status (changed files)
- Recent commits
- Current branch

### 💬 slack-notify.sh
Sends Slack notification when Claude needs input.

**Setup:**
```bash
export CLAUDE_SLACK_WEBHOOK="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

## Custom Hooks

Create your own in `~/.claude/hooks/`:

```bash
#!/bin/bash
# my-hook.sh

# Read input JSON from stdin
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Do something
echo "Processing: $FILE_PATH"

# Exit codes:
# 0 = success, continue
# 1 = error (shown to user, continues)
# 2 = block the action
exit 0
```

Add to settings.json:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/my-hook.sh"
          }
        ]
      }
    ]
  }
}
```

## Hook Events

| Event | When It Fires |
|-------|---------------|
| `SessionStart` | When Claude Code starts |
| `UserPromptSubmit` | When you send a message |
| `PreToolUse` | Before a tool runs (can block) |
| `PostToolUse` | After a tool completes |
| `Notification` | When Claude awaits input |
| `Stop` | When Claude stops working |

## Environment Variables

Available in hooks:
- `CLAUDE_PROJECT_DIR` — Project root directory
- `CLAUDE_FILE_PATHS` — Files being operated on

## Troubleshooting

```bash
# Test a hook manually
echo '{"tool_input":{"command":"ls -la"}}' | ~/.claude/hooks/safety-check.sh

# Check logs
tail -f ~/.claude/logs/commands.log

# View current hooks config
cat ~/.claude/settings.json | jq '.hooks'
```
