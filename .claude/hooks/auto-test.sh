#!/bin/bash
# Auto-run tests after editing test files
# Only runs if we edited a test file

FILE_PATH=$(jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# Check if it's a test file
case "$FILE_PATH" in
    *_test.go)
        # Go test
        DIR=$(dirname "$FILE_PATH")
        cd "$CLAUDE_PROJECT_DIR" 2>/dev/null
        echo "🧪 Running Go tests..."
        go test "$DIR/..." -v 2>&1 | tail -20
        ;;
    *test_*.py|*_test.py|*/tests/*.py)
        # Python test
        cd "$CLAUDE_PROJECT_DIR" 2>/dev/null
        echo "🧪 Running Python tests..."
        python -m pytest "$FILE_PATH" -v 2>&1 | tail -20
        ;;
    *.test.ts|*.test.js|*.spec.ts|*.spec.js)
        # Node test
        cd "$CLAUDE_PROJECT_DIR" 2>/dev/null
        echo "🧪 Running Node tests..."
        npm test -- --testPathPattern="$(basename "$FILE_PATH")" 2>&1 | tail -20
        ;;
esac

exit 0
