/**
 * Recovery Manager
 * ================
 *
 * Handles task failures systematically:
 * - Track attempt history per task
 * - Extract failure patterns
 * - Provide recovery hints for retries
 * - Escalate to human after 3 failed attempts
 */

import { isEnabled } from '../config/features';
import type { TaskResultMessage } from '../redis/client';
import type { VerificationResult } from './verification';

/**
 * Maximum retry attempts before escalation
 */
const MAX_ATTEMPTS = 3;

/**
 * Failure record
 */
interface FailureRecord {
  attemptNumber: number;
  timestamp: Date;
  agentId: string;
  error: string;
  approach?: string;
  verificationResult?: VerificationResult;
}

/**
 * Recovery context for retry
 */
export interface RecoveryContext {
  attemptNumber: number;
  previousAttempts: number;
  recoveryHints: string[];
  whatToAvoid: string[];
  failurePatterns: string[];
}

/**
 * Escalation info
 */
export interface EscalationInfo {
  taskId: string;
  taskDescription: string;
  attempts: FailureRecord[];
  reason: string;
  suggestedActions: string[];
}

/**
 * Escalation handler callback
 */
type EscalationHandler = (info: EscalationInfo) => void | Promise<void>;

/**
 * Recovery Manager
 */
export class RecoveryManager {
  private failureHistory: Map<string, FailureRecord[]> = new Map();
  private escalationHandler: EscalationHandler | null = null;

  constructor() {
    if (!isEnabled('RECOVERY_SYSTEM')) {
      throw new Error(
        '[RecoveryManager] RECOVERY_SYSTEM feature is not enabled. ' +
          'Set FEATURE_RECOVERY_SYSTEM=true (requires AGENT_POOL and EXTERNAL_VERIFICATION).'
      );
    }
  }

  /**
   * Set the escalation handler
   */
  setEscalationHandler(handler: EscalationHandler): void {
    this.escalationHandler = handler;
  }

  /**
   * Record a task failure
   */
  recordFailure(
    taskId: string,
    agentId: string,
    result: TaskResultMessage,
    verification?: VerificationResult
  ): void {
    const failures = this.failureHistory.get(taskId) || [];

    const record: FailureRecord = {
      attemptNumber: failures.length + 1,
      timestamp: new Date(),
      agentId,
      error: result.error?.message || result.summary,
      approach: this.extractApproach(result),
      verificationResult: verification,
    };

    failures.push(record);
    this.failureHistory.set(taskId, failures);

    console.log(
      `[Recovery] Task ${taskId} failed (attempt ${record.attemptNumber}/${MAX_ATTEMPTS})`
    );
  }

  /**
   * Get attempt count for a task
   */
  getAttemptCount(taskId: string): number {
    return this.failureHistory.get(taskId)?.length || 0;
  }

  /**
   * Check if task should be retried
   */
  shouldRetry(taskId: string): boolean {
    const attempts = this.getAttemptCount(taskId);
    return attempts < MAX_ATTEMPTS;
  }

  /**
   * Get recovery context for retry
   */
  getRecoveryContext(taskId: string): RecoveryContext {
    const failures = this.failureHistory.get(taskId) || [];
    const attemptNumber = failures.length + 1;

    // Extract hints from previous failures
    const recoveryHints = failures
      .map((f) => {
        if (f.verificationResult && !f.verificationResult.success) {
          // Extract from verification failures
          return f.verificationResult.checks
            .filter((c) => !c.passed)
            .map((c) => `${c.name}: ${c.details || c.actual}`)
            .join('; ');
        }
        return f.error;
      })
      .filter((h) => h);

    // Extract what to avoid
    const whatToAvoid = failures
      .filter((f) => f.approach)
      .map((f) => f.approach!)
      .filter((a, i, arr) => arr.indexOf(a) === i); // unique

    // Extract failure patterns
    const failurePatterns = this.extractFailurePatterns(failures);

    return {
      attemptNumber,
      previousAttempts: failures.length,
      recoveryHints,
      whatToAvoid,
      failurePatterns,
    };
  }

  /**
   * Handle a failure (record and decide retry vs escalate)
   */
  async handleFailure(
    taskId: string,
    taskDescription: string,
    agentId: string,
    result: TaskResultMessage,
    verification?: VerificationResult
  ): Promise<{ retry: boolean; context?: RecoveryContext }> {
    // Record the failure
    this.recordFailure(taskId, agentId, result, verification);

    // Check if we should retry
    if (this.shouldRetry(taskId)) {
      const context = this.getRecoveryContext(taskId);
      return { retry: true, context };
    }

    // Escalate to human
    await this.escalate(taskId, taskDescription);
    return { retry: false };
  }

