# MCP Client Integration for GitHub & AWS Access - Product Requirements & Plan

**Status:** Draft
**Owner:** Andrew Streets
**Created:** 2024-12-30
**Last Updated:** 2024-12-30

---

## Executive Summary

Enable Lugh to access GitHub (repos, PRs, commits) and AWS infrastructure (Lightsail, EC2) by implementing MCP client capabilities that connect to official GitHub and AWS MCP servers. This eliminates the need for custom integrations and leverages the growing MCP ecosystem.

---

## Problem Statement

### Current State

- Lugh runs in Docker container with no GitHub authentication configured
- `git push` operations fail with "fatal: could not read Username for 'https://github.com'"
- No ability to create PRs, manage repos, or interact with GitHub programmatically
- No access to AWS Lightsail instance or console for infrastructure management
- Users must manually push commits from local machine (outside Docker)
- Custom GitHub/AWS integrations would require significant maintenance overhead

### Desired State

- Lugh can push commits, create PRs, and manage GitHub repos directly from Docker container
- Lugh can access AWS Lightsail instance, manage infrastructure, view logs
- Authentication is centralized and secure (env vars, secrets management)
- Solution is extensible to other MCP servers (Linear, Slack, Jira, etc.)
- Zero custom integration code - leverage official MCP servers

### Success Criteria

- ✅ Lugh can `git push` commits to GitHub without manual intervention
- ✅ Lugh can create GitHub PRs via `gh` CLI or MCP tools
- ✅ Lugh can clone private repos, read files, search code
- ✅ Lugh can access AWS Lightsail instance metadata, logs, and console
- ✅ Authentication persists across container restarts
- ✅ MCP client framework supports adding future MCP servers

---

## Requirements

### Must Have (P0)

- [ ] MCP client implementation that can connect to external MCP servers
- [ ] GitHub MCP server integration with authentication
- [ ] Git push/pull/clone operations working
- [ ] GitHub PR creation via MCP tools
- [ ] AWS MCP server integration with IAM credentials
- [ ] AWS Lightsail instance access and management
- [ ] Secure credential storage (environment variables or secrets)
- [ ] Documentation for adding new MCP servers

### Should Have (P1)

- [ ] MCP server registry/discovery system
- [ ] Health checks for connected MCP servers
- [ ] Fallback behavior when MCP servers are unavailable
- [ ] Logging and monitoring for MCP operations
- [ ] Configuration validation on startup

### Nice to Have (P2)

- [ ] MCP server hot-reload (add servers without restart)
- [ ] Per-user MCP credentials (multi-tenant support)
- [ ] MCP operation caching for performance
- [ ] Web UI for managing connected MCP servers

### Non-Goals (Explicitly Out of Scope)

- Building custom GitHub API client (use MCP instead)
- Building custom AWS SDK wrappers (use MCP instead)
- OAuth flows for GitHub (use PAT for simplicity)
- Multi-cloud support beyond AWS (Azure, GCP can be added later via MCP)

---

## Technical Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Lugh Docker Container                     │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Lugh Core (src/index.ts)                  │ │
│  └────────────────┬───────────────────────────────────────┘ │
│                   │                                          │
│  ┌────────────────▼───────────────────────────────────────┐ │
│  │         MCP Client Manager (src/mcp/client.ts)         │ │
│  │  - Spawns/manages external MCP servers                 │ │
│  │  - Proxies MCP tools to Claude Code sessions           │ │
│  │  - Handles stdio communication (JSON-RPC 2.0)          │ │
│  └────┬─────────────────────────────────────────────┬─────┘ │
│       │                                             │        │
│       ▼                                             ▼        │
│  ┌─────────────────────────┐      ┌──────────────────────┐ │
│  │  GitHub MCP Server      │      │  AWS MCP Server      │ │
│  │  (stdio subprocess)     │      │  (stdio subprocess)  │ │
│  │  - git operations       │      │  - Lightsail mgmt    │ │
│  │  - PR/issue mgmt        │      │  - EC2 operations    │ │
│  │  - repo search          │      │  - CloudWatch logs   │ │
│  └─────────────────────────┘      └──────────────────────┘ │
│         │                                    │               │
└─────────┼────────────────────────────────────┼──────────────┘
          │                                    │
          ▼                                    ▼
   ┌──────────────┐                   ┌──────────────┐
   │ GitHub API   │                   │  AWS APIs    │
   │ (authenticated)                  │ (IAM creds)  │
   └──────────────┘                   └──────────────┘
```

### Database Changes

**New table: `mcp_servers`**

```sql
CREATE TABLE mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,              -- e.g., 'github', 'aws'
  command TEXT NOT NULL,                   -- e.g., 'npx -y @modelcontextprotocol/server-github'
  args JSONB DEFAULT '[]'::jsonb,         -- Command args
  env_vars JSONB DEFAULT '{}'::jsonb,     -- Environment variables for server
  status TEXT DEFAULT 'stopped',           -- 'running', 'stopped', 'error'
  enabled BOOLEAN DEFAULT true,
  last_health_check TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Example rows:
