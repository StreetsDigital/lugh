/**
 * Claude Agent SDK wrapper
 * Provides async generator interface for streaming Claude responses
 *
 * Type Safety Pattern:
 * - Uses `Options` type from SDK for query configuration
 * - SDK message types (SDKMessage, SDKAssistantMessage, etc.) have strict
 *   type checking that requires explicit type handling for content blocks
 * - Content blocks are typed via inline assertions for clarity
 *
 * Approval Hooks (Phone Vibecoding V1):
 * - PreToolUse hooks can block tool execution pending user approval
 * - Sends Telegram notifications with inline approve/reject buttons
 * - Waits for user response before allowing tool to execute
 */
import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import type { Telegraf } from 'telegraf';
import { IAssistantClient, MessageChunk } from '../types';
import { logPrompt, logResponse, logToolCall, logSession, verbose } from '../utils/logger';
import * as approvalDb from '../db/approvals';
import { telegramApprovalHandler } from '../adapters/telegram-approvals';

/**
 * Context for phone-based approval workflow
 * When provided, high-risk tools will require user approval via Telegram
 */
export interface ApprovalContext {
  /** Database session ID for tracking approvals */
  sessionId: string;
  /** Telegram chat ID to send approval requests */
  chatId: number;
  /** Telegraf bot instance for sending messages */
  bot: Telegraf;
  /** Timeout in ms for waiting on approval (default: 5 minutes) */
  timeoutMs?: number;
}

/**
 * HIGH-RISK TOOLS that require approval before execution
 * These tools can modify files, execute commands, or make significant changes
 */
const HIGH_RISK_TOOLS = [
  'Write',
  'Edit',
  'Bash',
  'MultiEdit',
  // Note: Read, Glob, Grep are low-risk (read-only)
];

/**
 * Check if a tool requires approval
 */
function needsApproval(toolName: string, toolInput: Record<string, unknown>): boolean {
  // Always approve these high-risk tools
  if (HIGH_RISK_TOOLS.includes(toolName)) {
    return true;
  }

  // Extra dangerous bash commands
  if (toolName === 'Bash') {
    const command = (toolInput.command as string) || '';
    const dangerous = ['rm -rf', 'sudo', 'chmod', 'chown', '> /dev/', 'dd if='];
    if (dangerous.some(d => command.includes(d))) {
      return true;
    }
  }

  return false;
}

/**
 * Get risk level for display purposes
 */
function getRiskLevel(
  toolName: string,
  toolInput: Record<string, unknown>
): 'low' | 'medium' | 'high' {
  if (toolName === 'Bash') {
    const command = (toolInput.command as string) || '';
    if (command.includes('rm -rf') || command.includes('sudo')) {
      return 'high';
    }
  }
  if (HIGH_RISK_TOOLS.includes(toolName)) {
    return 'medium';
  }
  return 'low';
}

/**
 * Content block type for assistant messages
 * Represents text or tool_use blocks from Claude API responses
 */
interface ContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

/**
 * Claude AI assistant client
 * Implements generic IAssistantClient interface
 */
export class ClaudeClient implements IAssistantClient {
  /**
   * Send a query to Claude and stream responses
   * @param prompt - User message or prompt
   * @param cwd - Working directory for Claude
   * @param resumeSessionId - Optional session ID to resume
   * @param approvalContext - Optional context for phone-based approval workflow
   */
  async *sendQuery(
    prompt: string,
    cwd: string,
    resumeSessionId?: string,
    approvalContext?: ApprovalContext
  ): AsyncGenerator<MessageChunk> {
    // Get credentials - OAuth token (Max subscription) or API key
    const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!oauthToken && !apiKey) {
      throw new Error(
        'No credentials found. Set CLAUDE_CODE_OAUTH_TOKEN (for Max subscription) or ANTHROPIC_API_KEY.'
      );
    }

    // Check if blocking approvals are enabled
    const blockingApprovalsEnabled = approvalContext && process.env.BLOCKING_APPROVALS !== 'false';

    // Configure git to use GITHUB_TOKEN for authentication (if available)
    // Git will use these environment variables for HTTPS auth
    const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const gitEnv = githubToken
      ? {
          // Configure git credential helper via environment
          // This tells git to use our token for github.com
          GIT_CONFIG_COUNT: '2',
          GIT_CONFIG_KEY_0: 'credential.https://github.com.helper',
          GIT_CONFIG_VALUE_0: `!f() { echo "username=x-access-token"; echo "password=${githubToken}"; }; f`,
          GIT_CONFIG_KEY_1: 'credential.helper',
          GIT_CONFIG_VALUE_1: 'cache --timeout=3600',
        }
      : {};

