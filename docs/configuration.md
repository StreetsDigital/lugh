# Configuration Guide

Lugh supports a layered configuration system with sensible defaults, optional YAML config files, and environment variable overrides.

## Directory Structure

### User-Level (~/.lugh/)

```
~/.lugh/
├── workspaces/     # Cloned repositories
│   └── owner/repo/
├── worktrees/      # Git worktrees for isolation
│   └── repo-name/
│       └── branch-name/
└── config.yaml     # Global configuration (optional)
```

### Repository-Level (.lugh/)

```
.lugh/
├── commands/       # Custom command templates
│   └── plan.md
├── workflows/      # Future: workflow definitions
└── config.yaml     # Repo-specific configuration (optional)
```

## Configuration Priority

Settings are loaded in this order (later overrides earlier):

1. **Defaults** - Sensible built-in defaults
2. **Global Config** - `~/.lugh/config.yaml`
3. **Repo Config** - `.lugh/config.yaml` in repository
4. **Environment Variables** - Always highest priority

## Global Configuration

Create `~/.lugh/config.yaml` for user-wide preferences:

```yaml
# Default AI assistant
defaultAssistant: claude # or 'codex'

# Streaming preferences per platform
streaming:
  telegram: stream # 'stream' or 'batch'
  discord: batch
  slack: batch
  github: batch

# Custom paths (usually not needed)
paths:
  workspaces: ~/.lugh/workspaces
  worktrees: ~/.lugh/worktrees

# Concurrency limits
concurrency:
  maxConversations: 10
```

## Repository Configuration

Create `.lugh/config.yaml` in any repository for project-specific settings:

```yaml
# AI assistant for this project
assistant: claude

# Commands configuration
commands:
  folder: .lugh/commands
  autoLoad: true

# Worktree settings
worktree:
  baseBranch: main
```

## Environment Variables

Environment variables override all other configuration:

| Variable                       | Description                | Default       |
| ------------------------------ | -------------------------- | ------------- |
| `LUGH_HOME`                  | Base directory for Lugh  | `~/.lugh`   |
| `DEFAULT_AI_ASSISTANT`         | Default AI assistant       | `claude`      |
| `TELEGRAM_STREAMING_MODE`      | Telegram streaming         | `stream`      |
| `DISCORD_STREAMING_MODE`       | Discord streaming          | `batch`       |
| `SLACK_STREAMING_MODE`         | Slack streaming            | `batch`       |
| `GITHUB_STREAMING_MODE`        | GitHub streaming           | `batch`       |
| `MAX_CONCURRENT_CONVERSATIONS` | Concurrency limit          | `10`          |

## Docker Configuration

In Docker containers, paths are automatically set:

```
/.lugh/
├── workspaces/
└── worktrees/
```

Environment variables still work and override defaults.

## Command Folder Detection

When cloning or switching repositories, Lugh looks for commands in this priority order:

1. `.lugh/commands/` - Lugh-specific commands
2. `.claude/commands/` - Claude Code standard location
3. `.agents/commands/` - Alternative location

First found folder is used.

## Examples

### Minimal Setup (Using Defaults)

No configuration needed! Lugh works out of the box with:

- `~/.lugh/` for all managed files
- Claude as default AI assistant
- Platform-appropriate streaming modes

### Custom AI Preference

```yaml
# ~/.lugh/config.yaml
defaultAssistant: codex
```

### Project-Specific Settings

```yaml
# .lugh/config.yaml in your repo
assistant: claude
commands:
  autoLoad: true
```

### Docker with Custom Volume

```bash
docker run -v /my/data:/.lugh ghcr.io/dynamous-community/remote-coding-agent
```
