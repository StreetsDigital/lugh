# {{NAME}}

{{DESCRIPTION}}

## Setup

```bash
python -m venv venv
source venv/bin/activate
pip install -e .
```

## Run

```bash
python src/server.py
```

## Usage in Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "{{NAME}}": {
      "command": "python",
      "args": ["/path/to/{{NAME}}/src/server.py"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `example_tool` | An example tool that processes a message |

## Adding New Tools

1. Create input model with Pydantic
2. Add to `list_tools()` function
3. Add case in `call_tool()` function
