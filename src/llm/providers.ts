/**
 * LLM Provider Abstractions
 * =========================
 *
 * Unified interface for calling multiple LLM providers.
 * Supports: Claude (Anthropic), OpenAI, Grok (xAI), Ollama, OpenRouter, Custom
 *
 * Requires FEATURE_MULTI_LLM to be enabled.
 */

import { isEnabled } from '../config/features';

export type LLMProviderType =
  | 'claude'
  | 'openai'
  | 'grok'
  | 'gemini'
  | 'mistral'
  | 'groq'
  | 'together'
  | 'cohere'
  | 'perplexity'
  | 'ollama'
  | 'openrouter'
  | 'custom';

export type AuthMethod = 'api-key' | 'oauth' | 'none';

export interface LLMProviderConfig {
  type: LLMProviderType;
  apiKey?: string;
  oauthToken?: string;
  authMethod?: AuthMethod;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  tokensUsed: number;
  model: string;
  provider: LLMProviderType;
}

/**
 * Default provider configurations
 */
export const DEFAULT_PROVIDER_CONFIGS: Record<LLMProviderType, Partial<LLMProviderConfig>> = {
  claude: {
    type: 'claude',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 8192,
  },
  openai: {
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    maxTokens: 8192,
  },
  grok: {
    type: 'grok',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-2-latest',
    maxTokens: 8192,
  },
  gemini: {
    type: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-1.5-pro',
    maxTokens: 8192,
  },
  mistral: {
    type: 'mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest',
    maxTokens: 8192,
  },
  groq: {
    type: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    maxTokens: 8192,
  },
  together: {
    type: 'together',
    baseUrl: 'https://api.together.xyz/v1',
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    maxTokens: 8192,
  },
  cohere: {
    type: 'cohere',
    baseUrl: 'https://api.cohere.ai/v1',
    model: 'command-r-plus',
    maxTokens: 4096,
  },
  perplexity: {
    type: 'perplexity',
    baseUrl: 'https://api.perplexity.ai',
    model: 'llama-3.1-sonar-large-128k-online',
    maxTokens: 4096,
  },
  ollama: {
    type: 'ollama',
    baseUrl: 'http://localhost:11434/api',
    model: 'llama3.2',
    maxTokens: 4096,
  },
  openrouter: {
    type: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3.5-sonnet',
    maxTokens: 8192,
  },
  custom: {
    type: 'custom',
    model: 'custom-model',
    maxTokens: 4096,
  },
};

/**
 * LLM Provider class - handles API calls to various providers
 */
export class LLMProvider {
  private config: LLMProviderConfig;

  constructor(config: Partial<LLMProviderConfig> & { type: LLMProviderType }) {
    // Merge with defaults
    const defaults = DEFAULT_PROVIDER_CONFIGS[config.type];
    const credentials = this.getEnvCredentials(config.type);

    this.config = {
      ...defaults,
      ...config,
      apiKey: config.apiKey || credentials.apiKey,
      oauthToken: config.oauthToken || credentials.oauthToken,
      authMethod: config.authMethod || credentials.authMethod,
    } as LLMProviderConfig;
  }

  /**
   * Get credentials from environment (supports both API key and OAuth)
   */
  private getEnvCredentials(type: LLMProviderType): {
    apiKey: string;
    oauthToken: string;
    authMethod: AuthMethod;
  } {
    // API key environment variables
    const apiKeyVars: Record<LLMProviderType, string> = {
      claude: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      grok: 'XAI_API_KEY',
      gemini: 'GEMINI_API_KEY', // Also check GOOGLE_API_KEY
      mistral: 'MISTRAL_API_KEY',
      groq: 'GROQ_API_KEY',
      together: 'TOGETHER_API_KEY',
      cohere: 'COHERE_API_KEY',
      perplexity: 'PERPLEXITY_API_KEY',
      ollama: '', // No API key needed for local Ollama
      openrouter: 'OPENROUTER_API_KEY',
      custom: 'CUSTOM_LLM_API_KEY',
    };

    // OAuth token environment variables (for providers that support it)
    const oauthVars: Record<LLMProviderType, string> = {
      claude: 'CLAUDE_CODE_OAUTH_TOKEN', // Also check CLAUDE_OAUTH_TOKEN
      openai: 'OPENAI_OAUTH_TOKEN', // Future-proofing
      grok: '', // xAI doesn't use OAuth yet
      gemini: '', // Gemini uses OAuth for specific features only
      mistral: '',
      groq: '',
      together: '',
      cohere: '',
      perplexity: '',
      ollama: '', // Local
      openrouter: '', // Uses API key
      custom: 'CUSTOM_OAUTH_TOKEN',
    };

    // Handle providers with multiple env var options
    let apiKey = '';
    if (type === 'gemini') {
      apiKey = process.env.GEMINI_API_KEY
        || process.env.GOOGLE_API_KEY  // GOOGLE_API_KEY takes precedence per Google docs
        || '';
    } else {
      apiKey = process.env[apiKeyVars[type]] || '';
    }

    // For Claude, check multiple OAuth env var names
    let oauthToken = '';
    if (type === 'claude') {
      oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
        || process.env.CLAUDE_OAUTH_TOKEN
        || '';
    } else {
      oauthToken = process.env[oauthVars[type]] || '';
    }

    // Determine auth method: prefer OAuth if available, then API key, then none
    let authMethod: AuthMethod = 'none';
    if (type === 'ollama') {
      authMethod = 'none';
    } else if (oauthToken) {
      authMethod = 'oauth';
    } else if (apiKey) {
      authMethod = 'api-key';
    }

    return { apiKey, oauthToken, authMethod };
  }

