/**
 * Telegram Freewheel UI
 * =====================
 *
 * Provides Telegram-specific UI components for freewheel mode:
 * - Inline keyboards for approval/control
 * - Status messages with progress
 * - Mid-flight intervention buttons
 */

import type { Telegraf, Context, Markup } from 'telegraf';
import type { CallbackQuery, Message } from 'telegraf/types';
import {
  freewheelCoordinator,
  type ApprovalResponse,
} from '../swarm/freewheel-coordinator';
import {
  summarizeIntent,
  type FreewheelSession,
  type CheckpointType,
  type FreewheelIntent,
} from '../swarm/freewheel-mode';

// ============================================================================
// TYPES
// ============================================================================

interface PendingApproval {
  sessionId: string;
  checkpoint: CheckpointType;
  description: string;
  options: string[];
  messageId: number;
  resolve: (response: ApprovalResponse) => void;
}

interface PendingQuestion {
  sessionId: string;
  question: string;
  options?: string[];
  messageId: number;
  resolve: (answer: string) => void;
}

// ============================================================================
// TELEGRAM FREEWHEEL HANDLER
// ============================================================================

/**
 * TelegramFreewheelHandler
 * Manages Telegram UI for freewheel mode
 */
export class TelegramFreewheelHandler {
  private bot: Telegraf;
  private pendingApprovals: Map<string, PendingApproval> = new Map();
  private pendingQuestions: Map<string, PendingQuestion> = new Map();
  private sessionMessages: Map<string, number[]> = new Map(); // sessionId -> messageIds

  constructor(bot: Telegraf) {
    this.bot = bot;
    this.setupCallbackHandlers();
    this.setupCoordinatorCallbacks();
  }

  // =========================================================================
  // CALLBACK HANDLERS
  // =========================================================================

  /**
   * Set up Telegram callback query handlers
   */
  private setupCallbackHandlers(): void {
    // Handle approval responses
    this.bot.action(/^freewheel:approve:(.+):(.+)$/, async (ctx) => {
      const sessionId = ctx.match[1];
      const option = ctx.match[2];
      await this.handleApprovalCallback(ctx, sessionId, option, true);
    });

    this.bot.action(/^freewheel:reject:(.+)$/, async (ctx) => {
      const sessionId = ctx.match[1];
      await this.handleApprovalCallback(ctx, sessionId, '', false);
    });

    // Handle control actions
    this.bot.action(/^freewheel:pause:(.+)$/, async (ctx) => {
      const sessionId = ctx.match[1];
      await this.handlePause(ctx, sessionId);
    });

    this.bot.action(/^freewheel:resume:(.+)$/, async (ctx) => {
      const sessionId = ctx.match[1];
      await this.handleResume(ctx, sessionId);
    });

    this.bot.action(/^freewheel:cancel:(.+)$/, async (ctx) => {
      const sessionId = ctx.match[1];
      await this.handleCancel(ctx, sessionId);
    });

    // Handle question responses
    this.bot.action(/^freewheel:answer:(.+):(.+)$/, async (ctx) => {
      const sessionId = ctx.match[1];
      const answer = decodeURIComponent(ctx.match[2]);
      await this.handleQuestionCallback(ctx, sessionId, answer);
    });

    // Handle confirmation
    this.bot.action(/^freewheel:confirm:(.+)$/, async (ctx) => {
      const sessionId = ctx.match[1];
      const pending = this.pendingQuestions.get(sessionId);
      if (pending) {
        pending.resolve('yes');
        this.pendingQuestions.delete(sessionId);
        await ctx.editMessageReplyMarkup(undefined);
        await ctx.answerCbQuery('Confirmed!');
      }
    });

    this.bot.action(/^freewheel:modify:(.+)$/, async (ctx) => {
      const sessionId = ctx.match[1];
      await ctx.answerCbQuery('Send your modifications as a message');
      // TODO: Set up message listener for modifications
    });
  }

