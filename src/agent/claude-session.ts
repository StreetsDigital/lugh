/**
 * Claude Session
 * ==============
 *
 * Wrapper around Claude Code SDK for running agent sessions.
 * Handles streaming, tool calls, and session lifecycle.
 */

import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { AGENT_CHANNELS, type RedisClient } from '../redis/client';

interface SessionConfig {
  agentId: string;
  taskId: string;
  workingDirectory: string;
  redis: RedisClient;
}

interface SessionInput {
  prompt: string;
  context?: {
    previousAttempts: number;
    recoveryHints: string[];
    memoryContext: string;
  };
}

interface SessionResult {
  success: boolean;
  summary: string;
  commitsCreated: number;
  filesModified: string[];
  testsRun: boolean;
  testsPassed: boolean;
  error?: {
    message: string;
    stack?: string;
    recoverable: boolean;
  };
}

/**
 * Claude Code session wrapper
 */
export class ClaudeSession {
  private config: SessionConfig;
  private aborted = false;
  private progress = 0;
  private currentStep = 'Initializing';
  private toolCalls: { name: string; input: unknown }[] = [];

  constructor(config: SessionConfig) {
    this.config = config;
  }

  /**
   * Run the session
   */
  async run(input: SessionInput): Promise<SessionResult> {
    const { agentId, taskId, workingDirectory, redis } = this.config;

    console.log(`[Session ${taskId}] Starting in ${workingDirectory}`);

    // Track commits before
    const commitsBefore = await this.getCommitCount(workingDirectory);

    // Build options
    const options: Options = {
      cwd: workingDirectory,
      permissionMode: 'bypassPermissions',
      env: {
        PATH: process.env.PATH,
        CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
        ...process.env,
      },
    };

    try {
      this.currentStep = 'Running Claude Code';

      // Run Claude Code session
      const events = query({
        prompt: input.prompt,
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
      const commitsAfter = await this.getCommitCount(workingDirectory);
      const filesModified = await this.getModifiedFiles(workingDirectory);

      this.progress = 100;
      this.currentStep = 'Complete';

      return {
        success: true,
        summary: `Completed. Created ${commitsAfter - commitsBefore} commits, modified ${filesModified.length} files.`,
        commitsCreated: commitsAfter - commitsBefore,
        filesModified,
        testsRun: false, // TODO: Detect if tests were run
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

  /**
   * Handle streaming event
   */
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

    // Tool use events
    if (e.type === 'tool_use' && e.tool) {
      this.toolCalls.push(e.tool);
      this.currentStep = `Using ${e.tool.name}`;
      this.progress = Math.min(90, this.progress + 5);

      // Publish tool call for streaming
      await redis.publish(AGENT_CHANNELS.TOOL_CALL, {
        type: 'agent:tool-call',
        agentId,
        taskId,
        tool: {
          name: e.tool.name,
          input: e.tool.input as Record<string, unknown>,
        },
        timestamp: new Date().toISOString(),
      });

      console.log(`[Session ${taskId}] Tool: ${e.tool.name}`);
    }

    // Tool result events
    if (e.type === 'tool_result') {
      this.progress = Math.min(90, this.progress + 2);
    }

    // Text events
    if (e.type === 'text' && e.content?.text) {
      // Could stream text back if needed
    }
  }

  /**
   * Abort the session
   */
  async abort(): Promise<void> {
    this.aborted = true;
    this.currentStep = 'Aborting';
    console.log(`[Session ${this.config.taskId}] Aborted`);
  }

  /**
   * Get current progress (0-100)
   */
  getProgress(): number {
    return this.progress;
  }

  /**
   * Get current step description
   */
  getCurrentStep(): string {
    return this.currentStep;
  }

  /**
   * Get commit count in working directory
   */
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

  /**
   * Get modified files in working directory
   */
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
        .filter(f => f);
    } catch {
      return [];
    }
  }
}
