/**
 * LLM Providers Module
 * ====================
 *
 * Multi-LLM provider support for parallel agent execution.
 *
 * Supported providers:
 * - claude-code: Claude Code SDK (agentic coding with tool use)
 * - claude: Claude via llm CLI (conversation, analysis)
 * - openai: OpenAI GPT models via llm CLI
 * - grok: xAI Grok via llm CLI (OpenAI-compatible)
 * - ollama: Local models via Ollama
 * - openrouter: Multiple providers via OpenRouter
 *
 * Usage:
 * ```typescript
 * import { getProviderFactory, TaskCharacteristics } from './providers';
 *
 * const factory = getProviderFactory();
 *
 * // Create provider for a task
 * const characteristics: TaskCharacteristics = {
 *   type: 'coding',
 *   complexity: 'complex',
 *   requiresTools: true,
 *   priority: 'high',
 * };
 *
 * const provider = await factory.createProvider(
 *   agentId,
 *   taskId,
 *   redis,
 *   characteristics
 * );
 *
 * const result = await provider.run({
 *   prompt: 'Fix the bug in user-auth.ts',
 *   workingDirectory: '/project',
 * });
 * ```
 */

// Types
export type {
  LLMProviderType,
  ModelConfig,
  TaskCharacteristics,
  LLMSessionInput,
  LLMSessionResult,
  LLMToolCall,
  ProviderCapabilities,
  ILLMProvider,
  ProviderConfig,
  TaskRoutingConfig,
} from './types';

// Providers
export { ClaudeCodeProvider } from './claude-code-provider';
export {
  LLMCliProvider,
  isLLMCliInstalled,
  installLLMPlugin,
  getInstalledPlugins,
} from './llm-cli-provider';

// Factory
export {
  ProviderFactory,
  getProviderFactory,
  loadProviderConfig,
  initializeLLMCli,
} from './factory';