  /**
   * Set up coordinator callbacks
   */
  private setupCoordinatorCallbacks(): void {
    if (!freewheelCoordinator) return;

    // Approval requests
    freewheelCoordinator.setApprovalCallback(
      async (session, checkpoint, description, options) => {
        return this.sendApprovalRequest(session, checkpoint, description, options);
      }
    );

    // Status updates
    freewheelCoordinator.setStatusCallback(async (session, message, data) => {
      await this.sendStatusUpdate(session, message, data);
    });

    // Questions
    freewheelCoordinator.setQuestionCallback(async (session, question, options) => {
      return this.sendQuestion(session, question, options);
    });
  }

  // =========================================================================
  // APPROVAL UI
  // =========================================================================

  /**
   * Send approval request with inline keyboard
   */
  private async sendApprovalRequest(
    session: FreewheelSession,
    checkpoint: CheckpointType,
    description: string,
    options: string[]
  ): Promise<ApprovalResponse> {
    const chatId = parseInt(session.conversationId, 10);

    // Build inline keyboard
    const keyboard = this.buildApprovalKeyboard(session.id, options);

    // Send message
    const checkpointEmoji = this.getCheckpointEmoji(checkpoint);
    const message = await this.bot.telegram.sendMessage(
      chatId,
      `${checkpointEmoji} **Approval Required**\n\n${description}\n\n_Waiting for your response..._`,
      {
        parse_mode: 'Markdown',
        ...keyboard,
      }
    );

    // Track message
    this.trackMessage(session.id, message.message_id);

    // Wait for response
    return new Promise((resolve) => {
      this.pendingApprovals.set(session.id, {
        sessionId: session.id,
        checkpoint,
        description,
        options,
        messageId: message.message_id,
        resolve,
      });

      // Set timeout
      setTimeout(() => {
        const pending = this.pendingApprovals.get(session.id);
        if (pending) {
          this.pendingApprovals.delete(session.id);
          resolve({ approved: false, feedback: 'Timed out' });
        }
      }, 300000); // 5 minute timeout
    });
  }