  /**
   * Send a message to the LLM
   */
  async chat(
    messages: LLMMessage[],
    systemPrompt?: string
  ): Promise<LLMResponse> {
    switch (this.config.type) {
      case 'claude':
        return this.callClaude(messages, systemPrompt);
      case 'gemini':
        return this.callGemini(messages, systemPrompt);
      case 'cohere':
        return this.callCohere(messages, systemPrompt);
      case 'openai':
      case 'grok':
      case 'mistral':
      case 'groq':
      case 'together':
      case 'perplexity':
      case 'openrouter':
        return this.callOpenAICompatible(messages, systemPrompt);
      case 'ollama':
        return this.callOllama(messages, systemPrompt);
      case 'custom':
        return this.callCustom(messages, systemPrompt);
      default:
        throw new Error(`Unsupported provider: ${this.config.type}`);
    }
  }

  /**
   * Call Claude (Anthropic API) - supports both API key and OAuth
   */
  private async callClaude(
    messages: LLMMessage[],
    systemPrompt?: string
  ): Promise<LLMResponse> {
    // Build headers based on auth method
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    };

    // Use OAuth token if available, otherwise fall back to API key
    if (this.config.authMethod === 'oauth' && this.config.oauthToken) {
      headers['Authorization'] = `Bearer ${this.config.oauthToken}`;
    } else {
      headers['x-api-key'] = this.config.apiKey || '';
    }

    const response = await fetch(`${this.config.baseUrl}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        system: systemPrompt,
        messages: messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({
            role: m.role,
            content: m.content,
          })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
    };
    const content = data.content[0];

    if (content.type !== 'text' || !content.text) {
      throw new Error('Unexpected response type from Claude');
    }

    return {
      content: content.text,
      tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      model: data.model || this.config.model,
      provider: 'claude',
    };
  }

  /**
   * Call Google Gemini API
   */
  private async callGemini(
    messages: LLMMessage[],
    systemPrompt?: string
  ): Promise<LLMResponse> {
    // Gemini uses a different endpoint structure
    const model = this.config.model || 'gemini-1.5-pro';
    const url = `${this.config.baseUrl}/models/${model}:generateContent?key=${this.config.apiKey}`;

    // Convert messages to Gemini format
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: this.config.maxTokens,
        temperature: this.config.temperature || 0.7,
      },
    };

    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const tokensUsed = (data.usageMetadata?.promptTokenCount || 0) +
                       (data.usageMetadata?.candidatesTokenCount || 0);

    return {
      content: text,
      tokensUsed,
      model,
      provider: 'gemini',
    };
  }

  /**
   * Call Cohere API
   */
  private async callCohere(
    messages: LLMMessage[],
    systemPrompt?: string
  ): Promise<LLMResponse> {
    // Convert messages to Cohere chat format
    const chatHistory = messages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'CHATBOT' : 'USER',
      message: m.content,
    }));

    const lastMessage = messages[messages.length - 1];

    const response = await fetch(`${this.config.baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        message: lastMessage?.content || '',
        chat_history: chatHistory,
        preamble: systemPrompt,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature || 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cohere API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      text?: string;
      meta?: { tokens?: { input_tokens?: number; output_tokens?: number } };
    };

    const tokensUsed = (data.meta?.tokens?.input_tokens || 0) +
                       (data.meta?.tokens?.output_tokens || 0);

    return {
      content: data.text || '',
      tokensUsed,
      model: this.config.model,
      provider: 'cohere',
    };
  }

