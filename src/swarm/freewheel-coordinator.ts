/**
 * Freewheel Coordinator
 * =====================
 *
 * Bridges natural language intent to swarm execution.
 * Handles user control points, mid-flight intervention, and model assignment.
 */

import { v4 as uuidv4 } from 'uuid';
import { isEnabled } from '../config/features';
import {
  parseFreewheelIntent,
  summarizeIntent,
  MODEL_ALIASES,
  type FreewheelIntent,
  type FreewheelSession,
  type ExecutionMode,
  type CheckpointType,
  type ModelAssignment,
} from './freewheel-mode';
import { swarmCoordinator, SwarmCoordinator } from './swarm-coordinator';
import { agentSpawner, DynamicAgentSpawner } from './agent-spawner';
import { taskDecomposer, TaskDecomposer } from './task-decomposer';
import type { SwarmSession, SwarmEvent, AgentRole } from './types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * User response to an approval request
 */
export interface ApprovalResponse {
  approved: boolean;
  selectedOption?: string;
  feedback?: string;
}

/**
 * Callback for requesting user approval
 */
export type ApprovalRequestCallback = (
  session: FreewheelSession,
  checkpoint: CheckpointType,
  description: string,
  options: string[]
) => Promise<ApprovalResponse>;

/**
 * Callback for sending status updates
 */
export type StatusUpdateCallback = (
  session: FreewheelSession,
  update: string,
  data?: Record<string, unknown>
) => Promise<void>;

/**
 * Callback for asking user questions
 */
export type QuestionCallback = (
  session: FreewheelSession,
  question: string,
  options?: string[]
) => Promise<string>;

// ============================================================================
// FREEWHEEL COORDINATOR
// ============================================================================

/**
 * FreewheelCoordinator class
 * Manages the full lifecycle of a freewheel execution
 */
export class FreewheelCoordinator {
  private coordinator: SwarmCoordinator;
  private spawner: DynamicAgentSpawner;
  private decomposer: TaskDecomposer;
  private sessions: Map<string, FreewheelSession> = new Map();

  // Callbacks for user interaction
  private onApprovalRequest?: ApprovalRequestCallback;
  private onStatusUpdate?: StatusUpdateCallback;
  private onQuestion?: QuestionCallback;

  constructor() {
    if (!isEnabled('SWARM_COORDINATION')) {
      throw new Error(
        '[FreewheelCoordinator] SWARM_COORDINATION feature is not enabled. ' +
          'Set FEATURE_SWARM_COORDINATION=true (requires MULTI_LLM).'
      );
    }

    this.coordinator = swarmCoordinator;
    this.spawner = agentSpawner;
    this.decomposer = taskDecomposer;
  }

  // =========================================================================
  // CALLBACK REGISTRATION
  // =========================================================================

  /**
   * Set callback for approval requests
   */
  setApprovalCallback(callback: ApprovalRequestCallback): void {
    this.onApprovalRequest = callback;
  }

  /**
   * Set callback for status updates
   */
  setStatusCallback(callback: StatusUpdateCallback): void {
    this.onStatusUpdate = callback;
  }

  /**
   * Set callback for asking questions
   */
  setQuestionCallback(callback: QuestionCallback): void {
    this.onQuestion = callback;
  }

  // =========================================================================
  // MAIN ENTRY POINT
  // =========================================================================

