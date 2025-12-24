/**
 * Telegram Approval Handler - Phone Vibecoding V1
 * Sends tool execution approval requests with inline buttons
 */
import { Telegraf } from 'telegraf';
import { Approval } from '../types';
import * as approvalDb from '../db/approvals';

/**
 * Format tool input for display in Telegram message
 */
function formatToolInput(toolInput: Record<string, unknown>): string {
  try {
    const formatted = JSON.stringify(toolInput, null, 2);
    // Truncate if too long
    if (formatted.length > 1000) {
      return formatted.substring(0, 997) + '...';
    }
    return formatted;
  } catch {
    return '[Unable to format input]';
  }
}

/**
 * Get risk emoji based on level
 */
function getRiskEmoji(riskLevel: string): string {
  switch (riskLevel) {
    case 'high':
      return '🔴';
    case 'medium':
      return '🟡';
    case 'low':
      return '🟢';
    default:
      return '⚪';
  }
}

/**
 * Send approval request to Telegram with inline buttons
 */
export async function sendApprovalRequest(
  bot: Telegraf,
  chatId: number,
  approval: Approval
): Promise<void> {
  const riskEmoji = getRiskEmoji(approval.risk_level);
  const toolDetails = formatToolInput(approval.tool_input);

  const message = `${riskEmoji} **APPROVAL NEEDED**

**Tool:** \`${approval.tool_name}\`
**Risk Level:** ${approval.risk_level.toUpperCase()}

**Details:**
\`\`\`
${toolDetails}
\`\`\`

Do you want to proceed?`;

  await bot.telegram.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `approve:${approval.id}` },
          { text: '❌ Reject', callback_data: `reject:${approval.id}` },
        ],
        [{ text: 'ℹ️ Details', callback_data: `details:${approval.id}` }],
      ],
    },
  });

  console.log(`[TelegramApprovals] Sent approval request ${approval.id} for ${approval.tool_name}`);
}

/**
 * Handle approval button click
 */
export async function handleApprove(approvalId: string, userId: string): Promise<boolean> {
  const approval = await approvalDb.updateApprovalStatus(approvalId, 'approved', userId);

  if (approval) {
    console.log(`[TelegramApprovals] Approval ${approvalId} approved by ${userId}`);
    return true;
  }

  console.log(`[TelegramApprovals] Approval ${approvalId} not found or already processed`);
  return false;
}

/**
 * Handle rejection button click
 */
export async function handleReject(approvalId: string, userId: string): Promise<boolean> {
  const approval = await approvalDb.updateApprovalStatus(approvalId, 'rejected', userId);

  if (approval) {
    console.log(`[TelegramApprovals] Approval ${approvalId} rejected by ${userId}`);
    return true;
  }

  console.log(`[TelegramApprovals] Approval ${approvalId} not found or already processed`);
  return false;
}

/**
 * Get full details of an approval
 */
export async function getApprovalDetails(approvalId: string): Promise<string> {
  const approval = await approvalDb.getApproval(approvalId);

  if (!approval) {
    return 'Approval not found or expired.';
  }

  const fullDetails = JSON.stringify(approval.tool_input, null, 2);

  return `**Full Details for ${approval.tool_name}:**

\`\`\`
${fullDetails}
\`\`\`

**Status:** ${approval.status}
**Created:** ${approval.created_at.toISOString()}
**Expires:** ${approval.expires_at.toISOString()}`;
}

/**
 * Get pending approvals for a session
 */
export async function getPendingApprovals(sessionId: string): Promise<Approval[]> {
  return approvalDb.getPendingApprovals(sessionId);
}

/**
 * Wait for approval response (polling)
 */
export async function waitForApproval(
  approvalId: string,
  timeoutMs = 300000
): Promise<'approved' | 'rejected' | 'timeout'> {
  return approvalDb.waitForApproval(approvalId, timeoutMs);
}

/**
 * Exported handler object for use in telegram.ts
 */
export const telegramApprovalHandler = {
  sendApprovalRequest,
  handleApprove,
  handleReject,
  getApprovalDetails,
  getPendingApprovals,
  waitForApproval,
};
