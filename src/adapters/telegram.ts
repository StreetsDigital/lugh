/**
 * Telegram platform adapter using Telegraf SDK
 * Handles message sending with 4096 character limit splitting
 */
import { Telegraf, Context } from 'telegraf';
import { IPlatformAdapter } from '../types';
import { parseAllowedUserIds, isUserAuthorized } from '../utils/telegram-auth';
import { convertToTelegramMarkdown, stripMarkdown } from '../utils/telegram-markdown';
import { telegramApprovalHandler } from './telegram-approvals';
import { telegramAgentApprovalHandler } from './telegram-agent-approvals';

const MAX_LENGTH = 4096;

/**
 * Message context passed to onMessage handler
 */
export interface TelegramMessageContext {
  conversationId: string;
  message: string;
  userId: number | undefined;
}

export class TelegramAdapter implements IPlatformAdapter {
  private bot: Telegraf;
  private streamingMode: 'stream' | 'batch';
  private allowedUserIds: number[];
  private messageHandler: ((ctx: TelegramMessageContext) => Promise<void>) | null = null;

  constructor(token: string, mode: 'stream' | 'batch' = 'stream') {
    // Disable handler timeout to support long-running AI operations
    // Default is 90 seconds which is too short for complex coding tasks
    this.bot = new Telegraf(token, {
      handlerTimeout: Infinity,
    });
    this.streamingMode = mode;

    // Parse Telegram user whitelist (optional - empty = open access)
    // Support both TELEGRAM_ALLOWED_USER_IDS and TELEGRAM_ALLOWED_USERS
    this.allowedUserIds = parseAllowedUserIds(
      process.env.TELEGRAM_ALLOWED_USER_IDS ?? process.env.TELEGRAM_ALLOWED_USERS
    );
    if (this.allowedUserIds.length > 0) {
      console.log(
        `[Telegram] User whitelist enabled (${String(this.allowedUserIds.length)} users)`
      );
    } else {
      console.log('[Telegram] User whitelist disabled (open access)');
    }

    console.log(`[Telegram] Adapter initialized (mode: ${mode}, timeout: disabled)`);
  }

  /**
   * Send a message to a Telegram chat
   * Automatically splits messages longer than 4096 characters
   *
   * Formatting strategy:
   * - Short messages (≤4096 chars): Convert to MarkdownV2 for nice formatting
   * - Long messages: Split by paragraphs, format each chunk independently
   *   (paragraphs rarely have formatting that spans across them)
   */
  async sendMessage(chatId: string, message: string): Promise<void> {
    const id = parseInt(chatId);
    console.log(`[Telegram] sendMessage called, length=${String(message.length)}`);

    if (message.length <= MAX_LENGTH) {
      // Short message: try MarkdownV2 formatting
      await this.sendFormattedChunk(id, message);
    } else {
      // Long message: split by paragraphs, format each chunk
      console.log(
        `[Telegram] Message too long (${String(message.length)}), splitting by paragraphs`
      );
      const chunks = this.splitIntoParagraphChunks(message, MAX_LENGTH - 200);

      for (const chunk of chunks) {
        await this.sendFormattedChunk(id, chunk);
      }
    }
  }

  /**
   * Send a file to the user via Telegram
   * Supports local file paths or Buffer content
   */
  async sendFile(chatId: string, filePath: string, caption?: string): Promise<void> {
    const id = parseInt(chatId);
    console.log(`[Telegram] sendFile called: ${filePath}`);

    try {
      // Use Telegraf's sendDocument with file path
      await this.bot.telegram.sendDocument(
        id,
        { source: filePath },
        { caption: caption || undefined }
      );
      console.log(`[Telegram] File sent successfully: ${filePath}`);
    } catch (error) {
      console.error(`[Telegram] Failed to send file: ${filePath}`, error);
      // Fallback: send file path as message
      await this.sendMessage(
        chatId,
        `📁 File created: \`${filePath}\`\n\n_(File sending failed - access it directly on the server)_`
      );
    }
  }

