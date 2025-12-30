/**
 * LangGraph State Definitions
 * ===========================
 *
 * Defines the state schema for the Lugh conversation graph.
 * This replaces the implicit state in orchestrator.ts with explicit,
 * type-safe state that flows through the graph.
 */

import { Annotation } from '@langchain/langgraph';
import type {
  Conversation,
  Codebase,
  Session,
  IPlatformAdapter,
  IsolationHints,
  ApprovalContext,
  MessageChunk,
} from '../types';

/**
 * Input classification result
 */
export type InputType =
  | 'deterministic_command' // Slash commands handled by command-handler (no AI)
  | 'codebase_command' // /command-invoke - codebase-specific commands
  | 'template_command' // Global template commands
  | 'ai_query' // Regular AI conversation
  | 'swarm_request'; // Multi-agent swarm execution

/**
 * Command parsing result
 */
export interface ParsedCommand {
  command: string;
  args: string[];
  raw: string;
}

/**
 * Isolation resolution result
 */
export interface IsolationResult {
  cwd: string;
  envId: string | null;
  branchName: string | null;
  isNew: boolean;
}

/**
 * AI execution result
 */
export interface AIExecutionResult {
  success: boolean;
  chunks: MessageChunk[];
  sessionId: string | null;
  error: string | null;
  filesWritten: string[];
  fileOperations: {
    read: string[];
    write: string[];
    edit: string[];
    search: Array<{ pattern: string; path?: string }>;
  };
}

/**
 * Swarm execution result
 */
export interface SwarmResult {
  swarmId: string;
  status: 'completed' | 'failed';
  summary: string;
  agentCount: number;
  completedCount: number;
  failedCount: number;
  duration: number;
}

/**
 * Graph execution phase
 */
export type ExecutionPhase =
  | 'input_received'
  | 'input_parsed'
  | 'command_routing'
  | 'command_executed'
  | 'isolation_resolved'
  | 'session_prepared'
  | 'ai_executing'
  | 'ai_completed'
  | 'swarm_executing'
  | 'swarm_completed'
  | 'response_sent'
  | 'error'
  | 'completed';

/**
 * The main conversation state that flows through the graph
 *
 * This is the "single source of truth" for all conversation processing.
 * Each node reads from and writes to this state.
 */
export const ConversationStateAnnotation = Annotation.Root({
  // === Input Context ===
  /** Platform adapter for sending responses */
  platform: Annotation<IPlatformAdapter>,
  /** Conversation ID from platform */
  conversationId: Annotation<string>,
  /** Raw message from user */
  rawMessage: Annotation<string>,
  /** Optional GitHub issue/PR context */
  issueContext: Annotation<string | null>,
  /** Optional thread message history */
  threadContext: Annotation<string | null>,
  /** Optional parent conversation ID for inheritance */
  parentConversationId: Annotation<string | null>,
  /** Isolation hints from adapter */
  isolationHints: Annotation<IsolationHints | null>,

  // === Database Context ===
  /** Loaded conversation record */
  conversation: Annotation<Conversation | null>,
  /** Loaded codebase (if any) */
  codebase: Annotation<Codebase | null>,
  /** Active session */
  session: Annotation<Session | null>,

  // === Input Classification ===
  /** Classified input type */
  inputType: Annotation<InputType | null>,
  /** Parsed command (if slash command) */
  parsedCommand: Annotation<ParsedCommand | null>,
  /** Command name for template/codebase commands */
  commandName: Annotation<string | null>,

  // === Prompt Building ===
  /** Final prompt to send to AI (after variable substitution, context) */
  promptToSend: Annotation<string | null>,
  /** Whether to skip AI and just respond */
  skipAI: Annotation<boolean>,
  /** Direct response message (for deterministic commands) */
  directResponse: Annotation<string | null>,

  // === Isolation ===
  /** Resolved isolation environment */
  isolation: Annotation<IsolationResult | null>,

  // === Execution ===
  /** AI execution result */
  aiResult: Annotation<AIExecutionResult | null>,
  /** Swarm execution result */
  swarmResult: Annotation<SwarmResult | null>,
  /** Approval context for high-risk tools */
  approvalContext: Annotation<ApprovalContext | null>,

  // === Error Handling ===
  /** Error message if any step failed */
  error: Annotation<string | null>,
  /** Whether the operation was aborted via /stop */
  wasAborted: Annotation<boolean>,

  // === Tracking ===
  /** Current execution phase */
  phase: Annotation<ExecutionPhase>,
  /** Timestamp when processing started */
  startedAt: Annotation<Date>,
  /** Messages sent back to user during execution */
  messagesSent: Annotation<string[], { reducer: (a: string[], b: string[]) => string[] }>({
    default: () => [],
    reducer: (existing, newMessages) => [...existing, ...newMessages],
  }),
});

