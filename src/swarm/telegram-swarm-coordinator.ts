/**
 * Telegram Swarm Coordinator
 * ==========================
 *
 * Wraps the base swarm coordinator with Telegram approval integration.
 * Requests user confirmation before spawning each agent.
 */

import { Telegraf } from 'telegraf';
import { v4 as uuidv4 } from 'uuid';
import {
  telegramAgentApprovalHandler,
  type AgentSpawnRequest,
} from '../adapters/telegram-agent-approvals';

/**
 * Simplified sub-task interface (mirrors V1.1 types)
 */
interface SubTask {
  id: string;
  role: string;
  title: string;
  description: string;
  prompt: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  dependencies: string[];
  estimatedDuration: 'short' | 'medium' | 'long';
  requiredTools: boolean;
}

/**
 * Agent spawn result
 */
interface AgentSpawnResult {
  approved: boolean;
  agentId: string;
  request: AgentSpawnRequest | null;
  skipped: boolean;
}

/**
 * Swarm execution options
 */
interface SwarmExecutionOptions {
  chatId: number;
  bot: Telegraf;
  requireApproval?: boolean; // Default true
  approvalTimeoutMs?: number; // Default 5 minutes
  autoApproveForChat?: boolean; // Skip individual approvals
}

/**
 * TelegramSwarmCoordinator class
 * Adds approval workflow to agent spawning
 */
export class TelegramSwarmCoordinator {
  private bot: Telegraf;
  private chatId: number;
  private swarmId: string;
  private requireApproval: boolean;
  private approvalTimeoutMs: number;

  constructor(options: SwarmExecutionOptions) {
    this.bot = options.bot;
    this.chatId = options.chatId;
    this.swarmId = `swarm-${uuidv4().substring(0, 8)}`;
    this.requireApproval = options.requireApproval ?? true;
    this.approvalTimeoutMs = options.approvalTimeoutMs ?? 300000;

    // Check if auto-approve is enabled for this chat
    if (options.autoApproveForChat || telegramAgentApprovalHandler.isAutoApproveEnabled(this.chatId)) {
      this.requireApproval = false;
    }
  }

  /**
   * Request approval to spawn an agent
   * Returns immediately if approval not required or auto-approved
   */
  async requestAgentSpawn(subTask: SubTask): Promise<AgentSpawnResult> {
    const agentId = `agent-${uuidv4().substring(0, 8)}`;

    // If approval not required, auto-approve
    if (!this.requireApproval) {
      console.log(`[TelegramSwarm] Auto-approving agent ${agentId} (${subTask.role})`);

      await this.bot.telegram.sendMessage(
        this.chatId,
        `🚀 **Auto-spawning Agent**\n\n` +
        `**Agent:** \`${agentId}\`\n` +
        `**Role:** ${subTask.role}\n` +
        `**Task:** ${subTask.title}\n\n` +
        `_Auto-approve mode is enabled_`,
        { parse_mode: 'Markdown' }
      );

      return {
        approved: true,
        agentId,
        request: null,
        skipped: false,
      };
    }

    // Send approval request
    const request = await telegramAgentApprovalHandler.sendAgentSpawnApproval(
      this.bot,
      this.chatId,
      this.swarmId,
      agentId,
      subTask.role,
      subTask.title,
      subTask.description,
      subTask.priority,
      subTask.estimatedDuration,
      subTask.requiredTools,
      this.approvalTimeoutMs
    );

    // Wait for approval
    console.log(`[TelegramSwarm] Waiting for approval of agent ${agentId}...`);
    const result = await telegramAgentApprovalHandler.waitForAgentApproval(
      request.id,
      this.approvalTimeoutMs
    );

    if (result === 'approved') {
      console.log(`[TelegramSwarm] Agent ${agentId} approved, proceeding`);
      return {
        approved: true,
        agentId,
        request,
        skipped: false,
      };
    } else if (result === 'rejected') {
      console.log(`[TelegramSwarm] Agent ${agentId} rejected, skipping`);
      return {
        approved: false,
        agentId,
        request,
        skipped: true,
      };
    } else {
      // Timeout
      console.log(`[TelegramSwarm] Agent ${agentId} timed out`);
      await this.bot.telegram.sendMessage(
        this.chatId,
        `⏰ **Approval Timeout**\n\nAgent \`${agentId}\` spawn request timed out. Skipping this agent.`,
        { parse_mode: 'Markdown' }
      );
      return {
        approved: false,
        agentId,
        request,
        skipped: true,
      };
    }
  }