  /**
   * Call OpenAI-compatible APIs (OpenAI, Grok, OpenRouter)
   */
  private async callOpenAICompatible(
    messages: LLMMessage[],
    systemPrompt?: string
  ): Promise<LLMResponse> {
    const allMessages = systemPrompt
      ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
      : messages;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    // OpenRouter requires additional headers
    if (this.config.type === 'openrouter') {
      headers['HTTP-Referer'] = 'https://lugh.local';
      headers['X-Title'] = 'Lugh Swarm';
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature || 0.7,
        messages: allMessages,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`${this.config.type} API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      model?: string;
    };

    return {
      content: data.choices[0]?.message?.content || '',
      tokensUsed: data.usage?.total_tokens || 0,
      model: data.model || this.config.model,
      provider: this.config.type,
    };
  }

  /**
   * Call Ollama (local models)
   */
  private async callOllama(
    messages: LLMMessage[],
    systemPrompt?: string
  ): Promise<LLMResponse> {
    const allMessages = systemPrompt
      ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
      : messages;

    const response = await fetch(`${this.config.baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: allMessages,
        stream: false,
        options: {
          num_predict: this.config.maxTokens,
          temperature: this.config.temperature || 0.7,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      message?: { content: string };
      eval_count?: number;
      prompt_eval_count?: number;
      model?: string;
    };

    return {
      content: data.message?.content || '',
      tokensUsed: (data.eval_count || 0) + (data.prompt_eval_count || 0),
      model: data.model || this.config.model,
      provider: 'ollama',
    };
  }

  /**
   * Call custom provider (user-configured endpoint)
   */
  private async callCustom(
    messages: LLMMessage[],
    systemPrompt?: string
  ): Promise<LLMResponse> {
    if (!this.config.baseUrl) {
      throw new Error('Custom provider requires baseUrl');
    }

    const allMessages = systemPrompt
      ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
      : messages;

    // Try OpenAI-compatible format first
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        messages: allMessages,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Custom provider error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message: { content: string } }>;
      content?: string;
      usage?: { total_tokens?: number };
      model?: string;
    };

    // Handle both OpenAI and simple response formats
    const content = data.choices?.[0]?.message?.content || data.content || '';

    return {
      content,
      tokensUsed: data.usage?.total_tokens || 0,
      model: data.model || this.config.model,
      provider: 'custom',
    };
  }

  /**
   * Get provider configuration
   */
  getConfig(): LLMProviderConfig {
    return { ...this.config };
  }

  /**
   * Check if provider is available (has API key, OAuth token, or is local)
   */
  isAvailable(): boolean {
    if (this.config.type === 'ollama') {
      // Ollama doesn't need an API key
      return true;
    }
    // Check for either API key or OAuth token
    return Boolean(this.config.apiKey) || Boolean(this.config.oauthToken);
  }

  /**
   * Get the auth method being used
   */
  getAuthMethod(): AuthMethod {
    return this.config.authMethod || 'none';
  }
}

/**
 * Create a provider instance
 */
export function createProvider(
  type: LLMProviderType,
  overrides?: Partial<LLMProviderConfig>
): LLMProvider {
  return new LLMProvider({ type, ...overrides });
}

/**
 * Get list of available providers (those with configured API keys)
 */
export function getAvailableLLMProviders(): LLMProviderType[] {
  const providers: LLMProviderType[] = [
    'claude', 'openai', 'grok', 'gemini', 'mistral',
    'groq', 'together', 'cohere', 'perplexity',
    'ollama', 'openrouter', 'custom'
  ];
  return providers.filter((type) => {
    const provider = createProvider(type);
    return provider.isAvailable();
  });
}

/**
 * Provider factory - manages multiple provider instances
 */
export class LLMProviderFactory {
  private providers: Map<string, LLMProvider> = new Map();
  private customConfigs: Map<string, LLMProviderConfig> = new Map();

  constructor() {
    if (!isEnabled('MULTI_LLM')) {
      throw new Error(
        '[LLMProviderFactory] MULTI_LLM feature is not enabled. ' +
          'Set FEATURE_MULTI_LLM=true to use multi-LLM provider support.'
      );
    }
  }

  /**
   * Get or create a provider instance
   */
  getProvider(type: LLMProviderType, configId?: string): LLMProvider {
    const key = configId || type;

    if (!this.providers.has(key)) {
      const customConfig = configId ? this.customConfigs.get(configId) : undefined;
      const provider = createProvider(type, customConfig);
      this.providers.set(key, provider);
    }

    return this.providers.get(key)!;
  }

  /**
   * Register a custom provider configuration
   */
  registerCustomConfig(configId: string, config: LLMProviderConfig): void {
    this.customConfigs.set(configId, config);
    // Clear cached provider to pick up new config
    this.providers.delete(configId);
  }

  /**
   * List all registered configurations
   */
  listConfigs(): Array<{ id: string; config: LLMProviderConfig; authMethod: AuthMethod }> {
    const results: Array<{ id: string; config: LLMProviderConfig; authMethod: AuthMethod }> = [];

    // All default providers
    const defaultProviders: LLMProviderType[] = [
      'claude', 'openai', 'grok', 'gemini', 'mistral',
      'groq', 'together', 'cohere', 'perplexity',
      'ollama', 'openrouter'
    ];

    for (const type of defaultProviders) {
      const provider = createProvider(type);
      results.push({
        id: type,
        config: provider.getConfig(),
        authMethod: provider.getAuthMethod(),
      });
    }

    // Custom configs
    for (const [id, config] of this.customConfigs) {
      results.push({ id, config, authMethod: config.authMethod || 'api-key' });
    }

    return results;
  }
}

// Export singleton factory (only instantiate if feature is enabled)
export const llmProviderFactory = isEnabled('MULTI_LLM')
  ? new LLMProviderFactory()
  : (null as unknown as LLMProviderFactory);
