# Lugh Repository Structure & Features

> Complete documentation of all folders, features, and capabilities in the Lugh Remote Agentic Coding Platform.

## Overview

**Lugh** (also known as **makewithLugh**) is a Remote Agentic Coding Platform that enables developers to control AI coding assistants (Claude Code SDK, Codex SDK) remotely from Telegram, Slack, Discord, and GitHub.

- **Runtime**: Bun + TypeScript
- **Database**: PostgreSQL
- **License**: MIT
- **Package Name**: `remote-coding-agent`

---

## Root Directory Structure

```
lugh/
├── src/                    # Main source code (22 directories, 135 files)
├── .claude/                # Claude Code integration (agents, commands, chains)
├── .agents/                # Agent reference docs, plans, examples
├── .lugh/                  # Lugh-specific config (AgentCommander bot)
├── docs/                   # Documentation (8 subdirectories)
├── migrations/             # Database schema (12 versions)
├── architecture/           # Architecture documentation
├── deploy/                 # Deployment templates
├── features/               # Feature tracking & backlogs
├── orchestration/          # Agent assignments & master TODO
├── prd/                    # Product Requirements Documents
├── scripts/                # Utility deployment scripts
├── langgraph-service/      # LangGraph integration service
│
├── docker-compose.yml      # Main compose (external-db & with-db profiles)
├── docker-compose.prod.yml # Production environment
├── docker-compose.staging.yml # Staging environment
├── docker-compose.cloud.yml   # Cloud deployment
├── docker-compose.claude.yml  # Claude Code integration
│
├── deploy.sh               # Main deployment script
├── deploy-agent-pool.sh    # Agent pool deployment
├── deploy-swarm-coordination.sh # Swarm coordination
├── dev-local.sh            # Local development
├── dev-full-stack.sh       # Full-stack development
│
├── CLAUDE.md               # Project instructions for AI
├── README.md               # Main documentation
├── CHANGELOG.md            # Version history
├── CONTRIBUTING.md         # Contribution guidelines
└── [config files]          # tsconfig, eslint, prettier, etc.
```

---

## Source Code (`src/`)

### Directory Breakdown

| Directory       | Purpose                      | Key Files                                             |
| --------------- | ---------------------------- | ----------------------------------------------------- |
| `adapters/`     | Platform integrations        | telegram.ts, slack.ts, discord.ts, test.ts            |
| `clients/`      | AI assistant clients         | claude.ts, codex.ts, langgraph.ts, factory.ts         |
| `orchestrator/` | Conversation management      | orchestrator.ts, abort-manager.ts, recovery.ts        |
| `handlers/`     | Slash command processing     | command-handler.ts                                    |
| `db/`           | Database operations          | connection.ts, conversations.ts, sessions.ts          |
| `types/`        | TypeScript definitions       | index.ts                                              |
| `config/`       | Configuration management     | config-loader.ts, features.ts                         |
| `utils/`        | Shared utilities             | variable-substitution.ts, path-validation.ts          |
| `isolation/`    | Worktree isolation           | providers/worktree.ts                                 |
| `agent/`        | Claude Agent SDK integration | claude-session.ts, heartbeat.ts, worker.ts            |
| `llm/`          | LLM provider selection       | providers.ts                                          |
| `api/`          | REST API endpoints           | llm-config.ts, llm-proxy.ts, swarm.ts                 |
| `services/`     | Business logic services      | cleanup-service.ts                                    |
| `pool/`         | Agent pool coordination      | agent-registry.ts, pool-coordinator.ts, task-queue.ts |
| `swarm/`        | Multi-agent swarm            | swarm-coordinator.ts, task-decomposer.ts              |
| `memory/`       | Memory & embedding system    | agent-memory.ts, embedding-provider.ts                |
| `redis/`        | Redis client & channels      | client.ts, channels.ts, messages.ts                   |
| `tools/`        | Tool/function registry       | function-tool.ts, registry.ts, toolkit.ts             |
| `scripts/`      | CLI scripts                  | setup-auth.ts, start-worker.ts                        |
| `test/`         | Test utilities               | setup.ts, mocks/                                      |

### Platform Adapters (`src/adapters/`)

