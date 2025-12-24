# {{NAME}}

{{DESCRIPTION}}

## Setup

```bash
npm install
npm run build
```

## Development

```bash
npm run dev      # Watch mode
npm run inspector # Test with MCP Inspector
```

## Usage

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "{{NAME}}": {
      "command": "node",
      "args": ["/path/to/{{NAME}}/dist/index.js"]
    }
  }
}
```

### Claude Code

Add to `.mcp.json` in your project:

```json
{
  "mcpServers": {
    "{{NAME}}": {
      "command": "node",
      "args": ["./dist/index.js"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `example_tool` | An example tool that processes a message |

## Adding New Tools

1. Add schema in `src/index.ts`
2. Add to `ListToolsRequestSchema` handler
3. Add case in `CallToolRequestSchema` handler
4. Run `npm run build`
