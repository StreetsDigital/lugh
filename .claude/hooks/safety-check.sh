#!/bin/bash
# Block dangerous commands before execution
# Exit code 2 = block the action

# Parse command from stdin JSON
COMMAND=$(jq -r '.tool_input.command // empty' 2>/dev/null)

if [ -z "$COMMAND" ]; then
    exit 0
fi

# Dangerous patterns to block
BLOCKED_PATTERNS=(
    "rm -rf /"
    "rm -rf ~"
    "rm -rf \$HOME"
    "> /dev/sda"
    "mkfs."
    ":(){ :|:& };:"
    "chmod -R 777 /"
    "dd if=/dev/zero"
)

for pattern in "${BLOCKED_PATTERNS[@]}"; do
    if [[ "$COMMAND" == *"$pattern"* ]]; then
        echo "🚫 BLOCKED: Dangerous command detected: $pattern"
        exit 2  # Exit code 2 blocks the action
    fi
done

# Warn about production-ish commands but allow
WARN_PATTERNS=(
    "DROP DATABASE"
    "DROP TABLE"
    "DELETE FROM"
    "TRUNCATE"
    "kubectl delete"
    "docker system prune"
)

for pattern in "${WARN_PATTERNS[@]}"; do
    if [[ "$COMMAND" == *"$pattern"* ]]; then
        echo "⚠️  WARNING: Potentially destructive command: $pattern"
        # Don't block, just warn (exit 0)
    fi
done

exit 0
