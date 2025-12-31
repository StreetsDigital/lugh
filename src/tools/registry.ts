/**
 * Tool Registry
 * ==============
 *
 * Central registry for all tools and toolkits.
 * Manages tool discovery, execution, and platform filtering.
 *
 * Based on CAMEL AI's modular toolkit pattern.
 */

import type {
  IToolRegistry,
  IFunctionTool,
  IToolkit,
  ToolResult,
  ToolPlatform,
  MCPToolDefinition,
} from './types';

/**
 * Tool Registry implementation
 */
export class ToolRegistry implements IToolRegistry {
  private tools: Map<string, IFunctionTool> = new Map();
  private toolkits: Map<string, IToolkit> = new Map();

  /**
   * Register a single tool
   */
  register(tool: IFunctionTool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Overwriting existing tool: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    console.log(`[ToolRegistry] Registered tool: ${tool.name}`);
  }

  /**
   * Register a toolkit (all its tools)
   */
  registerToolkit(toolkit: IToolkit): void {
    if (this.toolkits.has(toolkit.name)) {
      console.warn(`[ToolRegistry] Overwriting existing toolkit: ${toolkit.name}`);
    }

    this.toolkits.set(toolkit.name, toolkit);

    // Register all tools from the toolkit
    for (const tool of toolkit.getTools()) {
      // Prefix with toolkit name if not already present
      const fullName = tool.name.includes('.')
        ? tool.name
        : `${toolkit.name}.${tool.name}`;

      const prefixedTool = {
        ...tool,
        name: fullName,
        execute: tool.execute.bind(tool),
      };

      this.tools.set(fullName, prefixedTool);

      // Also register without prefix for convenience
      if (!this.tools.has(tool.name)) {
        this.tools.set(tool.name, prefixedTool);
      }
    }

    console.log(
      `[ToolRegistry] Registered toolkit: ${toolkit.name} (${toolkit.getTools().length} tools)`
    );
  }

  /**
   * Get a tool by name
   */
  get(name: string): IFunctionTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): IFunctionTool[] {
    // Deduplicate (same tool may be registered with and without prefix)
    const seen = new Set<string>();
    const unique: IFunctionTool[] = [];

    for (const tool of this.tools.values()) {
      // Use the base name (after last dot) for deduplication
      const baseName = tool.name.includes('.')
        ? tool.name.split('.').pop()!
        : tool.name;

      if (!seen.has(baseName)) {
        seen.add(baseName);
        unique.push(tool);
      }
    }

    return unique;
  }

  /**
   * Get tools available for a specific platform
   */
  getForPlatform(platform: ToolPlatform): IFunctionTool[] {
    return this.getAll().filter((tool) => {
      const platforms = tool.platforms || ['all'];
      return platforms.includes('all') || platforms.includes(platform);
    });
  }

  /**
   * Get tools by tag
   */
  getByTag(tag: string): IFunctionTool[] {
    return this.getAll().filter((tool) => tool.tags?.includes(tag));
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Execute a tool by name
   */
  async execute<TInput, TOutput>(
    name: string,
    input: TInput
  ): Promise<ToolResult<TOutput>> {
    const tool = this.get(name);

    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
      };
    }

    try {
      const result = await tool.execute(input);
      return result as ToolResult<TOutput>;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Tool execution failed: ${message}`,
      };
    }
  }

  /**
   * Get all tools as MCP definitions
   */
  toMCPDefinitions(): MCPToolDefinition[] {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters,
    }));
  }

  /**
   * Get a toolkit by name
   */
  getToolkit(name: string): IToolkit | undefined {
    return this.toolkits.get(name);
  }

  /**
   * List all registered toolkits
   */
  listToolkits(): string[] {
    return Array.from(this.toolkits.keys());
  }

  /**
   * Get statistics about registered tools
   */
  getStats(): {
    totalTools: number;
    totalToolkits: number;
    byRiskLevel: Record<string, number>;
    byPlatform: Record<string, number>;
    byTag: Record<string, number>;
  } {
    const tools = this.getAll();

    const byRiskLevel: Record<string, number> = { low: 0, medium: 0, high: 0 };
    const byPlatform: Record<string, number> = {};
    const byTag: Record<string, number> = {};

    for (const tool of tools) {
      // Risk level
      const risk = tool.riskLevel || 'low';
      byRiskLevel[risk] = (byRiskLevel[risk] || 0) + 1;

      // Platforms
      const platforms = tool.platforms || ['all'];
      for (const platform of platforms) {
        byPlatform[platform] = (byPlatform[platform] || 0) + 1;
      }

      // Tags
      for (const tag of tool.tags || []) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }
    }

    return {
      totalTools: tools.length,
      totalToolkits: this.toolkits.size,
      byRiskLevel,
      byPlatform,
      byTag,
    };
  }

  /**
   * Clear all registered tools and toolkits
   */
  clear(): void {
    this.tools.clear();
    this.toolkits.clear();
    console.log('[ToolRegistry] Cleared all tools and toolkits');
  }
}

// Singleton instance
let defaultRegistry: ToolRegistry | null = null;

/**
 * Get the default tool registry (singleton)
 */
export function getToolRegistry(): ToolRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new ToolRegistry();
  }
  return defaultRegistry;
}

/**
 * Create a new tool registry
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}