```
adapters/
├── telegram.ts              # Telegram Bot API with polling
├── telegram-approvals.ts    # Approval workflow for Telegram
├── telegram-agent-approvals.ts
├── slack.ts                 # Slack Socket Mode adapter
├── discord.ts               # Discord.js WebSocket adapter
├── test.ts                  # HTTP test adapter for development
└── [*.test.ts files]        # Unit tests for each adapter
```

**Features:**

- All implement `IPlatformAdapter` interface
- Authorization via user ID whitelists
- Streaming mode support (stream vs batch)
- File sending (Telegram only)

### AI Clients (`src/clients/`)

```
clients/
├── claude.ts                # Claude Code SDK integration
├── codex.ts                 # OpenAI Codex SDK integration
├── langgraph.ts             # LangGraph service client
├── factory.ts               # Client factory with fallback support
└── [*.test.ts files]
```

**Supported Assistants:**

- Claude Code SDK (OAuth or API key)
- OpenAI Codex SDK (token-based)
- LangGraph (HTTP service)

### Agent Pool & Swarm (`src/pool/`, `src/swarm/`)

```
pool/
├── agent-registry.ts        # Agent registration & discovery
├── agent-worker.ts          # Worker thread management
├── pool-coordinator.ts      # Pool orchestration
├── task-queue.ts            # Task queue management
├── pubsub.ts                # Pub/sub messaging
└── types.ts

swarm/
├── swarm-coordinator.ts     # Multi-agent orchestration
├── task-decomposer.ts       # Break complex tasks into subtasks
├── agent-spawner.ts         # Spawn agents dynamically
├── result-synthesizer.ts    # Combine agent results
├── role-configs.ts          # Agent role definitions
└── telegram-swarm-coordinator.ts
```

**Capabilities:**

- Spawn multiple agents for parallel work
- Task decomposition and synthesis
- Redis-based pub/sub coordination
- Role-based agent configuration

### Memory System (`src/memory/`)

```
memory/
├── agent-memory.ts          # Agent memory management
├── embedding-provider.ts    # Vector embeddings
├── chat-history-block.ts    # Conversation history
├── vector-db-block.ts       # Vector database integration
└── types.ts
```

---

## Claude Code Integration (`.claude/`)

### Command Templates (34 commands)

```
.claude/commands/
├── core_piv_loop/           # Core PIV workflow
│   ├── prime.md             # Codebase research
│   ├── plan-feature.md      # Implementation planning
│   └── execute.md           # Execute plans
│
├── exp-piv-loop/            # Experimental PIV workflow (18 commands)
│   ├── plan.md              # Deep implementation planning
│   ├── implement.md         # Execute implementation
│   ├── commit.md            # Quick commit with natural language
│   ├── create-pr.md         # Create pull requests
│   ├── merge-pr.md          # Merge pull requests
│   ├── review-pr.md         # PR code review (basic)
│   ├── review-pr-full.md    # PR code review (comprehensive)
│   ├── rca.md               # Root cause analysis
│   ├── fix-rca.md           # Fix based on RCA
│   ├── fix-issue.md         # Fix GitHub issue end-to-end
│   ├── prd.md               # Product requirements document
│   ├── changelog-entry.md   # Add changelog entry
│   ├── changelog-release.md # Promote to release version
│   ├── release-notes.md     # Generate release notes
│   ├── release.md           # Create GitHub release
│   ├── worktree.md          # Parallel branch development
│   ├── worktree-cleanup.md  # Clean up worktrees
│   └── router.md            # Route to appropriate workflow
│
├── validation/              # Validation workflows (8 commands)
│   ├── code-review.ts
│   ├── code-review-fix.md
│   ├── system-review.md
│   ├── execution-report.md
│   ├── validate.md
│   └── ultimate_validate_command.md
│
├── github_bug_fix/          # GitHub issue fixing
│   ├── rca.md
│   └── implement-fix.md
│
├── create-prd.md
├── end-to-end-feature.md
└── review-doc.md
```

### Specialized AI Agents (59 agents)

```
.claude/agents/
├── adtech-*.md              # 9 adtech-focused agents
├── ai-*.md                  # 4 AI/ML agents (langchain, langgraph, rag, prompts)
├── arch-*.md                # 9 architecture agents
├── audit-*.md               # 12 audit agents (code, security, tests, etc.)
├── auto-*.md                # 4 automation agents (n8n, zapier, make, apify)
├── build-*.md               # 3 build agents (cicd, mcp, openapi)
├── infra-*.md               # 7 infrastructure agents
├── meta-*.md                # 3 meta agents (dispatcher, production-readiness)
├── perf-*.md                # 5 performance agents
└── security-*.md            # 3 security agents
```

