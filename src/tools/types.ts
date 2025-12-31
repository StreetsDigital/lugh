/**
 * Tool System Types
 * ==================
 *
 * Based on CAMEL AI's FunctionTool and Toolkit patterns.
 * Compatible with MCP (Model Context Protocol) for interoperability.
 *
 * @see https://docs.camel-ai.org/key_modules/tools
 */

/**
 * JSON Schema for tool parameters
 */
export interface JSONSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  items?: JSONSchemaProperty;
  description?: string;
}

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';
  description?: string;
  enum?: (string | number)[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  default?: unknown;
}

/**
 * Tool execution result
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Risk levels for tool execution
 */
export type ToolRiskLevel = 'low' | 'medium' | 'high';

/**
 * Platforms where a tool can be used
 */
export type ToolPlatform = 'telegram' | 'slack' | 'github' | 'discord' | 'all';

/**
 * Core FunctionTool interface
 * Any function can become a tool by implementing this interface
 */
export interface IFunctionTool<TInput = unknown, TOutput = unknown> {
  /** Unique tool name */
  name: string;

  /** Human-readable description */
  description: string;

  /** JSON Schema for input parameters */
  parameters: JSONSchema;

  /** Execute the tool */
  execute(input: TInput): Promise<ToolResult<TOutput>>;

  /** Whether this tool requires user approval before execution */
  requiresApproval?: boolean;

  /** Risk level for this tool */
  riskLevel?: ToolRiskLevel;

  /** Platforms where this tool is available */
  platforms?: ToolPlatform[];

  /** Tags for categorization */
  tags?: string[];
}

/**
 * Toolkit interface - a collection of related tools
 */
export interface IToolkit {
  /** Toolkit name */
  name: string;

  /** Toolkit description */
  description: string;

  /** Get all tools in this toolkit */
  getTools(): IFunctionTool[];

  /** Get a specific tool by name */
  getTool(name: string): IFunctionTool | undefined;
}

/**
 * Tool registry interface
 */
export interface IToolRegistry {
  /** Register a single tool */
  register(tool: IFunctionTool): void;

  /** Register a toolkit (all its tools) */
  registerToolkit(toolkit: IToolkit): void;

  /** Get a tool by name */
  get(name: string): IFunctionTool | undefined;

  /** Get all registered tools */
  getAll(): IFunctionTool[];

  /** Get tools available for a specific platform */
  getForPlatform(platform: ToolPlatform): IFunctionTool[];

  /** Get tools by tag */
  getByTag(tag: string): IFunctionTool[];

  /** Check if a tool exists */
  has(name: string): boolean;

  /** Execute a tool by name */
  execute<TInput, TOutput>(
    name: string,
    input: TInput
  ): Promise<ToolResult<TOutput>>;
}

/**
 * MCP Tool definition (for compatibility with Model Context Protocol)
 */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

/**
 * MCP Tool result
 */
export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * Tool decorator options
 */
export interface ToolDecoratorOptions {
  name?: string;
  description: string;
  parameters?: JSONSchema;
  requiresApproval?: boolean;
  riskLevel?: ToolRiskLevel;
  platforms?: ToolPlatform[];
  tags?: string[];
}

/**
 * Tool execution context (passed to tools during execution)
 */
export interface ToolExecutionContext {
  /** Conversation ID for the current context */
  conversationId?: string;

  /** Working directory */
  cwd?: string;

  /** Platform making the request */
  platform?: ToolPlatform;

  /** User ID (if available) */
  userId?: string;

  /** Additional context */
  metadata?: Record<string, unknown>;
}
