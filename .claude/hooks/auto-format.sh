#!/bin/bash
# Auto-format files after edit/write
# Reads file path from stdin JSON

# Parse file path from JSON input
FILE_PATH=$(jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# Get file extension
EXT="${FILE_PATH##*.}"

case "$EXT" in
    go)
        # Format Go files
        if command -v gofmt &> /dev/null; then
            gofmt -w "$FILE_PATH" 2>/dev/null
        fi
        ;;
    py)
        # Format Python files with ruff (faster than black)
        if command -v ruff &> /dev/null; then
            ruff format "$FILE_PATH" 2>/dev/null
            ruff check --fix "$FILE_PATH" 2>/dev/null
        elif command -v black &> /dev/null; then
            black -q "$FILE_PATH" 2>/dev/null
        fi
        ;;
    ts|tsx|js|jsx)
        # Format TypeScript/JavaScript with prettier
        if command -v prettier &> /dev/null; then
            prettier --write "$FILE_PATH" 2>/dev/null
        fi
        ;;
    json)
        # Format JSON with jq
        if command -v jq &> /dev/null; then
            TMP=$(mktemp)
            jq '.' "$FILE_PATH" > "$TMP" 2>/dev/null && mv "$TMP" "$FILE_PATH"
        fi
        ;;
esac

exit 0