**Agent Categories:**

| Category       | Count | Examples                               |
| -------------- | ----- | -------------------------------------- |
| Adtech         | 9     | prebid, bidder-manager, floors, fpd    |
| AI/ML          | 4     | langchain, langgraph, rag, prompts     |
| Architecture   | 9     | auction, automation, dashboard, ux     |
| Audit          | 12    | code, concurrency, security, tests     |
| Automation     | 4     | n8n, zapier, make, apify               |
| Build          | 3     | cicd, mcp, openapi                     |
| Infrastructure | 7     | docker, redis, supabase, observability |
| Meta           | 3     | dispatcher, production-readiness       |
| Performance    | 5     | cost, profiler, load-tests             |
| Security       | 3     | api, identity, privacy                 |

### Multi-Agent Chains (11 workflows)

```
.claude/chains/
├── bidder-build.yaml        # Build bidder adapters
├── docs-sprint.yaml         # Documentation sprint
├── full-audit.yaml          # Comprehensive codebase audit
├── mcp-build.yaml           # Build MCP servers
├── onboarding.yaml          # New developer onboarding
├── perf-analysis.yaml       # Performance analysis
├── pipeline-code-review.yaml
├── pipeline-coverage.yaml
├── pipeline-security.yaml
├── pr-review.yaml           # Pull request review
└── security-check.yaml      # Security verification
```

### Other Claude Directory Content

```
.claude/
├── GLOBAL_CLAUDE.md         # Global Claude instructions
├── AGENT_CATALOGUE.md       # Catalogue of all agents
├── AGENT_QUICKREF.md        # Quick reference
├── HOOKS.md                 # Session start hooks
├── SKILL_MAPPINGS.md        # Skill to command mappings
├── OUTPUT_ROUTING.md        # Output routing config
├── settings.json            # Claude Code settings
│
├── prompts/                 # Reusable prompts (12 templates)
│   ├── client-report.md
│   ├── debug-error.md
│   ├── document-api.md
│   ├── explain-codebase.md
│   ├── fix-bug.md
│   ├── performance.md
│   ├── pr-review.md
│   ├── quick-fix.md
│   ├── refactor.md
│   ├── write-spec.md
│   └── write-tests.md
│
├── knowledge/               # Knowledge base
│   └── nexus-engine.md
│
├── checkpoints/             # Audit checkpoints
│   ├── lugh-security_privacy.md
│   └── saas-security_privacy.md
│
└── templates/               # Project templates
    ├── mcp-python/
    ├── mcp-typescript/
    ├── n8n-workflow/
    ├── prebid-adapter/
    └── fastapi/
```

---

## Agent Reference (`.agents/`)

### Plans (Active & Completed)

```
.agents/plans/
├── [Active Plans - 7]
│   ├── 1-multi-repo-path-collision.plan.md
│   ├── 2-self-hosted-distribution.plan.md
│   ├── 3-slack-auto-worktree.plan.md
│   ├── amp-provider.plan.md
│   ├── state-management-stabilization.plan.md
│   ├── workflow-engine.plan.md
│   └── worktree-parallel-execution.plan.md
│
└── completed/               # 40+ completed plans
    ├── mvp-telegram-claude-platform.md
    ├── discord-adapter.plan.md
    ├── slack-adapter.plan.md
    ├── github-adapter-implementation.md
    ├── bun-migration.plan.md
    ├── codex-integration-second-ai-assistant.md
    ├── isolation-provider-abstraction.plan.md
    ├── worktree-per-conversation.plan.md
    └── [35+ more]
```

### Reference Documentation

```
.agents/reference/
├── new-features.md          # How to add new features
├── adding-ai-assistant-clients.md
├── adding-platform-adapters.md
├── command-system.md
├── database-schema.md
├── lugh-rules.md
├── streaming-modes.md
└── vps-provider-research-2025.md
```

### Example Implementations

