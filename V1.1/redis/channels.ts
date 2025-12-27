/**
 * Redis Channel Definitions
 * =========================
 *
 * All pub/sub channels used for orchestrator <-> agent communication.
 *
 * Channel naming convention:
 * - task:*    - Task lifecycle events
 * - agent:*   - Agent status events
 * - control:* - Control commands from orchestrator
 */

/**
 * Channels published by ORCHESTRATOR, subscribed by AGENTS
 */
export const ORCHESTRATOR_CHANNELS = {
  /**
   * New task assignment
   * Payload: TaskDispatchMessage
   */
  TASK_DISPATCH: 'task:dispatch',

  /**
   * Stop current task (graceful)
   * Payload: { agentId: string, taskId: string, reason: string }
   */
  CONTROL_STOP: 'control:stop',

  /**
   * Kill agent (immediate)
   * Payload: { agentId: string, reason: string }
   */
  CONTROL_KILL: 'control:kill',

  /**
   * Request status from specific agent
   * Payload: { agentId: string }
   */
  CONTROL_STATUS_REQUEST: 'control:status-request',
} as const;

/**
 * Channels published by AGENTS, subscribed by ORCHESTRATOR
 */
export const AGENT_CHANNELS = {
  /**
   * Agent comes online
   * Payload: AgentRegisterMessage
   */
  AGENT_REGISTER: 'agent:register',

  /**
   * Agent heartbeat (every 5s)
   * Payload: AgentHeartbeatMessage
   */
  AGENT_HEARTBEAT: 'agent:heartbeat',

  /**
   * Agent status update
   * Payload: AgentStatusMessage
   */
  AGENT_STATUS: 'agent:status',

  /**
   * Task completed or failed
   * Payload: TaskResultMessage
   */
  TASK_RESULT: 'task:result',

  /**
   * Tool call notification (for streaming)
   * Payload: ToolCallMessage
   */
  TOOL_CALL: 'agent:tool-call',

  /**
   * Agent going offline
   * Payload: { agentId: string, reason: string }
   */
  AGENT_DEREGISTER: 'agent:deregister',
} as const;

/**
 * Redis key prefixes for data storage
 */
export const REDIS_KEYS = {
  /**
   * Agent info hash: agent:{agentId}
   * Fields: status, currentTask, lastHeartbeat, worktree
   */
  AGENT: 'agent',

  /**
   * Task info hash: task:{taskId}
   * Fields: status, agentId, startTime, result
   */
  TASK: 'task',

  /**
   * Task queue (sorted set by priority)
   */
  TASK_QUEUE: 'queue:tasks',

  /**
   * Active agents set
   */
  ACTIVE_AGENTS: 'agents:active',

  /**
   * Agent lock for task assignment
   */
  AGENT_LOCK: 'lock:agent',
} as const;

// Type exports for channel names
export type OrchestratorChannel =
  (typeof ORCHESTRATOR_CHANNELS)[keyof typeof ORCHESTRATOR_CHANNELS];
export type AgentChannel = (typeof AGENT_CHANNELS)[keyof typeof AGENT_CHANNELS];
export type RedisKey = (typeof REDIS_KEYS)[keyof typeof REDIS_KEYS];
