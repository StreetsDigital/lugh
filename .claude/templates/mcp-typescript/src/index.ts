import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Tool input schemas
const ExampleToolSchema = z.object({
  message: z.string().describe("The message to process"),
});

// Create server
const server = new Server(
  {
    name: "{{NAME}}",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "example_tool",
        description: "An example tool that processes a message",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "The message to process",
            },
          },
          required: ["message"],
        },
      },
      // Add more tools here
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "example_tool": {
      const { message } = ExampleToolSchema.parse(args);
      
      // TODO: Implement your tool logic here
      const result = `Processed: ${message}`;
      
      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("{{NAME}} MCP server running on stdio");
}

main().catch(console.error);
