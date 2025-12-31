# Feature Request: Borrow Multi-Agent Patterns from CAMEL AI

**Date**: 2025-12-30
**Author**: Comparative analysis of CAMEL AI and Lugh
**Priority**: P0-P2 (staged implementation)
**Related**: https://github.com/camel-ai/camel

## Summary

After analyzing the [CAMEL AI framework](https://github.com/camel-ai/camel) (15k+ stars, Python), several patterns could significantly enhance Lugh's multi-agent capabilities. This document outlines borrowable concepts and implementation recommendations.

## Background

CAMEL AI is built on four foundational principles:
- **Evolvability**: Agents continuously improve through data generation
- **Scalability**: Designed for millions of agents
- **Statefulness**: Memory across multi-step interactions
- **Code-as-Prompt**: Every line of code serves as interpretable instructions

Lugh already has solid multi-agent foundations (`src/swarm/`), but lacks several patterns that CAMEL has refined.

## Proposed Features

### P0: Memory Systems

**Problem**: Lugh has basic session management but no structured memory for agent continuity.

**CAMEL's Approach**: Three-tier memory architecture:
- Short-term (conversation buffer)
- Long-term (persistent vector store)
- Working memory (task-specific scratchpad)

**Proposed Implementation**:

```typescript
// src/memory/types.ts
interface AgentMemory {
  shortTerm: ConversationBuffer;    // Recent messages, auto-summarized
  longTerm: VectorStore;            // Embeddings of past decisions/code
  workingMemory: Map<string, unknown>; // Task-specific state
}

interface ConversationBuffer {
  messages: Message[];
  maxSize: number;
  summarize(): Promise<string>;
}

interface VectorStore {
  add(text: string, metadata: Record<string, unknown>): Promise<void>;
  search(query: string, k: number): Promise<SearchResult[]>;
}
```

**Files to Create**:
- `src/memory/conversation-buffer.ts`
- `src/memory/vector-store.ts`
- `src/memory/memory-manager.ts`

**Effort**: Medium (2-3 days)
**Value**: High - enables context continuity across sessions

---

### P0: RAG/Codebase Indexing

**Problem**: No semantic search over codebase or past decisions.

**CAMEL's Approach**: Built-in retrievers for knowledge-augmented responses.

**Proposed Implementation**:

```typescript
// src/retrieval/codebase-indexer.ts
interface CodebaseIndexer {
  indexCodebase(codebaseId: string, path: string): Promise<void>;
  search(query: string, codebaseId: string): Promise<CodeChunk[]>;
  invalidate(codebaseId: string, filePath: string): Promise<void>;
}

interface CodeChunk {
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  score: number;
}
```

**Integration Points**:
- Index on `/clone` command
- Re-index on file changes (via git hooks or polling)
- Query before sending prompt to add relevant context

**Effort**: Medium (3-4 days)
**Value**: High - dramatically improves code understanding

---

### P1: Dynamic Role Assignment

**Problem**: Static 12-role config in `src/swarm/role-configs.ts`.

**CAMEL's Approach**: Dynamically assigns and composes roles based on task analysis.

**Proposed Implementation**:

```typescript
// src/swarm/role-composer.ts
interface RoleComposer {
  // Analyze task and suggest optimal role combination
  suggestRoles(task: string, history?: TaskHistory): Promise<ComposedRole[]>;

  // Combine multiple roles into a hybrid
  composeRoles(roles: AgentRole[]): RoleConfig;

  // Learn from successful decompositions
  recordSuccess(taskId: string, roles: AgentRole[]): Promise<void>;
}

interface ComposedRole extends RoleConfig {
  baseRoles: AgentRole[];
  confidence: number;
}
```

**Effort**: Low-Medium (1-2 days)
**Value**: Medium - smarter task decomposition

---

### P1: Inter-Agent Communication

**Problem**: Agents are independent; only share through result synthesis.

**CAMEL's Approach**: Async messaging between agents in a "society."

**Proposed Implementation**:

```typescript
// src/swarm/agent-messaging.ts
interface AgentMessage {
  id: string;
  from: string;      // Agent ID
  to: string | '*';  // Agent ID or broadcast
  type: 'request' | 'response' | 'broadcast' | 'handoff';
  topic: string;
  content: string;
  replyTo?: string;
  timestamp: Date;
}

interface AgentMailbox {
  send(message: AgentMessage): Promise<void>;
  receive(agentId: string): AsyncGenerator<AgentMessage>;
  broadcast(message: AgentMessage): Promise<void>;
}
```

**Use Cases**:
- Architecture agent asks Security agent to review a design
- Implementation agent requests clarification from PM agent
- Handoff patterns between planning and execution

**Effort**: Medium (2-3 days)
**Value**: Medium - enables collaborative refinement

---

### P2: Custom Tool Registry

**Problem**: Relies entirely on Claude Code's built-in tools.

**CAMEL's Approach**: Modular toolkit system (SearchToolkit, CodeToolkit, etc.)

**Proposed Implementation**:

```typescript
// src/tools/registry.ts
interface CustomTool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute: (input: unknown) => Promise<ToolResult>;
  requiresApproval?: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
}

interface ToolRegistry {
  register(tool: CustomTool): void;
  get(name: string): CustomTool | undefined;
  list(): CustomTool[];
  execute(name: string, input: unknown): Promise<ToolResult>;
}
```

**Example Tools**:
- `web-search`: Search the web for documentation
- `slack-notify`: Send notifications to Slack
- `jira-create`: Create Jira tickets
- `deploy-preview`: Trigger preview deployments

**Effort**: Medium (2-3 days)
**Value**: Medium - extensibility for custom workflows

---

### P2: Self-Improvement via Data Capture

**Problem**: No capture of successful patterns for learning.

**CAMEL's Approach**: Generates training data from interactions.

**Proposed Implementation**:

```typescript
// src/learning/interaction-logger.ts
interface InteractionLog {
  taskId: string;
  prompt: string;
  decomposition: DecomposedTask;
  agentResults: AgentResult[];
  userFeedback?: 'positive' | 'negative' | 'neutral';
  outcome?: 'pr_merged' | 'pr_rejected' | 'abandoned';
  metadata: Record<string, unknown>;
}

interface PatternLearner {
  log(interaction: InteractionLog): Promise<void>;
  getPatterns(taskType: string): Promise<SuccessfulPattern[]>;
  suggestFromHistory(task: string): Promise<Suggestion[]>;
}
```

**Effort**: High (4-5 days)
**Value**: Medium - long-term improvement

---

## Implementation Plan

### Phase 1: Foundation (P0)
1. Memory Systems - 2-3 days
2. RAG/Codebase Indexing - 3-4 days

### Phase 2: Intelligence (P1)
3. Dynamic Role Assignment - 1-2 days
4. Inter-Agent Communication - 2-3 days

### Phase 3: Extensibility (P2)
5. Custom Tool Registry - 2-3 days
6. Self-Improvement Logging - 4-5 days

**Total Estimated Effort**: 14-20 days

## Quick Wins (Can Do Now)

1. **Conversation Summary Cache**
   - Add `summary` field to sessions table
   - Summarize on session end
   - Load summary as context on resume

2. **File Structure Cache**
   - Cache `tree` output per codebase
   - Invalidate on git operations

3. **Role Success Tracking**
   - Add `successful_roles` JSONB to decomposed tasks
   - Query for similar task patterns

## References

- [CAMEL AI GitHub](https://github.com/camel-ai/camel)
- [CAMEL Documentation](https://docs.camel-ai.org/)
- [OWL Framework](https://github.com/camel-ai/owl)
- [CAMEL Role-Playing Paper](https://arxiv.org/abs/2303.17760)

## Acceptance Criteria

- [ ] Memory system persists across sessions
- [ ] RAG retrieves relevant code chunks for prompts
- [ ] Role assignment adapts based on task type
- [ ] Agents can request information from each other
- [ ] Custom tools can be registered and used
- [ ] Interaction patterns are logged for analysis
