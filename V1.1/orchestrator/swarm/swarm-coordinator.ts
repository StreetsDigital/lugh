/**
 * Swarm Coordinator
 * =================
 *
 * Coordinates parallel execution of multiple agents.
 * Manages dependencies, tracks progress, and handles failures.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  SwarmSession,
  DecomposedTask,
  SubTask,
  SpawnedAgent,
  AgentResult,
  SwarmEvent,
  SwarmEventHandler,
} from './types';
import { TaskDecomposer, taskDecomposer } from './task-decomposer';
import { DynamicAgentSpawner, agentSpawner } from './agent-spawner';
import { ResultSynthesizer, resultSynthesizer } from './result-synthesizer';

/**
 * Agent approval hook - returns true to spawn, false to skip
 */
export type AgentApprovalHook = (
  subTask: SubTask,
  swarmId: string
) => Promise<{ approved: boolean; agentId?: string }>;

/**
 * Swarm execution options
 */
export interface SwarmExecuteOptions {
  /** Hook to request approval before spawning each agent */
  agentApprovalHook?: AgentApprovalHook;
  /** Skip approval for these agent roles */
  autoApproveRoles?: string[];
}

/**
 * Execution graph node for dependency tracking
 */
interface ExecutionNode {
  subTask: SubTask;
  status: 'pending' | 'ready' | 'running' | 'completed' | 'failed';
  dependsOn: string[];
  agent?: SpawnedAgent;
  result?: AgentResult;
}

/**
 * SwarmCoordinator class
 * Orchestrates the full swarm execution lifecycle
 */
export class SwarmCoordinator {
  private decomposer: TaskDecomposer;
  private spawner: DynamicAgentSpawner;
  private synthesizer: ResultSynthesizer;
  private sessions: Map<string, SwarmSession> = new Map();
  private eventHandlers: SwarmEventHandler[] = [];

  constructor(
    decomposer: TaskDecomposer = taskDecomposer,
    spawner: DynamicAgentSpawner = agentSpawner,
    synthesizer: ResultSynthesizer = resultSynthesizer
  ) {
    this.decomposer = decomposer;
    this.spawner = spawner;
    this.synthesizer = synthesizer;

    // Set up progress tracking
    this.spawner.setProgressCallback((agentId, progress, step) => {
      this.emitEvent({
        type: 'agent_progress',
        swarmId: this.findSwarmByAgent(agentId) || '',
        timestamp: new Date(),
        data: { agentId, progress, step },
      });
    });
  }

