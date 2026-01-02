/**
 * Orchestrator - Main conversation handler
 * Routes slash commands and AI messages appropriately
 */
import { readFile, stat, writeFile, mkdir } from 'fs/promises';
import { join, basename } from 'path';
import {
  IPlatformAdapter,
  IsolationHints,
  IsolationEnvironmentRow,
  Conversation,
  Codebase,
  ApprovalContext,
} from '../types';
import * as db from '../db/conversations';
import * as codebaseDb from '../db/codebases';
import * as sessionDb from '../db/sessions';
import * as templateDb from '../db/command-templates';
import * as isolationEnvDb from '../db/isolation-environments';
import * as commandHandler from '../handlers/command-handler';
import { formatToolCall } from '../utils/tool-formatter';
import { substituteVariables } from '../utils/variable-substitution';
import { classifyAndFormatError } from '../utils/error-formatter';
import { verbose, isVerboseEnabled } from '../utils/logger';
import { getAssistantClient } from '../clients/factory';
import { getIsolationProvider } from '../isolation';
import { worktreeExists, findWorktreeByBranch, getCanonicalRepoPath } from '../utils/git';
import {
  cleanupToMakeRoom,
  getWorktreeStatusBreakdown,
  MAX_WORKTREES_PER_CODEBASE,
  STALE_THRESHOLD_DAYS,
  WorktreeStatusBreakdown,
} from '../services/cleanup-service';
import * as approvalDb from '../db/approvals';
import {
  createAbortController,
  isAborted,
  clearAbortState,
} from './abort-manager';
import {
  FileOperationsTracker,
  formatFileOperationsSummary,
  getBriefFileOperationsSummary,
} from '../utils/file-operations-tracker';
import { swarmCoordinator } from '../swarm/swarm-coordinator';
import { createTelegramSwarmCoordinator } from '../swarm/telegram-swarm-coordinator';
import { freewheelCoordinator, summarizeIntent } from '../swarm/freewheel-coordinator';
import { isFreewheelRequest, getTelegramFreewheelHandler } from '../adapters/telegram-freewheel';
import { isEnabled } from '../config/features';

/**
 * Format the worktree limit reached message
 */
function formatWorktreeLimitMessage(
  codebaseName: string,
  breakdown: WorktreeStatusBreakdown
): string {
  let msg = `Worktree limit reached (${String(breakdown.total)}/${String(breakdown.limit)}) for **${codebaseName}**.\n\n`;

  msg += '**Status:**\n';
  msg += `• ${String(breakdown.merged)} merged (can auto-remove)\n`;
  msg += `• ${String(breakdown.stale)} stale (no activity in ${String(STALE_THRESHOLD_DAYS)}+ days)\n`;
  msg += `• ${String(breakdown.active)} active\n\n`;

  msg += '**Options:**\n';
  if (breakdown.stale > 0) {
    msg += '• `/worktree cleanup stale` - Remove stale worktrees\n';
  }
  msg += '• `/worktree list` - See all worktrees\n';
  msg += '• `/worktree remove <name>` - Remove specific worktree';

  return msg;
}

/**
 * File-writing tool detection for auto-send feature
 * Returns the file path if this is a file-writing tool, null otherwise
 */
const FILE_WRITING_TOOLS = [
  'write_file', 'Write',           // Claude Code's file writing
  'create_file', 'create',         // File creation variants
  'str_replace_editor', 'Edit',    // File editing (creates if new)
];

function extractWrittenFilePath(toolName: string, toolInput: Record<string, unknown> | undefined): string | null {
  if (!toolInput) return null;
  if (!FILE_WRITING_TOOLS.includes(toolName)) return null;

  // Different tools use different parameter names
  const path = toolInput.path ?? toolInput.file_path ?? toolInput.filename;
  if (typeof path === 'string' && path.length > 0) {
    return path;
  }
  return null;
}

/**
 * File extensions worth sending to user (code, docs, config, data)
 */
const SENDABLE_EXTENSIONS = new Set([
  // Source code
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyw', '.pyi',
  '.go', '.rs', '.java', '.kt', '.kts',
  '.rb', '.php', '.swift', '.c', '.cpp', '.h', '.hpp',
  '.cs', '.fs', '.scala', '.clj', '.ex', '.exs',
  // Config
  '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg',
  '.env.example', '.env.local', '.env.development',
  // Docs
  '.md', '.txt', '.rst', '.adoc',
  // Data
  '.csv', '.sql', '.graphql', '.prisma',
  // Scripts
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  // Web
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.svg', '.xml',
]);

/**
 * Files/paths to never send (noise, generated, sensitive)
 */
const BLOCKED_PATTERNS = [
  // Lock files
  /package-lock\.json$/,
  /yarn\.lock$/,
  /bun\.lockb$/,
  /Cargo\.lock$/,
  /Gemfile\.lock$/,
  /composer\.lock$/,
  /poetry\.lock$/,
  /pnpm-lock\.yaml$/,
  // Build/generated directories
  /node_modules\//,
  /\.next\//,
  /dist\//,
  /build\//,
  /out\//,
  /target\//,
  /\.cache\//,
  /__pycache__\//,
  /\.pyc$/,
  // Hidden/internal
  /\.git\//,
  /\.DS_Store$/,
  /\.env$/, // Actual .env files (not .env.example)
  /\.env\.local$/,
  // Binary artifacts
  /\.exe$/,
  /\.dll$/,
  /\.so$/,
  /\.dylib$/,
  /\.o$/,
  /\.class$/,
  /\.wasm$/,
];

