# V1.1 Architecture
## Multi-Agent Orchestration with Redis

---

## Overview

V1.1 introduces a **containerized multi-agent architecture** where:

1. **Orchestrator** (1 container) - The "God-Tier" that manages everything
2. **Agents** (1-12 containers) - Each runs an isolated Claude Code session
3. **Redis** - Message bus for coordination
4. **Postgres** - Persistent storage

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           CONTROL SURFACES                                │
│                                                                          │
│   📱 Telegram    💬 Slack    🌐 Web Dashboard    🔌 Browser Extension    │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │ HTTP/WebSocket
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                           ORCHESTRATOR                                    │
│                         (God-Tier Layer)                                  │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Task Queue  │  │ Pool Manager│  │ Verification│  │  Recovery   │     │
│  │  (Priority) │  │  (Agents)   │  │  (Git/Test) │  │  (Retry/Esc)│     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                                          │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │ Redis Pub/Sub
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                              REDIS                                        │
│                         (Message Bus)                                     │
│                                                                          │
│  Channels:                                                               │
│  ├── task:dispatch    (orchestrator → agents)                           │
│  ├── task:result      (agents → orchestrator)                           │
│  ├── agent:register   (agents → orchestrator)                           │
│  ├── agent:heartbeat  (agents → orchestrator, every 5s)                 │
│  ├── agent:tool-call  (agents → orchestrator, for streaming)            │
│  └── control:stop     (orchestrator → agents)                           │
│                                                                          │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
       ┌─────────────────────────┼─────────────────────────┐
       │                         │                         │
       ▼                         ▼                         ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│   AGENT 1    │          │   AGENT 2    │          │   AGENT N    │
│              │          │              │          │              │
│ ┌──────────┐ │          │ ┌──────────┐ │          │ ┌──────────┐ │
│ │ Claude   │ │          │ │ Claude   │ │          │ │ Claude   │ │
│ │ Code SDK │ │          │ │ Code SDK │ │          │ │ Code SDK │ │
│ └──────────┘ │          │ └──────────┘ │          │ └──────────┘ │
│              │          │              │          │              │
│ Worktree:    │          │ Worktree:    │          │ Worktree:    │
│ /worktrees/  │          │ /worktrees/  │          │ /worktrees/  │
│   agent-1/   │          │   agent-2/   │          │   agent-n/   │
└──────────────┘          └──────────────┘          └──────────────┘
       │                         │                         │
       └─────────────────────────┴─────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │    SHARED VOLUME       │
                    │    /worktrees/         │
                    │                        │
                    │  (Git worktrees for    │
                    │   isolated work)       │
                    └────────────────────────┘
```

---

## Component Details

### 1. Orchestrator

The orchestrator is **TypeScript code** (not an AI agent) that provides 100% reliable coordination.

**Why TypeScript, not an AI?**
- Agents are unreliable for orchestration
- They claim tasks are complete when they're not
- They skip verification steps
- They don't track state reliably

**Components:**

| Component | File | Purpose |
|-----------|------|---------|
| Pool Manager | `orchestrator/pool-manager.ts` | Track agents, dispatch tasks, monitor health |
| Verification | `orchestrator/verification.ts` | Verify git commits, test results, type checks |
| Recovery | `orchestrator/recovery.ts` | Track failures, provide hints, escalate |

### 2. Agent Workers

Each agent container runs:

| Component | File | Purpose |
|-----------|------|---------|
| Worker | `agent/worker.ts` | Main loop, message handling |
| Claude Session | `agent/claude-session.ts` | Claude SDK wrapper |
| Heartbeat | `agent/heartbeat.ts` | Send status every 5s |

**Lifecycle:**
```
1. Start → Connect to Redis
2. Register with orchestrator
3. Listen for task:dispatch
4. Receive task → Run Claude Code
5. Publish task:result
6. Goto 3 (idle) or shutdown
```

### 3. Redis Channels

| Channel | Direction | Message Type | Purpose |
|---------|-----------|--------------|---------|
| `task:dispatch` | Orch → Agent | TaskDispatchMessage | Assign task |
| `task:result` | Agent → Orch | TaskResultMessage | Report completion |
| `agent:register` | Agent → Orch | AgentRegisterMessage | Agent online |
| `agent:heartbeat` | Agent → Orch | AgentHeartbeatMessage | Still alive |
| `agent:status` | Agent → Orch | AgentStatusMessage | State change |
| `agent:tool-call` | Agent → Orch | ToolCallMessage | Tool streaming |
| `control:stop` | Orch → Agent | ControlStopMessage | Stop task |
| `control:kill` | Orch → Agent | ControlKillMessage | Terminate |

---

## Verification Flow

**Key Principle:** Don't trust agent claims. Verify externally.

```
Agent claims:
  "Created 2 commits, modified 3 files, tests pass"
                    │
                    ▼
