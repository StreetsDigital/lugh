/**
 * Yolo Mode
 * ==============
 *
 * Natural language interface for controlling multi-agent execution.
 * Allows users to specify execution mode, agent types, models, and control points
 * through conversational commands.
 *
 * Examples:
 * - "Build me an auth system" (defaults to yolo)
 * - "Go wild, make this codebase better"
 * - "Use 3 agents debating the architecture"
 * - "Check with me before each major change"
 * - "Use Opus for planning, Haiku for implementation"
 */

import type { LLMProviderType } from '../llm/providers';
import type { AgentRole } from './types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Execution modes for multi-agent tasks
 */
export type ExecutionMode =
  | 'yolo' // Full autonomy - agents work independently
  | 'supervised' // User gets updates but doesn't block
  | 'controlled' // User approves at checkpoints
  | 'debate'; // Agents argue approaches, user picks winner

/**
 * Multi-agent strategies
 */
export type SwarmStrategy =
  | 'parallel' // All agents work simultaneously
  | 'sequential' // Agents work in dependency order
  | 'debate' // Multiple agents argue, synthesize best
  | 'consensus' // Agents must agree before proceeding
  | 'competition'; // Agents race, best result wins

/**
 * Checkpoint types for controlled mode
 */
export type CheckpointType =
  | 'task_start' // Before starting each subtask
  | 'major_decision' // Before architecture/design decisions
  | 'file_change' // Before modifying files
  | 'task_complete' // After each subtask completes
  | 'phase_complete'; // After major phase (plan, implement, test)

/**
 * User intent parsed from natural language
 */
export interface YoloIntent {
  /** The actual task/request stripped of control instructions */
  task: string;

  /** Execution mode (yolo, supervised, controlled, debate) */
  mode: ExecutionMode;

  /** Multi-agent strategy */
  strategy: SwarmStrategy;

  /** Model assignments (role -> model) */
  modelAssignments: Map<string, ModelAssignment>;

  /** Default model for unassigned roles */
  defaultModel?: ModelAssignment;

  /** Which checkpoints require user approval */
  checkpoints: CheckpointType[];

  /** Specific roles/agents requested */
  requestedRoles: AgentRole[];

  /** Number of agents for debate/competition */
  agentCount?: number;

  /** User wants progress updates */
  wantsUpdates: boolean;

  /** User wants to be able to intervene */
  allowsIntervention: boolean;

  /** Max duration before checking in (in minutes) */
  maxAutonomyMinutes?: number;

  /** Original message for context */
  originalMessage: string;
}

/**
 * Model assignment with tier
 */
export interface ModelAssignment {
  provider: LLMProviderType;
  model: string;
  tier: 'flagship' | 'standard' | 'fast' | 'local';
}

// ============================================================================
// MODEL TIERS (for natural language like "use the best model" or "fast models")
// ============================================================================