/**
 * Check if file type is worth sending based on extension
 */
function isFileTypeWorthSending(filePath: string): boolean {
  const fileName = basename(filePath).toLowerCase();

  // Check blocked patterns first
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(filePath)) {
      return false;
    }
  }

  // Check extension whitelist
  const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
  if (SENDABLE_EXTENSIONS.has(ext)) {
    return true;
  }

  // Special cases: files without extensions that are useful
  const usefulFilenames = ['Dockerfile', 'Makefile', 'Rakefile', 'Gemfile', 'Procfile'];
  if (usefulFilenames.includes(basename(filePath))) {
    return true;
  }

  return false;
}

/**
 * Check if a file should be auto-sent (right type, small enough, exists)
 */
async function shouldAutoSendFile(filePath: string): Promise<{ send: boolean; size: number; reason?: string }> {
  // Check file type first (before stat to save I/O)
  if (!isFileTypeWorthSending(filePath)) {
    return { send: false, size: 0, reason: 'file type not in whitelist' };
  }

  try {
    const stats = await stat(filePath);
    const MAX_AUTO_SEND_SIZE = 10 * 1024 * 1024; // 10MB limit for Telegram

    if (!stats.isFile()) {
      return { send: false, size: 0, reason: 'not a file' };
    }

    if (stats.size > MAX_AUTO_SEND_SIZE) {
      return { send: false, size: stats.size, reason: 'file too large' };
    }

    return { send: true, size: stats.size };
  } catch {
    return { send: false, size: 0, reason: 'file not found' };
  }
}

/**
 * Threshold for converting long text responses to .txt files
 * Telegram messages get unwieldy above ~2000 chars on mobile
 */
const LONG_RESPONSE_THRESHOLD = 2000;

/**
 * Save a long text response to a .txt file for easier reading on mobile
 * Returns the file path if saved, null if too short
 */
async function saveLongResponseToFile(
  content: string,
  conversationId: string
): Promise<string | null> {
  if (content.length < LONG_RESPONSE_THRESHOLD) {
    return null;
  }

  // Create temp directory for responses
  const tempDir = '/tmp/lugh-responses';
  await mkdir(tempDir, { recursive: true });

  // Generate unique filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const shortId = conversationId.slice(-6);
  const fileName = `response-${shortId}-${timestamp}.txt`;
  const filePath = join(tempDir, fileName);

  // Add header with metadata
  const header = `Claude Response
Generated: ${new Date().toLocaleString()}
Conversation: ${conversationId}
${'─'.repeat(50)}

`;

  await writeFile(filePath, header + content, 'utf-8');
  console.log(`[Orchestrator] Saved long response (${content.length} chars) to ${filePath}`);

  return filePath;
}

/**
 * Validate existing isolation and create new if needed
 * This is the single source of truth for isolation decisions
 */
async function validateAndResolveIsolation(
  conversation: Conversation,
  codebase: Codebase | null,
  platform: IPlatformAdapter,
  conversationId: string,
  hints?: IsolationHints
): Promise<{ cwd: string; env: IsolationEnvironmentRow | null; isNew: boolean }> {
  // 1. Check existing isolation reference (new UUID model)
  if (conversation.isolation_env_id) {
    const env = await isolationEnvDb.getById(conversation.isolation_env_id);

    if (env && (await worktreeExists(env.working_path))) {
      // Valid - use it
      return { cwd: env.working_path, env, isNew: false };
    }

    // Stale reference - clean up
    console.warn(`[Orchestrator] Stale isolation: ${conversation.isolation_env_id}`);
    await db.updateConversation(conversation.id, {
      isolation_env_id: null,
    });

    if (env) {
      await isolationEnvDb.updateStatus(env.id, 'destroyed');
    }
  }

  // 2. No valid isolation - check if we should create
  if (!codebase) {
    // Default to user's home directory where global CLAUDE.md lives
    const defaultHome = process.env.HOME ?? '/home/appuser';
    return { cwd: conversation.cwd ?? defaultHome, env: null, isNew: false };
  }

  // 3. Create new isolation (auto-isolation for all platforms!)
  const env = await resolveIsolation(codebase, platform, conversationId, hints);
  if (env) {
    await db.updateConversation(conversation.id, {
      isolation_env_id: env.id,
      cwd: env.working_path,
    });
    return { cwd: env.working_path, env, isNew: true };
  }

  return { cwd: codebase.default_cwd, env: null, isNew: false };
}

/**
 * Resolve which isolation environment to use
 * Handles reuse, sharing, adoption, and creation
 */
