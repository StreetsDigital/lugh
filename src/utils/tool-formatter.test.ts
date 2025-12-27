import { formatToolCall, formatThinking } from './tool-formatter';

describe('tool-formatter', () => {
  describe('formatToolCall', () => {
    describe('Bash tool', () => {
      test('formats command with emoji', () => {
        const result = formatToolCall('Bash', { command: 'npm test' });
        expect(result).toBe('⚡ **Bash**\n`npm test`');
      });

      test('shows description when provided', () => {
        const result = formatToolCall('Bash', {
          command: 'npm test',
          description: 'Run tests',
        });
        expect(result).toBe('⚡ **Bash**\n└─ Run tests\n`npm test`');
      });

      test('truncates long command at 100 chars by default', () => {
        const longCommand = 'a'.repeat(120);
        const result = formatToolCall('Bash', { command: longCommand });
        expect(result).toBe(`⚡ **Bash**\n\`${'a'.repeat(100)}...\``);
      });

      test('truncates at 200 chars in verbose mode', () => {
        const longCommand = 'a'.repeat(220);
        const result = formatToolCall('Bash', { command: longCommand }, { verbose: true });
        expect(result).toBe(`⚡ **Bash**\n\`${'a'.repeat(200)}...\``);
      });
    });

    describe('Read tool', () => {
      test('formats with emoji and filename only', () => {
        const result = formatToolCall('Read', { file_path: '/path/to/file.ts' });
        expect(result).toBe('📖 **Read**\n└─ file.ts');
      });

      test('shows full path in verbose mode', () => {
        const result = formatToolCall('Read', { file_path: '/path/to/file.ts' }, { verbose: true });
        expect(result).toBe('📖 **Read**\n└─ /path/to/file.ts');
      });
    });

    describe('Write tool', () => {
      test('formats with filename and line count', () => {
        const result = formatToolCall('Write', {
          file_path: '/path/to/file.ts',
          content: 'line1\nline2\nline3',
        });
        expect(result).toBe('✏️ **Write**\n└─ file.ts (3 lines)');
      });

      test('shows 0 lines for empty content', () => {
        const result = formatToolCall('Write', {
          file_path: '/path/to/file.ts',
          content: '',
        });
        expect(result).toBe('✏️ **Write**\n└─ file.ts (0 lines)');
      });
    });

    describe('Edit tool', () => {
      test('formats with filename and replacement preview', () => {
        const result = formatToolCall('Edit', {
          file_path: '/path/to/file.ts',
          old_string: 'old code here',
        });
        expect(result).toBe('🔧 **Edit**\n└─ file.ts\n   replacing: "old code here"');
      });

      test('truncates long old_string at 30 chars', () => {
        const result = formatToolCall('Edit', {
          file_path: '/path/to/file.ts',
          old_string: 'this is a very long string that exceeds thirty characters',
        });
        expect(result).toBe('🔧 **Edit**\n└─ file.ts\n   replacing: "this is a very long string tha..."');
      });

      test('replaces newlines with arrows in preview', () => {
        const result = formatToolCall('Edit', {
          file_path: '/path/to/file.ts',
          old_string: 'line1\nline2',
        });
        expect(result).toBe('🔧 **Edit**\n└─ file.ts\n   replacing: "line1↵line2"');
      });
    });

    describe('Glob tool', () => {
      test('formats pattern', () => {
        const result = formatToolCall('Glob', { pattern: '**/*.ts' });
        expect(result).toBe('🔍 **Glob**\n└─ **/*.ts');
      });

      test('includes path when provided', () => {
        const result = formatToolCall('Glob', { pattern: '**/*.ts', path: '/src' });
        expect(result).toBe('🔍 **Glob**\n└─ **/*.ts in /src');
      });
    });

    describe('Grep tool', () => {
      test('formats search pattern', () => {
        const result = formatToolCall('Grep', { pattern: 'TODO' });
        expect(result).toBe('🔎 **Grep**\n└─ "TODO"');
      });

      test('includes path when provided', () => {
        const result = formatToolCall('Grep', { pattern: 'TODO', path: '/src' });
        expect(result).toBe('🔎 **Grep**\n└─ "TODO" in /src');
      });
    });

    describe('Task tool', () => {
      test('formats with subagent type and description', () => {
        const result = formatToolCall('Task', {
          subagent_type: 'Explore',
          description: 'Find auth files',
        });
        expect(result).toBe('🤖 **Task**\n└─ Explore: Find auth files');
      });

      test('shows running placeholder without description', () => {
        const result = formatToolCall('Task', { subagent_type: 'general-purpose' });
        expect(result).toBe('🤖 **Task**\n└─ general-purpose: (running...)');
      });
    });

    describe('TodoWrite tool', () => {
      test('formats todo list with status icons', () => {
        const result = formatToolCall('TodoWrite', {
          todos: [
            { content: 'First task', status: 'completed' },
            { content: 'Second task', status: 'pending' },
          ],
        });
        expect(result).toBe('📝 **TodoWrite**\n  ✓ First task\n  ○ Second task');
      });

      test('truncates at 3 items with count', () => {
        const result = formatToolCall('TodoWrite', {
          todos: [
            { content: 'Task 1', status: 'completed' },
            { content: 'Task 2', status: 'pending' },
            { content: 'Task 3', status: 'pending' },
            { content: 'Task 4', status: 'pending' },
            { content: 'Task 5', status: 'pending' },
          ],
        });
        expect(result).toBe(
          '📝 **TodoWrite**\n  ✓ Task 1\n  ○ Task 2\n  ○ Task 3\n  ...+2 more'
        );
      });
    });

    describe('MCP tools', () => {
      test('formats mcp__server__tool pattern', () => {
        const result = formatToolCall('mcp__github__create_issue', { title: 'test' });
        expect(result).toBe('🔧 **mcp__github__create_issue**\n└─ github/create_issue');
      });
    });

    describe('unknown tools', () => {
      test('shows first key-value pair for unknown tool', () => {
        const result = formatToolCall('CustomTool', { arg: 'value' });
        expect(result).toBe('🔧 **CustomTool**\n└─ arg: value');
      });

      test('truncates long values at 50 chars', () => {
        const longValue = 'x'.repeat(60);
        const result = formatToolCall('CustomTool', { arg: longValue });
        expect(result).toBe(`🔧 **CustomTool**\n└─ arg: ${'x'.repeat(50)}...`);
      });
    });

    describe('no toolInput', () => {
      test('returns tool name only when toolInput is undefined', () => {
        const result = formatToolCall('SomeTool');
        expect(result).toBe('🔧 **SomeTool**');
      });

      test('returns tool name only when toolInput is null', () => {
        const result = formatToolCall('SomeTool', undefined);
        expect(result).toBe('🔧 **SomeTool**');
      });
    });

    describe('empty toolInput', () => {
      test('returns tool name only for empty object', () => {
        const result = formatToolCall('SomeTool', {});
        expect(result).toBe('🔧 **SomeTool**');
      });
    });
  });

  describe('formatThinking', () => {
    test('formats thinking under 200 chars', () => {
      const thinking = 'I need to analyze this code';
      const result = formatThinking(thinking);
      expect(result).toBe(`💭 ${thinking}`);
    });

    test('formats thinking at exactly 200 chars', () => {
      const thinking = 'a'.repeat(200);
      const result = formatThinking(thinking);
      expect(result).toBe(`💭 ${thinking}`);
    });

    test('truncates thinking over 200 chars', () => {
      const thinking = 'a'.repeat(250);
      const result = formatThinking(thinking);
      expect(result).toBe(`💭 ${'a'.repeat(200)}...`);
    });

    test('handles empty string', () => {
      const result = formatThinking('');
      expect(result).toBe('💭 ');
    });
  });
});
