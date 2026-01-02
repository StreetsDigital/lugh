# CAMEL Ecosystem: Implementation Guide for Lugh

**Date**: 2025-12-30
**Research Sources**: OWL, CRAB, OASIS, CAMEL Core
**Target**: Lugh Remote Agentic Coding Platform

---

## Executive Summary

After deep-diving into the CAMEL AI ecosystem (OWL, CRAB, OASIS, and core CAMEL), we've identified **18 specific patterns** to implement in Lugh, organized into 6 categories.

---

## 1. Memory Systems (from CAMEL Core)

### What CAMEL Has

CAMEL implements a 3-tier memory architecture:

| Memory Type             | Purpose                        | Storage                   |
| ----------------------- | ------------------------------ | ------------------------- |
| **ChatHistoryMemory**   | Recent conversation context    | Key-value (recency-based) |
| **VectorDBMemory**      | Semantic search across history | Qdrant/Milvus embeddings  |
| **LongtermAgentMemory** | Hybrid of both                 | Combined retrieval        |

### What to Implement in Lugh

```typescript
// src/memory/types.ts
export interface MemoryBlock {
  write(record: MemoryRecord): Promise<void>;
  retrieve(query: string, k?: number): Promise<MemoryRecord[]>;
  clear(): Promise<void>;
}

export interface ChatHistoryBlock extends MemoryBlock {
  // Retrieves by recency (FIFO with max size)
  maxMessages: number;
  summarizeOnOverflow: boolean;
}

export interface VectorDBBlock extends MemoryBlock {
  // Retrieves by semantic similarity
  embedder: EmbeddingProvider;
  storage: VectorStorage;
  similarityThreshold: number;
}

export interface AgentMemory {
  chatHistory: ChatHistoryBlock;
  vectorDB?: VectorDBBlock;
  workingMemory: Map<string, unknown>; // Task-specific scratchpad

  // Unified interface
  getContext(query: string): Promise<string>;
  addMessage(message: Message): Promise<void>;
}
```

### Implementation Files

```
src/memory/
├── types.ts                 # Memory interfaces
├── chat-history-block.ts    # Recency-based retrieval
├── vector-db-block.ts       # Semantic retrieval (use OpenAI embeddings)
├── agent-memory.ts          # Unified memory manager
└── context-creator.ts       # Format context for prompts
```

### Database Schema Addition

```sql
-- Add to migrations
CREATE TABLE memory_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  content TEXT NOT NULL,
  embedding VECTOR(1536),  -- OpenAI ada-002 dimensions
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX memory_embedding_idx ON memory_records
  USING ivfflat (embedding vector_cosine_ops);
```

**Effort**: 3-4 days
**Priority**: P0 - Foundation for all other features

---

## 2. Tool System (from OWL + CAMEL)

### What OWL Has

OWL provides 20+ toolkits:

- ArxivToolkit, GitHubToolkit, BrowserToolkit
- CodeExecutionToolkit, TerminalToolkit
- MCP protocol for extensibility

Key pattern: **FunctionTool wrapper** - any Python function becomes a tool.

### What to Implement in Lugh

```typescript
// src/tools/types.ts
export interface FunctionTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute: (input: TInput) => Promise<TOutput>;

  // Lugh-specific
  requiresApproval?: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
  platforms?: ('telegram' | 'slack' | 'github')[];
}

// src/tools/decorator.ts
export function tool(config: ToolConfig) {
  return function(target: Function) {
    return new FunctionTool({
      name: config.name ?? target.name,
      description: config.description,
      parameters: inferSchema(target),
      execute: target as any,
      ...config
    });
  };
}

// Usage
@tool({ description: 'Search GitHub issues', riskLevel: 'low' })
async function searchGitHubIssues(query: string, repo: string): Promise<Issue[]> {
  // implementation
}
```

### Toolkit Registry

```typescript
// src/tools/registry.ts
export class ToolRegistry {
  private tools: Map<string, FunctionTool> = new Map();
  private toolkits: Map<string, FunctionTool[]> = new Map();

  register(tool: FunctionTool): void;
  registerToolkit(name: string, tools: FunctionTool[]): void;

  get(name: string): FunctionTool | undefined;
  getForPlatform(platform: string): FunctionTool[];

  // Convert to Claude Code MCP format
  toMCPTools(): MCPToolDefinition[];
}
```

### Built-in Toolkits to Create