async function resolveIsolation(
  codebase: Codebase,
  platform: IPlatformAdapter,
  conversationId: string,
  hints?: IsolationHints
): Promise<IsolationEnvironmentRow | null> {
  // Determine workflow identity
  const workflowType = hints?.workflowType ?? 'thread';
  const workflowId = hints?.workflowId ?? conversationId;

  // 1. Check for existing environment with same workflow
  const existing = await isolationEnvDb.findByWorkflow(codebase.id, workflowType, workflowId);
  if (existing && (await worktreeExists(existing.working_path))) {
    console.log(`[Orchestrator] Reusing environment for ${workflowType}/${workflowId}`);
    return existing;
  }

  // 2. Check linked issues for sharing (cross-conversation)
  if (hints?.linkedIssues?.length) {
    for (const issueNum of hints.linkedIssues) {
      const linkedEnv = await isolationEnvDb.findByWorkflow(codebase.id, 'issue', String(issueNum));
      if (linkedEnv && (await worktreeExists(linkedEnv.working_path))) {
        console.log(`[Orchestrator] Sharing worktree with linked issue #${String(issueNum)}`);
        // Send UX message
        await platform.sendMessage(
          conversationId,
          `Reusing worktree from issue #${String(issueNum)}`
        );
        return linkedEnv;
      }
    }
  }

  // 3. Try PR branch adoption (skill symbiosis)
  if (hints?.prBranch) {
    const canonicalPath = await getCanonicalRepoPath(codebase.default_cwd);
    const adoptedPath = await findWorktreeByBranch(canonicalPath, hints.prBranch);
    if (adoptedPath && (await worktreeExists(adoptedPath))) {
      console.log(`[Orchestrator] Adopting existing worktree at ${adoptedPath}`);
      const env = await isolationEnvDb.create({
        codebase_id: codebase.id,
        workflow_type: workflowType,
        workflow_id: workflowId,
        working_path: adoptedPath,
        branch_name: hints.prBranch,
        created_by_platform: platform.getPlatformType(),
        metadata: { adopted: true, adopted_from: 'skill' },
      });
      return env;
    }
  }

  // 4. Check limit before creating new worktree (Phase 3D)
  const canonicalPath = await getCanonicalRepoPath(codebase.default_cwd);
  const count = await isolationEnvDb.countByCodebase(codebase.id);
  if (count >= MAX_WORKTREES_PER_CODEBASE) {
    console.log(
      `[Orchestrator] Worktree limit reached (${String(count)}/${String(MAX_WORKTREES_PER_CODEBASE)}), attempting auto-cleanup`
    );

    const cleanupResult = await cleanupToMakeRoom(codebase.id, canonicalPath);

    if (cleanupResult.removed.length > 0) {
      // Cleaned up some worktrees - send feedback and continue
      await platform.sendMessage(
        conversationId,
        `Cleaned up ${String(cleanupResult.removed.length)} merged worktree(s) to make room.`
      );
    } else {
      // Could not auto-cleanup - show limit message with options
      const breakdown = await getWorktreeStatusBreakdown(codebase.id, canonicalPath);
      const limitMessage = formatWorktreeLimitMessage(codebase.name, breakdown);
      await platform.sendMessage(conversationId, limitMessage);
      return null; // Don't create new isolation
    }

    // Re-check count after cleanup
    const newCount = await isolationEnvDb.countByCodebase(codebase.id);
    if (newCount >= MAX_WORKTREES_PER_CODEBASE) {
      // Still at limit - show options
      const breakdown = await getWorktreeStatusBreakdown(codebase.id, canonicalPath);
      const limitMessage = formatWorktreeLimitMessage(codebase.name, breakdown);
      await platform.sendMessage(conversationId, limitMessage);
      return null;
    }
  }

  // 5. Create new worktree
  const provider = getIsolationProvider();

  try {
    const isolatedEnv = await provider.create({
      codebaseId: codebase.id,
      canonicalRepoPath: canonicalPath,
      workflowType,
      identifier: workflowId,
      prBranch: hints?.prBranch,
      prSha: hints?.prSha,
    });

    // Create database record
    const env = await isolationEnvDb.create({
      codebase_id: codebase.id,
      workflow_type: workflowType,
      workflow_id: workflowId,
      working_path: isolatedEnv.workingPath,
      branch_name: isolatedEnv.branchName ?? `${workflowType}-${workflowId}`,
      created_by_platform: platform.getPlatformType(),
      metadata: {
        related_issues: hints?.linkedIssues ?? [],
        related_prs: hints?.linkedPRs ?? [],
      },
    });

    // UX message
    if (hints?.prSha) {
      const shortSha = hints.prSha.substring(0, 7);
      await platform.sendMessage(
        conversationId,
        `Reviewing PR at commit \`${shortSha}\` (branch: \`${hints.prBranch}\`)`
      );
    } else {
      await platform.sendMessage(
        conversationId,
        `Working in isolated branch \`${env.branch_name}\``
      );
    }

    return env;
  } catch (error) {
    console.error('[Orchestrator] Failed to create isolation:', error);
    return null;
  }
}

/**
 * HIGH-RISK TOOLS - tools that modify files or execute commands
 * These will trigger notifications when executed
 */
const HIGH_RISK_TOOLS = [
  'Write',
  'Edit',
  'Bash',
  'MultiEdit',
  'TodoWrite',
  // Add more as needed
];

/**
 * Check if a tool is considered high-risk
 */
function isHighRiskTool(toolName: string): boolean {
  return HIGH_RISK_TOOLS.includes(toolName);
}

/**
 * Check if a bash command is particularly dangerous
 */
function isDangerousBashCommand(toolInput: Record<string, unknown>): boolean {
  const command = (toolInput.command as string) || '';
  const dangerous = ['rm -rf', 'sudo', 'chmod', 'chown', '> /dev/', 'dd if='];
  return dangerous.some(d => command.includes(d));
}

/**
 * Get risk level for a tool call
 */
function getToolRiskLevel(
  toolName: string,
  toolInput: Record<string, unknown>
): 'low' | 'medium' | 'high' {
  if (toolName === 'Bash' && isDangerousBashCommand(toolInput)) {
    return 'high';
  }
  if (HIGH_RISK_TOOLS.includes(toolName)) {
    return 'medium';
  }
  return 'low';
}

/**
 * Format a risk notification message for Telegram
 * Reserved for future use when blocking approval mode is implemented
 */
