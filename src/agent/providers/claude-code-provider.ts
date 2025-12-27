/**
 * Claude Code Provider
 * ====================
 *
 * Provider implementation using Claude Code SDK.
 * This is the primary provider for agentic coding tasks.
 */

import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
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

interface ClaudeCodeProviderConfig {
  agentId: string;
  taskId: string;
  redis: RedisClient;
  modelConfig?: ModelConfig;
}

/**
 * Claude Code SDK provider for agentic coding
 */
export class ClaudeCodeProvider implements ILLMProvider {
  readonly name = 'Claude Code';
  readonly type: LLMProviderType = 'claude-code';
  readonly capabilities: ProviderCapabilities = {
    supportsTools: true,
    supportsStreaming: true,
    supportsImages: true,
    supportsCodeExecution: true,
    maxContextWindow: 200000,
    costPerMillionTokens: 15, // Sonnet pricing
  };

  private config: ClaudeCodeProviderConfig;
  private aborted = false;
  private progress = 0;
  private currentStep = 'Initializing';
  private toolCalls: LLMToolCall[] = [];

  onToolCall?: (tool: LLMToolCall) => Promise<void>;

  constructor(config: ClaudeCodeProviderConfig) {
    this.config = config;
  }

  async run(input: LLMSessionInput): Promise<LLMSessionResult> {
    const { agentId, taskId, redis } = this.config;

    console.log(`[ClaudeCode ${taskId}] Starting in ${input.workingDirectory}`);

    // Track commits before
    const commitsBefore = await this.getCommitCount(input.workingDirectory);

    // Build options
    const options: Options = {
      cwd: input.workingDirectory,
      permissionMode: 'bypassPermissions',
      env: {
        PATH: process.env.PATH,
        CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
        ...process.env,
      },
    };

    try {
      this.currentStep = 'Running Claude Code';

      // Build full prompt with context
      let fullPrompt = input.prompt;
      if (input.context?.memoryContext) {
        fullPrompt = `${input.context.memoryContext}\n\n---\n\nTask: ${fullPrompt}`;
      }
      if (input.context?.recoveryHints?.length) {
        fullPrompt += `\n\n---\n\nPrevious attempts failed. Avoid:\n${input.context.recoveryHints.map((h) => `- ${h}`).join('\n')}`;
      }

      // Run Claude Code session
      const events = query({
        prompt: fullPrompt,
        options,
      });

      // Process events
      for await (const event of events) {
        if (this.aborted) {
          throw new Error('Session aborted by user');
        }

        await this.handleEvent(event, redis, agentId, taskId);
      }

      // Get results
      const commitsAfter = await this.getCommitCount(input.workingDirectory);
      const filesModified = await this.getModifiedFiles(input.workingDirectory);

      this.progress = 100;
      this.currentStep = 'Complete';

      return {
        success: true,
        summary: `Completed. Created ${commitsAfter - commitsBefore} commits, modified ${filesModified.length} files.`,
        commitsCreated: commitsAfter - commitsBefore,
        filesModified,
        testsRun: false,
        testsPassed: false,
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

  private async handleEvent(
    event: unknown,
    redis: RedisClient,
    agentId: string,
    taskId: string
  ): Promise<void> {
    const e = event as {
      type?: string;
      tool?: { name: string; input: unknown };
      toolResult?: { content: unknown };
      content?: { text?: string };
    };

    if (e.type === 'tool_use' && e.tool) {
      const toolCall: LLMToolCall = {
        name: e.tool.name,
        input: e.tool.input as Record<string, unknown>,
      };

      this.toolCalls.push(toolCall);
      this.currentStep = `Using ${e.tool.name}`;
      this.progress = Math.min(90, this.progress + 5);

      // Publish tool call for streaming
      await redis.publish(AGENT_CHANNELS.TOOL_CALL, {
        type: 'agent:tool-call',
        agentId,
        taskId,
        tool: toolCall,
        timestamp: new Date().toISOString(),
      });

      // Call external handler if set
      if (this.onToolCall) {
        await this.onToolCall(toolCall);
      }

      console.log(`[ClaudeCode ${taskId}] Tool: ${e.tool.name}`);
    }

    if (e.type === 'tool_result') {
      this.progress = Math.min(90, this.progress + 2);
    }
  }

  async abort(): Promise<void> {
    this.aborted = true;
    this.currentStep = 'Aborting';
    console.log(`[ClaudeCode ${this.config.taskId}] Aborted`);
  }

  getProgress(): number {
    return this.progress;
  }

  getCurrentStep(): string {
    return this.currentStep;
  }

  private async getCommitCount(cwd: string): Promise<number> {
    try {
      const proc = Bun.spawn(['git', 'rev-list', '--count', 'HEAD'], {
        cwd,
        stdout: 'pipe',
      });
      const text = await new Response(proc.stdout).text();
      return parseInt(text.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }

  private async getModifiedFiles(cwd: string): Promise<string[]> {
    try {
      const proc = Bun.spawn(['git', 'diff', '--name-only', 'HEAD~1'], {
        cwd,
        stdout: 'pipe',
      });
      const text = await new Response(proc.stdout).text();
      return text
        .trim()
        .split('\n')
        .filter((f) => f);
    } catch {
      return [];
    }
  }
}
