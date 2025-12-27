/**
 * Redis Message Types
 * ===================
 *
 * Type definitions for all messages passed between orchestrator and agents.
 */

/**
 * Task priority levels
 */
export type TaskPriority = 'critical' | 'high' | 'normal' | 'low';

/**
 * Task status
 */
export type TaskStatus =
  | 'queued'
  | 'dispatched'
  | 'running'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Agent status
 */
export type AgentStatus = 'idle' | 'busy' | 'stopping' | 'error' | 'offline';

// =============================================================================
// TASK MESSAGES
// =============================================================================

/**
 * Task dispatch from orchestrator to agent
 * Channel: task:dispatch
 */
export interface TaskDispatchMessage {
  type: 'task:dispatch';
  taskId: string;
  targetAgentId?: string; // If specified, only this agent should handle

  // Task details
  task: {
    description: string;
    codebaseId: string;
    worktreePath: string;
    priority: TaskPriority;

    // Context from memory layer
    context?: {
      previousAttempts: number;
      recoveryHints: string[];
      memoryContext: string;
    };

    // Expected outcomes for verification
    expectations?: {
      shouldCommit: boolean;
      shouldModifyFiles: string[];
      shouldPassTests: boolean;
    };
  };

  // Metadata
  timestamp: string;
  conversationId: string;
  platform: 'telegram' | 'slack' | 'web' | 'github';
}

/**
 * Task result from agent to orchestrator
 * Channel: task:result
 */
export interface TaskResultMessage {
  type: 'task:result';
  taskId: string;
  agentId: string;

  // Outcome
  status: 'completed' | 'failed' | 'cancelled';
  success: boolean;

  // What the agent claims happened
  claims: {
    commitsCreated: number;
    filesModified: string[];
    testsRun: boolean;
    testsPassed: boolean;
  };

  // Agent's summary
  summary: string;

  // Raw LLM response (for non-agentic providers)
  response?: string;

  // LLM usage metrics
  tokensUsed?: number;
  cost?: number;
  provider?: LLMProviderType;

  // Error details if failed
  error?: {
    message: string;
    stack?: string;
    recoverable: boolean;
  };

  // Timing
  startTime: string;
  endTime: string;
  durationMs: number;
}

// =============================================================================
// AGENT MESSAGES
// =============================================================================

/**
 * LLM Provider types
 */
export type LLMProviderType =
  | 'claude-code'
  | 'claude'
  | 'openai'
  | 'grok'
  | 'ollama'
  | 'openrouter';

/**
 * Agent registration when coming online
 * Channel: agent:register
 */
export interface AgentRegisterMessage {
  type: 'agent:register';
  agentId: string;

  // Agent capabilities
  capabilities: {
    maxConcurrentTasks: number;
    supportedLanguages: string[];
    hasWorktree: boolean;
    worktreePath?: string;
    // Multi-LLM support
    llmProvider?: LLMProviderType;
    availableProviders?: LLMProviderType[];
    supportsToolUse?: boolean;
  };

  // System info
  system: {
    hostname: string;
    platform: string;
    memory: number;
    cpus: number;
  };

  timestamp: string;
}

/**
 * Agent heartbeat (every 5 seconds)
 * Channel: agent:heartbeat
 */
export interface AgentHeartbeatMessage {
  type: 'agent:heartbeat';
  agentId: string;
  status: AgentStatus;

  // Current task info (if busy)
  currentTask?: {
    taskId: string;
    progress: number; // 0-100
    currentStep: string;
  };

  // Resource usage
  resources: {
    memoryUsedMb: number;
    cpuPercent: number;
  };

  timestamp: string;
}

/**
 * Agent status update (on state change)
 * Channel: agent:status
 */
export interface AgentStatusMessage {
  type: 'agent:status';
  agentId: string;

  previousStatus: AgentStatus;
  currentStatus: AgentStatus;
  reason: string;

  timestamp: string;
}

/**
 * Agent deregistration when going offline
 * Channel: agent:register (same channel, different type)
 */
export interface AgentDeregisterMessage {
  type: 'agent:deregister';
  agentId: string;
  reason: string;
  timestamp: string;
}

// =============================================================================
// TOOL CALL MESSAGES (for streaming)
// =============================================================================

/**
 * Tool call notification (for real-time streaming to control surfaces)
 * Channel: agent:tool-call
 */
export interface ToolCallMessage {
  type: 'agent:tool-call';
  agentId: string;
  taskId: string;

  tool: {
    name: string;
    input: Record<string, unknown>;
    description?: string;
  };

  timestamp: string;
}

// =============================================================================
// CONTROL MESSAGES
// =============================================================================

/**
 * Stop command from orchestrator
 * Channel: control:stop
 */
export interface ControlStopMessage {
  type: 'control:stop';
  agentId: string;
  taskId?: string;
  reason: string;
  graceful: boolean; // If false, immediate termination
  timestamp: string;
}

