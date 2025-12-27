/**
 * Abort Manager
 * =============
 *
 * Manages abort signals for active conversations.
 * Used by /stop command to interrupt running AI queries.
 */

/**
 * Active abort controllers per conversation
 */
const abortControllers = new Map<string, AbortController>();

/**
 * Abort flags for conversations (fallback for generators)
 */
const abortFlags = new Map<string, boolean>();

/**
 * Create an abort controller for a conversation
 */
export function createAbortController(conversationId: string): AbortController {
  // Cancel any existing controller
  const existing = abortControllers.get(conversationId);
  if (existing) {
    existing.abort();
  }

  const controller = new AbortController();
  abortControllers.set(conversationId, controller);
  abortFlags.set(conversationId, false);

  return controller;
}

/**
 * Get the abort signal for a conversation
 */
export function getAbortSignal(conversationId: string): AbortSignal | undefined {
  return abortControllers.get(conversationId)?.signal;
}

/**
 * Signal abort for a conversation
 */
export function signalAbort(conversationId: string): boolean {
  const controller = abortControllers.get(conversationId);

  // Set the flag (always works)
  abortFlags.set(conversationId, true);

  if (controller) {
    controller.abort();
    console.log(`[AbortManager] Aborted conversation ${conversationId}`);
    return true;
  }

  console.log(`[AbortManager] No active controller for ${conversationId}, flag set`);
  return false;
}

/**
 * Check if abort was requested for a conversation
 */
export function isAborted(conversationId: string): boolean {
  const controller = abortControllers.get(conversationId);
  const flag = abortFlags.get(conversationId);

  return controller?.signal.aborted || flag === true;
}

/**
 * Clear abort state for a conversation (call when query completes)
 */
export function clearAbortState(conversationId: string): void {
  abortControllers.delete(conversationId);
  abortFlags.delete(conversationId);
}

/**
 * Get all active conversations with abort controllers
 */
export function getActiveConversations(): string[] {
  return Array.from(abortControllers.keys());
}