-- INSERT INTO mcp_servers (name, command, env_vars) VALUES
-- ('github', 'npx', '{"GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx"}'),
-- ('aws', 'npx', '{"AWS_ACCESS_KEY_ID": "AKIA...", "AWS_SECRET_ACCESS_KEY": "xxx"}');
```

### API Changes

No external API changes. Internal changes:

**New MCP Client Manager** (`src/mcp/client.ts`):

```typescript
export class MCPClientManager {
  private servers: Map<string, MCPServerProcess> = new Map();

  async startServer(config: MCPServerConfig): Promise<void>;
  async stopServer(name: string): Promise<void>;
  async callTool(serverName: string, toolName: string, args: any): Promise<any>;
  async listServers(): Promise<MCPServerInfo[]>;
  async healthCheck(serverName: string): Promise<boolean>;
}
```

**MCP Server Process Wrapper** (`src/mcp/server-process.ts`):

```typescript
export class MCPServerProcess {
  constructor(config: MCPServerConfig);
  async start(): Promise<void>; // Spawn stdio subprocess
  async stop(): Promise<void>; // Kill subprocess
  async request(method: string, params: any): Promise<any>; // JSON-RPC call
  on(event: 'error' | 'close', handler: Function): void;
}
```

### File Structure

```
src/
├── mcp/
│   ├── index.ts              # (existing) MCP server we built in FEAT-006
│   ├── server.ts             # (existing) Lugh as MCP server
│   ├── types.ts              # (existing) MCP protocol types
│   ├── client.ts             # NEW: MCP client manager
│   ├── server-process.ts     # NEW: Wrapper for stdio subprocess
│   ├── clients/              # NEW: Client-specific config
│   │   ├── github.ts         # GitHub MCP server config
│   │   ├── aws.ts            # AWS MCP server config
│   │   └── index.ts          # Registry of all clients
│   └── tools/
│       ├── health.ts         # (existing)
│       ├── sessions.ts       # (existing)
│       └── index.ts          # (existing)
├── migrations/
│   └── 003_mcp_servers.sql   # NEW: mcp_servers table
└── index.ts                  # Update to initialize MCP clients on startup
```

---

## Implementation Plan

### Phase 1: MCP Client Foundation

- [ ] Create `src/mcp/client.ts` - MCPClientManager class
- [ ] Create `src/mcp/server-process.ts` - stdio subprocess wrapper
- [ ] Implement JSON-RPC 2.0 client (inverse of our server from FEAT-006)
- [ ] Add database migration for `mcp_servers` table
- [ ] Unit tests for client manager and server process

### Phase 2: GitHub MCP Integration

- [ ] Install GitHub MCP server: `npm install @modelcontextprotocol/server-github`
- [ ] Create `src/mcp/clients/github.ts` config
- [ ] Add `GITHUB_PERSONAL_ACCESS_TOKEN` to Docker environment variables
- [ ] Configure git credential helper to use MCP GitHub tools
- [ ] Test: git clone private repo
- [ ] Test: git push to remote
- [ ] Test: create PR via MCP tool
- [ ] Documentation for GitHub token setup

### Phase 3: AWS MCP Integration

- [ ] Install AWS MCP server: `npm install @modelcontextprotocol/server-aws`
- [ ] Create `src/mcp/clients/aws.ts` config
- [ ] Add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` to Docker env
- [ ] Test: list Lightsail instances
- [ ] Test: read Lightsail instance metadata
- [ ] Test: tail CloudWatch logs
- [ ] Documentation for AWS IAM credentials setup

### Phase 4: Integration & Polish

- [ ] Update `src/index.ts` to auto-start MCP clients on Lugh startup
- [ ] Add health check endpoint that includes MCP server status
- [ ] Add logging for all MCP operations (debug mode)
- [ ] Error handling and retry logic for MCP calls
- [ ] Update CLAUDE.md with MCP client capabilities
- [ ] Update PRPs/ai_docs/ARCHITECTURE.md with MCP client section

---

## Testing Strategy

### Unit Tests

- [ ] `MCPClientManager.startServer()` spawns subprocess correctly
- [ ] `MCPClientManager.stopServer()` kills subprocess gracefully
- [ ] `MCPServerProcess.request()` sends valid JSON-RPC messages
- [ ] JSON-RPC response parsing handles errors correctly
- [ ] Server process restarts on crash (resilience)

### Integration Tests

