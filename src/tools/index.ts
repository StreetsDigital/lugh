/**
 * Tool System
 * ============
 *
 * CAMEL AI / OWL-inspired tool architecture for Lugh.
 *
 * Components:
 * - FunctionTool: Wrapper to make any function a tool
 * - Toolkit: Collection of related tools
 * - ToolRegistry: Central registry for tool management
 *
 * Built-in Toolkits:
 * - GitToolkit: Git operations (clone, commit, push, branch)
 * - GitHubToolkit: GitHub operations (issues, PRs, reviews)
 *
 * Usage:
 * ```typescript
 * import { getToolRegistry, createGitToolkit, createGitHubToolkit } from './tools';
 *
 * const registry = getToolRegistry();
 *
 * // Register built-in toolkits
 * registry.registerToolkit(createGitToolkit());
 * registry.registerToolkit(createGitHubToolkit());
 *
 * // Execute a tool
 * const result = await registry.execute('git.status', { cwd: '/path/to/repo' });
 *
 * // Create custom tool
 * const myTool = createTool({
 *   name: 'myTool',
 *   description: 'Does something',
 *   parameters: { type: 'object', properties: {} },
 *   execute: async (input) => ({ success: true, data: 'done' }),
 * });
 * registry.register(myTool);
 * ```
 */

// Types
export type {
  JSONSchema,
  JSONSchemaProperty,
  ToolResult,
  ToolRiskLevel,
  ToolPlatform,
  IFunctionTool,
  IToolkit,
  IToolRegistry,
  MCPToolDefinition,
  MCPToolResult,
  ToolDecoratorOptions,
  ToolExecutionContext,
} from './types';

// FunctionTool
export {
  FunctionTool,
  createTool,
  tool,
  getToolMetadata,
  extractToolsFromClass,
} from './function-tool';
export type { FunctionToolConfig } from './function-tool';

// Toolkit base
export { Toolkit, createToolkit, combineToolkits } from './toolkit';

// Registry
export { ToolRegistry, getToolRegistry, createToolRegistry } from './registry';

// Built-in toolkits
export { GitToolkit, createGitToolkit } from './toolkits/git-toolkit';
export { GitHubToolkit, createGitHubToolkit } from './toolkits/github-toolkit';

/**
 * Initialize the default registry with built-in toolkits
 */
import { getToolRegistry } from './registry';
import { createGitToolkit } from './toolkits/git-toolkit';
import { createGitHubToolkit } from './toolkits/github-toolkit';

export function initializeBuiltinTools(): void {
  const registry = getToolRegistry();

  // Only register if not already registered
  if (!registry.getToolkit('git')) {
    registry.registerToolkit(createGitToolkit());
  }
  if (!registry.getToolkit('github')) {
    registry.registerToolkit(createGitHubToolkit());
  }

  console.log('[Tools] Initialized built-in toolkits:', registry.listToolkits().join(', '));
}