  /**
   * Split message into chunks by paragraph boundaries
   * Paragraphs are separated by double newlines and usually contain complete formatting
   */
  private splitIntoParagraphChunks(message: string, maxLength: number): string[] {
    const paragraphs = message.split(/\n\n+/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const para of paragraphs) {
      const newLength = currentChunk.length + para.length + 2; // +2 for \n\n

      if (newLength > maxLength && currentChunk) {
        // Current chunk is full, start a new one
        chunks.push(currentChunk);
        currentChunk = para;
      } else {
        // Add paragraph to current chunk
        currentChunk += (currentChunk ? '\n\n' : '') + para;
      }
    }

    // Don't forget the last chunk
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    console.log(`[Telegram] Split into ${String(chunks.length)} paragraph chunks`);
    return chunks;
  }

  /**
   * Send a single chunk with MarkdownV2 formatting, with fallback to plain text
   */
  private async sendFormattedChunk(id: number, chunk: string): Promise<void> {
    // If chunk is still too long after paragraph splitting, fall back to plain text
    if (chunk.length > MAX_LENGTH) {
      console.log(`[Telegram] Chunk too long (${String(chunk.length)}), sending as plain text`);
      const plainText = stripMarkdown(chunk);
      // Split by lines if still too long
      const lines = plainText.split('\n');
      let subChunk = '';
      for (const line of lines) {
        if (subChunk.length + line.length + 1 > MAX_LENGTH - 100) {
          if (subChunk) await this.bot.telegram.sendMessage(id, subChunk);
          subChunk = line;
        } else {
          subChunk += (subChunk ? '\n' : '') + line;
        }
      }
      if (subChunk) await this.bot.telegram.sendMessage(id, subChunk);
      return;
    }

    // Try MarkdownV2 formatting
    const formatted = convertToTelegramMarkdown(chunk);
    try {
      await this.bot.telegram.sendMessage(id, formatted, { parse_mode: 'MarkdownV2' });
      console.log(`[Telegram] MarkdownV2 chunk sent (${String(chunk.length)} chars)`);
    } catch (error) {
      // Fallback to stripped plain text for this chunk
      const err = error as Error;
      console.warn('[Telegram] MarkdownV2 failed for chunk, using plain text:', err.message);
      console.warn('[Telegram] Original chunk (first 500 chars):', chunk.substring(0, 500));
      console.warn('[Telegram] Formatted chunk (first 500 chars):', formatted.substring(0, 500));
      console.warn(
        '[Telegram] Formatted chunk (around byte 4059):',
        formatted.substring(4000, 4100)
      );
      await this.bot.telegram.sendMessage(id, stripMarkdown(chunk));
    }
  }

  /**
   * Get the Telegraf bot instance
   */
  getBot(): Telegraf {
    return this.bot;
  }

  /**
   * Get the configured streaming mode
   */
  getStreamingMode(): 'stream' | 'batch' {
    return this.streamingMode;
  }

  /**
   * Get platform type
   */
  getPlatformType(): string {
    return 'telegram';
  }

  /**
   * Extract conversation ID from Telegram context
   */
  getConversationId(ctx: Context): string {
    if (!ctx.chat) {
      throw new Error('No chat in context');
    }
    return ctx.chat.id.toString();
  }

  /**
   * Ensure responses go to a thread.
   * Telegram doesn't have threads - each chat is a persistent conversation.
   * Returns original conversation ID unchanged.
   */
  async ensureThread(originalConversationId: string, _messageContext?: unknown): Promise<string> {
    return originalConversationId;
  }

  /**
   * Register a message handler for incoming messages
   * Must be called before start()
   */
  onMessage(handler: (ctx: TelegramMessageContext) => Promise<void>): void {
    this.messageHandler = handler;
  }

