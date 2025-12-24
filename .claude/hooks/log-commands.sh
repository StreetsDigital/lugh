#!/bin/bash
# Log all bash commands to a file for audit/debugging
# Appends to ~/.claude/logs/commands.log

LOG_DIR="$HOME/.claude/logs"
LOG_FILE="$LOG_DIR/commands.log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Parse command from stdin JSON
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
DESCRIPTION=$(echo "$INPUT" | jq -r '.tool_input.description // "No description"' 2>/dev/null)

if [ -n "$COMMAND" ]; then
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    PROJECT="${CLAUDE_PROJECT_DIR:-unknown}"
    
    echo "[$TIMESTAMP] [$PROJECT] $COMMAND | $DESCRIPTION" >> "$LOG_FILE"
fi

exit 0
