/**
 * Swarm Types
 * ===========
 *
 * Type definitions for the dynamic agent spawning system.
 * Enables a chat agent to decompose tasks and spawn specialized agents.
 */

/**
 * Agent role/specialization types
 */
export type AgentRole =
  | 'competitor-analysis'
  | 'tech-stack-research'
  | 'architecture-design'
  | 'project-management'
  | 'market-research'
  | 'ux-design'
  | 'security-audit'
  | 'cost-estimation'
  | 'legal-compliance'
  | 'implementation'
  | 'testing'
  | 'documentation'
  | 'custom';

/**
 * A sub-task identified by the task decomposer
 */
export interface SubTask {
  id: string;
  role: AgentRole;
  title: string;
  description: string;
  prompt: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  dependencies: string[]; // IDs of tasks that must complete first
  estimatedDuration: 'short' | 'medium' | 'long'; // <1min, 1-5min, >5min
  requiredTools: boolean; // Whether this needs Claude Code (tools) or just LLM
}

/**
 * Result from task decomposition
 */
export interface DecomposedTask {
  originalRequest: string;
  projectName: string;
  projectDescription: string;
  subTasks: SubTask[];
  executionStrategy: 'parallel' | 'sequential' | 'hybrid';
  estimatedTotalDuration: string;
}

/**
 * Status of a spawned agent
 */
export type AgentStatus = 'pending' | 'spawning' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * A spawned agent instance
 */
export interface SpawnedAgent {
  id: string;
  swarmId: string;
  subTaskId: string;
  role: AgentRole;
  status: AgentStatus;
  provider: 'claude-code' | 'claude' | 'grok' | 'openai' | 'ollama';
  startedAt: Date | null;
  completedAt: Date | null;
  result: AgentResult | null;
  error: string | null;
  progress: number; // 0-100
  currentStep: string;
}

/**
 * Result from an agent execution
 */
export interface AgentResult {
  subTaskId: string;
  role: AgentRole;
  summary: string;
  details: string;
  artifacts: Artifact[];
  recommendations: string[];
  nextSteps: string[];
  confidence: number; // 0-1
  tokensUsed: number;
  duration: number; // ms
}

/**
 * An artifact produced by an agent
 */
export interface Artifact {
  type: 'document' | 'code' | 'diagram' | 'data' | 'link';
  name: string;
  content: string;
  format: string; // 'markdown', 'json', 'typescript', 'mermaid', etc.
}

/**
 * A swarm execution session
 */
export interface SwarmSession {
  id: string;
  conversationId: string;
  originalRequest: string;
  decomposedTask: DecomposedTask;
  agents: SpawnedAgent[];
  status: 'decomposing' | 'spawning' | 'running' | 'synthesizing' | 'completed' | 'failed';
  startedAt: Date;
  completedAt: Date | null;
  synthesizedResult: SynthesizedResult | null;
}

/**
 * Final synthesized result from all agents
 */
export interface SynthesizedResult {
  summary: string;
  sections: ResultSection[];
  combinedRecommendations: string[];
  nextSteps: string[];
  totalTokensUsed: number;
  totalDuration: number;
  agentResults: AgentResult[];
}

/**
 * A section in the synthesized result
 */
export interface ResultSection {
  title: string;
  role: AgentRole;
  content: string;
  artifacts: Artifact[];
  confidence: number;
}

/**
 * Role configuration with prompts and settings
 */
export interface RoleConfig {
  role: AgentRole;
  name: string;
  description: string;
  systemPrompt: string;
  requiresTools: boolean;
  preferredProvider: 'claude-code' | 'claude' | 'grok' | 'openai' | 'ollama';
  maxDuration: number; // ms
}

/**
 * Event emitted during swarm execution
 */
export interface SwarmEvent {
  type:
    | 'swarm_started'
    | 'task_decomposed'
    | 'agent_spawned'
    | 'agent_progress'
    | 'agent_completed'
    | 'agent_failed'
    | 'synthesis_started'
    | 'swarm_completed'
    | 'swarm_failed';
  swarmId: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

/**
 * Callback for swarm events
 */
export type SwarmEventHandler = (event: SwarmEvent) => void | Promise<void>;
