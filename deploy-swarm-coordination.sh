#!/bin/bash
# Deploy Swarm Coordination Feature
# Run this ON YOUR LIGHTSAIL SERVER: bash deploy-swarm-coordination.sh

set -e

echo "🐝 Deploying Swarm Coordination (Parallel Agent Execution)"
echo ""

# Navigate to project directory
cd ~/makewithLugh

# Pull latest code
echo "📥 Pulling latest code from GitHub..."
git pull origin master

# Check if .env exists
if [ ! -f .env ]; then
  echo "❌ .env file not found!"
  echo "Copy .env.example to .env and configure it first"
  exit 1
fi

# Check if swarm coordination is enabled
if ! grep -q "FEATURE_SWARM_COORDINATION=true" .env; then
  echo ""
  echo "⚠️  Swarm coordination not enabled in .env"
  echo ""
  echo "Add these lines to your .env file:"
  echo ""
  echo "# Swarm Coordination (Parallel Agent Execution)"
  echo "FEATURE_SWARM_COORDINATION=true"
  echo "FEATURE_MULTI_LLM=true"
  echo ""
  read -p "Do you want me to add them now? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "" >> .env
    echo "# Swarm Coordination (Parallel Agent Execution)" >> .env
    echo "FEATURE_SWARM_COORDINATION=true" >> .env
    echo "FEATURE_MULTI_LLM=true" >> .env
    echo "✅ Added swarm coordination configuration to .env"
  else
    echo "Please add them manually and run this script again"
    exit 1
  fi
fi

# Rebuild and restart
echo ""
echo "🔨 Rebuilding containers..."
docker compose --profile with-db down
docker compose --profile with-db up -d --build

# Wait for startup
echo ""
echo "⏳ Waiting 10 seconds for app to start..."
sleep 10

# Check logs
echo ""
echo "📋 Checking logs..."
docker compose --profile with-db logs app-with-db | tail -20

echo ""
echo "✨ Swarm Coordination Deployment Complete!"
echo ""
echo "📱 Test it: Send '/swarm Build a todo app with React and Firebase' to your Telegram bot"
echo "🔍 Monitor: docker compose --profile with-db logs -f app-with-db"
echo ""
echo "🎉 You now have parallel agent execution (5x vibe coding)!"
