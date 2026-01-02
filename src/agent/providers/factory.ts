/**
 * LLM Provider Factory
 * ====================
 *
 * Creates LLM providers based on configuration.
 * Handles task-based routing to select optimal LLM.
 */

import type { RedisClient } from '../../redis/client';
import type {
  ILLMProvider,
  LLMProviderType,
  ModelConfig,
  ProviderConfig,
  TaskCharacteristics,
  TaskRoutingConfig,
} from './types';
import { ClaudeCodeProvider } from './claude-code-provider';
import { LLMCliProvider, isLLMCliInstalled, installLLMPlugin } from './llm-cli-provider';

/**
 * Default provider configuration
 */
const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  defaultProvider: 'claude-code',
  providers: {
    'claude-code': {
      provider: 'claude-code',
      model: 'claude-code',
    },
    claude: {
      provider: 'claude',
      model: 'claude-3.5-sonnet',
    },
    openai: {
      provider: 'openai',
      model: 'gpt-4o',
    },
    grok: {
      provider: 'grok',
      model: 'grok-2',
      baseUrl: 'https://api.x.ai/v1',
    },
    ollama: {
      provider: 'ollama',
      model: 'llama3.2',
    },
    openrouter: {
      provider: 'openrouter',
      model: 'anthropic/claude-3.5-sonnet',
    },
  },
  taskRouting: {
    // Coding tasks -> Claude Code (has tools)
    byTaskType: {
      coding: 'claude-code',
      review: 'claude-code',
      planning: 'claude',
      analysis: 'openai',
      chat: 'grok',
    },
    // Complex tasks -> more capable models
    byComplexity: {
      simple: 'grok', // Fast and cheap
      medium: 'claude',
      complex: 'claude-code', // Full agentic capabilities
    },
    costOptimization: true,
  },
};

/**
 * Load provider configuration from environment
 */
export function loadProviderConfig(): ProviderConfig {
  const config = { ...DEFAULT_PROVIDER_CONFIG };

  // Override default provider
  const defaultProvider = process.env.LLM_DEFAULT_PROVIDER as LLMProviderType;
  if (defaultProvider) {
    config.defaultProvider = defaultProvider;
  }

  // Override individual provider settings
  if (process.env.ANTHROPIC_API_KEY) {
    config.providers.claude.apiKey = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.OPENAI_API_KEY) {
    config.providers.openai.apiKey = process.env.OPENAI_API_KEY;
  }
  if (process.env.XAI_API_KEY) {
    config.providers.grok.apiKey = process.env.XAI_API_KEY;
  }
  if (process.env.OPENROUTER_API_KEY) {
    config.providers.openrouter.apiKey = process.env.OPENROUTER_API_KEY;
  }

  // Override Grok base URL
  if (process.env.XAI_BASE_URL) {
    config.providers.grok.baseUrl = process.env.XAI_BASE_URL;
  }

  // Override Ollama model
  if (process.env.OLLAMA_MODEL) {
    config.providers.ollama.model = process.env.OLLAMA_MODEL;
  }

  // Parse task routing from JSON env var
  if (process.env.LLM_TASK_ROUTING) {
    try {
      const routing = JSON.parse(process.env.LLM_TASK_ROUTING) as TaskRoutingConfig;
      config.taskRouting = { ...config.taskRouting, ...routing };
    } catch (e) {
      console.warn('[ProviderFactory] Failed to parse LLM_TASK_ROUTING:', e);
    }
  }

  return config;
}

/**
 * Provider Factory
 */
export class ProviderFactory {
  private config: ProviderConfig;
  private llmCliAvailable: boolean | null = null;

  constructor(config?: Partial<ProviderConfig>) {
    this.config = { ...loadProviderConfig(), ...config };
  }

  /**
   * Create a provider for a specific task
   */
  async createProvider(
    agentId: string,
    taskId: string,
    redis: RedisClient,
    characteristics?: TaskCharacteristics
  ): Promise<ILLMProvider> {
    // Select provider based on task characteristics
    const providerType = characteristics
      ? this.selectProvider(characteristics)
      : this.config.defaultProvider;

    return this.createProviderByType(providerType, agentId, taskId, redis);
  }

  /**
   * Create a specific provider by type
   */
  async createProviderByType(
    type: LLMProviderType,
    agentId: string,
    taskId: string,
    redis: RedisClient
  ): Promise<ILLMProvider> {
    const modelConfig = this.config.providers[type];

    if (!modelConfig) {
      console.warn(`[ProviderFactory] Unknown provider ${type}, falling back to claude-code`);
      return this.createClaudeCodeProvider(agentId, taskId, redis);
    }

    switch (type) {
      case 'claude-code':
        return this.createClaudeCodeProvider(agentId, taskId, redis);

      case 'claude':
      case 'openai':
      case 'grok':
      case 'ollama':
      case 'openrouter':
        return this.createLLMCliProvider(agentId, taskId, redis, modelConfig);

      default:
        console.warn(`[ProviderFactory] Unsupported provider ${type}, falling back to claude-code`);
        return this.createClaudeCodeProvider(agentId, taskId, redis);
    }
  }