┌──────────────────────────────────────────┐
│           VERIFICATION ENGINE            │
│                                          │
│  1. git rev-list --count HEAD            │
│     → Actually 2 new commits? ✓          │
│                                          │
│  2. git diff --name-only HEAD~1 HEAD     │
│     → Files actually changed? ✓          │
│                                          │
│  3. npm test                             │
│     → Tests actually pass? ✓             │
│                                          │
│  4. npx tsc --noEmit                     │
│     → Types valid? ✓                     │
└──────────────────────────────────────────┘
                    │
                    ▼
         All checks pass? → VERIFIED
         Any check fails? → RETRY with hints
```

---

## Recovery Flow

```
Attempt 1: Agent fails
         │
         ├── Record: error, approach, verification
         ├── Check: attempts < 3?
         │   YES → Retry with recovery context
         │
Attempt 2: Agent fails
         │
         ├── Record: error, approach, verification
         ├── Extract: failure patterns
         ├── Check: attempts < 3?
         │   YES → Retry with enhanced hints
         │
Attempt 3: Agent fails
         │
         ├── Record: error, approach, verification
         ├── Check: attempts < 3?
         │   NO → ESCALATE
         │
         ▼
┌──────────────────────────────────────────┐
│              ESCALATION                  │
│                                          │
│  Notify all control surfaces:            │
│  • Telegram: 🚨 Task failed 3 times      │
│  • Slack: @channel intervention needed   │
│  • Web: Dashboard alert                  │
│                                          │
│  Suggested actions:                      │
│  • Simplify task                         │
│  • Provide more context                  │
│  • Manual intervention                   │
└──────────────────────────────────────────┘
```

---

## Task Dispatch Flow

```
User: "Add user authentication"
         │
         ▼
┌─────────────────────────────────────────┐
│            CONTROL SURFACE              │
│  (Telegram/Slack/Web)                   │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│              ORCHESTRATOR               │
│                                         │
│  1. Parse task                          │
│  2. Create TaskInfo                     │
│  3. Find available agent                │
│     ├── Found? → Dispatch immediately   │
│     └── None?  → Add to priority queue  │
└────────────────────┬────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
    Agent found              Queue task
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│ Redis publish:  │    │ Redis ZADD:     │
│ task:dispatch   │    │ queue:tasks     │
│                 │    │ (sorted by      │
│ targetAgentId:  │    │  priority)      │
│ agent-3         │    │                 │
└────────┬────────┘    └────────┬────────┘
         │                      │
         ▼                      │
┌─────────────────┐             │
│    AGENT 3      │             │
│                 │             │
│ 1. Receive task │             │
│ 2. Acquire lock │             │
│ 3. Run Claude   │◄────────────┘
│ 4. Publish      │     (when agent
│    result       │      becomes idle)
└─────────────────┘
```

---

## Health Monitoring

**Heartbeat Check:**
```
Every 5 seconds:
┌─────────────────┐         ┌─────────────────┐
│    AGENT        │  ──→    │  ORCHESTRATOR   │
│                 │         │                 │
│ agent:heartbeat │         │ Update:         │
│ {               │         │ - lastHeartbeat │
│   agentId,      │         │ - status        │
│   status,       │         │ - resources     │
│   resources     │         │                 │
│ }               │         │                 │
└─────────────────┘         └─────────────────┘
```

**Dead Agent Detection:**
```
Every 15 seconds (HEARTBEAT_TIMEOUT_MS):
┌─────────────────────────────────────────────────┐
│              ORCHESTRATOR                       │
│                                                 │
│  for each agent:                                │
│    if (now - lastHeartbeat > 15s):             │
│      • Mark agent offline                       │
│      • Fail current task (if any)               │
│      • Remove from pool                         │
│      • Call onAgentDead handler                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Scaling

