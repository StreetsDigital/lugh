/**
 * LLM Provider Types
 * ==================
 *
 * Common types for multi-LLM provider support.
 */

/**
 * Supported LLM providers
 */
export type LLMProviderType =
  | 'claude-code' // Claude Code SDK (agentic coding)
  | 'claude' // Claude via llm CLI
  | 'openai' // OpenAI GPT models via llm CLI
  | 'grok' // xAI Grok via llm CLI (OpenAI-compatible)
  | 'ollama' // Local models via Ollama
  | 'openrouter'; // OpenRouter for multiple providers

/**
 * Model configuration
 */
export interface ModelConfig {
  provider: LLMProviderType;
  model: string; // e.g., 'claude-3-sonnet', 'gpt-4o', 'grok-2'
  apiKey?: string; // API key (from env if not specified)
  baseUrl?: string; // Custom endpoint (for Grok, Ollama, OpenRouter)
  maxTokens?: number;
  temperature?: number;
}

/**
 * Task characteristics for LLM selection
 */
export interface TaskCharacteristics {
  type: 'coding' | 'analysis' | 'chat' | 'review' | 'planning';
  complexity: 'simple' | 'medium' | 'complex';
  requiresTools: boolean; // Does task need tool use (file ops, git, etc)?
  estimatedTokens?: number;
  priority: 'low' | 'normal' | 'high' | 'critical';
  costSensitive?: boolean;
}

/**
 * Session input for LLM providers
 */
export interface LLMSessionInput {
  prompt: string;
  systemPrompt?: string;
  context?: {
    previousAttempts?: number;
    recoveryHints?: string[];
    memoryContext?: string;
  };
  workingDirectory: string;
  taskCharacteristics?: TaskCharacteristics;
}

/**
 * Tool call from LLM
 */
export interface LLMToolCall {
  name: string;
  input: Record<string, unknown>;
}

/**
 * Session result from LLM providers
 */
export interface LLMSessionResult {
  success: boolean;
  summary: string;
  response?: string; // Raw LLM response (for non-agentic providers)
  commitsCreated: number;
  filesModified: string[];
  testsRun: boolean;
  testsPassed: boolean;
  tokensUsed?: number;
  cost?: number; // Estimated cost in USD
  error?: {
    message: string;
    stack?: string;
    recoverable: boolean;
  };
}

/**
 * Provider capabilities
 */
export interface ProviderCapabilities {
  supportsTools: boolean; // Can use tools (file ops, git, etc)
  supportsStreaming: boolean; // Can stream responses
  supportsImages: boolean; // Can process images
  supportsCodeExecution: boolean; // Can execute code in sandbox
  maxContextWindow: number; // Max tokens in context
  costPerMillionTokens: number; // Approximate cost for comparison
}

/**
 * LLM Provider interface
 */
export interface ILLMProvider {
  readonly name: string;
  readonly type: LLMProviderType;
  readonly capabilities: ProviderCapabilities;

  /**
   * Run a session with this provider
   */
  run(input: LLMSessionInput): Promise<LLMSessionResult>;

  /**
   * Abort the current session
   */
  abort(): Promise<void>;

  /**
   * Get current progress (0-100)
   */
  getProgress(): number;

  /**
   * Get current step description
   */
  getCurrentStep(): string;

  /**
   * Event callback for tool calls (streaming)
   */
  onToolCall?: (tool: LLMToolCall) => Promise<void>;
}

/**
 * Provider factory configuration
 */
export interface ProviderConfig {
  defaultProvider: LLMProviderType;
  providers: Record<LLMProviderType, ModelConfig>;
  taskRouting?: TaskRoutingConfig;
}

/**
 * Task-based LLM routing configuration
 */
export interface TaskRoutingConfig {
  // Route by task type
  byTaskType?: Partial<Record<TaskCharacteristics['type'], LLMProviderType>>;

  // Route by complexity
  byComplexity?: Partial<Record<TaskCharacteristics['complexity'], LLMProviderType>>;

  // Cost optimization: use cheaper models for simple tasks
  costOptimization?: boolean;

  // Custom routing function
  customRouter?: (characteristics: TaskCharacteristics) => LLMProviderType;
}