/**
 * Type alias for the conversation state
 */
export type ConversationState = typeof ConversationStateAnnotation.State;

/**
 * Initial state factory
 */
export function createInitialState(
  platform: IPlatformAdapter,
  conversationId: string,
  message: string,
  options?: {
    issueContext?: string;
    threadContext?: string;
    parentConversationId?: string;
    isolationHints?: IsolationHints;
  }
): Partial<ConversationState> {
  return {
    // Input
    platform,
    conversationId,
    rawMessage: message,
    issueContext: options?.issueContext ?? null,
    threadContext: options?.threadContext ?? null,
    parentConversationId: options?.parentConversationId ?? null,
    isolationHints: options?.isolationHints ?? null,

    // Database (loaded by first node)
    conversation: null,
    codebase: null,
    session: null,

    // Classification (set by parseInput node)
    inputType: null,
    parsedCommand: null,
    commandName: null,

    // Prompt (set by buildPrompt node)
    promptToSend: null,
    skipAI: false,
    directResponse: null,

    // Isolation (set by resolveIsolation node)
    isolation: null,

    // Execution (set by AI/swarm nodes)
    aiResult: null,
    swarmResult: null,
    approvalContext: null,

    // Error handling
    error: null,
    wasAborted: false,

    // Tracking
    phase: 'input_received',
    startedAt: new Date(),
    messagesSent: [],
  };
}

/**
 * Swarm subgraph state - for multi-agent execution
 */
export const SwarmStateAnnotation = Annotation.Root({
  /** Parent conversation state reference */
  conversationId: Annotation<string>,
  /** User's original request */
  userRequest: Annotation<string>,
  /** Working directory for agents */
  cwd: Annotation<string>,
  /** Platform for sending updates */
  platform: Annotation<IPlatformAdapter>,

  // === Decomposition ===
  /** Decomposed sub-tasks */
  subTasks: Annotation<Array<{
    id: string;
    role: string;
    title: string;
    description: string;
    prompt: string;
    dependencies: string[];
    status: 'pending' | 'ready' | 'running' | 'completed' | 'failed';
  }>>({
    default: () => [],
  }),
  /** Execution strategy */
  strategy: Annotation<'parallel' | 'sequential' | 'hybrid' | null>,

  // === Execution ===
  /** Currently running agent IDs */
  runningAgents: Annotation<string[], { reducer: (a: string[], b: string[]) => string[] }>({
    default: () => [],
    reducer: (existing, newAgents) => [...new Set([...existing, ...newAgents])],
  }),
  /** Completed agent results */
  completedResults: Annotation<Array<{
    subTaskId: string;
    role: string;
    summary: string;
    success: boolean;
    duration: number;
  }>, { reducer: (a: Array<unknown>, b: Array<unknown>) => Array<unknown> }>({
    default: () => [],
    reducer: (existing, newResults) => [...existing, ...newResults],
  }),

  // === Synthesis ===
  /** Final synthesized result */
  synthesizedResult: Annotation<string | null>,

  // === Tracking ===
  /** Swarm execution phase */
  phase: Annotation<'decomposing' | 'spawning' | 'running' | 'synthesizing' | 'completed' | 'failed'>,
  /** Error if failed */
  error: Annotation<string | null>,
});

export type SwarmState = typeof SwarmStateAnnotation.State;