/**
 * Kill command from orchestrator
 * Channel: control:kill
 */
export interface ControlKillMessage {
  type: 'control:kill';
  agentId: string;
  reason: string;
  timestamp: string;
}

// =============================================================================
// SWARM MESSAGES
// =============================================================================

/**
 * Agent role types for swarm
 */
export type SwarmAgentRole =
  | 'competitor-analysis'
  | 'tech-stack-research'
  | 'architecture-design'
  | 'project-management'
  | 'market-research'
  | 'ux-design'
  | 'security-audit'
  | 'cost-estimation'
  | 'legal-compliance'
  | 'implementation'
  | 'testing'
  | 'documentation'
  | 'custom';

/**
 * Swarm started notification
 * Channel: swarm:started
 */
export interface SwarmStartedMessage {
  type: 'swarm:started';
  swarmId: string;
  conversationId: string;
  originalRequest: string;
  timestamp: string;
}

/**
 * Swarm task decomposed
 * Channel: swarm:decomposed
 */
export interface SwarmDecomposedMessage {
  type: 'swarm:decomposed';
  swarmId: string;
  projectName: string;
  subTaskCount: number;
  roles: SwarmAgentRole[];
  executionStrategy: 'parallel' | 'sequential' | 'hybrid';
  estimatedDuration: string;
  timestamp: string;
}

/**
 * Swarm agent spawned
 * Channel: swarm:agent-spawned
 */
export interface SwarmAgentSpawnedMessage {
  type: 'swarm:agent-spawned';
  swarmId: string;
  agentId: string;
  role: SwarmAgentRole;
  title: string;
  timestamp: string;
}

/**
 * Swarm agent progress update
 * Channel: swarm:agent-progress
 */
export interface SwarmAgentProgressMessage {
  type: 'swarm:agent-progress';
  swarmId: string;
  agentId: string;
  role: SwarmAgentRole;
  progress: number; // 0-100
  currentStep: string;
  timestamp: string;
}

/**
 * Swarm agent completed
 * Channel: swarm:agent-completed
 */
export interface SwarmAgentCompletedMessage {
  type: 'swarm:agent-completed';
  swarmId: string;
  agentId: string;
  role: SwarmAgentRole;
  summary: string;
  confidence: number;
  tokensUsed: number;
  durationMs: number;
  timestamp: string;
}

/**
 * Swarm agent failed
 * Channel: swarm:agent-failed
 */
export interface SwarmAgentFailedMessage {
  type: 'swarm:agent-failed';
  swarmId: string;
  agentId: string;
  role: SwarmAgentRole;
  error: string;
  timestamp: string;
}

/**
 * Swarm completed
 * Channel: swarm:completed
 */
export interface SwarmCompletedMessage {
  type: 'swarm:completed';
  swarmId: string;
  conversationId: string;
  totalAgents: number;
  successfulAgents: number;
  failedAgents: number;
  totalTokensUsed: number;
  totalDurationMs: number;
  timestamp: string;
}

/**
 * Swarm failed
 * Channel: swarm:failed
 */
export interface SwarmFailedMessage {
  type: 'swarm:failed';
  swarmId: string;
  conversationId: string;
  error: string;
  timestamp: string;
}

// =============================================================================
// UNION TYPES
// =============================================================================

/**
 * All swarm message types
 */
export type SwarmMessage =
  | SwarmStartedMessage
  | SwarmDecomposedMessage
  | SwarmAgentSpawnedMessage
  | SwarmAgentProgressMessage
  | SwarmAgentCompletedMessage
  | SwarmAgentFailedMessage
  | SwarmCompletedMessage
  | SwarmFailedMessage;

/**
 * All message types from orchestrator
 */
export type OrchestratorMessage =
  | TaskDispatchMessage
  | ControlStopMessage
  | ControlKillMessage
  | SwarmMessage;

/**
 * All message types from agents
 */
export type AgentMessage =
  | TaskResultMessage
  | AgentRegisterMessage
  | AgentDeregisterMessage
  | AgentHeartbeatMessage
  | AgentStatusMessage
  | ToolCallMessage;

/**
 * Any Redis message
 */
export type RedisMessage = OrchestratorMessage | AgentMessage;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a timestamped message
 */
export function createMessage<T extends { timestamp?: string }>(
  message: Omit<T, 'timestamp'>
): T {
  return {
    ...message,
    timestamp: new Date().toISOString(),
  } as T;
}

/**
 * Parse a Redis message from JSON string
 */
export function parseMessage(json: string): RedisMessage {
  return JSON.parse(json) as RedisMessage;
}

/**
 * Serialize a message to JSON string
 */
export function serializeMessage(message: RedisMessage): string {
  return JSON.stringify(message);
}