  /**
   * Select provider based on task characteristics
   */
  selectProvider(characteristics: TaskCharacteristics): LLMProviderType {
    const routing = this.config.taskRouting;

    if (!routing) {
      return this.config.defaultProvider;
    }

    // Check custom router first
    if (routing.customRouter) {
      return routing.customRouter(characteristics);
    }

    // Tasks requiring tools MUST use claude-code
    if (characteristics.requiresTools) {
      return 'claude-code';
    }

    // Cost optimization: use cheaper models for simple, non-critical tasks
    if (
      routing.costOptimization &&
      characteristics.complexity === 'simple' &&
      characteristics.priority !== 'critical' &&
      !characteristics.requiresTools
    ) {
      // Prefer local models or cheaper options
      if (this.isProviderAvailable('ollama')) {
        return 'ollama';
      }
      if (this.isProviderAvailable('grok')) {
        return 'grok';
      }
    }

    // Route by task type
    if (routing.byTaskType?.[characteristics.type]) {
      const provider = routing.byTaskType[characteristics.type]!;
      if (this.isProviderAvailable(provider)) {
        return provider;
      }
    }

    // Route by complexity
    if (routing.byComplexity?.[characteristics.complexity]) {
      const provider = routing.byComplexity[characteristics.complexity]!;
      if (this.isProviderAvailable(provider)) {
        return provider;
      }
    }

    return this.config.defaultProvider;
  }

  /**
   * Check if a provider is available (has API key or is local)
   */
  private isProviderAvailable(type: LLMProviderType): boolean {
    const config = this.config.providers[type];
    if (!config) return false;

    switch (type) {
      case 'claude-code':
        return !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
      case 'claude':
        return !!config.apiKey || !!process.env.ANTHROPIC_API_KEY;
      case 'openai':
        return !!config.apiKey || !!process.env.OPENAI_API_KEY;
      case 'grok':
        return !!config.apiKey || !!process.env.XAI_API_KEY;
      case 'ollama':
        return true; // Always available if installed
      case 'openrouter':
        return !!config.apiKey || !!process.env.OPENROUTER_API_KEY;
      default:
        return false;
    }
  }

  /**
   * Create Claude Code provider
   */
  private createClaudeCodeProvider(
    agentId: string,
    taskId: string,
    redis: RedisClient
  ): ClaudeCodeProvider {
    return new ClaudeCodeProvider({
      agentId,
      taskId,
      redis,
    });
  }

  /**
   * Create LLM CLI provider
   */
  private async createLLMCliProvider(
    agentId: string,
    taskId: string,
    redis: RedisClient,
    modelConfig: ModelConfig
  ): Promise<LLMCliProvider> {
    // Check if llm CLI is available
    if (this.llmCliAvailable === null) {
      this.llmCliAvailable = await isLLMCliInstalled();
    }

    if (!this.llmCliAvailable) {
      console.warn('[ProviderFactory] llm CLI not installed, falling back to claude-code');
      throw new Error('llm CLI not installed');
    }

    return new LLMCliProvider({
      agentId,
      taskId,
      redis,
      modelConfig,
    });
  }

  /**
   * Get all available providers
   */
  getAvailableProviders(): LLMProviderType[] {
    return Object.keys(this.config.providers).filter(type =>
      this.isProviderAvailable(type as LLMProviderType)
    ) as LLMProviderType[];
  }

  /**
   * Get provider configuration
   */
  getConfig(): ProviderConfig {
    return this.config;
  }
}

/**
 * Singleton factory instance
 */
let factoryInstance: ProviderFactory | null = null;

export function getProviderFactory(): ProviderFactory {
  if (!factoryInstance) {
    factoryInstance = new ProviderFactory();
  }
  return factoryInstance;
}

/**
 * Initialize LLM CLI with required plugins
 */
export async function initializeLLMCli(): Promise<void> {
  const isInstalled = await isLLMCliInstalled();
  if (!isInstalled) {
    console.log('[ProviderFactory] llm CLI not installed, skipping plugin setup');
    return;
  }

  console.log('[ProviderFactory] Checking llm CLI plugins...');

  // Install required plugins based on configured providers
  const requiredPlugins: Record<LLMProviderType, string | null> = {
    'claude-code': null,
    claude: 'llm-anthropic',
    openai: null, // Built-in
    grok: null, // Uses OpenAI-compatible endpoint
    ollama: 'llm-ollama',
    openrouter: 'llm-openrouter',
  };

  for (const [provider, plugin] of Object.entries(requiredPlugins)) {
    if (plugin && process.env[`${provider.toUpperCase()}_API_KEY`]) {
      const installed = await installLLMPlugin(plugin);
      if (installed) {
        console.log(`[ProviderFactory] Installed ${plugin}`);
      }
    }
  }
}