    const options: Options = {
      cwd,
      // Credentials passed via env - OAuth token takes priority over API key
      env: {
        PATH: process.env.PATH,
        ...(oauthToken ? { CLAUDE_CODE_OAUTH_TOKEN: oauthToken } : {}),
        ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}),
        ...gitEnv, // Add git authentication
        ...process.env,
      },
      permissionMode: 'bypassPermissions', // Still bypass - we handle approval in hook
      allowDangerouslySkipPermissions: true, // Required when bypassing permissions
      systemPrompt: { type: 'preset', preset: 'claude_code' }, // Use Claude Code's system prompt
      settingSources: ['project'], // Load CLAUDE.md files from project
      stderr: (data: string) => {
        // Capture and log Claude Code stderr - but filter out informational messages
        const output = data.trim();
        if (!output) return;

        // Only log actual errors, not informational messages
        // Filter out: "Spawning Claude Code process:", debug info, etc.
        const isError =
          output.toLowerCase().includes('error') ||
          output.toLowerCase().includes('fatal') ||
          output.toLowerCase().includes('failed') ||
          output.toLowerCase().includes('exception') ||
          output.includes('at ') || // Stack trace lines
          output.includes('Error:');

        const isInfoMessage =
          output.includes('Spawning Claude Code') ||
          output.includes('--output-format') ||
          output.includes('--permission-mode');

        if (isError && !isInfoMessage) {
          console.error(`[Claude stderr] ${output}`);
        }
      },
    };

    // Add PreToolUse hook for blocking approvals if context provided
    if (blockingApprovalsEnabled) {
      console.log('[Claude] Blocking approvals ENABLED for this session');

      // PreToolUse hook - intercepts tool calls before execution
      const preToolUseHook = async (
        input: {
          hook_event_name: string;
          tool_name: string;
          tool_input: Record<string, unknown>;
          tool_use_id: string;
          session_id: string;
          cwd: string;
        },
        _toolUseId: string
      ): Promise<Record<string, unknown>> => {
        const { tool_name: toolName, tool_input: toolInput } = input;

        // Check if this tool needs approval
        if (!needsApproval(toolName, toolInput)) {
          verbose('Claude', `Tool ${toolName} auto-approved (low-risk)`);
          return {}; // Allow without approval
        }

        console.log(`[Claude] ⚠️ BLOCKING for approval: ${toolName}`);

        try {
          // Create approval record in database
          const riskLevel = getRiskLevel(toolName, toolInput);
          const approval = await approvalDb.createApproval({
            session_id: approvalContext.sessionId,
            tool_name: toolName,
            tool_input: toolInput,
            risk_level: riskLevel,
          });

          console.log(`[Claude] Created approval ${approval.id} for ${toolName}`);

          // Send Telegram notification with inline buttons
          await telegramApprovalHandler.sendApprovalRequest(
            approvalContext.bot,
            approvalContext.chatId,
            approval
          );

          console.log(`[Claude] Sent approval request to chat ${approvalContext.chatId}`);

          // Wait for user response (blocking!)
          const timeoutMs = approvalContext.timeoutMs ?? 300000; // 5 min default
          console.log(`[Claude] Waiting for approval (timeout: ${timeoutMs / 1000}s)...`);

          const result = await telegramApprovalHandler.waitForApproval(approval.id, timeoutMs);

          if (result === 'approved') {
            console.log(`[Claude] ✅ Tool ${toolName} APPROVED by user`);
            return {}; // Allow execution
          } else {
            console.log(`[Claude] ❌ Tool ${toolName} ${result.toUpperCase()} by user`);
            return {
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason:
                  result === 'rejected'
                    ? 'User rejected this operation via Telegram'
                    : 'Approval request timed out (no response)',
              },
            };
          }
        } catch (error) {
          console.error('[Claude] Approval error:', error);
          // On error, deny to be safe
          return {
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'deny',
              permissionDecisionReason: `Approval system error: ${(error as Error).message}`,
            },
          };
        }
      };

      // Add hooks to options
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (options as any).hooks = {
        PreToolUse: [
          {
            matcher: 'Write|Edit|Bash|MultiEdit',
            hooks: [preToolUseHook],
          },
        ],
      };
    } else if (approvalContext) {
      console.log('[Claude] Blocking approvals DISABLED (BLOCKING_APPROVALS=false)');
    }

    if (resumeSessionId) {
      options.resume = resumeSessionId;
      console.log(`[Claude] Resuming session: ${resumeSessionId}`);
      logSession('RESUME', resumeSessionId, `cwd: ${cwd}`);
    } else {
      console.log(`[Claude] Starting new session in ${cwd}`);
      logSession('NEW', 'pending', `cwd: ${cwd}`);
    }

    // Log the full prompt being sent
    logPrompt(prompt);
    verbose('Claude', `Sending prompt (${prompt.length} chars) to Claude...`);

    try {
      for await (const msg of query({ prompt, options })) {
        verbose('Claude', `Received message type: ${msg.type}`);
        if (msg.type === 'assistant') {
          // Process assistant message content blocks
          // Type assertion needed: SDK's strict types require explicit handling
          const message = msg as { message: { content: ContentBlock[] } };
          const content = message.message.content;

          for (const block of content) {
            // Text blocks - assistant responses
            if (block.type === 'text' && block.text) {
              logResponse('TEXT', block.text);
              yield { type: 'assistant', content: block.text };
            }

            // Tool use blocks - tool calls
            else if (block.type === 'tool_use' && block.name) {
              logToolCall(block.name, block.input ?? {});
              yield {
                type: 'tool',
                toolName: block.name,
                toolInput: block.input ?? {},
              };
            }
          }
        } else if (msg.type === 'result') {
          // Extract session ID for persistence
          const resultMsg = msg as { session_id?: string };
          if (resultMsg.session_id) {
            logSession('COMPLETED', resultMsg.session_id);
          }
          yield { type: 'result', sessionId: resultMsg.session_id };
        }
        // Ignore other message types (system, thinking, tool_result, etc.)
      }
    } catch (error) {
      console.error('[Claude] Query error:', error);
      throw error;
    }
  }

  /**
   * Get the assistant type identifier
   */
  getType(): string {
    return 'claude';
  }
}