  /**
   * Start a freewheel execution from a natural language message
   */
  async start(
    message: string,
    conversationId: string,
    skipConfirmation = false
  ): Promise<FreewheelSession> {
    const sessionId = `freewheel-${uuidv4().substring(0, 8)}`;
    console.log(`[FreewheelCoordinator] Starting session ${sessionId}`);

    // Parse intent from natural language
    const intent = parseFreewheelIntent(message);
    console.log(`[FreewheelCoordinator] Parsed intent:`, {
      mode: intent.mode,
      strategy: intent.strategy,
      agentCount: intent.agentCount,
      modelAssignments: Array.from(intent.modelAssignments.entries()),
    });

    // Create session
    const session: FreewheelSession = {
      id: sessionId,
      conversationId,
      intent,
      status: 'parsing',
      userInterventions: [],
      startedAt: new Date(),
      lastActivityAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    // Apply model assignments to spawner
    this.applyModelAssignments(intent);

    // If confirmation required and not skipped, ask user
    if (!skipConfirmation && intent.mode !== 'freewheel') {
      session.status = 'confirming';
      const confirmed = await this.confirmIntent(session);
      if (!confirmed) {
        session.status = 'cancelled';
        this.sessions.delete(sessionId);
        return session;
      }
    }

    // Execute based on mode
    session.status = 'running';
    await this.executeSession(session);

    return session;
  }

  /**
   * Confirm intent with user before proceeding
   */
  private async confirmIntent(session: FreewheelSession): Promise<boolean> {
    if (!this.onQuestion) {
      console.log('[FreewheelCoordinator] No question callback, auto-confirming');
      return true;
    }

    const summary = summarizeIntent(session.intent);
    const response = await this.onQuestion(
      session,
      `I understood your request as:\n\n${summary}\n\nProceed?`,
      ['Yes, proceed', 'Modify settings', 'Cancel']
    );

    if (response.toLowerCase().includes('yes') || response.toLowerCase().includes('proceed')) {
      return true;
    }

    if (response.toLowerCase().includes('cancel')) {
      return false;
    }

    // TODO: Handle "modify settings" - ask follow-up questions
    return true;
  }

  /**
   * Execute the session based on its mode and strategy
   */
  private async executeSession(session: FreewheelSession): Promise<void> {
    const { intent } = session;

    try {
      // Send initial status
      await this.sendStatus(session, `Starting ${intent.mode} execution...`);

      // Set up event handlers for swarm progress
      this.coordinator.onEvent(async (event) => {
        await this.handleSwarmEvent(session, event);
      });

      // Check for pre-execution approval if controlled mode
      if (
        intent.mode === 'controlled' &&
        intent.checkpoints.includes('task_start')
      ) {
        const approved = await this.requestApproval(
          session,
          'task_start',
          `About to start: ${intent.task}`,
          ['Start', 'Cancel']
        );
        if (!approved) {
          session.status = 'cancelled';
          return;
        }
      }

      // Execute the swarm
      session.currentPhase = 'decomposing';
      const swarmSession = await this.coordinator.execute(
        intent.task,
        session.conversationId
      );

      session.swarmId = swarmSession.id;
      session.status = 'completed';

      // Send completion message
      if (swarmSession.synthesizedResult) {
        await this.sendStatus(
          session,
          `Completed!\n\n${swarmSession.synthesizedResult.summary}`,
          { result: swarmSession.synthesizedResult }
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[FreewheelCoordinator] Execution failed:`, errorMessage);
      session.status = 'cancelled';
      await this.sendStatus(session, `Execution failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Handle swarm events and apply checkpoints
   */
  private async handleSwarmEvent(
    session: FreewheelSession,
    event: SwarmEvent
  ): Promise<void> {
    const { intent } = session;

    switch (event.type) {
      case 'task_decomposed':
        session.currentPhase = 'executing';
        await this.sendStatus(
          session,
          `Task decomposed into ${(event.data as { subTaskCount: number }).subTaskCount} subtasks`,
          event.data
        );
        break;

      case 'agent_spawned':
        await this.sendStatus(
          session,
          `Agent spawned: ${(event.data as { role: string }).role} - ${(event.data as { title: string }).title}`
        );

        // Check for task_start checkpoint
        if (
          intent.mode === 'controlled' &&
          intent.checkpoints.includes('task_start')
        ) {
          const data = event.data as { role: string; title: string };
          const approved = await this.requestApproval(
            session,
            'task_start',
            `About to start: ${data.role} - ${data.title}`,
            ['Proceed', 'Skip', 'Cancel All']
          );
          if (!approved) {
            // TODO: Handle skip vs cancel
          }
        }
        break;

      case 'agent_progress':
        if (intent.wantsUpdates) {
          const data = event.data as { agentId: string; progress: number; step: string };
          await this.sendStatus(
            session,
            `Progress: ${data.step} (${data.progress}%)`
          );
        }
        break;

      case 'agent_completed':
        await this.sendStatus(
          session,
          `Agent completed: ${(event.data as { role: string }).role}`,
          event.data
        );

        // Check for task_complete checkpoint
        if (
          intent.mode === 'controlled' &&
          intent.checkpoints.includes('task_complete')
        ) {
          await this.requestApproval(
            session,
            'task_complete',
            `Task completed: ${(event.data as { role: string }).role}. Continue?`,
            ['Continue', 'Review Results', 'Stop']
          );
        }
        break;

      case 'agent_failed':
        await this.sendStatus(
          session,
          `Agent failed: ${(event.data as { role: string }).role} - ${(event.data as { error: string }).error}`
        );
        break;

      case 'swarm_completed':
        session.currentPhase = 'completed';
        await this.sendStatus(session, 'All agents completed!', event.data);
        break;

      case 'swarm_failed':
        session.currentPhase = 'failed';
        await this.sendStatus(
          session,
          `Swarm failed: ${(event.data as { error: string }).error}`
        );
        break;
    }

    session.lastActivityAt = new Date();
  }

  /**
   * Apply model assignments from intent to spawner
   */
  private applyModelAssignments(intent: FreewheelIntent): void {
    // Set default model if specified
    if (intent.defaultModel) {
      this.spawner.setDefaultProvider(intent.defaultModel.provider);
      console.log(
        `[FreewheelCoordinator] Default provider: ${intent.defaultModel.provider}`
      );
    }

    // Set role-specific overrides
    for (const [roleType, assignment] of intent.modelAssignments) {
      // Map roleType to AgentRole
      const roleMapping: Record<string, AgentRole> = {
        planning: 'architecture-design',
        implementation: 'implementation',
        review: 'security-audit',
        testing: 'testing',
        analysis: 'competitor-analysis',
        research: 'tech-stack-research',
        architecture: 'architecture-design',
        security: 'security-audit',
      };

      const agentRole = roleMapping[roleType];
      if (agentRole) {
        this.spawner.setRoleProvider(agentRole, assignment.provider);
        console.log(
          `[FreewheelCoordinator] ${agentRole} provider: ${assignment.provider}`
        );
      }
    }
  }

  // =========================================================================
  // USER CONTROL
  // =========================================================================

  /**
   * Request user approval at a checkpoint
   */
  private async requestApproval(
    session: FreewheelSession,
    checkpoint: CheckpointType,
    description: string,
    options: string[]
  ): Promise<boolean> {
    if (!this.onApprovalRequest) {
      console.log(
        '[FreewheelCoordinator] No approval callback, auto-approving'
      );
      return true;
    }

    session.status = 'waiting_approval';
    session.pendingApproval = {
      type: checkpoint,
      description,
      options,
      createdAt: new Date(),
    };

    const response = await this.onApprovalRequest(
      session,
      checkpoint,
      description,
      options
    );

    session.pendingApproval = undefined;
    session.status = 'running';

    // Record intervention
    session.userInterventions.push({
      type: response.approved ? 'approve' : 'reject',
      message: response.feedback,
      timestamp: new Date(),
    });

    return response.approved;
  }

  /**
   * Send status update to user
   */
  private async sendStatus(
    session: FreewheelSession,
    message: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    if (this.onStatusUpdate) {
      await this.onStatusUpdate(session, message, data);
    }
    session.lastActivityAt = new Date();
  }

  // =========================================================================
  // USER INTERVENTIONS
  // =========================================================================

  /**
   * Pause a running session
   */
  async pause(sessionId: string, message?: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'running') {
      return false;
    }

    session.status = 'paused';
    session.userInterventions.push({
      type: 'pause',
      message,
      timestamp: new Date(),
    });

    // Cancel the swarm
    if (session.swarmId) {
      await this.coordinator.cancel(session.swarmId);
    }

    await this.sendStatus(session, 'Execution paused by user');
    return true;
  }

  /**
   * Resume a paused session
   */
  async resume(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'paused') {
      return false;
    }

    session.status = 'running';
    session.userInterventions.push({
      type: 'resume',
      timestamp: new Date(),
    });

    // TODO: Resume the swarm with remaining tasks
    await this.sendStatus(session, 'Execution resumed');
    return true;
  }

  /**
   * Cancel a session
   */
  async cancel(sessionId: string, message?: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.status = 'cancelled';
    session.userInterventions.push({
      type: 'cancel',
      message,
      timestamp: new Date(),
    });

    // Cancel the swarm
    if (session.swarmId) {
      await this.coordinator.cancel(session.swarmId);
    }

    await this.sendStatus(session, 'Execution cancelled by user');
    return true;
  }

  /**
   * Redirect execution with new instructions
   */
  async redirect(sessionId: string, newInstructions: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.userInterventions.push({
      type: 'redirect',
      message: newInstructions,
      timestamp: new Date(),
    });

    // Parse new instructions and merge with existing intent
    const newIntent = parseFreewheelIntent(newInstructions);

    // Merge model assignments
    for (const [role, model] of newIntent.modelAssignments) {
      session.intent.modelAssignments.set(role, model);
    }

    // Update other settings if specified
    if (newIntent.mode !== 'freewheel') {
      session.intent.mode = newIntent.mode;
    }
    if (newIntent.strategy !== 'parallel') {
      session.intent.strategy = newIntent.strategy;
    }
    if (newIntent.checkpoints.length > 0) {
      session.intent.checkpoints = newIntent.checkpoints;
    }

    // Re-apply model assignments
    this.applyModelAssignments(session.intent);

    await this.sendStatus(
      session,
      `Redirected: ${newInstructions}`
    );
    return true;
  }

  // =========================================================================
  // SESSION MANAGEMENT
  // =========================================================================

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): FreewheelSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get session by conversation ID
   */
  getSessionByConversation(conversationId: string): FreewheelSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.conversationId === conversationId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): FreewheelSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === 'running' || s.status === 'paused' || s.status === 'waiting_approval'
    );
  }

  /**
   * Get session status summary
   */
  getSessionStatus(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const lines: string[] = [];
    lines.push(`**Status:** ${session.status}`);
    lines.push(`**Mode:** ${session.intent.mode}`);

    if (session.currentPhase) {
      lines.push(`**Phase:** ${session.currentPhase}`);
    }

    if (session.swarmId) {
      const progress = this.coordinator.getProgress(session.swarmId);
      if (progress) {
        lines.push(
          `**Progress:** ${progress.completed}/${progress.total} tasks completed`
        );
      }
    }

    if (session.pendingApproval) {
      lines.push('');
      lines.push(`**Waiting for approval:** ${session.pendingApproval.description}`);
    }

    return lines.join('\n');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

export const freewheelCoordinator = isEnabled('SWARM_COORDINATION')
  ? new FreewheelCoordinator()
  : (null as unknown as FreewheelCoordinator);

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export { parseFreewheelIntent, summarizeIntent, MODEL_ALIASES };