```
.agents/examples/
├── claude-telegram-bot/     # Simple Claude + Telegram bot
│   ├── README.md
│   ├── CLAUDE.md
│   ├── docker-compose.yml
│   └── src/
│
└── codex-telegram-bot/      # Codex + Telegram implementation
    ├── README.md
    ├── docker-compose.yml
    ├── scripts/             # Setup scripts
    └── src/
        ├── bot/             # Bot commands & handlers
        ├── codex/           # Codex client
        ├── config/
        └── session/
```

---

## Documentation (`docs/`)

```
docs/
├── getting-started.md
├── configuration.md
├── deployment-setup.md
├── cloud-deployment.md
├── slack-setup.md
├── lugh-architecture.md
├── phone-vibecoding-v1.md
├── worktree-orchestration.md
├── worktree-orchestration-research.md
├── CONSOLIDATION_PLAN.md
├── SAAS_READINESS_PLAN.md
├── BRANCH_CATALOG.md
│
├── audits/                  # Security & privacy audits
│   ├── 2025-12-28-privacy-police.md
│   └── 2025-12-28-security-privacy.md
│
├── design/
│   └── autonomous-improvement-agents.md
│
└── feature-requests/
    ├── GITHUB_ISSUE_BODY.md
    ├── camel-ai-patterns.md
    └── camel-ecosystem-implementation-guide.md
```

---

## Database Migrations (`migrations/`)

```
migrations/
├── 000_combined.sql         # All migrations combined
├── 001_initial_schema.sql   # Initial tables
├── 002_command_templates.sql
├── 003_add_worktree.sql
├── 004_worktree_sharing.sql
├── 005_isolation_abstraction.sql
├── 006_isolation_environments.sql
├── 007_drop_legacy_columns.sql
├── 008_add_approvals_table.sql
├── 009_llm_configuration.sql
├── 010_agent_pool.sql
└── 011_memory_system.sql
```

**Core Tables:**

- `remote_agent_conversations` - Platform conversation tracking
- `remote_agent_codebases` - Repository metadata
- `remote_agent_sessions` - AI session persistence
- `remote_agent_command_templates` - Global command templates
- `remote_agent_isolation_environments` - Worktree isolation

**Extended Tables:**

- `remote_agent_approvals` - Approval workflow
- `remote_agent_llm_configurations` - LLM config storage
- `remote_agent_agent_pools` - Agent pool management
- `remote_agent_memory_*` - Memory & embedding system

---

## Key Features Summary

### 1. Multi-Platform Support

- **Telegram**: Bot API with polling, file sending, approval workflow
- **Slack**: Socket Mode with thread support
- **Discord**: Discord.js WebSocket with thread support
- **GitHub**: Webhooks with issue/PR comment detection
- **Test**: HTTP-based adapter for development

### 2. AI Assistant Integration

- Claude Code SDK (OAuth + API key)
- OpenAI Codex SDK
- LangGraph service integration
- Factory pattern with fallback support

### 3. Conversation Management

- Persistent sessions (survive restarts)
- Git worktree isolation per conversation
- Session recovery and context management
- Concurrency control with locks

### 4. Command System

- 12+ builtin slash commands
- Custom markdown commands with variable substitution
- Global workflow templates
- Variable support: `$1`, `$2`, `$ARGUMENTS`, `$PLAN`

### 5. Advanced Features

- **Approval Workflow**: Blocking approvals for high-risk operations
- **Streaming Modes**: Real-time or buffered delivery
- **Agent Pool**: Multi-agent coordination
- **Swarm System**: Task decomposition and synthesis
- **Memory System**: Vector embeddings and chat history

### 6. Development Tools

- Hot reload with `bun --watch`
- Comprehensive test suite
- ESLint + Prettier
- Type-safe strict TypeScript

---

## Statistics

| Metric                 | Count |
| ---------------------- | ----- |
| TypeScript Files       | 135   |
| Source Directories     | 22    |
| Command Templates      | 34    |
| AI Agents              | 59    |
| Multi-Agent Chains     | 11    |
| Database Migrations    | 12    |
| Docker Compose Configs | 5     |
| Documentation Files    | 40+   |
| Completed Plans        | 40+   |
| Prompt Templates       | 12    |
| Project Templates      | 5     |

---

## Related Names

- **Lugh**: Current project name
- **makewithLugh**: Alternative/previous name (referenced in audit documents)
- **remote-coding-agent**: NPM package name
