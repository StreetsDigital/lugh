/**
 * FunctionTool
 * =============
 *
 * Wraps any function to make it usable as an agent tool.
 * Based on CAMEL AI's FunctionTool pattern.
 *
 * Usage:
 * ```typescript
 * const addTool = new FunctionTool({
 *   name: 'add',
 *   description: 'Add two numbers',
 *   parameters: {
 *     type: 'object',
 *     properties: {
 *       a: { type: 'number', description: 'First number' },
 *       b: { type: 'number', description: 'Second number' },
 *     },
 *     required: ['a', 'b'],
 *   },
 *   execute: async (input) => ({ success: true, data: input.a + input.b }),
 * });
 * ```
 */

import type {
  IFunctionTool,
  JSONSchema,
  ToolResult,
  ToolRiskLevel,
  ToolPlatform,
  ToolDecoratorOptions,
} from './types';

/**
 * FunctionTool configuration
 */
export interface FunctionToolConfig<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute: (input: TInput) => Promise<ToolResult<TOutput>>;
  requiresApproval?: boolean;
  riskLevel?: ToolRiskLevel;
  platforms?: ToolPlatform[];
  tags?: string[];
}

/**
 * FunctionTool class
 */
export class FunctionTool<TInput = unknown, TOutput = unknown> implements IFunctionTool<
  TInput,
  TOutput
> {
  readonly name: string;
  readonly description: string;
  readonly parameters: JSONSchema;
  readonly requiresApproval: boolean;
  readonly riskLevel: ToolRiskLevel;
  readonly platforms: ToolPlatform[];
  readonly tags: string[];

  private executeFn: (input: TInput) => Promise<ToolResult<TOutput>>;

  constructor(config: FunctionToolConfig<TInput, TOutput>) {
    this.name = config.name;
    this.description = config.description;
    this.parameters = config.parameters;
    this.executeFn = config.execute;
    this.requiresApproval = config.requiresApproval ?? false;
    this.riskLevel = config.riskLevel ?? 'low';
    this.platforms = config.platforms ?? ['all'];
    this.tags = config.tags ?? [];
  }

  /**
   * Execute the tool
   */
  async execute(input: TInput): Promise<ToolResult<TOutput>> {
    try {
      // Validate input against schema (basic validation)
      this.validateInput(input);

      // Execute the function
      const result = await this.executeFn(input);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Tool execution failed: ${message}`,
      };
    }
  }

  /**
   * Basic input validation against JSON Schema
   */
  private validateInput(input: unknown): void {
    if (this.parameters.type === 'object') {
      if (typeof input !== 'object' || input === null) {
        throw new Error('Input must be an object');
      }

      const inputObj = input as Record<string, unknown>;
      const required = this.parameters.required || [];

      for (const field of required) {
        if (!(field in inputObj)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Type check for properties
      if (this.parameters.properties) {
        for (const [key, schema] of Object.entries(this.parameters.properties)) {
          if (key in inputObj) {
            const value = inputObj[key];
            const expectedType = schema.type;

            if (expectedType === 'string' && typeof value !== 'string') {
              throw new Error(`Field '${key}' must be a string`);
            }
            if (expectedType === 'number' && typeof value !== 'number') {
              throw new Error(`Field '${key}' must be a number`);
            }
            if (expectedType === 'boolean' && typeof value !== 'boolean') {
              throw new Error(`Field '${key}' must be a boolean`);
            }
            if (expectedType === 'array' && !Array.isArray(value)) {
              throw new Error(`Field '${key}' must be an array`);
            }
          }
        }
      }
    }
  }

  /**
   * Convert to MCP tool definition
   */
  toMCPDefinition(): { name: string; description: string; inputSchema: JSONSchema } {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.parameters,
    };
  }

  /**
   * Check if tool is available for a platform
   */
  isAvailableFor(platform: ToolPlatform): boolean {
    return this.platforms.includes('all') || this.platforms.includes(platform);
  }

  /**
   * Check if tool has a specific tag
   */
  hasTag(tag: string): boolean {
    return this.tags.includes(tag);
  }
}

/**
 * Create a FunctionTool from a simple function
 */
export function createTool<TInput, TOutput>(
  config: FunctionToolConfig<TInput, TOutput>
): FunctionTool<TInput, TOutput> {
  return new FunctionTool(config);
}

/**
 * Tool decorator factory
 *
 * Usage:
 * ```typescript
 * class MyToolkit {
 *   @tool({
 *     description: 'Add two numbers',
 *     parameters: { ... }
 *   })
 *   async add(input: { a: number; b: number }): Promise<number> {
 *     return input.a + input.b;
 *   }
 * }
 * ```
 */
export function tool(options: ToolDecoratorOptions) {
  return function <T extends (...args: unknown[]) => Promise<unknown>>(
    _target: object,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value!;

    // Store tool metadata on the method
    (originalMethod as unknown as Record<string, unknown>).__toolMetadata = {
      name: options.name || propertyKey,
      ...options,
    };

    return descriptor;
  };
}

/**
 * Extract tool metadata from a decorated method
 */
export function getToolMetadata(method: unknown): ToolDecoratorOptions | undefined {
  return (method as Record<string, unknown>)?.__toolMetadata as ToolDecoratorOptions | undefined;
}

/**
 * Create FunctionTools from a class with decorated methods
 */
export function extractToolsFromClass(instance: object): FunctionTool[] {
  const tools: FunctionTool[] = [];
  const prototype = Object.getPrototypeOf(instance);

  for (const key of Object.getOwnPropertyNames(prototype)) {
    if (key === 'constructor') continue;

    const method = prototype[key];
    const metadata = getToolMetadata(method);

    if (metadata) {
      tools.push(
        new FunctionTool({
          name: metadata.name || key,
          description: metadata.description,
          parameters: metadata.parameters || { type: 'object', properties: {} },
          execute: async input => {
            try {
              const result = await method.call(instance, input);
              return { success: true, data: result };
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Unknown error';
              return { success: false, error: message };
            }
          },
          requiresApproval: metadata.requiresApproval,
          riskLevel: metadata.riskLevel,
          platforms: metadata.platforms,
          tags: metadata.tags,
        })
      );
    }
  }

  return tools;
}