function _formatRiskNotification(
  toolName: string,
  toolInput: Record<string, unknown>,
  riskLevel: string
): string {
  const emoji = riskLevel === 'high' ? '🔴' : riskLevel === 'medium' ? '🟡' : '🟢';

  let details = '';
  if (toolName === 'Bash') {
    details = `Command: \`${(toolInput.command as string) || 'unknown'}\``;
  } else if (toolName === 'Write' || toolName === 'Edit') {
    details = `File: \`${(toolInput.file_path as string) || (toolInput.path as string) || 'unknown'}\``;
  } else {
    details = `Input: ${JSON.stringify(toolInput).substring(0, 200)}`;
  }

  return `${emoji} **Tool Executed:** \`${toolName}\`\n${details}`;
}

// Export for potential future use
void _formatRiskNotification;

/**
 * Wraps command content with execution context to signal the AI should execute immediately
 * @param commandName - The name of the command being invoked (e.g., 'create-pr')
 * @param content - The command template content after variable substitution
 * @returns Content wrapped with execution context
 */
function wrapCommandForExecution(commandName: string, content: string): string {
  return `The user invoked the \`/${commandName}\` command. Execute the following instructions immediately without asking for confirmation:

---

${content}

---

Remember: The user already decided to run this command. Take action now.`;
}

/**
 * Handle freewheel mode requests
 * Natural language multi-agent execution with user control
 */
