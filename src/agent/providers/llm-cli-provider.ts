/**
 * LLM CLI Provider
 * =================
 *
 * Provider implementation using Simon Willison's llm CLI tool.
 * Supports: Claude, OpenAI, Grok, Ollama, OpenRouter, and more.
 *
 * @see https://github.com/simonw/llm
 */

import type {
  ILLMProvider,
  LLMProviderType,
  LLMSessionInput,
  LLMSessionResult,
  LLMToolCall,
  ProviderCapabilities,
  ModelConfig,
} from './types';
import type { RedisClient } from '../../redis/client';
import { AGENT_CHANNELS } from '../../redis/client';

// Model presets available for reference (used by documentation)
// 'claude-3.5-sonnet', 'claude-3-opus', 'claude-3-haiku' (requires llm-anthropic)
// 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini' (built-in)
// 'grok-2', 'grok-2-mini' (OpenAI-compatible)
// 'llama3.2', 'codellama', 'mistral', 'deepseek-coder' (requires llm-ollama)

/**
 * Cost per million tokens (approximate)
 */
const COST_PER_MILLION: Record<string, number> = {
  'claude-3.5-sonnet': 15,
  'claude-3-opus': 75,
  'claude-3-haiku': 1.25,
  'gpt-4o': 10,
  'gpt-4o-mini': 0.6,
  'gpt-4-turbo': 30,
  'o1': 60,
  'o1-mini': 12,
  'grok-2': 10,
  'grok-2-mini': 2,
  'llama3.2': 0, // Local
  'codellama': 0,
  'mistral': 0,
  'deepseek-coder': 0,
};

interface LLMCliProviderConfig {
  agentId: string;
  taskId: string;
  redis: RedisClient;
  modelConfig: ModelConfig;
}

/**
 * LLM CLI provider for multiple LLM backends
 */
export class LLMCliProvider implements ILLMProvider {
  readonly name: string;
  readonly type: LLMProviderType;
  readonly capabilities: ProviderCapabilities;

  private config: LLMCliProviderConfig;
  private aborted = false;
  private progress = 0;
  private currentStep = 'Initializing';
  private currentProcess: ReturnType<typeof Bun.spawn> | null = null;

  onToolCall?: (tool: LLMToolCall) => Promise<void>;

  constructor(config: LLMCliProviderConfig) {
    this.config = config;
    this.name = `LLM CLI (${config.modelConfig.model})`;
    this.type = config.modelConfig.provider;

    // Set capabilities based on provider
    const costPerMillion = COST_PER_MILLION[config.modelConfig.model] || 10;

    this.capabilities = {
      supportsTools: false, // llm CLI doesn't have tool use like Claude Code
      supportsStreaming: true,
      supportsImages: this.supportsImages(config.modelConfig.model),
      supportsCodeExecution: false,
      maxContextWindow: this.getContextWindow(config.modelConfig.model),
      costPerMillionTokens: costPerMillion,
    };
  }