| Toolkit                 | Tools                                       | Priority |
| ----------------------- | ------------------------------------------- | -------- |
| **GitToolkit**          | clone, commit, push, createBranch, createPR | P0       |
| **GitHubToolkit**       | searchIssues, createIssue, commentOnPR      | P0       |
| **FileToolkit**         | read, write, search, glob                   | P0       |
| **NotificationToolkit** | sendTelegram, sendSlack, sendEmail          | P1       |
| **WebToolkit**          | fetch, search, scrape                       | P1       |
| **DatabaseToolkit**     | query, insert, update                       | P2       |

**Effort**: 4-5 days
**Priority**: P0 - Extends agent capabilities

---

## 3. Cross-Platform Coordination (from CRAB)

### What CRAB Has

CRAB's killer feature: **Unified interface for multi-environment agents**

```python
# CRAB pattern - agent accesses multiple environments simultaneously
@action
def read_phone_message(device: Phone) -> str: ...

@action
def type_on_computer(device: Computer, text: str): ...

# Agent can: read message on phone → type response on computer
```

### What to Implement in Lugh

Lugh already has multi-platform (Telegram, Slack, GitHub) but they're siloed. CRAB pattern enables **cross-platform agent actions**.

```typescript
// src/environments/types.ts
export interface Environment {
  name: string;
  actions: Map<string, Action>;
  observe(): Promise<Observation>;
}

export interface Action<TInput = unknown, TOutput = unknown> {
  name: string;
  environment: string;
  execute: (input: TInput) => Promise<TOutput>;
}

// src/environments/unified-interface.ts
export class UnifiedEnvironment {
  private environments: Map<string, Environment> = new Map();

  // Register platform as environment
  registerPlatform(platform: IPlatformAdapter): void {
    this.environments.set(platform.getPlatformType(), {
      name: platform.getPlatformType(),
      actions: this.extractActions(platform),
      observe: () => platform.getLatestMessages?.() ?? Promise.resolve([]),
    });
  }

  // Cross-platform action
  async execute(environmentName: string, actionName: string, input: unknown): Promise<unknown>;

  // Agent can query any environment
  async observeAll(): Promise<Map<string, Observation>>;
}
```

### Use Cases Enabled

1. **GitHub → Telegram**: PR merged → notify on Telegram
2. **Telegram → GitHub**: "Create issue about X" → creates GitHub issue
3. **Slack → GitHub**: Slack command triggers GitHub workflow
4. **Cross-repo**: Agent reads from repo A, commits to repo B

**Effort**: 3-4 days
**Priority**: P1 - Powerful but not blocking

---

## 4. Workforce/Societies (from CAMEL Workforce)

### What CAMEL Has

The **Workforce** system orchestrates multiple agents:

```python
# CAMEL Workforce pattern
workforce = Workforce()
workforce.add_worker(RolePlayingWorker("architect", "developer"))
workforce.add_worker(SingleAgentWorker("reviewer"))

# Workforce handles: decomposition → assignment → execution → completion
result = workforce.process(complex_task)
```

Key components:

- **task_agent**: Decomposes tasks into subtasks
- **coordinator_agent**: Assigns subtasks to workers
- **RolePlayingWorker**: Two agents debate/collaborate on a task

### What Lugh Already Has

- `SwarmCoordinator` - parallel execution with dependency DAG
- `TaskDecomposer` - LLM-based decomposition
- `RoleConfigs` - 12 predefined roles

### What to Add

```typescript
// src/workforce/workforce.ts
export class Workforce {
  private workers: Map<string, Worker> = new Map();
  private coordinator: CoordinatorAgent;
  private taskAgent: TaskDecomposer;

  addWorker(worker: Worker): void;
  removeWorker(id: string): void;

  // Process with full lifecycle management
  async process(task: string): Promise<WorkforceResult> {
    // 1. Decompose
    const subtasks = await this.taskAgent.decompose(task);

    // 2. Assign (coordinator decides which worker)
    const assignments = await this.coordinator.assign(subtasks, this.workers);

    // 3. Execute (parallel where possible)
    const results = await this.executeWithDependencies(assignments);

    // 4. Synthesize
    return this.synthesize(results);
  }
}

// src/workforce/role-playing-worker.ts
export class RolePlayingWorker implements Worker {
  constructor(
    private role1: RoleConfig, // e.g., "architect"
    private role2: RoleConfig, // e.g., "critic"
    private maxTurns: number = 10
  ) {}

  async execute(task: SubTask): Promise<AgentResult> {
    // Two agents debate until consensus
    let conversation: Message[] = [];

    for (let turn = 0; turn < this.maxTurns; turn++) {
      const response1 = await this.agent1.respond(task, conversation);
      conversation.push(response1);

      const response2 = await this.agent2.critique(response1, conversation);
      conversation.push(response2);

      if (this.hasConsensus(conversation)) break;
    }

    return this.extractResult(conversation);
  }
}
```

