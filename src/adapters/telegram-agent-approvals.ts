/**
 * Telegram Agent Spawn Approval Handler
 * ======================================
 *
 * Sends agent spawn approval requests with inline buttons.
 * Allows users to approve/reject/modify agent spawning from their phone.
 */
import { Telegraf } from 'telegraf';
import { v4 as uuidv4 } from 'uuid';

/**
 * Agent spawn request pending approval
 */
export interface AgentSpawnRequest {
  id: string;
  swarmId: string;
  agentId: string;
  role: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimatedDuration: 'short' | 'medium' | 'long';
  requiredTools: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'modified' | 'timeout';
  createdAt: Date;
  expiresAt: Date;
  respondedBy: string | null;
  respondedAt: Date | null;
  modifiedPrompt?: string; // If user wants to modify the task
}

/**
 * In-memory store for pending approvals (in production, use Redis/DB)
 */
const pendingApprovals = new Map<string, AgentSpawnRequest>();

/**
 * Resolve functions for waiting approvals
 */
const approvalResolvers = new Map<string, (result: 'approved' | 'rejected' | 'timeout') => void>();

/**
 * Get priority emoji
 */
function getPriorityEmoji(priority: string): string {
  switch (priority) {
    case 'critical': return '🔴';
    case 'high': return '🟠';
    case 'medium': return '🟡';
    case 'low': return '🟢';
    default: return '⚪';
  }
}

/**
 * Get duration estimate text
 */
function getDurationText(duration: string): string {
  switch (duration) {
    case 'short': return '< 1 min';
    case 'medium': return '1-5 min';
    case 'long': return '> 5 min';
    default: return 'Unknown';
  }
}

/**
 * Send agent spawn approval request to Telegram
 */
export async function sendAgentSpawnApproval(
  bot: Telegraf,
  chatId: number,
  swarmId: string,
  agentId: string,
  role: string,
  title: string,
  description: string,
  priority: 'critical' | 'high' | 'medium' | 'low',
  estimatedDuration: 'short' | 'medium' | 'long',
  requiredTools: boolean,
  timeoutMs: number = 300000 // 5 minutes default
): Promise<AgentSpawnRequest> {
  const approvalId = uuidv4().substring(0, 8);

  const request: AgentSpawnRequest = {
    id: approvalId,
    swarmId,
    agentId,
    role,
    title,
    description,
    priority,
    estimatedDuration,
    requiredTools,
    status: 'pending',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + timeoutMs),
    respondedBy: null,
    respondedAt: null,
  };

  pendingApprovals.set(approvalId, request);

  const priorityEmoji = getPriorityEmoji(priority);
  const durationText = getDurationText(estimatedDuration);
  const toolsText = requiredTools ? '🔧 Yes (Claude Code)' : '💬 No (LLM only)';

  const message = `🤖 **NEW AGENT SPAWN REQUEST**

${priorityEmoji} **Priority:** ${priority.toUpperCase()}

🔹 **Agent:** \`${agentId.substring(0, 12)}\`
🎭 **Role:** ${role}
📋 **Task:** ${title}

📝 **Description:**
${description.length > 200 ? description.substring(0, 200) + '...' : description}

⏱ **Est. Duration:** ${durationText}
🛠 **Needs Tools:** ${toolsText}

🐝 _Swarm: ${swarmId}_`;

  await bot.telegram.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Start Agent', callback_data: `agent_approve:${approvalId}` },
          { text: '❌ Skip', callback_data: `agent_reject:${approvalId}` },
        ],
        [
          { text: '📝 Modify Task', callback_data: `agent_modify:${approvalId}` },
          { text: 'ℹ️ Full Details', callback_data: `agent_details:${approvalId}` },
        ],
        [
          { text: '👀 See All Remaining', callback_data: `agent_see_all:${swarmId}` },
          { text: '✅ Approve All', callback_data: `agent_approve_all:${swarmId}` },
        ],
      ],
    },
  });

  console.log(`[AgentApprovals] Sent spawn request ${approvalId} for agent ${agentId} (${role})`);

  return request;
}

/**
 * Handle agent approval
 */
export async function handleAgentApprove(approvalId: string, userId: string): Promise<boolean> {
  const request = pendingApprovals.get(approvalId);

  if (!request || request.status !== 'pending') {
    console.log(`[AgentApprovals] Approval ${approvalId} not found or already processed`);
    return false;
  }

  request.status = 'approved';
  request.respondedBy = userId;
  request.respondedAt = new Date();

  // Resolve the waiting promise
  const resolver = approvalResolvers.get(approvalId);
  if (resolver) {
    resolver('approved');
    approvalResolvers.delete(approvalId);
  }

  console.log(`[AgentApprovals] Agent ${request.agentId} approved by ${userId}`);
  return true;
}

