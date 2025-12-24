#!/bin/bash
# Session start: Load git context and recent changes

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

# Only run if it's a git repo
if [ ! -d ".git" ]; then
    exit 0
fi

echo "📋 Git Status:"
git status -s 2>/dev/null | head -10

CHANGED=$(git status -s 2>/dev/null | wc -l | tr -d ' ')
if [ "$CHANGED" -gt 10 ]; then
    echo "   ... and $((CHANGED - 10)) more files"
fi

echo ""
echo "📝 Recent Commits:"
git log --oneline -5 2>/dev/null

echo ""
echo "🌿 Current Branch: $(git branch --show-current 2>/dev/null)"

exit 0
