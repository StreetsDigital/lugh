# Lugh Architecture

This document explains the Lugh directory structure and configuration system for developers contributing to or extending the remote-coding-agent.

## Overview

Lugh is the unified directory and configuration system for the remote-coding-agent. It provides:

1. **Consistent paths** across all platforms (Mac, Linux, Windows, Docker)
2. **Configuration precedence** chain (env > global > repo > defaults)
3. **Future-ready structure** for workflow engine and UI integration

## Directory Structure

### User-Level: `~/.lugh/`

```
~/.lugh/                    # LUGH_HOME
├── workspaces/               # Cloned repositories
│   └── owner/
│       └── repo/
├── worktrees/                # Git worktrees for isolation
│   └── repo-name/
│       └── branch-name/
└── config.yaml               # Global user configuration
```

**Purpose:**
- `workspaces/` - Repositories cloned via `/clone` command or GitHub adapter
- `worktrees/` - Isolated git worktrees created per conversation/issue/PR
- `config.yaml` - Non-secret user preferences

### Repo-Level: `.lugh/`

```
any-repo/.lugh/
├── commands/                 # Custom command templates
│   ├── plan.md
│   └── execute.md
├── workflows/                # Future: workflow definitions
│   └── pr-review.yaml
└── config.yaml               # Repo-specific configuration
```

**Purpose:**
- `commands/` - Slash command templates (priority over `.claude/commands/`, `.agents/commands/`)
- `workflows/` - Future workflow engine definitions
- `config.yaml` - Project-specific settings

### Docker: `/.lugh/`

In Docker containers, the Lugh home is fixed at `/.lugh/` (root level). This is:
- Mounted as a named volume for persistence
- Not overridable by end users (simplifies container setup)

## Path Resolution

All path resolution is centralized in `src/utils/lugh-paths.ts`.

### Core Functions

```typescript
// Get the Lugh home directory
getLughHome(): string
// Returns: ~/.lugh (local) or /.lugh (Docker)

// Get workspaces directory
getLughWorkspacesPath(): string
// Returns: ${LUGH_HOME}/workspaces

// Get worktrees directory
getLughWorktreesPath(): string
// Returns: ${LUGH_HOME}/worktrees

// Get global config path
getLughConfigPath(): string
// Returns: ${LUGH_HOME}/config.yaml

// Get command folder search paths (priority order)
getCommandFolderSearchPaths(): string[]
// Returns: ['.lugh/commands', '.claude/commands', '.agents/commands']
```

### Docker Detection

```typescript
function isDocker(): boolean {
  return (
    process.env.WORKSPACE_PATH === '/workspace' ||
    (process.env.HOME === '/root' && Boolean(process.env.WORKSPACE_PATH)) ||
    process.env.LUGH_DOCKER === 'true'
  );
}
```

### Platform-Specific Paths

| Platform | `getLughHome()` |
|----------|-------------------|
| macOS | `/Users/<username>/.lugh` |
| Linux | `/home/<username>/.lugh` |
| Windows | `C:\Users\<username>\.lugh` |
| Docker | `/.lugh` |

## Configuration System

### Precedence Chain

Configuration is resolved in this order (highest to lowest priority):

1. **Environment Variables** - Secrets, deployment-specific
2. **Global Config** (`~/.lugh/config.yaml`) - User preferences
3. **Repo Config** (`.lugh/config.yaml`) - Project-specific
4. **Built-in Defaults** - Hardcoded in `src/config/config-types.ts`

### Config Loading

```typescript
// Load merged config for a repo
const config = await loadConfig(repoPath);

// Load just global config
const globalConfig = await loadGlobalConfig();

// Load just repo config
const repoConfig = await loadRepoConfig(repoPath);
```

### Configuration Options

Key configuration options:

| Option | Env Override | Default |
|--------|--------------|---------|
| `LUGH_HOME` | `LUGH_HOME` | `~/.lugh` |
| Default AI Assistant | `DEFAULT_AI_ASSISTANT` | `claude` |
| Telegram Streaming | `TELEGRAM_STREAMING_MODE` | `stream` |
| Discord Streaming | `DISCORD_STREAMING_MODE` | `batch` |
| Slack Streaming | `SLACK_STREAMING_MODE` | `batch` |
| GitHub Streaming | `GITHUB_STREAMING_MODE` | `batch` |

## Command Folders

Command detection searches in priority order:

1. `.lugh/commands/` - Lugh-specific commands
2. `.claude/commands/` - Claude Code standard location
3. `.agents/commands/` - Alternative location

First match wins. No migration required.

## Extension Points

### Adding New Paths

To add a new managed directory:

1. Add function to `src/utils/lugh-paths.ts`:
```typescript
export function getLughNewPath(): string {
  return join(getLughHome(), 'new-directory');
}
```

2. Update Docker setup in `Dockerfile`
3. Update volume mounts in `docker-compose.yml`
4. Add tests in `src/utils/lugh-paths.test.ts`

### Adding Config Options

To add new configuration options:

1. Add type to `src/config/config-types.ts`:
```typescript
export interface GlobalConfig {
  // ...existing
  newFeature?: {
    enabled?: boolean;
    setting?: string;
  };
}
```

2. Add default in `getDefaults()` function
3. Use via `loadConfig()` in your code

## Design Decisions

### Why `~/.lugh/` instead of `~/.config/lugh/`?

- Simpler path (fewer nested directories)
- Follows Claude Code pattern (`~/.claude/`)
- Cross-platform without XDG complexity
- Easy to find and manage manually

### Why YAML for config?

- Bun has native support (via `yaml` package)
- Supports comments (unlike JSON)
- Future workflow definitions need YAML
- Human-readable and editable

### Why fixed Docker paths?

- Simplifies container setup
- Predictable volume mounts
- No user confusion about env vars in containers
- Matches convention (apps use fixed paths in containers)

### Why config precedence chain?

- Mirrors git config pattern (familiar to developers)
- Secrets stay in env vars (security)
- User preferences in global config (portable)
- Project settings in repo config (version-controlled)

## Future Considerations

### Workflow Engine

The `.lugh/workflows/` directory is reserved for:
- YAML workflow definitions
- Multi-step automated processes
- Agent orchestration rules

### UI Integration

The config type system is designed for:
- Future web UI configuration
- API-driven config updates
- Real-time config validation

### Multi-Tenant / SaaS

Path structure supports future scenarios:
- Per-user isolation
- Organization-level config
- Shared workflow templates
