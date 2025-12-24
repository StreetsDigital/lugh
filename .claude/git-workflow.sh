#!/bin/bash
# Claude Code Git Workflow Helper
# Auto-create branches, commits, and PRs

set -e

COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
    branch)
        # Create a branch for the current agent/task
        AGENT_NAME="${1:-claude}"
        TASK="${2:-work}"
        
        # Sanitize names
        AGENT_NAME=$(echo "$AGENT_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g')
        TASK=$(echo "$TASK" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | cut -c1-30)
        
        BRANCH="claude/${AGENT_NAME}/${TASK}-$(date +%Y%m%d-%H%M)"
        
        git checkout -b "$BRANCH"
        echo "✓ Created branch: $BRANCH"
        ;;
        
    commit)
        # Auto-commit with message
        MESSAGE="${1:-Claude Code changes}"
        
        git add -A
        
        # Check if there are changes
        if git diff --cached --quiet; then
            echo "No changes to commit"
            exit 0
        fi
        
        git commit -m "$MESSAGE"
        echo "✓ Committed: $MESSAGE"
        ;;
        
    save)
        # Quick save - add all, commit with timestamp
        AGENT="${1:-claude}"
        
        git add -A
        
        if git diff --cached --quiet; then
            echo "No changes to save"
            exit 0
        fi
        
        MESSAGE="[$AGENT] Checkpoint $(date '+%H:%M')"
        git commit -m "$MESSAGE"
        echo "✓ Saved: $MESSAGE"
        ;;
        
    pr)
        # Create a PR (GitHub CLI required)
        TITLE="${1:-Claude Code changes}"
        BODY="${2:-Automated PR from Claude Code}"
        
        CURRENT_BRANCH=$(git branch --show-current)
        
        # Push branch
        git push -u origin "$CURRENT_BRANCH"
        
        # Create PR
        if command -v gh &> /dev/null; then
            gh pr create --title "$TITLE" --body "$BODY"
            echo "✓ PR created"
        else
            echo "GitHub CLI (gh) not installed. Push complete, create PR manually:"
            echo "  https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/pull/new/$CURRENT_BRANCH"
        fi
        ;;
        
    status)
        # Show current git status
        echo "📌 Branch: $(git branch --show-current)"
        echo ""
        echo "📝 Changes:"
        git status -s
        echo ""
        echo "📊 Recent commits:"
        git log --oneline -5
        ;;
        
    diff)
        # Show diff from main
        BASE="${1:-main}"
        git diff "$BASE"...HEAD --stat
        ;;
        
    squash)
        # Squash all commits on current branch into one
        BASE="${1:-main}"
        MESSAGE="${2:-Squashed Claude Code changes}"
        
        COMMITS=$(git rev-list --count "$BASE"..HEAD)
        
        if [ "$COMMITS" -eq 0 ]; then
            echo "No commits to squash"
            exit 0
        fi
        
        git reset --soft "$BASE"
        git commit -m "$MESSAGE"
        echo "✓ Squashed $COMMITS commits into one"
        ;;
        
    wrap)
        # Wrap up session: squash, push, create PR
        BASE="${1:-main}"
        TITLE="${2:-Claude Code session}"
        
        CURRENT_BRANCH=$(git branch --show-current)
        
        if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
            echo "❌ Cannot wrap up from main/master branch"
            exit 1
        fi
        
        # Squash commits
        COMMITS=$(git rev-list --count "$BASE"..HEAD)
        if [ "$COMMITS" -gt 1 ]; then
            git reset --soft "$BASE"
            git commit -m "$TITLE"
            echo "✓ Squashed $COMMITS commits"
        fi
        
        # Push and PR
        git push -u origin "$CURRENT_BRANCH" --force-with-lease
        
        if command -v gh &> /dev/null; then
            gh pr create --title "$TITLE" --body "Automated PR from Claude Code session" 2>/dev/null || echo "PR may already exist"
            echo "✓ Pushed and PR created"
        else
            echo "✓ Pushed. Create PR manually."
        fi
        ;;
        
    help|*)
        echo "Claude Code Git Workflow"
        echo ""
        echo "Usage: claude-git <command> [args]"
        echo ""
        echo "Commands:"
        echo "  branch <agent> <task>   Create branch: claude/agent/task-date"
        echo "  commit <message>        Add all and commit"
        echo "  save [agent]            Quick checkpoint commit"
        echo "  pr <title> [body]       Push and create GitHub PR"
        echo "  status                  Show branch, changes, recent commits"
        echo "  diff [base]             Show diff from base (default: main)"
        echo "  squash [base] [msg]     Squash all commits into one"
        echo "  wrap [base] [title]     Squash, push, and create PR"
        echo ""
        echo "Examples:"
        echo "  claude-git branch audit-go review-handlers"
        echo "  claude-git save audit-go"
        echo "  claude-git commit 'Fix authentication bug'"
        echo "  claude-git wrap main 'Security audit fixes'"
        ;;
esac
