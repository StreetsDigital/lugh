/**
 * Swarm Module
 * ============
 *
 * Dynamic agent spawning system for parallel task execution.
 *
 * Usage:
 *
 * ```typescript
 * import { swarmCoordinator, agentSpawner } from './swarm';
 *
 * // Listen for events
 * swarmCoordinator.onEvent((event) => {
 *   console.log(`[${event.type}]`, event.data);
 * });
 *
 * // Configure providers
 * agentSpawner.setDefaultProvider('openai');
 * agentSpawner.setRoleProvider('competitor-analysis', 'grok');
 *
 * // Execute a swarm
 * const session = await swarmCoordinator.execute(
 *   "Build a Spotify competitor for indie labels that pays artists fairly",
 *   "conversation-123"
 * );
 *
 * // Get formatted result
 * const markdown = resultSynthesizer.formatAsMarkdown(session.synthesizedResult);
 * ```
 */

// Types
export * from './types';

// Role configurations
export { ROLE_CONFIGS, getRoleConfig, getAvailableRoles } from './role-configs';

// LLM Providers (from llm module)
export {
  LLMProvider,
  LLMProviderFactory,
  llmProviderFactory,
  createProvider,
  getAvailableLLMProviders,
  DEFAULT_PROVIDER_CONFIGS,
  type LLMProviderType,
  type LLMProviderConfig,
  type LLMMessage,
  type LLMResponse,
} from '../llm/providers';

// Task decomposer
export { TaskDecomposer, taskDecomposer } from './task-decomposer';

// Agent spawner
export { DynamicAgentSpawner, agentSpawner } from './agent-spawner';

// Swarm coordinator
export { SwarmCoordinator, swarmCoordinator } from './swarm-coordinator';

// Result synthesizer
export { ResultSynthesizer, resultSynthesizer } from './result-synthesizer';

// Freewheel mode - natural language multi-agent control
export {
  parseFreewheelIntent,
  summarizeIntent,
  MODEL_ALIASES,
  MODEL_TIERS,
  type FreewheelIntent,
  type FreewheelSession,
  type ExecutionMode,
  type SwarmStrategy,
  type CheckpointType,
  type ModelAssignment,
} from './freewheel-mode';

// Freewheel coordinator
export { FreewheelCoordinator, freewheelCoordinator } from './freewheel-coordinator';