  async run(input: LLMSessionInput): Promise<LLMSessionResult> {
    const { agentId, taskId, redis, modelConfig } = this.config;

    console.log(`[LLM-CLI ${taskId}] Starting with model ${modelConfig.model}`);
    this.currentStep = 'Preparing prompt';
    this.progress = 10;

    try {
      // Build the full prompt
      let fullPrompt = input.prompt;

      // Add system prompt if provided
      const systemPrompt =
        input.systemPrompt ||
        'You are a helpful coding assistant. Provide clear, concise responses.';

      // Add context
      if (input.context?.memoryContext) {
        fullPrompt = `Context:\n${input.context.memoryContext}\n\n---\n\nTask: ${fullPrompt}`;
      }
      if (input.context?.recoveryHints?.length) {
        fullPrompt += `\n\n---\n\nPrevious attempts failed. Avoid:\n${input.context.recoveryHints.map((h) => `- ${h}`).join('\n')}`;
      }

      this.currentStep = `Running ${modelConfig.model}`;
      this.progress = 30;

      // Build llm CLI command
      const args = this.buildLLMCommand(modelConfig, systemPrompt);

      // Run llm CLI
      const startTime = Date.now();
      const response = await this.executeLLM(args, fullPrompt, input.workingDirectory);
      const durationMs = Date.now() - startTime;

      this.progress = 90;
      this.currentStep = 'Processing response';

      // Estimate tokens (rough: ~4 chars per token)
      const estimatedTokens = Math.ceil((fullPrompt.length + response.length) / 4);
      const cost =
        (estimatedTokens / 1_000_000) * this.capabilities.costPerMillionTokens;

      // Publish response for streaming
      await redis.publish(AGENT_CHANNELS.TOOL_CALL, {
        type: 'agent:tool-call',
        agentId,
        taskId,
        tool: {
          name: 'llm_response',
          input: {
            model: modelConfig.model,
            responseLength: response.length,
            durationMs,
          },
        },
        timestamp: new Date().toISOString(),
      });

      this.progress = 100;
      this.currentStep = 'Complete';

      return {
        success: true,
        summary: `Generated response with ${modelConfig.model} (${estimatedTokens} tokens, ${durationMs}ms)`,
        response,
        commitsCreated: 0, // llm CLI doesn't create commits
        filesModified: [],
        testsRun: false,
        testsPassed: false,
        tokensUsed: estimatedTokens,
        cost,
      };
    } catch (error) {
      return {
        success: false,
        summary: error instanceof Error ? error.message : 'Unknown error',
        commitsCreated: 0,
        filesModified: [],
        testsRun: false,
        testsPassed: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          recoverable: !this.aborted,
        },
      };
    }
  }

  private buildLLMCommand(config: ModelConfig, systemPrompt: string): string[] {
    const args: string[] = ['llm'];

    // Model selection
    args.push('-m', config.model);

    // System prompt
    args.push('-s', systemPrompt);

    // Temperature
    if (config.temperature !== undefined) {
      args.push('-o', `temperature=${config.temperature}`);
    }

    // Max tokens
    if (config.maxTokens !== undefined) {
      args.push('-o', `max_tokens=${config.maxTokens}`);
    }

    return args;
  }

  private async executeLLM(
    args: string[],
    prompt: string,
    cwd: string
  ): Promise<string> {
    // Prepare environment - filter out undefined values
    const baseEnv = process.env as Record<string, string | undefined>;
    const env: Record<string, string> = {};

    for (const [key, value] of Object.entries(baseEnv)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }

    // Ensure PATH is set
    if (!env.PATH) {
      env.PATH = '/usr/local/bin:/usr/bin:/bin';
    }

    // Add API keys based on provider
    const { modelConfig } = this.config;

    if (modelConfig.provider === 'claude' && modelConfig.apiKey) {
      env.ANTHROPIC_API_KEY = modelConfig.apiKey;
    } else if (modelConfig.provider === 'openai' && modelConfig.apiKey) {
      env.OPENAI_API_KEY = modelConfig.apiKey;
    } else if (modelConfig.provider === 'grok') {
      // Grok uses OpenAI-compatible endpoint
      if (modelConfig.apiKey) env.XAI_API_KEY = modelConfig.apiKey;
      if (modelConfig.baseUrl) env.OPENAI_API_BASE = modelConfig.baseUrl;
    } else if (modelConfig.provider === 'openrouter' && modelConfig.apiKey) {
      env.OPENROUTER_API_KEY = modelConfig.apiKey;
    }

    // Write prompt to a temp file to avoid stdin issues
    const tempFile = `/tmp/llm-prompt-${Date.now()}.txt`;
    await Bun.write(tempFile, prompt);

    // Create the process using shell to handle input redirection
    this.currentProcess = Bun.spawn(['sh', '-c', `cat "${tempFile}" | ${args.join(' ')}`], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      env,
    });

    // Read response - handle Bun's stdout/stderr types
    const stdoutStream = this.currentProcess.stdout;
    const stderrStream = this.currentProcess.stderr;

    let stdout = '';
    let stderr = '';

    // Only read if we have a readable stream (not a file descriptor number)
    if (stdoutStream && typeof stdoutStream !== 'number') {
      stdout = await new Response(stdoutStream as ReadableStream).text();
    }
    if (stderrStream && typeof stderrStream !== 'number') {
      stderr = await new Response(stderrStream as ReadableStream).text();
    }

    // Wait for process to complete
    const exitCode = await this.currentProcess.exited;

    this.currentProcess = null;

    // Clean up temp file
    try {
      await Bun.write(tempFile, ''); // Clear contents
    } catch {
      // Ignore cleanup errors
    }

    if (exitCode !== 0) {
      throw new Error(`llm CLI failed (exit ${exitCode}): ${stderr || stdout}`);
    }

    if (this.aborted) {
      throw new Error('Session aborted by user');
    }

    return stdout.trim();
  }

  async abort(): Promise<void> {
    this.aborted = true;
    this.currentStep = 'Aborting';

    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }

    console.log(`[LLM-CLI ${this.config.taskId}] Aborted`);
  }

  getProgress(): number {
    return this.progress;
  }

  getCurrentStep(): string {
    return this.currentStep;
  }

  private supportsImages(model: string): boolean {
    const imageModels = [
      'gpt-4o',
      'gpt-4-turbo',
      'claude-3.5-sonnet',
      'claude-3-opus',
      'grok-2',
    ];
    return imageModels.some((m) => model.includes(m));
  }

  private getContextWindow(model: string): number {
    const contextWindows: Record<string, number> = {
      'claude-3.5-sonnet': 200000,
      'claude-3-opus': 200000,
      'claude-3-haiku': 200000,
      'gpt-4o': 128000,
      'gpt-4o-mini': 128000,
      'gpt-4-turbo': 128000,
      'o1': 128000,
      'grok-2': 131072,
      'llama3.2': 128000,
      'mistral': 32000,
    };
    return contextWindows[model] || 32000;
  }
}

/**
 * Check if llm CLI is installed
 */
export async function isLLMCliInstalled(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['llm', '--version'], { stdout: 'pipe' });
    await proc.exited;
    return true;
  } catch {
    return false;
  }
}

/**
 * Install llm CLI plugin
 */
export async function installLLMPlugin(plugin: string): Promise<boolean> {
  try {
    console.log(`[LLM-CLI] Installing plugin: ${plugin}`);
    const proc = Bun.spawn(['llm', 'install', plugin], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get installed llm CLI plugins
 */
export async function getInstalledPlugins(): Promise<string[]> {
  try {
    const proc = Bun.spawn(['llm', 'plugins'], { stdout: 'pipe' });
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    // Parse plugin names from output
    const lines = output.trim().split('\n');
    return lines.map((line) => line.trim()).filter((line) => line);
  } catch {
    return [];
  }
}