**Static Scaling (docker-compose):**
```bash
# Start with 6 agents
AGENT_COUNT=6 docker-compose -f docker-compose.multi-agent.yml up -d

# Scale up to 12
docker-compose -f docker-compose.multi-agent.yml up -d --scale agent=12

# Scale down to 3
docker-compose -f docker-compose.multi-agent.yml up -d --scale agent=3
```

**Dynamic Scaling (future):**
```typescript
// Orchestrator could implement:
if (queueLength > 10 && activeAgents < MAX_AGENTS) {
  // Spin up more agents
  await docker.scale('agent', activeAgents + 1);
}

if (queueLength === 0 && idleAgents > MIN_AGENTS) {
  // Scale down idle agents
  await killIdleAgent();
}
```

---

## File Structure

```
V1.1/
├── README.md                       # Quick start guide
├── docker-compose.multi-agent.yml  # Container orchestration
├── Dockerfile.orchestrator         # Orchestrator container
├── Dockerfile.agent                # Agent container
│
├── orchestrator/
│   ├── pool-manager.ts            # Agent pool management
│   ├── verification.ts            # External verification
│   └── recovery.ts                # Failure handling
│
├── agent/
│   ├── worker.ts                  # Main agent loop
│   ├── claude-session.ts          # Claude SDK wrapper
│   └── heartbeat.ts               # Status reporting
│
├── redis/
│   ├── client.ts                  # Redis connection + pub/sub
│   ├── channels.ts                # Channel definitions
│   └── messages.ts                # Message types
│
└── docs/
    ├── PRD-v1.1-AgentCommander.md # Full PRD
    ├── ARCHITECTURE.md            # This file
    └── REDIS-PROTOCOL.md          # Message specs
```

---

## Comparison: V1.0 vs V1.1

| Aspect | V1.0 | V1.1 |
|--------|------|------|
| **Agents** | 1 (in-process) | 1-12 (containers) |
| **Isolation** | Shared memory | Container per agent |
| **Crash impact** | Kills entire app | Only that agent dies |
| **Coordination** | None | Redis pub/sub |
| **Verification** | Trust agent | External checks |
| **Recovery** | Manual restart | Automatic retry (3x) |
| **Escalation** | None | Systematic to human |
| **Scaling** | N/A | docker-compose --scale |
| **Monitoring** | Logs only | Heartbeats + health checks |

---

## Key Design Decisions

### 1. Why Redis (not HTTP/gRPC)?

- **Pub/Sub natural fit** for event-driven architecture
- **Low latency** for heartbeats and tool streaming
- **No service discovery needed** - just subscribe to channels
- **Built-in persistence** for task queue (sorted sets)

### 2. Why Container per Agent?

- **True isolation** - one crash doesn't affect others
- **Resource limits** - can cap memory/CPU per agent
- **Independent scaling** - add/remove agents dynamically
- **Clean restart** - kill and recreate problematic agents

### 3. Why TypeScript Orchestrator (not AI)?

- **100% reliable** state management
- **Predictable** behavior
- **External verification** not dependent on AI claims
- **Systematic** recovery and escalation

### 4. Why Heartbeats (not polling)?

- **Agent-initiated** - agents know their own health
- **Immediate detection** - no waiting for poll interval
- **Low overhead** - small messages every 5s
- **Flexible** - can include progress, resources

---

## Future Enhancements

1. **Memory Layer** - Graphiti integration for cross-session context
2. **QA Loop** - Automated testing and fix cycles
3. **Web Dashboard** - Real-time agent monitoring
4. **Browser Extension** - Control claude.ai tabs
5. **Auto-scaling** - Scale agents based on queue depth
6. **Priority Queues** - Critical tasks jump the queue