async function handleFreewheelRequest(
  conversation: Conversation,
  message: string,
  platform: IPlatformAdapter,
  conversationId: string
): Promise<void> {
  console.log('[Orchestrator] Starting freewheel execution');

  // Check if freewheel mode is enabled
  if (!isEnabled('FREEWHEEL_MODE')) {
    await platform.sendMessage(
      conversationId,
      '❌ Freewheel mode is not enabled.\n\n' +
        'Add to your .env file:\n' +
        '```\n' +
        'FEATURE_MULTI_LLM=true\n' +
        'FEATURE_SWARM_COORDINATION=true\n' +
        'FEATURE_FREEWHEEL_MODE=true\n' +
        '```'
    );
    return;
  }

  if (!freewheelCoordinator) {
    await platform.sendMessage(
      conversationId,
      '❌ Freewheel coordinator not initialized. Check feature flags.'
    );
    return;
  }

  try {
    // For Telegram, set up the UI handler
    if (platform.getPlatformType() === 'telegram' && platform.getBot) {
      const bot = platform.getBot();
      getTelegramFreewheelHandler(bot);
    }

    // Start freewheel session
    const session = await freewheelCoordinator.start(message, conversationId);

    // If cancelled during confirmation, notify user
    if (session.status === 'cancelled') {
      await platform.sendMessage(conversationId, '❌ Freewheel execution cancelled.');
      return;
    }

    // Send summary of what happened
    if (session.status === 'completed' && session.swarmId) {
      await platform.sendMessage(
        conversationId,
        `✅ **Freewheel execution completed!**\n\n` +
          `Mode: ${session.intent.mode}\n` +
          `Strategy: ${session.intent.strategy}`
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Orchestrator] Freewheel execution failed:', errorMessage);
    await platform.sendMessage(
      conversationId,
      `❌ **Freewheel Failed**\n\n${errorMessage}`
    );
  }
}

/**
 * Handle swarm execution for parallel agent coordination
 */
async function handleSwarmExecution(
  _conversation: Conversation,
  userRequest: string,
  platform: IPlatformAdapter,
  conversationId: string
): Promise<void> {
  console.log('[Orchestrator] Starting swarm execution');

  // Check if swarm coordination is enabled
  if (!isEnabled('SWARM_COORDINATION')) {
    await platform.sendMessage(
      conversationId,
      '❌ Swarm coordination is not enabled.\n\n' +
        'Add to your .env file:\n' +
        '```\n' +
        'FEATURE_SWARM_COORDINATION=true\n' +
        'FEATURE_MULTI_LLM=true\n' +
        '```'
    );
    return;
  }

  try {
    // For Telegram, use the approval workflow
    if (platform.getPlatformType() === 'telegram') {
      const telegramBot = (platform as unknown as { bot?: unknown }).bot;
      if (telegramBot) {
        const chatId = parseInt(conversationId, 10);
        const telegramCoordinator = createTelegramSwarmCoordinator(
          telegramBot as Parameters<typeof createTelegramSwarmCoordinator>[0],
          chatId,
          { approvalTimeoutMs: 300000 }
        );

        // Announce swarm start
        await telegramCoordinator.announceSwarmStart(userRequest, 0);

        // Set up event handlers
        swarmCoordinator.onEvent(async (event) => {
          switch (event.type) {
            case 'task_decomposed':
              await platform.sendMessage(
                conversationId,
                `📋 **Task Decomposed**\n\n` +
                  `• Project: ${event.data.projectName}\n` +
                  `• Sub-tasks: ${event.data.subTaskCount}\n` +
                  `• Strategy: ${event.data.strategy}`
              );
              break;

            case 'agent_spawned':
              await platform.sendMessage(
                conversationId,
                `🚀 **Agent Spawned**\n\n` +
                  `• Agent: \`${event.data.agentId}\`\n` +
                  `• Role: ${event.data.role}\n` +
                  `• Task: ${event.data.title}`
              );
              break;

            case 'agent_completed': {
              const completedData = event.data as { agentId: string; role: string; duration: number };
              await telegramCoordinator.announceAgentComplete(
                completedData.agentId,
                completedData.role,
                true,
                `Completed in ${Math.round(completedData.duration / 1000)}s`
              );
              break;
            }

            case 'agent_failed': {
              const failedData = event.data as { agentId: string; role: string; error: string };
              await telegramCoordinator.announceAgentComplete(
                failedData.agentId,
                failedData.role,
                false,
                `Failed: ${failedData.error}`
              );
              break;
            }

            case 'swarm_completed': {
              const swarmData = event.data as { duration: number };
              const progress = swarmCoordinator.getProgress(event.swarmId);
              if (progress) {
                await telegramCoordinator.announceSwarmComplete(
                  progress.total,
                  progress.completed,
                  progress.failed,
                  0,
                  swarmData.duration
                );
              }
              break;
            }
          }
        });
      }
    }

    // Execute the swarm
    const session = await swarmCoordinator.execute(userRequest, conversationId);

    // Send final result
    if (session.synthesizedResult) {
      await platform.sendMessage(
        conversationId,
        `✨ **Swarm Complete**\n\n${session.synthesizedResult.summary}`
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Orchestrator] Swarm execution failed:', errorMessage);
    await platform.sendMessage(
      conversationId,
      `❌ **Swarm Failed**\n\n${errorMessage}`
    );
  }
}

export async function handleMessage(
  platform: IPlatformAdapter,
  conversationId: string,
  message: string,
  issueContext?: string, // Optional GitHub issue/PR context to append AFTER command loading
  threadContext?: string, // Optional thread message history for context
  parentConversationId?: string, // Optional parent channel ID for thread inheritance
  isolationHints?: IsolationHints // Optional hints from adapter for isolation decisions
): Promise<void> {
  // Track if operation was aborted via /stop command (needs to be before try for finally access)
  let wasAborted = false;

  try {
    console.log(`[Orchestrator] Handling message for conversation ${conversationId}`);

    // Get or create conversation (with optional parent context for thread inheritance)
    let conversation = await db.getOrCreateConversation(
      platform.getPlatformType(),
      conversationId,
      undefined,
      parentConversationId
    );

    // If new thread conversation, inherit context from parent
    if (parentConversationId && !conversation.codebase_id) {
      const parentConversation = await db.getConversationByPlatformId(
        platform.getPlatformType(),
        parentConversationId
      );
      if (parentConversation?.codebase_id) {
        await db.updateConversation(conversation.id, {
          codebase_id: parentConversation.codebase_id,
          cwd: parentConversation.cwd,
        });
        // Reload conversation with inherited values
        conversation = await db.getOrCreateConversation(platform.getPlatformType(), conversationId);
        console.log('[Orchestrator] Thread inherited context from parent channel');
      }
    }

    // Parse command upfront if it's a slash command
    let promptToSend = message;
    let commandName: string | null = null;

    if (message.startsWith('/')) {
      const { command, args } = commandHandler.parseCommand(message);

      // List of deterministic commands (handled by command-handler, no AI)
      const deterministicCommands = [
        'help',
        'status',
        'getcwd',
        'setcwd',
        'clone',
        'repos',
        'repo',
        'repo-remove',
        'reset',
        'reset-context',
        'command-set',
        'load-commands',
        'commands',
        'template-add',
        'template-list',
        'templates',
        'template-delete',
        'worktree',
        'init',
        'verbose', // Toggle verbose logging
        'stop', // Emergency abort (interrupt running operations)
        // Reference documentation commands
        'quickref',
        'agents',
        'chains',
        'prompts',
        'commands-all',
      ];

      if (deterministicCommands.includes(command)) {
        console.log(`[Orchestrator] Processing slash command: ${message}`);
        const result = await commandHandler.handleCommand(conversation, message);
        await platform.sendMessage(conversationId, result.message);

        // Reload conversation if modified
        if (result.modified) {
          conversation = await db.getOrCreateConversation(
            platform.getPlatformType(),
            conversationId
          );
        }

        // If command has a swarmRequest, route to swarm coordinator
        // This is used by /swarm to trigger parallel agent execution
        if (result.swarmRequest) {
          console.log('[Orchestrator] Routing to swarm coordinator');
          await handleSwarmExecution(
            conversation,
            result.swarmRequest,
            platform,
            conversationId
          );
          return;
        }

        // If command has a followUpPrompt, send it to Claude instead of returning
        // This is used by /stop to have Claude ask "why did you stop?"
        if (result.followUpPrompt) {
          console.log('[Orchestrator] Command has followUpPrompt, sending to AI');
          promptToSend = result.followUpPrompt;
          // Don't return - let execution continue to AI query section
        } else {
          return;
        }
      }

      // Handle /command-invoke (codebase-specific commands)
      if (command === 'command-invoke') {
        if (args.length < 1) {
          await platform.sendMessage(conversationId, 'Usage: /command-invoke <name> [args...]');
          return;
        }

        commandName = args[0];
        const commandArgs = args.slice(1);

        if (!conversation.codebase_id) {
          await platform.sendMessage(
            conversationId,
            'No codebase configured. Use /clone for a new repo or /repos to list your current repos you can switch to.'
          );
          return;
        }

        // Look up command definition
        const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
        if (!codebase) {
          await platform.sendMessage(conversationId, 'Codebase not found.');
          return;
        }

        const commandDef = codebase.commands[commandName];
        if (!commandDef) {
          await platform.sendMessage(
            conversationId,
            `Command '${commandName}' not found. Use /commands to see available.`
          );
          return;
        }

        // Read command file using the conversation's cwd
        const commandCwd = conversation.cwd ?? codebase.default_cwd;
        const commandFilePath = join(commandCwd, commandDef.path);

        try {
          const commandText = await readFile(commandFilePath, 'utf-8');

          // Substitute variables (no metadata needed - file-based workflow)
          const substituted = substituteVariables(commandText, commandArgs);
          promptToSend = wrapCommandForExecution(commandName, substituted);

          // Append issue/PR context AFTER command loading (if provided)
          if (issueContext) {
            promptToSend = promptToSend + '\n\n---\n\n' + issueContext;
            console.log('[Orchestrator] Appended issue/PR context to command prompt');
          }

          console.log(
            `[Orchestrator] Executing '${commandName}' with ${String(commandArgs.length)} args`
          );
        } catch (error) {
          const err = error as Error;
          await platform.sendMessage(conversationId, `Failed to read command file: ${err.message}`);
          return;
        }
      } else {
        // Check if it's a global template command
        const template = await templateDb.getTemplate(command);
        if (template) {
          console.log(`[Orchestrator] Found template: ${command}`);
          commandName = command;
          const substituted = substituteVariables(template.content, args);
          promptToSend = wrapCommandForExecution(commandName, substituted);

          if (issueContext) {
            promptToSend = promptToSend + '\n\n---\n\n' + issueContext;
            console.log('[Orchestrator] Appended issue/PR context to template prompt');
          }

          console.log(
            `[Orchestrator] Executing template '${command}' with ${String(args.length)} args`
          );
        } else {
          // Unknown command
          await platform.sendMessage(
            conversationId,
            `Unknown command: /${command}\n\nType /help for available commands or /templates for command templates.`
          );
          return;
        }
      }
    } else {
      // Regular message - check for freewheel request first
      if (isEnabled('FREEWHEEL_MODE') && isFreewheelRequest(message)) {
        console.log('[Orchestrator] Detected freewheel request, routing to swarm');
        await handleFreewheelRequest(conversation, message, platform, conversationId);
        return;
      }

      // Route through router template OR direct to Claude
      if (conversation.codebase_id) {
        // Has codebase - use router template if available
        const routerTemplate = await templateDb.getTemplate('router');
        if (routerTemplate) {
          console.log('[Orchestrator] Routing through router template');
          commandName = 'router';
          // Pass the entire message as $ARGUMENTS for the router
          promptToSend = substituteVariables(routerTemplate.content, [message]);
        }
        // If no router template, message passes through as-is
      } else {
        // No codebase configured - pass directly to Claude
        // Claude's global CLAUDE.md will guide the conversation (onboarding, etc.)
        console.log('[Orchestrator] No codebase - routing directly to Claude (global context)');
        // Message passes through as-is, Claude uses ~/.claude/CLAUDE.md for guidance
      }
    }

    // Prepend thread context if provided
    if (threadContext) {
      promptToSend = `## Thread Context (previous messages)\n\n${threadContext}\n\n---\n\n## Current Request\n\n${promptToSend}`;
      console.log('[Orchestrator] Prepended thread context to prompt');
    }

    console.log('[Orchestrator] Starting AI conversation');
    if (isVerboseEnabled()) {
      verbose('Orchestrator', 'Full prompt to be sent:', promptToSend);
    }

    // Dynamically get the appropriate AI client based on conversation's assistant type
    const aiClient = getAssistantClient(conversation.ai_assistant_type);
    console.log(`[Orchestrator] Using ${conversation.ai_assistant_type} assistant`);
    verbose('Orchestrator', `Conversation context`, {
      conversationId,
      codebaseId: conversation.codebase_id,
      commandName,
      hasIssueContext: !!issueContext,
      hasThreadContext: !!threadContext,
    });

    // Get codebase for isolation and session management
    const codebase = conversation.codebase_id
      ? await codebaseDb.getCodebase(conversation.codebase_id)
      : null;

    // Validate and resolve isolation - this is the single source of truth
    const { cwd, isNew: isNewIsolation } = await validateAndResolveIsolation(
      conversation,
      codebase,
      platform,
      conversationId,
      isolationHints
    );

    // Get or create session (handle plan→execute transition)
    let session = await sessionDb.getActiveSession(conversation.id);

    // If cwd changed (new isolation), deactivate stale sessions
    if (isNewIsolation && session) {
      console.log('[Orchestrator] New isolation, deactivating existing session');
      await sessionDb.deactivateSession(session.id);
      session = null;
    }

    // Update last_activity_at for staleness tracking
    await db.touchConversation(conversation.id);

    // Check for plan→execute transition (requires NEW session per PRD)
    // Supports both regular and GitHub workflows:
    // - plan-feature → execute (regular workflow)
    // - plan-feature-github → execute-github (GitHub workflow with staging)
    const needsNewSession =
      (commandName === 'execute' && session?.metadata?.lastCommand === 'plan-feature') ||
      (commandName === 'execute-github' &&
        session?.metadata?.lastCommand === 'plan-feature-github');

    if (needsNewSession) {
      console.log('[Orchestrator] Plan→Execute transition: creating new session');

      if (session) {
        await sessionDb.deactivateSession(session.id);
      }

      session = await sessionDb.createSession({
        conversation_id: conversation.id,
        codebase_id: conversation.codebase_id ?? undefined,
        ai_assistant_type: conversation.ai_assistant_type,
      });
    } else if (!session) {
      console.log('[Orchestrator] Creating new session');
      session = await sessionDb.createSession({
        conversation_id: conversation.id,
        codebase_id: conversation.codebase_id ?? undefined,
        ai_assistant_type: conversation.ai_assistant_type,
      });
    } else {
      console.log(`[Orchestrator] Resuming session ${session.id}`);
    }

    // Send to AI and stream responses
    const mode = platform.getStreamingMode();
    console.log(`[Orchestrator] Streaming mode: ${mode}`);

    // Send "starting" message in batch mode to provide feedback
    if (mode === 'batch') {
      const botName = process.env.BOT_DISPLAY_NAME ?? 'The agent';
      await platform.sendMessage(conversationId, `${botName} is on the case...`);
    }

    // Build approval context for phone-based blocking approvals (Telegram only)
    let approvalContext: ApprovalContext | undefined;
    const blockingApprovalsEnabled = process.env.BLOCKING_APPROVALS === 'true';

    if (
      blockingApprovalsEnabled &&
      platform.getPlatformType() === 'telegram' &&
      platform.getBot
    ) {
      approvalContext = {
        sessionId: session.id,
        chatId: parseInt(conversationId, 10),
        bot: platform.getBot(),
        timeoutMs: parseInt(process.env.APPROVAL_TIMEOUT_MS ?? '300000', 10), // 5 min default
      };
      console.log('[Orchestrator] Blocking approvals ENABLED for this session');
    }

    // Check if phone notifications are enabled (observe-only mode)
    const notifyOnRisk = process.env.NOTIFY_ON_RISK_TOOLS !== 'false';

    // Create abort controller for this conversation (allows /stop to interrupt)
    createAbortController(conversationId);

    // Track files written during this response for auto-send feature
    const writtenFiles = new Set<string>();

    // Track all file operations for visibility (Phone Vibecoding V1)
    const fileOpsTracker = new FileOperationsTracker();

    if (mode === 'stream') {
        // Stream mode: Send each chunk immediately
        for await (const msg of aiClient.sendQuery(
          promptToSend,
          cwd,
          session.assistant_session_id ?? undefined,
          approvalContext
        )) {
          // Check for abort signal before processing each chunk
          if (isAborted(conversationId)) {
            console.log('[Orchestrator] Abort detected, stopping stream');
            wasAborted = true;
            break;
          }

          if (msg.type === 'assistant' && msg.content) {
            await platform.sendMessage(conversationId, msg.content);
          } else if (msg.type === 'tool' && msg.toolName) {
            // Format and send tool call notification
            const toolMessage = formatToolCall(msg.toolName, msg.toolInput);
            await platform.sendMessage(conversationId, toolMessage);

            // Track all file operations for visibility
            fileOpsTracker.recordToolCall(msg.toolName, msg.toolInput as Record<string, unknown>);

            // Track file writes for auto-send feature
            const writtenPath = extractWrittenFilePath(msg.toolName, msg.toolInput as Record<string, unknown>);
            if (writtenPath) {
              writtenFiles.add(writtenPath);
            }

            // Send risk notification for high-risk tools
            if (notifyOnRisk && isHighRiskTool(msg.toolName)) {
              const riskLevel = getToolRiskLevel(msg.toolName, msg.toolInput ?? {});

              // Record in database for audit trail
              await approvalDb.createApproval({
                session_id: session.id,
                tool_name: msg.toolName,
                tool_input: msg.toolInput ?? {},
                risk_level: riskLevel,
              }).catch(err => {
                console.warn('[Orchestrator] Failed to record tool execution:', err);
              });

              // Log for monitoring
              console.log(
                `[Orchestrator] ${riskLevel.toUpperCase()} risk tool: ${msg.toolName}`
              );
            }
          } else if (msg.type === 'result' && msg.sessionId) {
            // Save session ID for resume
            await sessionDb.updateSession(session.id, msg.sessionId);
          }
        }
      } else {
      // Batch mode: Accumulate all chunks for logging, send only final clean summary
      const allChunks: { type: string; content: string }[] = [];
      const assistantMessages: string[] = [];

      for await (const msg of aiClient.sendQuery(
        promptToSend,
        cwd,
        session.assistant_session_id ?? undefined,
        approvalContext
      )) {
        // Check for abort signal before processing each chunk
        if (isAborted(conversationId)) {
          console.log('[Orchestrator] Abort detected, stopping batch accumulation');
          wasAborted = true;
          break;
        }

        if (msg.type === 'assistant' && msg.content) {
          assistantMessages.push(msg.content);
          allChunks.push({ type: 'assistant', content: msg.content });
        } else if (msg.type === 'tool' && msg.toolName) {
          // Format and log tool call for observability
          const toolMessage = formatToolCall(msg.toolName, msg.toolInput);
          allChunks.push({ type: 'tool', content: toolMessage });
          console.log(`[Orchestrator] Tool call: ${msg.toolName}`);

          // Track all file operations for visibility
          fileOpsTracker.recordToolCall(msg.toolName, msg.toolInput as Record<string, unknown>);

          // Track file writes for auto-send feature
          const writtenPath = extractWrittenFilePath(msg.toolName, msg.toolInput as Record<string, unknown>);
          if (writtenPath) {
            writtenFiles.add(writtenPath);
          }

          // Record high-risk tools for audit trail
          if (notifyOnRisk && isHighRiskTool(msg.toolName)) {
            const riskLevel = getToolRiskLevel(msg.toolName, msg.toolInput ?? {});

            await approvalDb.createApproval({
              session_id: session.id,
              tool_name: msg.toolName,
              tool_input: msg.toolInput ?? {},
              risk_level: riskLevel,
            }).catch(err => {
              console.warn('[Orchestrator] Failed to record tool execution:', err);
            });

            console.log(
              `[Orchestrator] ${riskLevel.toUpperCase()} risk tool: ${msg.toolName}`
            );
          }
        } else if (msg.type === 'result' && msg.sessionId) {
          await sessionDb.updateSession(session.id, msg.sessionId);
        }
      }

      // Log all chunks for observability
      console.log(`[Orchestrator] Received ${String(allChunks.length)} chunks total`);
      console.log(`[Orchestrator] Assistant messages: ${String(assistantMessages.length)}`);

      // Join all assistant messages and filter tool indicators
      // Tool indicators from Claude Code: 🔧, 💭, etc.
      // These appear at the start of lines showing tool usage
      let finalMessage = '';

      if (assistantMessages.length > 0) {
        // Join all messages with separator (preserves context from all responses)
        const allMessages = assistantMessages.join('\n\n---\n\n');

        // Split by double newlines to separate tool sections from content
        const sections = allMessages.split('\n\n');

        // Filter out sections that start with tool indicators
        // Using alternation for emojis with variation selectors
        const toolIndicatorRegex =
          /^(?:\u{1F527}|\u{1F4AD}|\u{1F4DD}|\u{270F}\u{FE0F}|\u{1F5D1}\u{FE0F}|\u{1F4C2}|\u{1F50D})/u;
        const cleanSections = sections.filter(section => {
          const trimmed = section.trim();
          return !toolIndicatorRegex.exec(trimmed);
        });

        // Join remaining sections
        finalMessage = cleanSections.join('\n\n').trim();

        // If we filtered everything out, fall back to all messages joined
        if (!finalMessage) {
          finalMessage = allMessages;
        }
      }

      if (finalMessage) {
        console.log(`[Orchestrator] Sending final message (${String(finalMessage.length)} chars)`);

        // Check if response is long enough to warrant a .txt file
        if (finalMessage.length >= LONG_RESPONSE_THRESHOLD && platform.sendFile) {
          // Save to .txt and send as file for easier mobile reading
          const txtPath = await saveLongResponseToFile(finalMessage, conversationId);
          if (txtPath) {
            // Send a brief summary message first
            const preview = finalMessage.slice(0, 200).trim() + '...';
            await platform.sendMessage(
              conversationId,
              `📝 *Long response* (${finalMessage.length} chars)\n\n${preview}\n\n_Full response attached as file_`
            );
            // Send the .txt file
            await platform.sendFile(conversationId, txtPath, '📄 Full response');
          } else {
            // Fallback to regular message
            await platform.sendMessage(conversationId, finalMessage);
          }
        } else {
          // Normal length - send as regular message
          await platform.sendMessage(conversationId, finalMessage);
        }
      }
    }

    // Auto-send created files if platform supports it
    if (writtenFiles.size > 0 && platform.sendFile) {
      console.log(`[Orchestrator] Checking ${writtenFiles.size} written files for auto-send`);
      const filesToSend: Array<{ path: string; size: number }> = [];

      for (const filePath of writtenFiles) {
        // Resolve relative paths against cwd
        const fullPath = filePath.startsWith('/') ? filePath : join(cwd, filePath);
        const { send, size } = await shouldAutoSendFile(fullPath);
        if (send) {
          filesToSend.push({ path: fullPath, size });
        }
      }

      if (filesToSend.length > 0) {
        // Send files to user
        for (const { path: filePath, size } of filesToSend) {
          const fileName = basename(filePath);
          const sizeKB = Math.round(size / 1024);
          console.log(`[Orchestrator] Auto-sending file: ${fileName} (${sizeKB}KB)`);

          try {
            await platform.sendFile(conversationId, filePath, `📁 ${fileName} (${sizeKB}KB)`);
          } catch (err) {
            console.warn(`[Orchestrator] Failed to send file ${fileName}:`, err);
          }
        }

        console.log(`[Orchestrator] Sent ${filesToSend.length} files to user`);
      }
    }

    // Send file operations summary (if any file operations occurred)
    if (fileOpsTracker.hasOperations()) {
      const summary = fileOpsTracker.getSummary();
      console.log(`[Orchestrator] File operations: ${summary.totalOperations} total`);

      // Use brief summary for batch mode, detailed for stream mode
      const summaryMessage =
        mode === 'stream'
          ? formatFileOperationsSummary(summary)
          : getBriefFileOperationsSummary(summary);

      if (summaryMessage) {
        await platform.sendMessage(conversationId, summaryMessage);
      }
    }

    // Track last command in metadata (for plan→execute detection)
    if (commandName) {
      await sessionDb.updateSessionMetadata(session.id, { lastCommand: commandName });
    }

    console.log('[Orchestrator] Message handling complete');
  } catch (error) {
    const err = error as Error;
    console.error('[Orchestrator] Error:', error);
    const userMessage = classifyAndFormatError(err);
    await platform.sendMessage(conversationId, userMessage);
  } finally {
    // Always clean up abort state when query completes
    clearAbortState(conversationId);

    // Notify user if operation was aborted via /stop
    if (wasAborted) {
      console.log('[Orchestrator] Operation was aborted by /stop command');
      await platform.sendMessage(
        conversationId,
        '⚠️ Operation interrupted by /stop command'
      ).catch(err => {
        console.warn('[Orchestrator] Failed to send abort notification:', err);
      });
    }
  }
}