- [ ] GitHub MCP: clone private repo via MCP tool
- [ ] GitHub MCP: push commit to test repo
- [ ] GitHub MCP: create PR with title and body
- [ ] GitHub MCP: search code across repos
- [ ] AWS MCP: list Lightsail instances
- [ ] AWS MCP: describe EC2 instance details
- [ ] AWS MCP: read CloudWatch log stream

### Manual Testing

- [ ] End-to-end: Make code change → commit → push → create PR (all via Lugh)
- [ ] End-to-end: Query AWS Lightsail instance status from Telegram
- [ ] Health check shows all MCP servers as "running"
- [ ] MCP server crashes are detected and logged
- [ ] Invalid credentials produce clear error messages

---

## Migration & Rollout

### Database Migrations

```sql
-- migrations/003_mcp_servers.sql
CREATE TABLE IF NOT EXISTS mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  command TEXT NOT NULL,
  args JSONB DEFAULT '[]'::jsonb,
  env_vars JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'stopped',
  enabled BOOLEAN DEFAULT true,
  last_health_check TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed GitHub and AWS MCP servers
INSERT INTO mcp_servers (name, command, args, env_vars) VALUES
  ('github', 'npx', '["@modelcontextprotocol/server-github"]'::jsonb, '{}'::jsonb),
  ('aws', 'npx', '["@modelcontextprotocol/server-aws"]'::jsonb, '{}'::jsonb)
ON CONFLICT (name) DO NOTHING;
```

### Deployment Steps

1. Add environment variables to Docker Compose / `.env`:
   ```env
   GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxxx
   AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxx
   AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   AWS_REGION=us-east-1
   ```
2. Install MCP server packages:
   ```bash
   npm install @modelcontextprotocol/server-github @modelcontextprotocol/server-aws
   ```
3. Run database migration: `bun run migrations/003_mcp_servers.sql`
4. Restart Lugh Docker container
5. Test health check: `curl http://localhost:2019/health` (should show MCP servers)
6. Test GitHub: Create a commit and push from Telegram
7. Test AWS: Query Lightsail instance status from Telegram

### Rollback Plan

1. Stop Docker container
2. Remove environment variables (`GITHUB_PERSONAL_ACCESS_TOKEN`, `AWS_*`)
3. Revert to previous Docker image (without MCP client code)
4. Database rollback (drop `mcp_servers` table if necessary, but not critical)

---

## Dependencies

### Requires

- **FEAT-006 (MCP Server)**: Must be complete (we reuse types.ts and JSON-RPC logic)
- **Node.js/Bun**: Runtime for MCP servers (already available)
- **npm/npx**: To run official MCP servers via `npx`
- **GitHub Personal Access Token**: User must generate PAT with `repo`, `workflow` scopes
- **AWS IAM Credentials**: User must create IAM user with EC2/Lightsail permissions

### Blocks

- None (this is a standalone feature)

---

## Risks & Mitigations

| Risk                                  | Impact | Likelihood | Mitigation                                                    |
| ------------------------------------- | ------ | ---------- | ------------------------------------------------------------- |
| GitHub token leaked in logs/errors    | High   | Medium     | Sanitize all log output, use `***` masking for tokens         |
| AWS credentials compromised           | High   | Medium     | Use IAM roles with minimal permissions, rotate keys regularly |
| MCP server crashes repeatedly         | Medium | Low        | Implement auto-restart with backoff, health checks            |
| Subprocess communication deadlock     | Medium | Low        | Add timeouts to all JSON-RPC calls, log hanging requests      |
| `npx` package installation slow/fails | Low    | Medium     | Pre-install packages in Docker image, use local cache         |
| MCP protocol version mismatch         | Low    | Low        | Pin MCP server versions in package.json, test upgrades        |

---

## Open Questions

- [ ] Should we support per-user GitHub tokens (multi-tenant)? Or one shared "Lugh bot" account?
- [ ] Do we need GitHub App instead of PAT for better security/rate limits?
- [ ] Should MCP servers be started on-demand (lazy) or all at startup?
- [ ] How do we handle MCP server updates? Auto-update via `npx -y` or pin versions?
- [ ] Should we expose MCP client operations via Lugh's own MCP server (meta-MCP)?
- [ ] Do we need a web UI for managing MCP servers, or is database config sufficient?

---

## References

- **MCP Specification**: https://spec.modelcontextprotocol.io/
- **GitHub MCP Server**: https://github.com/modelcontextprotocol/servers/tree/main/src/github
- **AWS MCP Server**: https://github.com/modelcontextprotocol/servers/tree/main/src/aws
- **FEAT-006 (MCP Server)**: @PRPs/features/FEAT-006-docs-restructure-mcp-server.md
- **Architecture**: @PRPs/ai_docs/ARCHITECTURE.md
- **Database**: @PRPs/ai_docs/DATABASE_SCHEMA.sql
