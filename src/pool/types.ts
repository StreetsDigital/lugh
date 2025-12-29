/**
 * Type definitions for PostgreSQL-based agent pool
 */

export type AgentStatus = 'idle' | 'busy' | 'offline';
export type TaskStatus = 'queued' | 'assigned' | 'running' | 'completed' | 'failed';
export type TaskType = 'code' | 'review' | 'test' | 'plan' | 'general';
export type ResultType = 'chunk' | 'tool_call' | 'complete' | 'error';

export interface Agent {
  id: string;
  agentId: string;
  status: AgentStatus;
  capabilities: string[];
  currentTaskId?: string;
  lastHeartbeat: Date;
  registeredAt: Date;
  metadata: Record<string, unknown>;
}

export interface PoolTask {
  id: string;
  conversationId: string;
  taskType: TaskType;
  priority: number; // 1=highest, 10=lowest
  status: TaskStatus;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  assignedAgentId?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface TaskResult {
  id: string;
  taskId: string;
  resultType: ResultType;
  content: Record<string, unknown>;
  createdAt: Date;
}

export interface TaskRequest {
  conversationId: string;
  taskType: TaskType;
  priority?: number;
  payload: Record<string, unknown>;
}

export interface TaskHandle {
  taskId: string;
  status: TaskStatus;
}

export interface PoolStatus {
  totalAgents: number;
  idleAgents: number;
  busyAgents: number;
  offlineAgents: number;
  queuedTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
}

export interface PubSubMessage {
  channel: string;
  payload: unknown;
}

export interface HeartbeatMessage {
  agentId: string;
  status: AgentStatus;
  timestamp: number;
}

export interface TaskAssignment {
  taskId: string;
  agentId: string;
  task: PoolTask;
}