  /**
   * Register event handler
   */
  onEvent(handler: SwarmEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Emit event to all handlers
   */
  private emitEvent(event: SwarmEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('[SwarmCoordinator] Event handler error:', error);
      }
    }
  }

  /**
   * Find swarm ID by agent ID
   */
  private findSwarmByAgent(agentId: string): string | undefined {
    for (const [swarmId, session] of this.sessions) {
      if (session.agents.some((a) => a.id === agentId)) {
        return swarmId;
      }
    }
    return undefined;
  }

  /**
   * Execute a swarm for a user request
   * This is the main entry point
   */
  async execute(
    userRequest: string,
    conversationId: string,
    options?: SwarmExecuteOptions
  ): Promise<SwarmSession> {
    const swarmId = `swarm-${uuidv4().substring(0, 8)}`;
    console.log(`[SwarmCoordinator] Starting swarm ${swarmId}`);

    // Initialize session
    const session: SwarmSession = {
      id: swarmId,
      conversationId,
      originalRequest: userRequest,
      decomposedTask: null as unknown as DecomposedTask, // Will be set after decomposition
      agents: [],
      status: 'decomposing',
      startedAt: new Date(),
      completedAt: null,
      synthesizedResult: null,
    };

    this.sessions.set(swarmId, session);

    this.emitEvent({
      type: 'swarm_started',
      swarmId,
      timestamp: new Date(),
      data: { userRequest, conversationId },
    });

    try {
      // Step 1: Decompose the task
      console.log(`[SwarmCoordinator] Decomposing task...`);
      const decomposedTask = await this.decomposer.decompose(userRequest);
      session.decomposedTask = decomposedTask;
      session.status = 'spawning';

      this.emitEvent({
        type: 'task_decomposed',
        swarmId,
        timestamp: new Date(),
        data: {
          projectName: decomposedTask.projectName,
          subTaskCount: decomposedTask.subTasks.length,
          strategy: decomposedTask.executionStrategy,
        },
      });

      console.log(
        `[SwarmCoordinator] Decomposed into ${decomposedTask.subTasks.length} sub-tasks`
      );

      // Step 2: Build execution graph
      const executionGraph = this.buildExecutionGraph(decomposedTask.subTasks);

      // Step 3: Execute based on strategy
      session.status = 'running';
      const results = await this.executeGraph(executionGraph, swarmId, session, options);

      // Step 4: Synthesize results
      session.status = 'synthesizing';

      this.emitEvent({
        type: 'synthesis_started',
        swarmId,
        timestamp: new Date(),
        data: { resultCount: results.length },
      });

      const synthesizedResult = await this.synthesizer.synthesize(
        decomposedTask,
        results
      );

      // Complete session
      session.status = 'completed';
      session.completedAt = new Date();
      session.synthesizedResult = synthesizedResult;

      this.emitEvent({
        type: 'swarm_completed',
        swarmId,
        timestamp: new Date(),
        data: {
          duration: session.completedAt.getTime() - session.startedAt.getTime(),
          totalTokens: synthesizedResult.totalTokensUsed,
        },
      });

      console.log(`[SwarmCoordinator] Swarm ${swarmId} completed successfully`);
      return session;
    } catch (error) {
      session.status = 'failed';
      session.completedAt = new Date();

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.emitEvent({
        type: 'swarm_failed',
        swarmId,
        timestamp: new Date(),
        data: { error: errorMessage },
      });

      console.error(`[SwarmCoordinator] Swarm ${swarmId} failed:`, errorMessage);
      throw error;
    }
  }

  /**
   * Build execution graph from sub-tasks
   */
  private buildExecutionGraph(subTasks: SubTask[]): Map<string, ExecutionNode> {
    const graph = new Map<string, ExecutionNode>();

    for (const subTask of subTasks) {
      graph.set(subTask.id, {
        subTask,
        status: subTask.dependencies.length === 0 ? 'ready' : 'pending',
        dependsOn: subTask.dependencies,
      });
    }

    return graph;
  }

  /**
   * Execute the task graph respecting dependencies
   */
  private async executeGraph(
    graph: Map<string, ExecutionNode>,
    swarmId: string,
    session: SwarmSession,
    options?: SwarmExecuteOptions
  ): Promise<AgentResult[]> {
    const results: AgentResult[] = [];
    const completedIds = new Set<string>();
    const runningPromises = new Map<string, Promise<AgentResult>>();

    // Keep executing until all tasks are done
    while (completedIds.size < graph.size) {
      // Find ready tasks (dependencies satisfied)
      const readyTasks: ExecutionNode[] = [];

      for (const [_taskId, node] of graph) {
        if (node.status === 'pending' || node.status === 'ready') {
          // Check if all dependencies are complete
          const depsComplete = node.dependsOn.every((depId) =>
            completedIds.has(depId)
          );

          if (depsComplete && node.status !== 'ready') {
            node.status = 'ready';
          }

          if (node.status === 'ready') {
            readyTasks.push(node);
          }
        }
      }

      // Spawn agents for ready tasks
      for (const node of readyTasks) {
        if (!runningPromises.has(node.subTask.id)) {
          console.log(
            `[SwarmCoordinator] Spawning agent for: ${node.subTask.title}`
          );

          // 🔐 APPROVAL CHECK - Request user approval before spawning
          if (options?.agentApprovalHook) {
            // Check if this role is auto-approved
            const isAutoApproved = options.autoApproveRoles?.includes(node.subTask.role);

            if (!isAutoApproved) {
              console.log(`[SwarmCoordinator] ⏳ Requesting approval for agent (${node.subTask.role})`);

              const approvalResult = await options.agentApprovalHook(node.subTask, swarmId);

              if (!approvalResult.approved) {
                console.log(`[SwarmCoordinator] ⏭ Agent skipped by user (${node.subTask.role})`);
                node.status = 'failed';
                completedIds.add(node.subTask.id);

                this.emitEvent({
                  type: 'agent_failed',
                  swarmId,
                  timestamp: new Date(),
                  data: {
                    agentId: approvalResult.agentId || 'skipped',
                    role: node.subTask.role,
                    error: 'Skipped by user',
                  },
                });

                // Return a skipped result
                const skippedResult: AgentResult = {
                  subTaskId: node.subTask.id,
                  role: node.subTask.role,
                  summary: '⏭ Skipped by user',
                  details: '',
                  artifacts: [],
                  recommendations: [],
                  nextSteps: [],
                  confidence: 0,
                  tokensUsed: 0,
                  duration: 0,
                };
                results.push(skippedResult);
                continue; // Skip to next ready task
              }

              console.log(`[SwarmCoordinator] ✅ Agent approved (${node.subTask.role})`);
            }
          }

          node.status = 'running';

          const handle = await this.spawner.spawn(node.subTask, swarmId);
          node.agent = handle.agent;
          session.agents.push(handle.agent);

          this.emitEvent({
            type: 'agent_spawned',
            swarmId,
            timestamp: new Date(),
            data: {
              agentId: handle.agent.id,
              role: node.subTask.role,
              title: node.subTask.title,
            },
          });

          // Track the promise
          const resultPromise = handle.promise.then((result) => {
            node.status = 'completed';
            node.result = result;
            completedIds.add(node.subTask.id);

            this.emitEvent({
              type: 'agent_completed',
              swarmId,
              timestamp: new Date(),
              data: {
                agentId: handle.agent.id,
                role: node.subTask.role,
                duration: result.duration,
              },
            });

            return result;
          }).catch((error) => {
            node.status = 'failed';
            completedIds.add(node.subTask.id); // Mark as done even on failure

            this.emitEvent({
              type: 'agent_failed',
              swarmId,
              timestamp: new Date(),
              data: {
                agentId: handle.agent.id,
                role: node.subTask.role,
                error: error.message,
              },
            });

            // Return a failure result
            return {
              subTaskId: node.subTask.id,
              role: node.subTask.role,
              summary: `Failed: ${error.message}`,
              details: '',
              artifacts: [],
              recommendations: [],
              nextSteps: [],
              confidence: 0,
              tokensUsed: 0,
              duration: 0,
            } as AgentResult;
          });

          runningPromises.set(node.subTask.id, resultPromise);
        }
      }

      // If nothing is running and nothing is ready, we have a deadlock or are done
      if (runningPromises.size === 0 && readyTasks.length === 0) {
        break;
      }

      // Wait for at least one task to complete
      if (runningPromises.size > 0) {
        const completedResult = await Promise.race(runningPromises.values());
        results.push(completedResult);

        // Remove completed promise
        for (const [completedTaskId] of runningPromises) {
          if (completedIds.has(completedTaskId)) {
            runningPromises.delete(completedTaskId);
          }
        }
      }
    }

    // Collect any remaining results
    for (const [, promise] of runningPromises) {
      const result = await promise;
      if (!results.includes(result)) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Get session status
   */
  getSession(swarmId: string): SwarmSession | undefined {
    return this.sessions.get(swarmId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SwarmSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status !== 'completed' && s.status !== 'failed'
    );
  }

  /**
   * Cancel a swarm execution
   */
  async cancel(swarmId: string): Promise<boolean> {
    const session = this.sessions.get(swarmId);
    if (!session) return false;

    console.log(`[SwarmCoordinator] Cancelling swarm ${swarmId}`);

    // Abort all agents
    for (const agent of session.agents) {
      this.spawner.abortAgent(agent.id);
    }

    session.status = 'failed';
    session.completedAt = new Date();

    return true;
  }

  /**
   * Get progress summary for a swarm
   */
  getProgress(swarmId: string): {
    total: number;
    completed: number;
    running: number;
    failed: number;
    agents: { role: string; status: string; progress: number }[];
  } | null {
    const session = this.sessions.get(swarmId);
    if (!session) return null;

    const agents = session.agents.map((a) => ({
      role: a.role,
      status: a.status,
      progress: a.progress,
    }));

    return {
      total: session.decomposedTask?.subTasks.length || 0,
      completed: agents.filter((a) => a.status === 'completed').length,
      running: agents.filter((a) => a.status === 'running').length,
      failed: agents.filter((a) => a.status === 'failed').length,
      agents,
    };
  }
}

// Export singleton instance
export const swarmCoordinator = new SwarmCoordinator();
