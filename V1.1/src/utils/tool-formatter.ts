/**
 * Tool Call Formatter (V1.1)
 *
 * Formats tool calls from AI assistants into CLI-like display
 * Shows real-time feedback of what Claude Code is doing
 *
 * Copied from V1.0 for V1.1 multi-agent architecture
 */

// Tool emoji mapping for CLI-like display
const TOOL_EMOJI: Record<string, string> = {
  Bash: '⚡',
  Read: '📖',
  Write: '✏️',
  Edit: '🔧',
  Glob: '🔍',
  Grep: '🔎',
  Task: '🤖',
  TodoWrite: '📝',
  WebFetch: '🌐',
  WebSearch: '🔍',
};

/**
 * Format a tool call for CLI-like display
 *
 * @param toolName - Name of the tool being called
 * @param toolInput - Input parameters for the tool
 * @param options - Display options
 * @returns Formatted tool message with emoji and details
 */
export function formatToolCall(
  toolName: string,
  toolInput?: Record<string, unknown>,
  options: { verbose?: boolean } = {}
): string {
  const emoji = TOOL_EMOJI[toolName] || '🔧';
  const parts: string[] = [];

  // Header line with emoji and tool name
  parts.push(`${emoji} **${toolName}**`);

  // Add tool-specific details
  if (toolInput) {
    const details = extractToolDetails(toolName, toolInput, options.verbose);
    if (details) {
      parts.push(details);
    }
  }

  return parts.join('\n');
}

/**
 * Extract CLI-like details from tool input
 */
function extractToolDetails(
  toolName: string,
  toolInput: Record<string, unknown>,
  verbose?: boolean
): string | null {
  const maxLen = verbose ? 200 : 100;

  switch (toolName) {
    case 'Bash': {
      const cmd = (toolInput.command as string) || '';
      const desc = toolInput.description as string;
      const lines: string[] = [];

      if (desc) {
        lines.push(`└─ ${desc}`);
      }

      if (cmd) {
        const truncated = cmd.length > maxLen ? cmd.substring(0, maxLen) + '...' : cmd;
        lines.push(`\`${truncated}\``);
      }

      return lines.join('\n');
    }

    case 'Read': {
      const path = toolInput.file_path as string;
      if (path) {
        const filename = verbose ? path : path.split('/').pop() || path;
        return `└─ ${filename}`;
      }
      return null;
    }

    case 'Write': {
      const path = toolInput.file_path as string;
      if (path) {
        const filename = verbose ? path : path.split('/').pop() || path;
        const content = toolInput.content as string;
        const lines = content ? content.split('\n').length : 0;
        return `└─ ${filename} (${lines} lines)`;
      }
      return null;
    }

    case 'Edit': {
      const path = toolInput.file_path as string;
      if (path) {
        const filename = verbose ? path : path.split('/').pop() || path;
        const oldStr = (toolInput.old_string as string) || '';
        const preview = oldStr.substring(0, 30).replace(/\n/g, '↵');
        return `└─ ${filename}\n   replacing: "${preview}${oldStr.length > 30 ? '...' : ''}"`;
      }
      return null;
    }

    case 'Glob': {
      const pattern = toolInput.pattern as string;
      const path = toolInput.path as string;
      if (pattern) {
        return path ? `└─ ${pattern} in ${path}` : `└─ ${pattern}`;
      }
      return null;
    }

    case 'Grep': {
      const pattern = toolInput.pattern as string;
      const path = toolInput.path as string;
      if (pattern) {
        return path ? `└─ "${pattern}" in ${path}` : `└─ "${pattern}"`;
      }
      return null;
    }

    case 'Task': {
      const desc = toolInput.description as string;
      const subagent = toolInput.subagent_type as string;
      if (desc || subagent) {
        return `└─ ${subagent || 'agent'}: ${desc || '(running...)'}`;
      }
      return null;
    }

    case 'TodoWrite': {
      const todos = toolInput.todos as Array<{ content: string; status: string }>;
      if (todos && todos.length > 0) {
        const summary = todos
          .slice(0, 3)
          .map((t) => `  ${t.status === 'completed' ? '✓' : '○'} ${t.content}`)
          .join('\n');
        const more = todos.length > 3 ? `\n  ...+${todos.length - 3} more` : '';
        return summary + more;
      }
      return null;
    }

    default: {
      // MCP tools
      if (toolName.startsWith('mcp__')) {
        const parts = toolName.split('__');
        if (parts.length >= 3) {
          return `└─ ${parts[1]}/${parts[2]}`;
        }
        return null;
      }

      // Generic: show first key-value pair
      const keys = Object.keys(toolInput);
      if (keys.length > 0) {
        const firstKey = keys[0];
        const value = String(toolInput[firstKey]);
        const truncated = value.length > 50 ? value.substring(0, 50) + '...' : value;
        return `└─ ${firstKey}: ${truncated}`;
      }
      return null;
    }
  }
}

/**
 * Format thinking/reasoning for display (optional)
 */
export function formatThinking(thinking: string): string {
  const maxLength = 200;
  if (thinking.length > maxLength) {
    return `💭 ${thinking.substring(0, maxLength)}...`;
  }
  return `💭 ${thinking}`;
}
