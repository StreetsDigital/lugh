/**
 * Telegram Integration for V1.1
 * ==============================
 *
 * Wires the Telegram adapter to the multi-agent pool manager.
 *
 * Flow:
 * 1. Telegram message comes in
 * 2. Dispatch to agent pool
 * 3. Stream tool calls back to Telegram via Redis
 * 4. Send final result to Telegram
 */

import { Telegraf } from 'telegraf';
import { v4 as uuid } from 'uuid';
import { getPoolManager, type AgentPoolManager } from './pool-manager';
import { getRecoveryManager, type RecoveryManager, type EscalationInfo } from './recovery';
import { getRedisClient, type RedisClient } from '../redis/client';
import { formatToolCall } from '../src/utils/tool-formatter';

// Types
interface ConversationState {
  codebaseId: string | null;
  workingDirectory: string;
  activeTaskId: string | null;
}

/**
 * Telegram Integration for Multi-Agent Pool
 */
export class TelegramPoolIntegration {
  private bot: Telegraf;
  private poolManager: AgentPoolManager;
  private recoveryManager: RecoveryManager;
  private redis: RedisClient;
  private conversations: Map<string, ConversationState> = new Map();

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.bot = new Telegraf(token);
    this.poolManager = getPoolManager();
    this.recoveryManager = getRecoveryManager();
    this.redis = getRedisClient();
  }

  /**
   * Start the integration
   */
  async start(): Promise<void> {
    console.log('[TelegramPool] Starting...');

    // Connect Redis
    await this.redis.connect();

    // Start pool manager
    await this.poolManager.start();

    // Set up pool event handlers
    this.setupPoolHandlers();

    // Set up recovery escalation
    this.setupRecoveryHandler();

    // Set up bot handlers
    this.setupBotHandlers();

    // Start bot
    await this.bot.launch();

    console.log('[TelegramPool] Ready');
  }

  /**
   * Stop the integration
   */
  async stop(): Promise<void> {
    console.log('[TelegramPool] Stopping...');

    this.bot.stop('SIGTERM');
    await this.poolManager.stop();
    await this.redis.disconnect();

    console.log('[TelegramPool] Stopped');
  }

  /**
   * Set up pool manager event handlers
   */
  private setupPoolHandlers(): void {
    this.poolManager.setHandlers({
      // Task completed successfully
      onTaskComplete: async (task, result) => {
        const chatId = task.conversationId;

        // Clear active task
        const state = this.conversations.get(chatId);
        if (state) {
          state.activeTaskId = null;
        }

        // Send success message
        const message = [
          '✅ **Task Complete**',
          '',
          result.summary,
          '',
          `📊 Stats:`,
          `• Commits: ${result.claims.commitsCreated}`,
          `• Files: ${result.claims.filesModified.length}`,
          `• Duration: ${Math.round(result.durationMs / 1000)}s`,
        ].join('\n');

        await this.sendMessage(chatId, message);
      },

      // Task failed
      onTaskFailed: async (task, result) => {
        const chatId = task.conversationId;

        // Clear active task
        const state = this.conversations.get(chatId);
        if (state) {
          state.activeTaskId = null;
        }

        // Check if we should retry
        const { retry, context } = await this.recoveryManager.handleFailure(
          task.id,
          task.description,
          result.agentId,
          result
        );

        if (retry && context) {
          // Notify user we're retrying
          await this.sendMessage(
            chatId,
            `⚠️ Task failed (attempt ${context.attemptNumber}/${3}). Retrying with recovery hints...`
          );

          // Re-dispatch with recovery context
          await this.poolManager.dispatchTask({
            id: uuid(),
            description: task.description,
            codebaseId: state?.codebaseId || '',
            worktreePath: state?.workingDirectory || '/worktrees/default',
            conversationId: chatId,
            platform: 'telegram',
            context: {
              previousAttempts: context.previousAttempts,
              recoveryHints: context.recoveryHints,
              memoryContext: context.whatToAvoid.join('\n'),
            },
          });
        } else {
          // Final failure - already escalated by recovery manager
          await this.sendMessage(
            chatId,
            `❌ **Task Failed**\n\n${result.error?.message || result.summary}\n\nUse /retry to try again or /status to check agents.`
          );
        }
      },

      // Tool call (for streaming)
      onToolCall: async (_agentId, taskId, tool) => {
        // Find the conversation for this task
        for (const [chatId, state] of this.conversations.entries()) {
          if (state.activeTaskId === taskId) {
            const formatted = formatToolCall(tool.name, tool.input as Record<string, unknown>);
            await this.sendMessage(chatId, formatted);
            break;
          }
        }
      },

      // Agent died
      onAgentDead: async (agentId) => {
        console.log(`[TelegramPool] Agent ${agentId} died`);
        // Could notify admin channel if configured
      },
    });
  }

  /**
   * Set up recovery escalation handler
   */
  private setupRecoveryHandler(): void {
    this.recoveryManager.setEscalationHandler(async (info: EscalationInfo) => {
      // Find the conversation for this task
      for (const [chatId, state] of this.conversations.entries()) {
        if (state.activeTaskId === info.taskId) {
          const message = [
            '🚨 **Human Intervention Needed**',
            '',
            `Task: ${info.taskDescription}`,
            `Attempts: ${info.attempts.length}`,
            '',
            '**Failure History:**',
            ...info.attempts.map(
              (a, i) => `${i + 1}. ${a.error.slice(0, 100)}${a.error.length > 100 ? '...' : ''}`
            ),
            '',
            '**Suggested Actions:**',
            ...info.suggestedActions.map((a) => `• ${a}`),
          ].join('\n');

          await this.sendMessage(chatId, message);
          break;
        }
      }
    });
  }

  /**
   * Set up Telegram bot handlers
   */
  private setupBotHandlers(): void {
    // Authorization check
    const allowedUsers = process.env.TELEGRAM_ALLOWED_USER_IDS?.split(',').map((id) =>
      parseInt(id.trim(), 10)
    );

    const isAuthorized = (userId: number): boolean => {
      if (!allowedUsers || allowedUsers.length === 0) return true;
      return allowedUsers.includes(userId);
    };

    // /start command
    this.bot.command('start', async (ctx) => {
      if (!isAuthorized(ctx.from.id)) return;

      await ctx.reply(
        [
          '🤖 **AgentCommander V1.1**',
          '',
          'Multi-agent coding with Redis coordination.',
          '',
          '**Commands:**',
          '/status - Show agent pool status',
          '/stop - Stop current task',
          '/agents - List all agents',
          '/setcwd <path> - Set working directory',
          '',
          'Send any message to dispatch a coding task.',
        ].join('\n'),
        { parse_mode: 'Markdown' }
      );
    });

    // /status command
    this.bot.command('status', async (ctx) => {
      if (!isAuthorized(ctx.from.id)) return;

      const status = this.poolManager.getStatus();
      const chatId = ctx.chat.id.toString();
      const state = this.conversations.get(chatId);

      const message = [
        '📊 **Pool Status**',
        '',
        `**Agents:** ${status.agents.length}`,
        ...status.agents.map(
          (a) =>
            `• ${a.id.slice(0, 8)}: ${a.status}${a.currentTask ? ` (task: ${a.currentTask.slice(0, 8)})` : ''}`
        ),
        '',
        `**Tasks:**`,
        `• Queued: ${status.tasks.queued}`,
        `• Running: ${status.tasks.running}`,
        `• Completed: ${status.tasks.completed}`,
        `• Failed: ${status.tasks.failed}`,
        '',
        `**This conversation:**`,
        `• Working dir: ${state?.workingDirectory || 'Not set'}`,
        `• Active task: ${state?.activeTaskId?.slice(0, 8) || 'None'}`,
      ].join('\n');

      await ctx.reply(message, { parse_mode: 'Markdown' });
    });

    // /stop command
    this.bot.command('stop', async (ctx) => {
      if (!isAuthorized(ctx.from.id)) return;

      const chatId = ctx.chat.id.toString();
      const state = this.conversations.get(chatId);

      if (!state?.activeTaskId) {
        await ctx.reply('No active task to stop.');
        return;
      }

      const stopped = await this.poolManager.stopTask(
        state.activeTaskId,
        'User requested stop'
      );

      if (stopped) {
        state.activeTaskId = null;
        await ctx.reply('⏹️ Task stopped.');
      } else {
        await ctx.reply('Failed to stop task.');
      }
    });

    // /agents command
    this.bot.command('agents', async (ctx) => {
      if (!isAuthorized(ctx.from.id)) return;

      const status = this.poolManager.getStatus();

      if (status.agents.length === 0) {
        await ctx.reply('No agents connected. Waiting for agents to register...');
        return;
      }

      const message = [
        '🤖 **Agent Pool**',
        '',
        ...status.agents.map((a) =>
          [
            `**${a.id.slice(0, 8)}**`,
            `  Status: ${a.status}`,
            `  Task: ${a.currentTask?.slice(0, 8) || 'idle'}`,
            `  Heartbeat: ${a.lastHeartbeat}`,
          ].join('\n')
        ),
      ].join('\n\n');

      await ctx.reply(message, { parse_mode: 'Markdown' });
    });

    // /setcwd command
    this.bot.command('setcwd', async (ctx) => {
      if (!isAuthorized(ctx.from.id)) return;

      const chatId = ctx.chat.id.toString();
      const path = ctx.message.text.replace('/setcwd', '').trim();

      if (!path) {
        await ctx.reply('Usage: /setcwd /path/to/project');
        return;
      }

      const state = this.getOrCreateState(chatId);
      state.workingDirectory = path;

      await ctx.reply(`✅ Working directory set to: ${path}`);
    });

    // Regular messages - dispatch as tasks
    this.bot.on('text', async (ctx) => {
      if (!isAuthorized(ctx.from.id)) return;

      // Skip if it's a command
      if (ctx.message.text.startsWith('/')) return;

      const chatId = ctx.chat.id.toString();
      const state = this.getOrCreateState(chatId);

      // Check if there's already an active task
      if (state.activeTaskId) {
        await ctx.reply(
          '⏳ A task is already running. Use /stop to cancel it first.'
        );
        return;
      }

      // Create task
      const taskId = uuid();
      state.activeTaskId = taskId;

      await ctx.reply('🚀 Dispatching task to agent pool...');

      // Dispatch to pool
      const result = await this.poolManager.dispatchTask({
        id: taskId,
        description: ctx.message.text,
        codebaseId: state.codebaseId || 'default',
        worktreePath: state.workingDirectory,
        conversationId: chatId,
        platform: 'telegram',
      });

      if (result.dispatched) {
        await ctx.reply(`✅ Task assigned to agent ${result.agentId?.slice(0, 8)}`);
      } else {
        await ctx.reply(
          `📋 Task queued (position: ${result.queuePosition}). Waiting for available agent...`
        );
      }
    });
  }

  /**
   * Get or create conversation state
   */
  private getOrCreateState(chatId: string): ConversationState {
    let state = this.conversations.get(chatId);
    if (!state) {
      state = {
        codebaseId: null,
        workingDirectory: '/worktrees/default',
        activeTaskId: null,
      };
      this.conversations.set(chatId, state);
    }
    return state;
  }

  /**
   * Send message to Telegram
   */
  private async sendMessage(chatId: string, text: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      // Fallback to plain text if markdown fails
      try {
        await this.bot.telegram.sendMessage(chatId, text);
      } catch (e) {
        console.error('[TelegramPool] Failed to send message:', e);
      }
    }
  }
}

/**
 * Create and start the integration
 */
export async function startTelegramPoolIntegration(): Promise<TelegramPoolIntegration> {
  const integration = new TelegramPoolIntegration();
  await integration.start();
  return integration;
}