  /**
   * Escalate to human
   */
  private async escalate(taskId: string, taskDescription: string): Promise<void> {
    const failures = this.failureHistory.get(taskId) || [];

    const info: EscalationInfo = {
      taskId,
      taskDescription,
      attempts: failures,
      reason: `Task failed ${failures.length} times`,
      suggestedActions: this.getSuggestedActions(failures),
    };

    console.log(`[Recovery] Escalating task ${taskId} to human intervention`);

    if (this.escalationHandler) {
      await this.escalationHandler(info);
    }
  }

  /**
   * Extract approach from result
   */
  private extractApproach(result: TaskResultMessage): string | undefined {
    // Try to extract the approach from the summary
    const summary = result.summary.toLowerCase();

    if (summary.includes('created') || summary.includes('added')) {
      return 'create_new_files';
    }
    if (summary.includes('modified') || summary.includes('updated')) {
      return 'modify_existing';
    }
    if (summary.includes('refactor')) {
      return 'refactoring';
    }

    return undefined;
  }

  /**
   * Extract failure patterns from history
   */
  private extractFailurePatterns(failures: FailureRecord[]): string[] {
    const patterns: string[] = [];

    // Check for common error types
    const errorTypes = failures.map((f) => {
      if (f.error.includes('syntax')) return 'syntax_error';
      if (f.error.includes('type')) return 'type_error';
      if (f.error.includes('import') || f.error.includes('module'))
        return 'import_error';
      if (f.error.includes('test')) return 'test_failure';
      if (f.error.includes('timeout')) return 'timeout';
      return 'unknown';
    });

    // Count occurrences
    const counts = errorTypes.reduce(
      (acc, type) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Add patterns that appear multiple times
    for (const [type, count] of Object.entries(counts)) {
      if (count >= 2) {
        patterns.push(`Recurring ${type.replace('_', ' ')} (${count} times)`);
      }
    }

    // Check for verification patterns
    const verificationIssues = failures
      .filter((f) => f.verificationResult)
      .flatMap((f) =>
        f.verificationResult!.checks.filter((c) => !c.passed).map((c) => c.name)
      );

    const verificationCounts = verificationIssues.reduce(
      (acc, issue) => {
        acc[issue] = (acc[issue] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    for (const [issue, count] of Object.entries(verificationCounts)) {
      if (count >= 2) {
        patterns.push(`Verification: ${issue} failing (${count} times)`);
      }
    }

    return patterns;
  }

  /**
   * Get suggested actions for escalation
   */
  private getSuggestedActions(failures: FailureRecord[]): string[] {
    const actions: string[] = [];

    // Check failure patterns
    const patterns = this.extractFailurePatterns(failures);

    if (patterns.some((p) => p.includes('type_error'))) {
      actions.push('Review type definitions and interfaces');
    }

    if (patterns.some((p) => p.includes('import_error'))) {
      actions.push('Check import paths and module exports');
    }

    if (patterns.some((p) => p.includes('test_failure'))) {
      actions.push('Review test expectations or implementation logic');
    }

    if (patterns.some((p) => p.includes('commits'))) {
      actions.push('Ensure agent is committing changes correctly');
    }

    // Always suggest these
    actions.push('Simplify the task into smaller subtasks');
    actions.push('Provide more specific instructions');
    actions.push('Manually complete the remaining work');

    return actions;
  }

  /**
   * Clear failure history for a task (after success or manual intervention)
   */
  clearHistory(taskId: string): void {
    this.failureHistory.delete(taskId);
  }
}

// Singleton
let recoveryManager: RecoveryManager | null = null;

export function getRecoveryManager(): RecoveryManager {
  if (!isEnabled('RECOVERY_SYSTEM')) {
    throw new Error(
      '[RecoveryManager] RECOVERY_SYSTEM feature is not enabled. ' +
        'Set FEATURE_RECOVERY_SYSTEM=true (requires AGENT_POOL and EXTERNAL_VERIFICATION).'
    );
  }
  if (!recoveryManager) {
    recoveryManager = new RecoveryManager();
  }
  return recoveryManager;
}