  /**
   * Start the bot (begins polling)
   */
  async start(): Promise<void> {
    // Register /pending command to show all pending agent approvals
    this.bot.command('pending', async ctx => {
      const userId = ctx.from.id;
      if (!isUserAuthorized(userId, this.allowedUserIds)) {
        return; // Silent rejection
      }

      // Get all pending approvals across all swarms
      const allPending = telegramAgentApprovalHandler.getAllPendingApprovals();

      if (allPending.length === 0) {
        await ctx.reply('✅ No pending agent approvals.', { parse_mode: 'Markdown' });
        return;
      }

      let summary = '👀 **All Pending Agent Approvals**\n\n';
      summary += `📊 Total pending: ${allPending.length} agent${allPending.length > 1 ? 's' : ''}\n\n`;

      // Group by swarm
      const bySwarm = new Map<string, typeof allPending>();
      for (const req of allPending) {
        const swarmList = bySwarm.get(req.swarmId) || [];
        swarmList.push(req);
        bySwarm.set(req.swarmId, swarmList);
      }

      for (const [swarmId, agents] of bySwarm) {
        summary += `🐝 **Swarm:** \`${swarmId}\`\n`;
        for (const req of agents) {
          const priorityEmoji =
            req.priority === 'critical'
              ? '🔴'
              : req.priority === 'high'
                ? '🟠'
                : req.priority === 'medium'
                  ? '🟡'
                  : '🟢';
          summary += `  ${priorityEmoji} ${req.role}: ${req.title}\n`;
        }
        summary += '\n';
      }

      await ctx.reply(summary, { parse_mode: 'Markdown' });
    });

    // Register /test-approval command to create mock approvals with buttons
    this.bot.command('test_approval', async ctx => {
      const userId = ctx.from.id;
      if (!isUserAuthorized(userId, this.allowedUserIds)) {
        return;
      }

      const chatId = ctx.chat.id;
      const swarmId = `test-swarm-${Date.now().toString(36)}`;

      // Create 3 test agents with different priorities
      const testAgents = [
        { role: 'Researcher', title: 'Find API documentation', priority: 'high' as const },
        { role: 'Code Writer', title: 'Implement login endpoint', priority: 'medium' as const },
        { role: 'Debugger', title: 'Fix authentication bug', priority: 'critical' as const },
      ];

      await ctx.reply(`🧪 Creating ${testAgents.length} test approval requests...`);

      for (const agent of testAgents) {
        await telegramAgentApprovalHandler.sendAgentSpawnApproval(
          this.bot,
          chatId,
          swarmId,
          `agent-${Math.random().toString(36).substring(2, 8)}`,
          agent.role,
          agent.title,
          `Test task: ${agent.title}. This is a mock approval for testing the button interface.`,
          agent.priority,
          'medium',
          true,
          300000
        );
        // Small delay between messages
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    });

    // Register callback query handlers for approval buttons
    this.bot.on('callback_query', async ctx => {
      const data = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
      if (!data) return;

      // Authorization check
      const userId = ctx.from.id;
      if (!isUserAuthorized(userId, this.allowedUserIds)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
      }

      try {
        if (data.startsWith('approve:')) {
          const approvalId = data.replace('approve:', '');
          const success = await telegramApprovalHandler.handleApprove(
            approvalId,
            userId.toString()
          );

          if (success) {
            await ctx.answerCbQuery('Approved!');
            const originalText =
              ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message
                ? ctx.callbackQuery.message.text
                : '';
            await ctx.editMessageText(originalText + '\n\n✅ **APPROVED**', {
              parse_mode: 'Markdown',
            });
          } else {
            await ctx.answerCbQuery('Already processed or expired');
          }
        } else if (data.startsWith('reject:')) {
          const approvalId = data.replace('reject:', '');
          const success = await telegramApprovalHandler.handleReject(approvalId, userId.toString());

          if (success) {
            await ctx.answerCbQuery('Rejected');
            const originalText =
              ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message
                ? ctx.callbackQuery.message.text
                : '';
            await ctx.editMessageText(originalText + '\n\n❌ **REJECTED**', {
              parse_mode: 'Markdown',
            });
          } else {
            await ctx.answerCbQuery('Already processed or expired');
          }
        } else if (data.startsWith('details:')) {
          const approvalId = data.replace('details:', '');
          const details = await telegramApprovalHandler.getApprovalDetails(approvalId);
          await ctx.answerCbQuery();
          await ctx.reply(details, { parse_mode: 'Markdown' });
        }
        // ========== AGENT SPAWN APPROVALS ==========
        else if (data.startsWith('agent_approve:')) {
          const approvalId = data.replace('agent_approve:', '');
          const success = await telegramAgentApprovalHandler.handleAgentApprove(
            approvalId,
            userId.toString()
          );

          if (success) {
            await ctx.answerCbQuery('🚀 Agent starting!');
            const originalText =
              ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message
                ? ctx.callbackQuery.message.text
                : '';
            await ctx.editMessageText(originalText + '\n\n✅ **AGENT APPROVED - Starting...**', {
              parse_mode: 'Markdown',
            });
          } else {
            await ctx.answerCbQuery('Already processed or expired');
          }
        } else if (data.startsWith('agent_reject:')) {
          const approvalId = data.replace('agent_reject:', '');
          const success = await telegramAgentApprovalHandler.handleAgentReject(
            approvalId,
            userId.toString()
          );

          if (success) {
            await ctx.answerCbQuery('Agent skipped');
            const originalText =
              ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message
                ? ctx.callbackQuery.message.text
                : '';
            await ctx.editMessageText(originalText + '\n\n⏭ **SKIPPED** - Agent will not run', {
              parse_mode: 'Markdown',
            });
          } else {
            await ctx.answerCbQuery('Already processed or expired');
          }
        } else if (data.startsWith('agent_approve_all:')) {
          const swarmId = data.replace('agent_approve_all:', '');
          const count = await telegramAgentApprovalHandler.handleApproveAllInSwarm(
            swarmId,
            userId.toString()
          );

          await ctx.answerCbQuery(`✅ Approved ${count} agents`);
          await ctx.reply(
            `✅ **Auto-approved ${count} remaining agents** in swarm \`${swarmId}\``,
            {
              parse_mode: 'Markdown',
            }
          );
        } else if (data.startsWith('agent_details:')) {
          const approvalId = data.replace('agent_details:', '');
          const details = telegramAgentApprovalHandler.getAgentDetails(approvalId);
          await ctx.answerCbQuery();
          await ctx.reply(details, { parse_mode: 'Markdown' });
        } else if (data.startsWith('agent_modify:')) {
          const approvalId = data.replace('agent_modify:', '');
          await ctx.answerCbQuery();
          await ctx.reply(
            `📝 **Modify Task**\n\nReply to this message with modified instructions for agent \`${approvalId}\`.\n\n_Feature coming soon - for now, reject and create a new request._`,
            { parse_mode: 'Markdown' }
          );
        } else if (data.startsWith('agent_see_all:')) {
          const swarmId = data.replace('agent_see_all:', '');
          const summary = telegramAgentApprovalHandler.getAllRemainingAgentsSummary(swarmId);
          await ctx.answerCbQuery('👀 Loading...');
          await ctx.reply(summary, { parse_mode: 'Markdown' });
        }
      } catch (error) {
        console.error('[Telegram] Callback query error:', error);
        await ctx.answerCbQuery('Error processing request');
      }
    });

    // Register message handler before launch
    this.bot.on('message', async ctx => {
      if (!('text' in ctx.message)) return;

      const message = ctx.message.text;
      if (!message) return;

      // Authorization check - verify sender is in whitelist
      const userId = ctx.from.id;
      if (!isUserAuthorized(userId, this.allowedUserIds)) {
        // Log unauthorized attempt (mask user ID for privacy)
        const maskedId = `${String(userId).slice(0, 4)}***`;
        console.log(`[Telegram] Unauthorized message from user ${maskedId}`);
        return; // Silent rejection
      }

      // Handle text-based agent approval: "please start agent-xxxxxx" or "start agent-xxxxxx"
      const startMatch = /(?:please\s+)?start\s+agent[- ]?([a-z0-9]+)/i.exec(message.toLowerCase());
      if (startMatch) {
        const agentIdFragment = startMatch[1];
        const result = await telegramAgentApprovalHandler.approveByAgentId(
          agentIdFragment,
          userId.toString()
        );
        if (result.success) {
          await ctx.reply(
            `✅ **Agent approved!**\n\n🎭 Role: ${result.role}\n📋 Task: ${result.title}\n\n_Agent is now starting..._`,
            {
              parse_mode: 'Markdown',
            }
          );
        } else {
          await ctx.reply(
            `❌ Could not find pending agent matching \`${agentIdFragment}\`\n\n_Try /pending to see all pending agents_`,
            {
              parse_mode: 'Markdown',
            }
          );
        }
        return; // Don't pass to main message handler
      }

      if (this.messageHandler) {
        const conversationId = this.getConversationId(ctx);
        // Fire-and-forget - errors handled by caller
        void this.messageHandler({ conversationId, message, userId });
      }
    });

    // Drop pending updates on startup to prevent reprocessing messages after container restart
    // This ensures a clean slate - old unprocessed messages won't be handled
    await this.bot.launch({
      dropPendingUpdates: true,
    });
    console.log('[Telegram] Bot started (polling mode, pending updates dropped)');
  }

  /**
   * Stop the bot gracefully
   */
  stop(): void {
    this.bot.stop();
    console.log('[Telegram] Bot stopped');
  }
}
