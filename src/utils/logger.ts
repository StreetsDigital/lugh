/**
 * Logging utility with verbose mode support
 * Enable verbose logging with VERBOSE_LOGGING=true or /verbose on command
 */

// Runtime state (can be toggled via /verbose command)
let verboseEnabled = process.env.VERBOSE_LOGGING === 'true';

/**
 * Enable or disable verbose logging at runtime
 */
export function setVerbose(enabled: boolean): void {
  verboseEnabled = enabled;
  console.log(`[Logger] Verbose logging ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

/**
 * Toggle verbose logging
 */
export function toggleVerbose(): boolean {
  verboseEnabled = !verboseEnabled;
  console.log(`[Logger] Verbose logging ${verboseEnabled ? 'ENABLED' : 'DISABLED'}`);
  return verboseEnabled;
}

/**
 * Check if verbose logging is enabled
 */
export function isVerboseEnabled(): boolean {
  return verboseEnabled;
}

/**
 * Log verbose messages (only when verbose is enabled)
 */
export function verbose(tag: string, message: string, data?: unknown): void {
  if (!verboseEnabled) return;

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [VERBOSE] [${tag}]`;

  if (data !== undefined) {
    // Truncate large data for readability
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const truncated = dataStr.length > 2000 ? dataStr.substring(0, 2000) + '\n... (truncated)' : dataStr;
    console.log(`${prefix} ${message}\n${truncated}`);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Log verbose prompt being sent to AI
 */
export function logPrompt(prompt: string): void {
  if (!verboseEnabled) return;

  const lines = prompt.split('\n').length;
  const chars = prompt.length;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`[VERBOSE] [Claude] PROMPT (${lines} lines, ${chars} chars)`);
  console.log('='.repeat(80));
  console.log(prompt.length > 5000 ? prompt.substring(0, 5000) + '\n... (truncated)' : prompt);
  console.log('='.repeat(80) + '\n');
}

/**
 * Log verbose AI response chunk
 */
export function logResponse(type: string, content: string): void {
  if (!verboseEnabled) return;

  const timestamp = new Date().toISOString();
  const truncated = content.length > 1000 ? content.substring(0, 1000) + '... (truncated)' : content;
  console.log(`[${timestamp}] [VERBOSE] [Claude] RESPONSE [${type}]: ${truncated}`);
}

/**
 * Log verbose tool call with full details
 */
export function logToolCall(toolName: string, toolInput: unknown): void {
  if (!verboseEnabled) return;

  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] [VERBOSE] [Claude] TOOL CALL: ${toolName}`);
  console.log('-'.repeat(40));

  const inputStr = JSON.stringify(toolInput, null, 2);
  const truncated = inputStr.length > 3000 ? inputStr.substring(0, 3000) + '\n... (truncated)' : inputStr;
  console.log(truncated);
  console.log('-'.repeat(40) + '\n');
}

/**
 * Log session events
 */
export function logSession(action: string, sessionId: string, details?: string): void {
  if (!verboseEnabled) return;

  const timestamp = new Date().toISOString();
  const msg = details ? `${action}: ${sessionId} - ${details}` : `${action}: ${sessionId}`;
  console.log(`[${timestamp}] [VERBOSE] [Session] ${msg}`);
}