/**
 * Handle agent rejection (skip this agent)
 */
export async function handleAgentReject(approvalId: string, userId: string): Promise<boolean> {
  const request = pendingApprovals.get(approvalId);

  if (!request || request.status !== 'pending') {
    console.log(`[AgentApprovals] Approval ${approvalId} not found or already processed`);
    return false;
  }

  request.status = 'rejected';
  request.respondedBy = userId;
  request.respondedAt = new Date();

  // Resolve the waiting promise
  const resolver = approvalResolvers.get(approvalId);
  if (resolver) {
    resolver('rejected');
    approvalResolvers.delete(approvalId);
  }

  console.log(`[AgentApprovals] Agent ${request.agentId} rejected by ${userId}`);
  return true;
}

/**
 * Approve agent by agent ID fragment (text-based approval)
 * Matches partial agent IDs like "abc123" against "agent-abc123"
 */
export async function approveByAgentId(
  agentIdFragment: string,
  userId: string
): Promise<{ success: boolean; role?: string; title?: string }> {
  const fragment = agentIdFragment.toLowerCase();

  for (const [approvalId, request] of pendingApprovals) {
    if (request.status !== 'pending') continue;

    // Match if agent ID contains the fragment
    if (request.agentId.toLowerCase().includes(fragment)) {
      request.status = 'approved';
      request.respondedBy = userId;
      request.respondedAt = new Date();

      // Resolve the waiting promise
      const resolver = approvalResolvers.get(approvalId);
      if (resolver) {
        resolver('approved');
        approvalResolvers.delete(approvalId);
      }

      console.log(`[AgentApprovals] Agent ${request.agentId} approved by text command from ${userId}`);
      return { success: true, role: request.role, title: request.title };
    }
  }

  console.log(`[AgentApprovals] No pending agent found matching "${agentIdFragment}"`);
  return { success: false };
}

/**
 * Handle approve all remaining agents in a swarm
 */
export async function handleApproveAllInSwarm(swarmId: string, userId: string): Promise<number> {
  let approvedCount = 0;

  for (const [approvalId, request] of pendingApprovals) {
    if (request.swarmId === swarmId && request.status === 'pending') {
      request.status = 'approved';
      request.respondedBy = userId;
      request.respondedAt = new Date();

      // Resolve the waiting promise
      const resolver = approvalResolvers.get(approvalId);
      if (resolver) {
        resolver('approved');
        approvalResolvers.delete(approvalId);
      }

      approvedCount++;
    }
  }

  console.log(`[AgentApprovals] Approved ${approvedCount} agents in swarm ${swarmId} by ${userId}`);
  return approvedCount;
}

/**
 * Get full details of an agent spawn request
 */
export function getAgentDetails(approvalId: string): string {
  const request = pendingApprovals.get(approvalId);

  if (!request) {
    return 'Agent spawn request not found or expired.';
  }

  const statusEmoji = request.status === 'approved' ? '✅' :
                       request.status === 'rejected' ? '❌' :
                       request.status === 'pending' ? '⏳' :
                       request.status === 'timeout' ? '⏰' : '❓';

  return `🔍 **Full Details for Agent ${request.agentId}**

🎭 **Role:** ${request.role}
📋 **Task:** ${request.title}
${getPriorityEmoji(request.priority)} **Priority:** ${request.priority}
${statusEmoji} **Status:** ${request.status}

📝 **Full Description:**
${request.description}

⚙️ **Configuration:**
• ⏱ Estimated Duration: ${getDurationText(request.estimatedDuration)}
• 🛠 Needs Tools: ${request.requiredTools ? '✅ Yes' : '❌ No'}
• 🐝 Swarm ID: ${request.swarmId}

🕐 **Timestamps:**
• 📅 Created: ${request.createdAt.toISOString()}
• ⏰ Expires: ${request.expiresAt.toISOString()}
${request.respondedAt ? `• ✅ Responded: ${request.respondedAt.toISOString()}` : ''}
${request.respondedBy ? `• 👤 By: ${request.respondedBy}` : ''}`;
}

/**
 * Wait for approval response (polling)
 */
