/**
 * Agent Pool - PostgreSQL-based multi-agent coordination
 *
 * Enables 3-12 parallel agents using PostgreSQL NOTIFY/LISTEN for pub/sub.
 * No Redis required.
 */

export { PgPubSub } from './pubsub.js';
export { AgentRegistry } from './agent-registry.js';
export { TaskQueue } from './task-queue.js';
export { PoolCoordinator } from './pool-coordinator.js';
export type { PoolCoordinatorConfig } from './pool-coordinator.js';
export { AgentWorker } from './agent-worker.js';
export type { AgentWorkerConfig } from './agent-worker.js';

export type {
  Agent,
  AgentStatus,
  PoolTask,
  TaskStatus,
  TaskType,
  TaskResult,
  ResultType,
  TaskRequest,
  TaskHandle,
  PoolStatus,
  PubSubMessage,
  HeartbeatMessage,
  TaskAssignment,
} from './types.js';