  /**
   * Announce swarm start
   */
  async announceSwarmStart(taskDescription: string, subTaskCount: number): Promise<void> {
    await this.bot.telegram.sendMessage(
      this.chatId,
      `🐝 **SWARM INITIALIZED**\n\n` +
      `**Swarm ID:** \`${this.swarmId}\`\n` +
      `**Task:** ${taskDescription.substring(0, 200)}${taskDescription.length > 200 ? '...' : ''}\n` +
      `**Sub-tasks:** ${subTaskCount} agents will be spawned\n\n` +
      `${this.requireApproval ? '⏳ Waiting for your approval on each agent...' : '🚀 Auto-approve mode - agents starting automatically'}`,
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * Announce agent completion
   */
  async announceAgentComplete(agentId: string, role: string, success: boolean, summary: string): Promise<void> {
    const emoji = success ? '✅' : '❌';
    await this.bot.telegram.sendMessage(
      this.chatId,
      `${emoji} **Agent Complete**\n\n` +
      `**Agent:** \`${agentId}\`\n` +
      `**Role:** ${role}\n` +
      `**Status:** ${success ? 'Success' : 'Failed'}\n\n` +
      `${summary.substring(0, 300)}${summary.length > 300 ? '...' : ''}`,
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * Announce swarm completion
   */
  async announceSwarmComplete(
    totalAgents: number,
    completedAgents: number,
    failedAgents: number,
    skippedAgents: number,
    durationMs: number
  ): Promise<void> {
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);

    await this.bot.telegram.sendMessage(
      this.chatId,
      `🏁 **SWARM COMPLETE**\n\n` +
      `**Swarm ID:** \`${this.swarmId}\`\n` +
      `**Duration:** ${minutes}m ${seconds}s\n\n` +
      `**Results:**\n` +
      `• ✅ Completed: ${completedAgents}\n` +
      `• ❌ Failed: ${failedAgents}\n` +
      `• ⏭ Skipped: ${skippedAgents}\n` +
      `• 📊 Total: ${totalAgents}`,
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * Get swarm ID
   */
  getSwarmId(): string {
    return this.swarmId;
  }

  /**
   * Enable auto-approve mode for this chat
   */
  enableAutoApprove(): void {
    this.requireApproval = false;
    telegramAgentApprovalHandler.enableAutoApprove(this.chatId);
  }

  /**
   * Disable auto-approve mode for this chat
   */
  disableAutoApprove(): void {
    this.requireApproval = true;
    telegramAgentApprovalHandler.disableAutoApprove(this.chatId);
  }
}

/**
 * Factory function to create a Telegram swarm coordinator
 */
export function createTelegramSwarmCoordinator(
  bot: Telegraf,
  chatId: number,
  options?: Partial<SwarmExecutionOptions>
): TelegramSwarmCoordinator {
  return new TelegramSwarmCoordinator({
    bot,
    chatId,
    ...options,
  });
}

/**
 * Create an agent approval hook for use with SwarmCoordinator
 * This connects Telegram approval buttons to the swarm execution
 */
export function createTelegramApprovalHook(
  bot: Telegraf,
  chatId: number,
  options?: { approvalTimeoutMs?: number; autoApprove?: boolean }
): (subTask: SubTask, swarmId: string) => Promise<{ approved: boolean; agentId?: string }> {
  const approvalTimeoutMs = options?.approvalTimeoutMs ?? 300000;
  const autoApprove = options?.autoApprove ?? telegramAgentApprovalHandler.isAutoApproveEnabled(chatId);

  return async (subTask: SubTask, swarmId: string) => {
    const agentId = `agent-${uuidv4().substring(0, 8)}`;

    // Auto-approve if enabled
    if (autoApprove) {
      console.log(`[TelegramApprovalHook] ✅ Auto-approving agent ${agentId} (${subTask.role})`);

      await bot.telegram.sendMessage(
        chatId,
        `🚀 **Auto-spawning Agent**\n\n` +
        `**Agent:** \`${agentId}\`\n` +
        `**Role:** ${subTask.role}\n` +
        `**Task:** ${subTask.title}\n\n` +
        `_Auto-approve mode is enabled_`,
        { parse_mode: 'Markdown' }
      );

      return { approved: true, agentId };
    }

    // Send approval request with inline buttons
    const request = await telegramAgentApprovalHandler.sendAgentSpawnApproval(
      bot,
      chatId,
      swarmId,
      agentId,
      subTask.role,
      subTask.title,
      subTask.description,
      subTask.priority,
      subTask.estimatedDuration,
      subTask.requiredTools,
      approvalTimeoutMs
    );

    // Wait for user response
    console.log(`[TelegramApprovalHook] ⏳ Waiting for approval of agent ${agentId}...`);
    const result = await telegramAgentApprovalHandler.waitForAgentApproval(
      request.id,
      approvalTimeoutMs
    );

    if (result === 'approved') {
      console.log(`[TelegramApprovalHook] ✅ Agent ${agentId} approved`);
      return { approved: true, agentId };
    } else if (result === 'rejected') {
      console.log(`[TelegramApprovalHook] ❌ Agent ${agentId} rejected`);
      return { approved: false, agentId };
    } else {
      // Timeout
      console.log(`[TelegramApprovalHook] ⏰ Agent ${agentId} timed out`);
      await bot.telegram.sendMessage(
        chatId,
        `⏰ **Approval Timeout**\n\nAgent \`${agentId}\` spawn request timed out. Skipping this agent.`,
        { parse_mode: 'Markdown' }
      );
      return { approved: false, agentId };
    }
  };
}

/**
 * Example usage with the V1.1 swarm coordinator
 *
 * ```typescript
 * import { swarmCoordinator } from '../V1.1/orchestrator/swarm/swarm-coordinator';
 * import { createTelegramApprovalHook } from './telegram-swarm-coordinator';
 *
 * async function executeSwarmWithApproval(
 *   bot: Telegraf,
 *   chatId: number,
 *   userRequest: string
 * ) {
 *   // Create the approval hook
 *   const approvalHook = createTelegramApprovalHook(bot, chatId);
 *
 *   // Execute with approval workflow
 *   const session = await swarmCoordinator.execute(
 *     userRequest,
 *     chatId.toString(),
 *     {
 *       agentApprovalHook: approvalHook,
 *       autoApproveRoles: ['researcher'], // Auto-approve research tasks
 *     }
 *   );
 *
 *   return session;
 * }
 * ```
 */
