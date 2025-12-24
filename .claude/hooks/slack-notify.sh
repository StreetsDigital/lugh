#!/bin/bash
# Send Slack notification when Claude Code needs input
# Set CLAUDE_SLACK_WEBHOOK environment variable to your webhook URL

WEBHOOK_URL="${CLAUDE_SLACK_WEBHOOK:-}"

if [ -z "$WEBHOOK_URL" ]; then
    # No webhook configured, skip silently
    exit 0
fi

PROJECT="${CLAUDE_PROJECT_DIR:-unknown}"
PROJECT_NAME=$(basename "$PROJECT")

# Send to Slack
curl -s -X POST "$WEBHOOK_URL" \
    -H 'Content-type: application/json' \
    --data "{
        \"text\": \"🤖 Claude Code needs your attention\",
        \"blocks\": [
            {
                \"type\": \"section\",
                \"text\": {
                    \"type\": \"mrkdwn\",
                    \"text\": \"*Claude Code* is waiting for input in \`$PROJECT_NAME\`\"
                }
            }
        ]
    }" > /dev/null 2>&1

exit 0
