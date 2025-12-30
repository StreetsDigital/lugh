#!/bin/bash
# Deploy Lugh to Lightsail Server
# Run locally: ./deploy.sh

set -e

# Load deployment configuration if exists
if [ -f .env.deploy ]; then
  echo "📝 Loading deployment config from .env.deploy"
  set -a
  source .env.deploy
  set +a
fi

# Configuration (override with environment variables)
SERVER_HOST="${LUGH_SERVER_HOST:-your-lightsail-server.com}"
SERVER_USER="${LUGH_SERVER_USER:-ubuntu}"
SERVER_PATH="${LUGH_SERVER_PATH:-~/makewithLugh}"
SSH_KEY="${LUGH_SSH_KEY:-~/.ssh/id_rsa}"

echo "🚀 Deploying Lugh to $SERVER_USER@$SERVER_HOST"
echo ""

# Check if SSH key exists
if [ ! -f "$SSH_KEY" ]; then
  echo "❌ SSH key not found: $SSH_KEY"
  echo "Set LUGH_SSH_KEY environment variable or place key at ~/.ssh/id_rsa"
  exit 1
fi

# Deploy via SSH
ssh -i "$SSH_KEY" "$SERVER_USER@$SERVER_HOST" << 'ENDSSH'
set -e

echo "📥 Pulling latest code from GitHub..."
cd ~/makewithLugh
git pull origin master

echo ""
echo "🔨 Rebuilding and restarting containers..."
docker compose --profile with-db down
docker compose --profile with-db up -d --build

echo ""
echo "⏳ Waiting 10 seconds for startup..."
sleep 10

echo ""
echo "📋 Checking logs (last 30 lines)..."
docker compose --profile with-db logs app-with-db | tail -30

echo ""
echo "✨ Deployment complete!"
echo ""
echo "🔍 To monitor logs:"
echo "   ssh -t $USER@$(hostname) 'cd ~/makewithLugh && docker compose --profile with-db logs -f app-with-db'"
ENDSSH

echo ""
echo "✅ Deployment successful!"
echo ""
echo "📱 Test your bot:"
echo "   - Telegram: Send /status to your bot"
echo "   - Slack: Send /status in your workspace"
echo "   - Discord: Mention your bot and send /status"
echo ""
echo "🔍 Monitor logs remotely:"
echo "   ssh -i $SSH_KEY -t $SERVER_USER@$SERVER_HOST 'cd $SERVER_PATH && docker compose --profile with-db logs -f app-with-db'"