  /**
   * Build approval keyboard
   */
  private buildApprovalKeyboard(
    sessionId: string,
    options: string[]
  ): { reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } {
    const buttons = options.map((opt) => ({
      text: opt,
      callback_data: `freewheel:approve:${sessionId}:${encodeURIComponent(opt)}`,
    }));

    // Add cancel button
    buttons.push({
      text: '❌ Cancel',
      callback_data: `freewheel:reject:${sessionId}`,
    });

    // Arrange in rows of 2
    const rows: Array<Array<{ text: string; callback_data: string }>> = [];
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2));
    }

    return { reply_markup: { inline_keyboard: rows } };
  }

  /**
   * Handle approval callback
   */
  private async handleApprovalCallback(
    ctx: Context,
    sessionId: string,
    option: string,
    approved: boolean
  ): Promise<void> {
    const pending = this.pendingApprovals.get(sessionId);
    if (!pending) {
      await ctx.answerCbQuery('Request expired');
      return;
    }

    this.pendingApprovals.delete(sessionId);

    // Update message
    const emoji = approved ? '✅' : '❌';
    const status = approved ? `Approved: ${decodeURIComponent(option)}` : 'Rejected';
    await ctx.editMessageText(
      `${emoji} ${status}\n\n_${pending.description}_`,
      { parse_mode: 'Markdown' }
    );

    await ctx.answerCbQuery(status);

    // Resolve promise
    pending.resolve({
      approved,
      selectedOption: decodeURIComponent(option),
    });
  }

  // =========================================================================
  // STATUS UI
  // =========================================================================

  /**
   * Send status update with control buttons
   */
  async sendStatusUpdate(
    session: FreewheelSession,
    message: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    const chatId = parseInt(session.conversationId, 10);

    // Build status message
    const statusEmoji = this.getStatusEmoji(session.status);
    let text = `${statusEmoji} ${message}`;

    if (data) {
      // Add relevant data
      if ('subTaskCount' in data) {
        text += `\n\n📋 ${data.subTaskCount as number} subtasks identified`;
      }
      if ('progress' in data) {
        text += `\n📊 Progress: ${data.progress as number}%`;
      }
    }

    // Add control buttons if session is running
    const keyboard =
      session.status === 'running'
        ? this.buildControlKeyboard(session.id)
        : undefined;

    const msg = await this.bot.telegram.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      ...keyboard,
    });

    this.trackMessage(session.id, msg.message_id);
  }

  /**
   * Build control keyboard for running session
   */
  private buildControlKeyboard(
    sessionId: string
  ): { reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } {
    return {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⏸️ Pause', callback_data: `freewheel:pause:${sessionId}` },
            { text: '🛑 Cancel', callback_data: `freewheel:cancel:${sessionId}` },
          ],
        ],
      },
    };
  }

  /**
   * Handle pause action
   */
  private async handlePause(ctx: Context, sessionId: string): Promise<void> {
    const success = await freewheelCoordinator?.pause(sessionId);
    if (success) {
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [
          [
            { text: '▶️ Resume', callback_data: `freewheel:resume:${sessionId}` },
            { text: '🛑 Cancel', callback_data: `freewheel:cancel:${sessionId}` },
          ],
        ],
      });
      await ctx.answerCbQuery('Paused');
    } else {
      await ctx.answerCbQuery('Could not pause');
    }
  }

  /**
   * Handle resume action
   */
  private async handleResume(ctx: Context, sessionId: string): Promise<void> {
    const success = await freewheelCoordinator?.resume(sessionId);
    if (success) {
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [
          [
            { text: '⏸️ Pause', callback_data: `freewheel:pause:${sessionId}` },
            { text: '🛑 Cancel', callback_data: `freewheel:cancel:${sessionId}` },
          ],
        ],
      });
      await ctx.answerCbQuery('Resumed');
    } else {
      await ctx.answerCbQuery('Could not resume');
    }
  }

  /**
   * Handle cancel action
   */
  private async handleCancel(ctx: Context, sessionId: string): Promise<void> {
    const success = await freewheelCoordinator?.cancel(sessionId);
    if (success) {
      await ctx.editMessageReplyMarkup(undefined);
      await ctx.answerCbQuery('Cancelled');
    } else {
      await ctx.answerCbQuery('Could not cancel');
    }
  }

  // =========================================================================
  // QUESTION UI
  // =========================================================================

  /**
   * Send question to user
   */
  private async sendQuestion(
    session: FreewheelSession,
    question: string,
    options?: string[]
  ): Promise<string> {
    const chatId = parseInt(session.conversationId, 10);

    let keyboard:
      | { reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } }
      | undefined;

    if (options && options.length > 0) {
      const buttons = options.map((opt) => ({
        text: opt,
        callback_data: `freewheel:answer:${session.id}:${encodeURIComponent(opt)}`,
      }));

      // Arrange in rows of 2
      const rows: Array<Array<{ text: string; callback_data: string }>> = [];
      for (let i = 0; i < buttons.length; i += 2) {
        rows.push(buttons.slice(i, i + 2));
      }

      keyboard = { reply_markup: { inline_keyboard: rows } };
    }

    const message = await this.bot.telegram.sendMessage(chatId, `❓ ${question}`, {
      parse_mode: 'Markdown',
      ...keyboard,
    });

    this.trackMessage(session.id, message.message_id);

    // Wait for response
    return new Promise((resolve) => {
      this.pendingQuestions.set(session.id, {
        sessionId: session.id,
        question,
        options,
        messageId: message.message_id,
        resolve,
      });

      // Set timeout
      setTimeout(() => {
        const pending = this.pendingQuestions.get(session.id);
        if (pending) {
          this.pendingQuestions.delete(session.id);
          resolve('timeout');
        }
      }, 300000); // 5 minute timeout
    });
  }

  /**
   * Handle question callback
   */
  private async handleQuestionCallback(
    ctx: Context,
    sessionId: string,
    answer: string
  ): Promise<void> {
    const pending = this.pendingQuestions.get(sessionId);
    if (!pending) {
      await ctx.answerCbQuery('Question expired');
      return;
    }

    this.pendingQuestions.delete(sessionId);

    // Update message
    await ctx.editMessageText(`✅ Selected: ${answer}`, { parse_mode: 'Markdown' });
    await ctx.answerCbQuery('Got it!');

    // Resolve promise
    pending.resolve(answer);
  }

  // =========================================================================
  // SESSION START UI
  // =========================================================================

  /**
   * Send initial confirmation message for freewheel intent
   */
  async sendIntentConfirmation(
    chatId: number,
    intent: FreewheelIntent,
    sessionId: string
  ): Promise<boolean> {
    const summary = summarizeIntent(intent);

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Proceed', callback_data: `freewheel:confirm:${sessionId}` },
            { text: '⚙️ Modify', callback_data: `freewheel:modify:${sessionId}` },
          ],
          [{ text: '❌ Cancel', callback_data: `freewheel:reject:${sessionId}` }],
        ],
      },
    };

    const message = await this.bot.telegram.sendMessage(
      chatId,
      `🎯 **I understood your request as:**\n\n${summary}`,
      {
        parse_mode: 'Markdown',
        ...keyboard,
      }
    );

    // Wait for response
    return new Promise((resolve) => {
      this.pendingQuestions.set(sessionId, {
        sessionId,
        question: 'confirmation',
        messageId: message.message_id,
        resolve: (answer) => resolve(answer === 'yes'),
      });

      setTimeout(() => {
        if (this.pendingQuestions.has(sessionId)) {
          this.pendingQuestions.delete(sessionId);
          resolve(false);
        }
      }, 60000); // 1 minute timeout for confirmation
    });
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  /**
   * Get emoji for checkpoint type
   */
  private getCheckpointEmoji(checkpoint: CheckpointType): string {
    const emojis: Record<CheckpointType, string> = {
      task_start: '🚀',
      major_decision: '🔀',
      file_change: '📝',
      task_complete: '✅',
      phase_complete: '🎯',
    };
    return emojis[checkpoint] || '❓';
  }

  /**
   * Get emoji for session status
   */
  private getStatusEmoji(status: FreewheelSession['status']): string {
    const emojis: Record<FreewheelSession['status'], string> = {
      parsing: '🔍',
      confirming: '❓',
      running: '⚡',
      paused: '⏸️',
      waiting_approval: '🔔',
      completed: '✅',
      cancelled: '❌',
    };
    return emojis[status] || '📌';
  }

  /**
   * Track message for cleanup
   */
  private trackMessage(sessionId: string, messageId: number): void {
    const existing = this.sessionMessages.get(sessionId) || [];
    existing.push(messageId);
    this.sessionMessages.set(sessionId, existing);
  }

  /**
   * Clean up messages for a session
   */
  async cleanupSession(sessionId: string, chatId: number): Promise<void> {
    const messageIds = this.sessionMessages.get(sessionId);
    if (!messageIds) return;

    for (const messageId of messageIds) {
      try {
        await this.bot.telegram.deleteMessage(chatId, messageId);
      } catch {
        // Message may already be deleted
      }
    }

    this.sessionMessages.delete(sessionId);
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let handler: TelegramFreewheelHandler | null = null;

/**
 * Get or create the Telegram freewheel handler
 */
export function getTelegramFreewheelHandler(bot: Telegraf): TelegramFreewheelHandler {
  if (!handler) {
    handler = new TelegramFreewheelHandler(bot);
  }
  return handler;
}

/**
 * Check if a message looks like a freewheel request
 */
export function isFreewheelRequest(message: string): boolean {
  const freewheelPatterns = [
    // Explicit freewheel triggers
    /\b(go wild|freewheel|full autonomy|do your thing|have at it)\b/i,

    // Multi-agent triggers
    /\b(\d+)\s*agents?\b/i,
    /\b(debate|argue|consensus|compete)\s+(the|about|on|this)/i,

    // Strategy triggers
    /\b(parallel|simultaneous)\s+(agents?|execution)/i,

    // Big task indicators (combined with model specification)
    /\b(build|create|implement|design)\s+.+\s+(use|with)\s+(opus|sonnet|haiku|gpt)/i,

    // Explicit control mode triggers
    /\b(check with me|ask me before|approve each)\b/i,
  ];

  return freewheelPatterns.some((pattern) => pattern.test(message));
}