export async function waitForAgentApproval(
  approvalId: string,
  timeoutMs: number = 300000
): Promise<'approved' | 'rejected' | 'timeout'> {
  return new Promise((resolve) => {
    // Store resolver for callback
    approvalResolvers.set(approvalId, resolve);

    // Set timeout
    const timeoutId = setTimeout(() => {
      const request = pendingApprovals.get(approvalId);
      if (request && request.status === 'pending') {
        request.status = 'timeout';
        approvalResolvers.delete(approvalId);
        resolve('timeout');
      }
    }, timeoutMs);

    // Check if already resolved
    const request = pendingApprovals.get(approvalId);
    if (request && request.status !== 'pending') {
      clearTimeout(timeoutId);
      approvalResolvers.delete(approvalId);
      resolve(request.status === 'approved' ? 'approved' : 'rejected');
    }
  });
}

/**
 * Get pending agent approvals for a swarm
 */
export function getPendingAgentApprovals(swarmId: string): AgentSpawnRequest[] {
  const pending: AgentSpawnRequest[] = [];

  for (const request of pendingApprovals.values()) {
    if (request.swarmId === swarmId && request.status === 'pending') {
      pending.push(request);
    }
  }

  return pending;
}

/**
 * Get ALL pending agent approvals across all swarms
 */
export function getAllPendingApprovals(): AgentSpawnRequest[] {
  const pending: AgentSpawnRequest[] = [];

  for (const request of pendingApprovals.values()) {
    if (request.status === 'pending') {
      pending.push(request);
    }
  }

  return pending;
}

/**
 * Get formatted summary of all remaining agents in a swarm
 */
export function getAllRemainingAgentsSummary(swarmId: string): string {
  const pending = getPendingAgentApprovals(swarmId);

  if (pending.length === 0) {
    return `👀 **No Remaining Agents**\n\nAll agents in swarm \`${swarmId}\` have been processed.`;
  }

  let summary = `👀 **Remaining Agents in Swarm**\n\n`;
  summary += `🐝 Swarm: \`${swarmId}\`\n`;
  summary += `📊 Pending: ${pending.length} agent${pending.length > 1 ? 's' : ''}\n\n`;

  for (let i = 0; i < pending.length; i++) {
    const req = pending[i];
    const priorityEmoji = getPriorityEmoji(req.priority);
    const durationText = getDurationText(req.estimatedDuration);
    const toolsEmoji = req.requiredTools ? '🔧' : '💬';

    summary += `**${i + 1}. ${req.role}** ${priorityEmoji}\n`;
    summary += `   📋 ${req.title}\n`;
    summary += `   ⏱ ${durationText} ${toolsEmoji}\n`;
    if (i < pending.length - 1) summary += '\n';
  }

  summary += `\n─────────────────────\n`;
  summary += `💡 Tap "✅ Approve All" to start all agents`;

  return summary;
}

/**
 * Clean up expired approvals
 */
export function cleanupExpiredApprovals(): number {
  let cleaned = 0;
  const now = new Date();

  for (const [id, request] of pendingApprovals) {
    if (request.expiresAt < now && request.status === 'pending') {
      request.status = 'timeout';

      const resolver = approvalResolvers.get(id);
      if (resolver) {
        resolver('timeout');
        approvalResolvers.delete(id);
      }

      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Auto-approve mode state per chat
 */
const autoApproveChats = new Set<number>();

/**
 * Enable auto-approve for a chat
 */
export function enableAutoApprove(chatId: number): void {
  autoApproveChats.add(chatId);
  console.log(`[AgentApprovals] Auto-approve enabled for chat ${chatId}`);
}

/**
 * Disable auto-approve for a chat
 */
export function disableAutoApprove(chatId: number): void {
  autoApproveChats.delete(chatId);
  console.log(`[AgentApprovals] Auto-approve disabled for chat ${chatId}`);
}

/**
 * Check if auto-approve is enabled for a chat
 */
export function isAutoApproveEnabled(chatId: number): boolean {
  return autoApproveChats.has(chatId);
}

/**
 * Exported handler object for use in telegram.ts
 */
export const telegramAgentApprovalHandler = {
  sendAgentSpawnApproval,
  handleAgentApprove,
  handleAgentReject,
  approveByAgentId,
  handleApproveAllInSwarm,
  getAgentDetails,
  getAllRemainingAgentsSummary,
  getAllPendingApprovals,
  waitForAgentApproval,
  getPendingAgentApprovals,
  cleanupExpiredApprovals,
  enableAutoApprove,
  disableAutoApprove,
  isAutoApproveEnabled,
};