export const MODEL_TIERS: Record<string, ModelAssignment[]> = {
  flagship: [
    { provider: 'claude', model: 'claude-opus-4-20250514', tier: 'flagship' },
    { provider: 'openai', model: 'gpt-4o', tier: 'flagship' },
    { provider: 'gemini', model: 'gemini-1.5-pro', tier: 'flagship' },
  ],
  standard: [
    { provider: 'claude', model: 'claude-sonnet-4-20250514', tier: 'standard' },
    { provider: 'openai', model: 'gpt-4o-mini', tier: 'standard' },
    { provider: 'gemini', model: 'gemini-1.5-flash', tier: 'standard' },
  ],
  fast: [
    { provider: 'claude', model: 'claude-3-5-haiku-20241022', tier: 'fast' },
    { provider: 'groq', model: 'llama-3.3-70b-versatile', tier: 'fast' },
    { provider: 'together', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', tier: 'fast' },
  ],
  local: [
    { provider: 'ollama', model: 'llama3.2', tier: 'local' },
    { provider: 'ollama', model: 'codellama', tier: 'local' },
  ],
};

// ============================================================================
// MODEL ALIASES (for natural language like "use Opus" or "use Haiku")
// ============================================================================

export const MODEL_ALIASES: Record<string, ModelAssignment> = {
  // Claude models
  opus: { provider: 'claude', model: 'claude-opus-4-20250514', tier: 'flagship' },
  'claude-opus': { provider: 'claude', model: 'claude-opus-4-20250514', tier: 'flagship' },
  sonnet: { provider: 'claude', model: 'claude-sonnet-4-20250514', tier: 'standard' },
  'claude-sonnet': { provider: 'claude', model: 'claude-sonnet-4-20250514', tier: 'standard' },
  haiku: { provider: 'claude', model: 'claude-3-5-haiku-20241022', tier: 'fast' },
  'claude-haiku': { provider: 'claude', model: 'claude-3-5-haiku-20241022', tier: 'fast' },

  // OpenAI models
  'gpt-4': { provider: 'openai', model: 'gpt-4o', tier: 'flagship' },
  'gpt-4o': { provider: 'openai', model: 'gpt-4o', tier: 'flagship' },
  'gpt-4-mini': { provider: 'openai', model: 'gpt-4o-mini', tier: 'standard' },
  o1: { provider: 'openai', model: 'o1', tier: 'flagship' },

  // Other providers
  grok: { provider: 'grok', model: 'grok-2-latest', tier: 'standard' },
  gemini: { provider: 'gemini', model: 'gemini-1.5-pro', tier: 'flagship' },
  'gemini-flash': { provider: 'gemini', model: 'gemini-1.5-flash', tier: 'fast' },
  llama: { provider: 'groq', model: 'llama-3.3-70b-versatile', tier: 'fast' },
  mistral: { provider: 'mistral', model: 'mistral-large-latest', tier: 'standard' },

  // Tier shortcuts
  best: { provider: 'claude', model: 'claude-opus-4-20250514', tier: 'flagship' },
  fastest: { provider: 'groq', model: 'llama-3.3-70b-versatile', tier: 'fast' },
  cheapest: { provider: 'claude', model: 'claude-3-5-haiku-20241022', tier: 'fast' },
  local: { provider: 'ollama', model: 'llama3.2', tier: 'local' },
};

// ============================================================================
// INTENT PARSER
// ============================================================================

/**
 * Parse natural language message to extract yolo intent
 */
export function parseYoloIntent(message: string): YoloIntent {
  const lowerMessage = message.toLowerCase();

  // Default intent
  const intent: YoloIntent = {
    task: message,
    mode: 'yolo',
    strategy: 'hybrid' as SwarmStrategy,
    modelAssignments: new Map(),
    checkpoints: [],
    requestedRoles: [],
    wantsUpdates: true,
    allowsIntervention: true,
    originalMessage: message,
  };

  // =========================================================================
  // DETECT EXECUTION MODE
  // =========================================================================

  // Yolo indicators
  if (
    /\b(go wild|yolo|full autonomy|do your thing|have at it|go for it|just do it|figure it out)\b/i.test(
      lowerMessage
    )
  ) {
    intent.mode = 'yolo';
    intent.checkpoints = []; // No checkpoints in yolo
  }

  // Supervised indicators
  if (/\b(keep me (updated|posted|informed)|let me know|notify me)\b/i.test(lowerMessage)) {
    intent.mode = 'supervised';
    intent.wantsUpdates = true;
  }

  // Controlled indicators
  if (
    /\b(check with me|ask me (first|before)|confirm (with me|before)|wait for (my approval|approval)|approve each|step.?by.?step approval)\b/i.test(
      lowerMessage
    )
  ) {
    intent.mode = 'controlled';
    intent.checkpoints = ['task_start', 'major_decision', 'file_change'];
  }

  // Specific checkpoint requests
  if (/\b(before (each |any )?(file|change|edit|write))/i.test(lowerMessage)) {
    intent.checkpoints.push('file_change');
    intent.mode = 'controlled';
  }
  if (/\b(before (each |any )?(major|big|important) (decision|choice))/i.test(lowerMessage)) {
    intent.checkpoints.push('major_decision');
    intent.mode = 'controlled';
  }
  if (/\b(after (each |every )?task|when (done|complete))/i.test(lowerMessage)) {
    intent.checkpoints.push('task_complete');
  }

  // =========================================================================
  // DETECT STRATEGY
  // =========================================================================

  // Debate/argue strategy
  if (/\b(debate|argue|discuss|deliberate|argue.?agents?)\b/i.test(lowerMessage)) {
    intent.strategy = 'debate';
    intent.mode = 'debate';
  }

  // Consensus strategy
  if (/\b(consensus|agree|unanimous|all.?agree)\b/i.test(lowerMessage)) {
    intent.strategy = 'consensus';
  }

  // Competition strategy
  if (/\b(compete|race|best.?wins?|competition)\b/i.test(lowerMessage)) {
    intent.strategy = 'competition';
  }

  // Parallel strategy
  if (/\b(parallel|simultaneous|at.?once|same.?time)\b/i.test(lowerMessage)) {
    intent.strategy = 'parallel';
  }

  // Sequential strategy
  if (/\b(sequential|one.?at.?a.?time|in.?order|step.?by.?step)\b/i.test(lowerMessage)) {
    intent.strategy = 'sequential';
  }

  // =========================================================================
  // DETECT AGENT COUNT
  // =========================================================================

  const agentCountMatch = /\b(\d+)\s*agents?\b/i.exec(lowerMessage);
  if (agentCountMatch) {
    intent.agentCount = parseInt(agentCountMatch[1], 10);
  }

  // =========================================================================
  // DETECT MODEL ASSIGNMENTS
  // =========================================================================

  // Pattern: "use X for Y" or "X for Y"
  const modelForRolePattern =
    /\buse\s+(\w+(?:-\w+)?)\s+for\s+(planning|implementation|review|testing|analysis|research|architecture|security)/gi;
  let modelMatch;
  while ((modelMatch = modelForRolePattern.exec(message)) !== null) {
    const modelName = modelMatch[1].toLowerCase();
    const roleType = modelMatch[2].toLowerCase();

    const modelAssignment = MODEL_ALIASES[modelName];
    if (modelAssignment) {
      intent.modelAssignments.set(roleType, modelAssignment);
    }
  }

  // Pattern: "use X" as default model
  const defaultModelPattern = /\buse\s+(\w+(?:-\w+)?)\b(?!\s+for)/i;
  const defaultMatch = defaultModelPattern.exec(message);
  if (defaultMatch) {
    const modelName = defaultMatch[1].toLowerCase();
    const modelAssignment = MODEL_ALIASES[modelName];
    if (modelAssignment) {
      intent.defaultModel = modelAssignment;
    }
  }

  // Pattern: "best model(s) for planning" or "fast model(s) for implementation"
  const tierForRolePattern =
    /\b(best|flagship|standard|fast|cheap(?:est)?|local)\s+models?\s+for\s+(planning|implementation|review|testing|analysis|research|architecture|security)/gi;
  while ((modelMatch = tierForRolePattern.exec(message)) !== null) {
    const tier = modelMatch[1].toLowerCase().replace('cheapest', 'fast');
    const roleType = modelMatch[2].toLowerCase();

    const tierModels = MODEL_TIERS[tier];
    if (tierModels && tierModels.length > 0) {
      intent.modelAssignments.set(roleType, tierModels[0]);
    }
  }

  // =========================================================================
  // DETECT AUTONOMY LIMITS
  // =========================================================================

  // Max autonomy time
  const timePattern = /\b(?:check.?in|update.?me|ping.?me)\s+(?:every|after)\s+(\d+)\s*(min(?:ute)?s?|hour?s?)/i;
  const timeMatch = timePattern.exec(lowerMessage);
  if (timeMatch) {
    let minutes = parseInt(timeMatch[1], 10);
    if (timeMatch[2].startsWith('hour')) {
      minutes *= 60;
    }
    intent.maxAutonomyMinutes = minutes;
  }

  // =========================================================================
  // DETECT SPECIFIC ROLES
  // =========================================================================

  const rolePatterns: Record<AgentRole, RegExp> = {
    'competitor-analysis': /\b(competitor|competition|market.?leader)/i,
    'tech-stack-research': /\b(tech.?stack|technology|framework)/i,
    'architecture-design': /\b(architect|design|system.?design)/i,
    'project-management': /\b(project.?manage|timeline|milestone)/i,
    'market-research': /\b(market.?research|user.?persona|target.?audience)/i,
    'ux-design': /\b(ux|ui|user.?experience|wireframe)/i,
    'security-audit': /\b(security|audit|vulnerab)/i,
    'cost-estimation': /\b(cost|budget|estimate|roi)/i,
    'legal-compliance': /\b(legal|compliance|gdpr|privacy.?policy)/i,
    implementation: /\b(implement|code|build|develop)/i,
    testing: /\b(test|qa|quality)/i,
    documentation: /\b(document|readme|api.?doc)/i,
    custom: /^$/,
  };

  for (const [role, pattern] of Object.entries(rolePatterns)) {
    if (pattern.test(lowerMessage)) {
      intent.requestedRoles.push(role as AgentRole);
    }
  }

  // =========================================================================
  // EXTRACT CLEAN TASK
  // =========================================================================

  // Remove control phrases from the task
  let cleanTask = message;
  const controlPhrases = [
    /\b(go wild|yolo|full autonomy|do your thing|have at it)\b/gi,
    /\b(check with me|ask me first|confirm before|wait for approval)\b/gi,
    /\b(use \w+(?:-\w+)? for \w+)/gi,
    /\b(use \w+(?:-\w+)?)\b(?!\s+for)/gi,
    /\b(keep me (updated|posted|informed))\b/gi,
    /\b(\d+) agents?\b/gi,
    /\b(debate|argue|consensus|parallel|sequential)\s+(?:strategy|approach)?\b/gi,
    /\b(before each|after each|step by step)\b/gi,
  ];

  for (const phrase of controlPhrases) {
    cleanTask = cleanTask.replace(phrase, '').trim();
  }

  // Clean up extra whitespace
  cleanTask = cleanTask.replace(/\s+/g, ' ').trim();
  intent.task = cleanTask || message;

  return intent;
}

// ============================================================================
// INTENT SUMMARY (for user confirmation)
// ============================================================================

/**
 * Generate a human-readable summary of the parsed intent
 */
export function summarizeIntent(intent: YoloIntent): string {
  const lines: string[] = [];

  lines.push(`**Task:** ${intent.task}`);
  lines.push('');

  // Mode
  const modeDescriptions: Record<ExecutionMode, string> = {
    yolo: 'Full autonomy - agents work independently',
    supervised: 'Supervised - you get updates but agents proceed',
    controlled: 'Controlled - you approve at checkpoints',
    debate: 'Debate mode - agents argue approaches, you pick winner',
  };
  lines.push(`**Mode:** ${modeDescriptions[intent.mode]}`);

  // Strategy
  const strategyDescriptions: Record<SwarmStrategy, string> = {
    parallel: 'Parallel - all agents work simultaneously',
    sequential: 'Sequential - agents work in order',
    debate: 'Debate - agents argue, synthesize best',
    consensus: 'Consensus - agents must agree',
    competition: 'Competition - best result wins',
  };
  lines.push(`**Strategy:** ${strategyDescriptions[intent.strategy]}`);

  // Agent count
  if (intent.agentCount) {
    lines.push(`**Agents:** ${intent.agentCount}`);
  }

  // Model assignments
  if (intent.modelAssignments.size > 0 || intent.defaultModel) {
    lines.push('');
    lines.push('**Models:**');
    if (intent.defaultModel) {
      lines.push(`  • Default: ${intent.defaultModel.model} (${intent.defaultModel.provider})`);
    }
    for (const [role, model] of intent.modelAssignments) {
      lines.push(`  • ${role}: ${model.model} (${model.provider})`);
    }
  }

  // Checkpoints
  if (intent.checkpoints.length > 0) {
    lines.push('');
    lines.push('**Checkpoints:** ' + intent.checkpoints.join(', '));
  }

  // Requested roles
  if (intent.requestedRoles.length > 0) {
    lines.push('');
    lines.push('**Roles:** ' + intent.requestedRoles.join(', '));
  }

  return lines.join('\n');
}

// ============================================================================
// YOLO SESSION
// ============================================================================

/**
 * A yolo execution session with control state
 */
export interface YoloSession {
  id: string;
  conversationId: string;
  intent: YoloIntent;
  status: 'parsing' | 'confirming' | 'running' | 'paused' | 'waiting_approval' | 'completed' | 'cancelled';
  swarmId?: string;
  currentPhase?: string;
  pendingApproval?: {
    type: CheckpointType;
    description: string;
    options: string[];
    createdAt: Date;
  };
  userInterventions: Array<{
    type: 'pause' | 'resume' | 'cancel' | 'redirect' | 'approve' | 'reject';
    message?: string;
    timestamp: Date;
  }>;
  startedAt: Date;
  lastActivityAt: Date;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  parseYoloIntent,
  summarizeIntent,
  MODEL_ALIASES,
  MODEL_TIERS,
};