### New Worker Types

| Worker                 | Pattern                | Use Case               |
| ---------------------- | ---------------------- | ---------------------- |
| **SingleAgentWorker**  | One agent, one task    | Simple research        |
| **RolePlayingWorker**  | Two agents debate      | Architecture decisions |
| **ConsensusWorker**    | N agents vote          | Code review            |
| **HierarchicalWorker** | Manager + subordinates | Complex implementation |

**Effort**: 4-5 days
**Priority**: P1 - Enhances swarm quality

---

## 5. Scalability Patterns (from OASIS)

### What OASIS Has

OASIS scales to **1 million agents** using:

- Async processing (`asyncio`)
- SQLite state persistence
- Agent graph structure
- Batch action processing

### What to Implement in Lugh

Lugh won't need 1M agents, but OASIS patterns improve efficiency:

```typescript
// src/scale/agent-graph.ts
export class AgentGraph {
  private agents: Map<string, AgentNode> = new Map();
  private edges: Map<string, Set<string>> = new Map(); // dependencies

  // Batch operations
  async stepAll(actions: Map<string, Action>): Promise<Map<string, Result>> {
    // Process all agents in parallel where no dependencies
    const independent = this.getIndependentAgents();
    const results = await Promise.all(
      independent.map(id => this.executeAgent(id, actions.get(id)))
    );

    // Then process dependent agents
    // ...
  }

  // Efficient agent lookup
  getAgentsByRole(role: string): AgentNode[];
  getAgentsByStatus(status: AgentStatus): AgentNode[];
}

// src/scale/action-space.ts
export const AGENT_ACTIONS = {
  // Development actions (like OASIS social actions)
  CREATE_FILE: 'create_file',
  EDIT_FILE: 'edit_file',
  RUN_TESTS: 'run_tests',
  CREATE_PR: 'create_pr',
  REVIEW_CODE: 'review_code',

  // Communication actions
  ASK_CLARIFICATION: 'ask_clarification',
  REPORT_PROGRESS: 'report_progress',
  REQUEST_REVIEW: 'request_review',

  // Meta actions
  DELEGATE: 'delegate',
  WAIT: 'wait',
  COMPLETE: 'complete',
} as const;
```

### State Persistence Pattern

```typescript
// src/scale/state-persistence.ts
export class AgentStatePersistence {
  // Checkpoint agent state for recovery
  async checkpoint(agentId: string, state: AgentState): Promise<void>;

  // Resume from last checkpoint
  async restore(agentId: string): Promise<AgentState | null>;

  // Bulk operations for efficiency
  async bulkCheckpoint(states: Map<string, AgentState>): Promise<void>;
}
```

**Effort**: 2-3 days
**Priority**: P2 - Optimization

---

## 6. MCP Integration (from OWL)

### What OWL Has

OWL uses **Model Context Protocol (MCP)** as a universal tool interface:

- Any tool becomes an MCP server
- Any MCP server can be used by agents
- Standardized tool discovery and execution

### What to Implement in Lugh

```typescript
// src/mcp/types.ts
export interface MCPServer {
  name: string;
  version: string;
  tools: MCPTool[];

  // Standard MCP methods
  listTools(): Promise<MCPTool[]>;
  callTool(name: string, args: unknown): Promise<MCPResult>;
}

// src/mcp/toolkit-to-mcp.ts
export function toolkitToMCPServer(toolkit: FunctionTool[]): MCPServer {
  return {
    name: 'lugh-toolkit',
    version: '1.0.0',
    tools: toolkit.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters,
    })),
    listTools: async () => this.tools,
    callTool: async (name, args) => {
      const tool = toolkit.find(t => t.name === name);
      if (!tool) throw new Error(`Tool ${name} not found`);
      return tool.execute(args);
    },
  };
}

// src/mcp/client.ts
export class MCPClient {
  private servers: Map<string, MCPServer> = new Map();

  // Connect to external MCP servers
  async connect(serverUrl: string): Promise<void>;

  // Aggregate tools from all servers
  getAllTools(): MCPTool[];

  // Route tool call to appropriate server
  async callTool(serverName: string, toolName: string, args: unknown): Promise<MCPResult>;
}
```

**Effort**: 3-4 days
**Priority**: P1 - Industry standard, future-proof

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

