/**
 * Base Toolkit
 * =============
 *
 * Abstract base class for creating toolkits.
 * Toolkits are collections of related tools.
 */

import type { IToolkit, IFunctionTool } from './types';
import { FunctionTool, extractToolsFromClass } from './function-tool';

/**
 * Abstract base toolkit class
 */
export abstract class Toolkit implements IToolkit {
  abstract readonly name: string;
  abstract readonly description: string;

  protected tools: Map<string, IFunctionTool> = new Map();

  /**
   * Get all tools in this toolkit
   */
  getTools(): IFunctionTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): IFunctionTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Register a tool in this toolkit
   */
  protected registerTool(tool: IFunctionTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Auto-register tools from decorated methods
   */
  protected autoRegisterTools(): void {
    const extractedTools = extractToolsFromClass(this);
    for (const tool of extractedTools) {
      this.registerTool(tool);
    }
  }
}

/**
 * Create a toolkit from a set of tools
 */
export function createToolkit(
  name: string,
  description: string,
  tools: IFunctionTool[]
): IToolkit {
  return {
    name,
    description,
    getTools: () => tools,
    getTool: (toolName: string) => tools.find((t) => t.name === toolName),
  };
}

/**
 * Combine multiple toolkits into one
 */
export function combineToolkits(
  name: string,
  description: string,
  toolkits: IToolkit[]
): IToolkit {
  const allTools = toolkits.flatMap((tk) => tk.getTools());
  return createToolkit(name, description, allTools);
}
