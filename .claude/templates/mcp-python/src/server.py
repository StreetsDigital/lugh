"""
{{NAME}} - {{DESCRIPTION}}
"""

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
from pydantic import BaseModel, Field


# Input models
class ExampleInput(BaseModel):
    """Input for the example tool."""
    message: str = Field(description="The message to process")


# Create server
server = Server("{{NAME}}")


@server.list_tools()
async def list_tools() -> list[Tool]:
    """List available tools."""
    return [
        Tool(
            name="example_tool",
            description="An example tool that processes a message",
            inputSchema=ExampleInput.model_json_schema(),
        ),
        # Add more tools here
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Handle tool calls."""
    
    match name:
        case "example_tool":
            args = ExampleInput(**arguments)
            # TODO: Implement your tool logic here
            result = f"Processed: {args.message}"
            return [TextContent(type="text", text=result)]
        
        case _:
            raise ValueError(f"Unknown tool: {name}")


async def main():
    """Run the MCP server."""
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