| Feature        | Source | Effort   | Files                  |
| -------------- | ------ | -------- | ---------------------- |
| Memory System  | CAMEL  | 3-4 days | `src/memory/*`         |
| Tool Registry  | OWL    | 2-3 days | `src/tools/*`          |
| Basic Toolkits | OWL    | 2-3 days | `src/tools/toolkits/*` |

### Phase 2: Intelligence (Week 3-4)

| Feature                | Source | Effort   | Files                |
| ---------------------- | ------ | -------- | -------------------- |
| RolePlaying Worker     | CAMEL  | 2-3 days | `src/workforce/*`    |
| Cross-Platform Actions | CRAB   | 3-4 days | `src/environments/*` |
| MCP Integration        | OWL    | 3-4 days | `src/mcp/*`          |

### Phase 3: Scale (Week 5)

| Feature           | Source | Effort   | Files         |
| ----------------- | ------ | -------- | ------------- |
| Agent Graph       | OASIS  | 2-3 days | `src/scale/*` |
| State Persistence | OASIS  | 1-2 days | `src/scale/*` |
| Action Space      | OASIS  | 1 day    | `src/scale/*` |

---

## Quick Wins (Can Ship This Week)

### 1. Conversation Summary in Sessions

```typescript
// Add to src/db/sessions.ts
interface Session {
  // existing fields...
  summary?: string; // Add this
}

// On session end, generate summary
async function summarizeAndSave(sessionId: string): Promise<void> {
  const history = await getSessionHistory(sessionId);
  const summary = await claude.summarize(history);
  await updateSession(sessionId, { summary });
}
```

### 2. Tool Execution Logging

```typescript
// Add to src/db/approvals.ts - already exists!
// Just need to query and analyze patterns
async function getSuccessfulToolPatterns(codebaseId: string): Promise<ToolPattern[]> {
  return db.query(
    `
    SELECT tool_name, tool_input, COUNT(*) as usage_count
    FROM approvals
    WHERE session_id IN (SELECT id FROM sessions WHERE codebase_id = $1)
    GROUP BY tool_name, tool_input
    ORDER BY usage_count DESC
  `,
    [codebaseId]
  );
}
```

### 3. Role Success Tracking

```typescript
// Add to src/swarm/types.ts
interface DecomposedTask {
  // existing fields...
  outcomeRoles?: { role: AgentRole; success: boolean }[]; // Track what worked
}
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Lugh Platform                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Telegram │  │  Slack   │  │  GitHub  │  │ Discord  │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       └─────────────┼─────────────┼─────────────┘          │
│                     ▼                                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Unified Environment (CRAB)              │   │
│  │  - Cross-platform action routing                     │   │
│  │  - Observation aggregation                           │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Orchestrator                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌────────────┐   │   │
│  │  │   Memory    │  │    Tools    │  │    MCP     │   │   │
│  │  │  (CAMEL)    │  │   (OWL)     │  │   (OWL)    │   │   │
│  │  └─────────────┘  └─────────────┘  └────────────┘   │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Workforce (CAMEL)                  │   │
│  │  ┌──────────────┐  ┌──────────────┐                 │   │
│  │  │ Coordinator  │  │ Task Agent   │                 │   │
│  │  └──────┬───────┘  └──────┬───────┘                 │   │
│  │         ▼                 ▼                          │   │
│  │  ┌─────────────────────────────────────────────┐    │   │
│  │  │              Worker Pool                     │    │   │
│  │  │  ┌────────┐ ┌────────┐ ┌────────────────┐   │    │   │
│  │  │  │ Single │ │ Role   │ │   Consensus    │   │    │   │
│  │  │  │ Agent  │ │ Playing│ │    Worker      │   │    │   │
│  │  │  └────────┘ └────────┘ └────────────────┘   │    │   │
│  │  └─────────────────────────────────────────────┘    │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               Agent Graph (OASIS)                    │   │
│  │  - Batch execution                                   │   │
│  │  - State persistence                                 │   │
│  │  - Action space                                      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## References

- [OWL Repository](https://github.com/camel-ai/owl)
- [CRAB Repository](https://github.com/camel-ai/crab)
- [OASIS Repository](https://github.com/camel-ai/oasis)
- [CAMEL Documentation](https://docs.camel-ai.org/)
- [CAMEL Memory Module](https://docs.camel-ai.org/key_modules/memory)
- [CAMEL Tools Documentation](https://docs.camel-ai.org/key_modules/tools)
- [CAMEL Workforce Documentation](https://docs.camel-ai.org/key_modules/workforce)
- [MCP Integration Blog](https://www.camel-ai.org/blogs/camel-mcp-servers-model-context-protocol-ai-agents)
