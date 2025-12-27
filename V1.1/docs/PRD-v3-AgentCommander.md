# AgentCommander V3 PRD
## Complete Technical Reference & Implementation Status

**Version:** 3.0
**Date:** December 2024
**Status:** Living Document
**Total Lines of Code:** ~8,582
**Total Source Files:** 37 TypeScript/JavaScript

---

## Executive Summary

AgentCommander is a **multi-agent AI orchestration platform** that coordinates 1-12 parallel Claude Code agents via Redis pub/sub messaging. It provides a "God-Tier" TypeScript orchestrator that manages task dispatch, verification, recovery, and escalation - ensuring reliable AI-assisted development at scale.

**Key Differentiator:** The orchestrator is deterministic TypeScript code (not AI), providing 100% reliable coordination while agents handle the creative coding work.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Tech Stack](#tech-stack)
3. [Component Inventory](#component-inventory)
4. [What's Built (Implemented)](#whats-built-implemented)
5. [What's Outstanding (Not Yet Implemented)](#whats-outstanding-not-yet-implemented)
6. [API Reference](#api-reference)
7. [Environment Variables](#environment-variables)
8. [Deployment Guide](#deployment-guide)
9. [Future Roadmap](#future-roadmap)

---

## System Architecture

### High-Level Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CONTROL SURFACES                                 │
│                                                                              │
│   [Telegram Bot]    [Slack Bot]    [Web Dashboard]    [Electron Desktop]    │
│        (v)              (-)             (partial)           (v)              │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ HTTP/WebSocket
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           GOD-TIER ORCHESTRATOR                               │
│                          (TypeScript - NOT AI)                                │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Task Queue  │  │ Pool Manager │  │ Verification │  │   Recovery   │     │
│  │  (Priority)  │  │  (1-12 Agents)│  │  (Git/Test)  │  │ (Retry/Esc) │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                       │
│  │  Swarm API   │  │ LLM Config   │  │   Telegram   │                       │
│  │  (REST)      │  │  (REST)      │  │ Integration  │                       │
│  └──────────────┘  └──────────────┘  └──────────────┘                       │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ Redis Pub/Sub
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                               REDIS MESSAGE BUS                               │
│                                                                              │
│  Channels:                                                                   │
│  ├── task:dispatch      (Orchestrator → Agents)                             │
│  ├── task:result        (Agents → Orchestrator)                             │
│  ├── agent:register     (Agent online notification)                         │
│  ├── agent:heartbeat    (Every 5 seconds)                                   │
│  ├── agent:status       (Task progress updates)                             │
│  ├── agent:tool-call    (Streaming tool calls)                              │
│  ├── control:stop       (Stop specific task)                                │
│  └── control:kill       (Terminate agent)                                   │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
          ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│     AGENT 1      │      │     AGENT 2      │      │     AGENT N      │
│                  │      │                  │      │                  │
│  ┌────────────┐  │      │  ┌────────────┐  │      │  ┌────────────┐  │
│  │ Claude SDK │  │      │  │ Claude SDK │  │      │  │ Claude SDK │  │
│  │    OR      │  │      │  │    OR      │  │      │  │    OR      │  │
│  │ LLM CLI    │  │      │  │ LLM CLI    │  │      │  │ LLM CLI    │  │
│  └────────────┘  │      └────────────┘  │      │  └────────────┘  │
│                  │      │                  │      │                  │
│  Worktree:       │      │  Worktree:       │      │  Worktree:       │
│  /worktrees/     │      │  /worktrees/     │      │  /worktrees/     │
│    agent-1/      │      │    agent-2/      │      │    agent-n/      │
└──────────────────┘      └──────────────────┘      └──────────────────┘
          │                         │                         │
          └─────────────────────────┴─────────────────────────┘
                                    │
                                    ▼
                    ┌────────────────────────────┐
                    │      SHARED VOLUME         │
                    │      /worktrees/           │
                    │                            │
                    │  (Git worktrees for        │
                    │   isolated development)    │
                    └────────────────────────────┘
```

### Data Flow

```
1. USER INPUT
   User sends message via Telegram/Slack/Web
              │
              ▼
2. CONTROL SURFACE
   Adapter receives message, validates user
              │
              ▼
3. ORCHESTRATOR
   - Parses task
   - Creates TaskInfo with priority
   - Finds available agent OR queues task
              │
              ▼
4. REDIS DISPATCH
   Publishes to task:dispatch channel
   Target: specific agent OR broadcast
              │
              ▼
5. AGENT EXECUTION
   - Agent receives task
   - Starts Claude Code session (or LLM CLI)
   - Streams tool calls back via agent:tool-call
   - Publishes result to task:result
              │
              ▼
6. VERIFICATION
   Orchestrator verifies externally:
   - git log (commits created?)
   - git diff (files changed?)
   - npm test (tests pass?)
   - tsc --noEmit (types valid?)
              │
              ▼
7. RECOVERY (if failed)
   - Attempt 1-3 with context hints
   - Escalate to human if all fail
              │
              ▼
8. COMPLETION
   Notify user via control surface
```

---

## Tech Stack

### Core Runtime & Build

| Technology | Version | Purpose |
|------------|---------|---------|
| **Bun** | 1.0+ | TypeScript-first JavaScript runtime |
| **TypeScript** | 5.3.0 | Type-safe development |
| **Node.js** | 18+ | Fallback runtime (via tsx) |

### Backend Services

| Technology | Version | Purpose |
|------------|---------|---------|
| **Express** | 5.2.1 | HTTP server, REST API |
| **Redis** | 4.7.0 | Pub/sub messaging, task queue |
| **PostgreSQL** | 16 | Persistent storage (via pg 8.13.3) |

### AI/LLM Integration

| Technology | Version | Purpose |
|------------|---------|---------|
| **Claude Agent SDK** | 0.1.57 | Claude Code agentic sessions |
| **llm CLI** | latest | Multi-provider CLI wrapper |

**Supported LLM Providers:**
- Claude (Anthropic) - via SDK and llm CLI
- OpenAI GPT-4/4o - via llm CLI
- Grok (xAI) - via llm CLI
- Ollama (local) - via llm CLI
- OpenRouter (aggregator) - via llm CLI
- Groq - via llm CLI
- Google Gemini - via llm CLI

### Control Surfaces

| Technology | Version | Purpose |
|------------|---------|---------|
| **Telegraf** | 4.16.0 | Telegram bot integration |
| **Electron** | 29.0.0 | Desktop application |
| **electron-builder** | 24.9.0 | App packaging |
| **electron-store** | 8.1.0 | Settings persistence |

### Development Tools

| Tool | Purpose |
|------|---------|
| **ESLint** | Linting |
| **Prettier** | Code formatting |
| **TypeScript Compiler** | Type checking |

---

## Component Inventory

### Directory Structure

```
V1.1/
├── orchestrator/                 # Main orchestration engine (5,100 LOC)
│   ├── index.ts                 # Entry point, Express server (228 lines)
│   ├── pool-manager.ts          # Agent pool lifecycle (583 lines)
│   ├── verification.ts          # External verification (352 lines)
│   ├── recovery.ts              # Failure handling (326 lines)
│   ├── swarm-api.ts             # REST API endpoints (461 lines)
│   ├── llm-config-api.ts        # LLM configuration (298 lines)
│   ├── telegram-integration.ts  # Telegram control (441 lines)
│   └── swarm/                   # Swarm subsystem
│       ├── index.ts             # Exports
│       ├── swarm-coordinator.ts # Main coordination (432 lines)
│       ├── agent-spawner.ts     # Dynamic provisioning (449 lines)
│       ├── task-decomposer.ts   # Task analysis (296 lines)
│       ├── result-synthesizer.ts# Result aggregation (365 lines)
│       ├── llm-providers.ts     # Provider config (684 lines) ← LARGEST
│       ├── role-configs.ts      # Agent roles (348 lines)
│       └── types.ts             # Type definitions (183 lines)
│
├── agent/                        # Agent workers (1,620 LOC)
│   ├── worker.ts                # Main agent loop (441 lines)
│   ├── claude-session.ts        # Claude SDK wrapper (233 lines)
│   ├── heartbeat.ts             # Health reporting (117 lines)
│   └── providers/               # LLM provider abstraction
│       ├── index.ts             # Exports (72 lines)
│       ├── factory.ts           # Provider factory (365 lines)
│       ├── claude-code-provider.ts # Claude SDK (221 lines)
│       ├── llm-cli-provider.ts  # CLI wrapper (380 lines)
│       └── types.ts             # Interfaces (156 lines)
│
├── redis/                        # Messaging layer (904 LOC)
│   ├── index.ts                 # Exports (10 lines)
│   ├── client.ts                # Connection management (309 lines)
│   ├── channels.ts              # Channel definitions (119 lines)
│   └── messages.ts              # Message types (466 lines)
│
├── electron/                     # Desktop application
│   ├── main.js                  # Electron main process
│   ├── preload.js               # IPC bridge
│   ├── renderer.js              # UI enhancements
│   ├── error.html               # Error fallback page
│   ├── package.json             # Electron config
│   └── assets/                  # Icons
│       ├── icon.icns            # macOS
│       ├── icon.ico             # Windows
│       └── icon.png             # Linux
│
├── public/                       # Static web assets
│   └── llm-config.html          # LLM configuration UI
│
├── src/utils/                    # Utilities
│   └── tool-formatter.ts        # Tool output formatting (185 lines)
│
├── docs/                         # Documentation
│   ├── PRD-v1.1-AgentCommander.md # Original PRD (41KB)
│   ├── ARCHITECTURE.md          # System architecture (18KB)
│   ├── LLM_PROVIDERS.md         # Provider reference (9.4KB)
│   └── PRD-v3-AgentCommander.md # THIS FILE
│
├── docker-compose.multi-agent.yml # Container orchestration
├── Dockerfile.orchestrator      # Orchestrator container
├── Dockerfile.agent             # Agent container
├── package.json                 # Root package config
├── tsconfig.json                # TypeScript config
└── README.md                    # Quick start guide
```

### File Statistics

| Category | Files | Lines of Code |
|----------|-------|---------------|
| Orchestrator Core | 7 | ~2,700 |
| Swarm Subsystem | 8 | ~2,400 |
| Agent Workers | 6 | ~1,600 |
| Redis Module | 4 | ~900 |
| Electron App | 4 | ~600 |
| Utilities | 1 | ~185 |
| **TOTAL** | **30** | **~8,400** |

---

## What's Built (Implemented)

### Core Orchestration

| Feature | Status | Files |
|---------|--------|-------|
| Task Queue (priority-based) | **DONE** | `orchestrator/pool-manager.ts` |
| Agent Pool (1-12 agents) | **DONE** | `orchestrator/pool-manager.ts` |
| Redis Pub/Sub Messaging | **DONE** | `redis/client.ts`, `redis/channels.ts` |
| Agent Registration | **DONE** | `agent/worker.ts` |
| Heartbeat Monitoring (5s) | **DONE** | `agent/heartbeat.ts` |
| Dead Agent Detection (15s) | **DONE** | `orchestrator/pool-manager.ts` |

### Verification Engine

| Feature | Status | Files |
|---------|--------|-------|
| Git Commit Verification | **DONE** | `orchestrator/verification.ts` |
| File Change Verification | **DONE** | `orchestrator/verification.ts` |
| Test Execution | **DONE** | `orchestrator/verification.ts` |
| Type Checking | **DONE** | `orchestrator/verification.ts` |

### Recovery System

| Feature | Status | Files |
|---------|--------|-------|
| Attempt Tracking (3 max) | **DONE** | `orchestrator/recovery.ts` |
| Failure Hint Extraction | **DONE** | `orchestrator/recovery.ts` |
| Context-Aware Retry | **DONE** | `orchestrator/recovery.ts` |
| Human Escalation | **DONE** | `orchestrator/recovery.ts` |

### Multi-LLM Support

| Feature | Status | Files |
|---------|--------|-------|
| Claude Code SDK Integration | **DONE** | `agent/providers/claude-code-provider.ts` |
| LLM CLI Integration | **DONE** | `agent/providers/llm-cli-provider.ts` |
| Provider Factory Pattern | **DONE** | `agent/providers/factory.ts` |
| Provider Configuration UI | **DONE** | `public/llm-config.html`, `orchestrator/llm-config-api.ts` |

### Swarm Coordination

| Feature | Status | Files |
|---------|--------|-------|
| Swarm Coordinator | **DONE** | `orchestrator/swarm/swarm-coordinator.ts` |
| Task Decomposer | **DONE** | `orchestrator/swarm/task-decomposer.ts` |
| Agent Spawner | **DONE** | `orchestrator/swarm/agent-spawner.ts` |
| Result Synthesizer | **DONE** | `orchestrator/swarm/result-synthesizer.ts` |
| Role Configurations | **DONE** | `orchestrator/swarm/role-configs.ts` |
| Swarm REST API | **DONE** | `orchestrator/swarm-api.ts` |

### Control Surfaces

| Feature | Status | Files |
|---------|--------|-------|
| Telegram Bot | **DONE** | `orchestrator/telegram-integration.ts` |
| Electron Desktop App | **DONE** | `electron/*` |
| Web UI (LLM Config) | **DONE** | `public/llm-config.html` |

### Infrastructure

| Feature | Status | Files |
|---------|--------|-------|
| Docker Compose Multi-Agent | **DONE** | `docker-compose.multi-agent.yml` |
| Orchestrator Container | **DONE** | `Dockerfile.orchestrator` |
| Agent Container | **DONE** | `Dockerfile.agent` |
| Health Check Endpoints | **DONE** | `orchestrator/index.ts` |

---

## What's Outstanding (Not Yet Implemented)

### High Priority

| Feature | Description | Effort |
|---------|-------------|--------|
| **Slack Adapter** | Port from V1.0 to V1.1 architecture | 2-3 days |
| **Discord Adapter** | Port from V1.0 to V1.1 architecture | 2-3 days |
| **Memory Layer** | Cross-session context (file-based + Graphiti) | 1 week |
| **Web Dashboard** | Real-time agent monitoring UI | 1-2 weeks |
| **QA Loop** | Automated test/fix cycles | 1 week |

### Medium Priority

| Feature | Description | Effort |
|---------|-------------|--------|
| **Browser Extension** | Chrome/Firefox agent control | 1-2 weeks |
| **WhatsApp Adapter** | Twilio integration | 3-5 days |
| **Auto-Scaling** | Scale agents based on queue depth | 3-5 days |
| **Cost Tracking** | Token usage per provider | 2-3 days |
| **User Authentication** | Multi-tenant support | 1 week |

### Low Priority / Future

| Feature | Description | Effort |
|---------|-------------|--------|
| **Billing Integration** | Stripe subscription + usage | 2 weeks |
| **GraphQL API** | Alternative to REST | 1 week |
| **Mobile App** | Native iOS/Android control | 4+ weeks |
| **Voice Control** | Siri/Alexa integration | 2+ weeks |

### Documentation Gaps

| Document | Status | Priority |
|----------|--------|----------|
| `.env.example` | **MISSING** | HIGH |
| `docs/SETUP.md` | **MISSING** | HIGH |
| `docs/REDIS_PROTOCOL.md` | **MISSING** | HIGH |
| `docs/API.md` | **MISSING** | HIGH |
| `docs/TROUBLESHOOTING.md` | **MISSING** | MEDIUM |
| `docs/DEVELOPMENT.md` | **MISSING** | MEDIUM |

---

## API Reference

### Health Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Basic health check |
| `/status` | GET | Detailed orchestrator status |

### LLM Configuration API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/llm/providers` | GET | List available providers |
| `/api/llm/providers` | POST | Configure a provider |
| `/api/llm/providers/:id` | PUT | Update provider config |
| `/api/llm/providers/:id` | DELETE | Remove provider |
| `/api/llm/default` | GET | Get default provider |
| `/api/llm/default` | PUT | Set default provider |

### Swarm API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/swarm/tasks` | GET | List all tasks |
| `/api/swarm/tasks` | POST | Create new task |
| `/api/swarm/tasks/:id` | GET | Get task status |
| `/api/swarm/tasks/:id/stop` | POST | Stop task |
| `/api/swarm/agents` | GET | List all agents |
| `/api/swarm/agents/:id` | GET | Get agent status |
| `/api/swarm/agents/:id/kill` | POST | Terminate agent |

### Redis Message Types

```typescript
// Task Dispatch (Orchestrator → Agent)
interface TaskDispatchMessage {
  taskId: string;
  taskType: 'planning' | 'implementation' | 'verification';
  priority: number;
  payload: {
    prompt: string;
    codebasePath: string;
    recoveryContext?: RecoveryContext;
  };
  targetAgentId: string | 'broadcast';
  timestamp: string;
}

// Task Result (Agent → Orchestrator)
interface TaskResultMessage {
  taskId: string;
  agentId: string;
  status: 'success' | 'failure';
  result: {
    commits?: string[];
    filesChanged?: string[];
    output?: string;
    error?: string;
  };
  duration: number;
  timestamp: string;
}

// Agent Heartbeat (Agent → Orchestrator)
interface AgentHeartbeatMessage {
  agentId: string;
  status: 'idle' | 'running' | 'error';
  currentTask?: string;
  resources: {
    memoryMB: number;
    cpuPercent: number;
  };
  timestamp: string;
}
```

---

## Environment Variables

### Required

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# AI Provider (at least one required)
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...    # Claude Code OAuth
# OR
ANTHROPIC_API_KEY=sk-ant-api03-...          # Anthropic API key

# Message Bus
REDIS_URL=redis://localhost:6379
```

### Control Surfaces (Optional)

```bash
# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_ALLOWED_USER_IDS=123456789,987654321
TELEGRAM_STREAMING_MODE=stream              # 'stream' or 'batch'

# Slack (not yet ported to V1.1)
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_ALLOWED_USER_IDS=U123456789

# Discord (not yet ported to V1.1)
DISCORD_BOT_TOKEN=...
DISCORD_ALLOWED_USER_IDS=123456789012345678
```

### Additional LLM Providers (Optional)

```bash
OPENAI_API_KEY=sk-...
XAI_API_KEY=xai-...
OPENROUTER_API_KEY=sk-or-v1-...
GROQ_API_KEY=gsk_...
GOOGLE_API_KEY=...
```

### Scaling & Timeouts

```bash
# Agent Pool
AGENT_COUNT=3                    # Default: 3, Max: 12
MAX_AGENTS=12                    # Hard limit

# Timeouts
TASK_TIMEOUT_MS=600000           # 10 minutes per task
HEARTBEAT_INTERVAL_MS=5000       # 5 seconds
HEARTBEAT_TIMEOUT_MS=15000       # 15 seconds (dead detection)
AGENT_IDLE_TIMEOUT_MS=300000     # 5 minutes before scale-down

# Server
PORT=3001                        # HTTP server port
NODE_ENV=development             # 'development' or 'production'
```

---

## Deployment Guide

### Development Mode (Recommended)

```bash
# Terminal 1: Start Redis and Postgres
docker-compose -f docker-compose.multi-agent.yml up -d redis postgres

# Terminal 2: Run orchestrator with hot reload
bun run dev

# Terminal 3: Run agent with hot reload (optional, for testing)
bun run dev:agent

# Terminal 4: Run Electron app
cd electron && npm run dev
```

### Docker Mode (Production-like)

```bash
# Start everything with 3 agents
docker-compose -f docker-compose.multi-agent.yml up -d

# Start with 12 agents
AGENT_COUNT=12 docker-compose -f docker-compose.multi-agent.yml up -d

# Scale dynamically
docker-compose -f docker-compose.multi-agent.yml up -d --scale agent=6

# View logs
docker-compose -f docker-compose.multi-agent.yml logs -f orchestrator
docker-compose -f docker-compose.multi-agent.yml logs -f agent

# Stop everything
docker-compose -f docker-compose.multi-agent.yml down
```

### Electron Desktop App

```bash
cd electron

# Development
npm run dev

# Build for macOS
npm run build:mac

# Build for Windows
npm run build:win

# Build for Linux
npm run build:linux
```

---

## Future Roadmap

### Phase 1: Platform Expansion (Q1 2025)
- [ ] Port Slack adapter to V1.1
- [ ] Port Discord adapter to V1.1
- [ ] Add WhatsApp via Twilio
- [ ] Complete web dashboard

### Phase 2: Intelligence Layer (Q1-Q2 2025)
- [ ] Memory layer (file-based + Graphiti)
- [ ] QA loop (automated test/fix)
- [ ] Cross-session context
- [ ] Failure pattern learning

### Phase 3: Productization (Q2 2025)
- [ ] User authentication
- [ ] Multi-tenant support
- [ ] Billing integration (Stripe)
- [ ] Usage analytics

### Phase 4: Scale & Polish (Q3 2025)
- [ ] Browser extension
- [ ] Auto-scaling based on load
- [ ] Performance optimization
- [ ] Enterprise features

---

## Key Design Decisions

### 1. TypeScript Orchestrator (Not AI)

**Why?** AI agents are unreliable for orchestration:
- They claim tasks complete when they're not
- They skip verification steps
- They don't track state reliably

TypeScript orchestrator provides:
- 100% reliable state management
- External verification (git, tests)
- Systematic recovery and escalation
- Predictable behavior

### 2. Redis Pub/Sub (Not HTTP/gRPC)

**Why?**
- Natural fit for event-driven architecture
- Low latency for heartbeats and streaming
- No service discovery needed
- Built-in persistence for task queue

### 3. Container Per Agent

**Why?**
- True isolation (one crash doesn't affect others)
- Resource limits (cap memory/CPU per agent)
- Independent scaling
- Clean restart for problematic agents

### 4. Git Worktrees for Isolation

**Why?**
- Each agent works in isolated branch
- No file conflicts between agents
- Easy cleanup (delete worktree)
- Standard git tooling

### 5. Multi-LLM Provider Support

**Why?**
- Cost optimization (use cheaper models for simple tasks)
- Rate limit handling (fallback to alternative)
- Specialization (coding vs analysis)
- Future-proofing

---

## Success Metrics

| Metric | V1.0 | V1.1 Target | V1.1 Actual |
|--------|------|-------------|-------------|
| Tasks completed without intervention | ~60% | 85%+ | TBD |
| False "done" claims caught | 0% | 95%+ | TBD |
| Recovery success rate | N/A | 70%+ | TBD |
| Mean time to escalation | N/A | <15 min | TBD |
| Parallel agents supported | 1 | 12 | 12 |
| Control surfaces | 1 | 5 | 3 |
| LLM providers supported | 1 | 8+ | 8+ |

---

## Changelog

### V3.0 (December 2024)
- Added Electron desktop application
- Added multi-LLM provider support (8+ providers)
- Added LLM configuration UI
- Added Swarm API
- Fixed ES module compatibility issues
- Created comprehensive V3 PRD

### V1.1 (November 2024)
- Multi-agent architecture (1-12 agents)
- Redis pub/sub coordination
- Verification engine
- Recovery manager
- Docker containerization

### V1.0 (October 2024)
- Single agent per conversation
- Telegram notifications
- Basic `/stop` control

---

*"Agents execute. Orchestrators verify. Humans approve."*
