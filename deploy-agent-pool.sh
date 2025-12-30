#!/bin/bash
# Deploy Agent Pool to Lightsail Server
# Run this ON YOUR LIGHTSAIL SERVER: bash deploy-agent-pool.sh

set -e

echo "🚀 Deploying Agent Pool (5x Parallel Execution)"
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

# Check if agent pool is enabled
if ! grep -q "FEATURE_AGENT_POOL=true" .env; then
  echo ""
  echo "⚠️  Agent pool not enabled in .env"
  echo ""
  echo "Add these lines to your .env file:"
  echo ""
  echo "FEATURE_AGENT_POOL=true"
  echo "AGENT_POOL_SIZE=4"
  echo "AGENT_HEARTBEAT_INTERVAL=30000"
  echo "AGENT_STALE_THRESHOLD=120"
  echo "AGENT_TASK_TIMEOUT=300"
  echo ""
  read -p "Do you want me to add them now? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "" >> .env
    echo "# Agent Pool (5x Parallel Execution)" >> .env
    echo "FEATURE_AGENT_POOL=true" >> .env
    echo "AGENT_POOL_SIZE=4" >> .env
    echo "AGENT_HEARTBEAT_INTERVAL=30000" >> .env
    echo "AGENT_STALE_THRESHOLD=120" >> .env
    echo "AGENT_TASK_TIMEOUT=300" >> .env
    echo "✅ Added agent pool configuration to .env"
  else
    echo "Please add them manually and run this script again"
    exit 1
  fi
fi

# Apply database migration
echo ""
echo "📊 Applying database migration..."
if docker compose --profile with-db exec postgres psql -U postgres -d lugh -c "\dt agent_pool" 2>&1 | grep -q "agent_pool"; then
  echo "✅ Migration already applied"
else
  docker compose --profile with-db exec postgres psql -U postgres -d lugh < migrations/010_agent_pool.sql
  echo "✅ Migration applied successfully"
fi

# Rebuild and restart
echo ""
echo "🔨 Rebuilding containers..."
docker compose --profile with-db down
docker compose --profile with-db up -d --build

# Wait for startup
echo ""
echo "⏳ Waiting 10 seconds for workers to start..."
sleep 10

# Check agents
echo ""
echo "🤖 Checking agent status..."
docker compose --profile with-db exec postgres psql -U postgres -d lugh -c "
SELECT agent_id, status, last_heartbeat, NOW() - last_heartbeat as age
FROM agent_pool ORDER BY last_heartbeat DESC;
"

# Check pool stats
echo ""
echo "📈 Pool statistics:"
docker compose --profile with-db exec postgres psql -U postgres -d lugh -c "
SELECT
  (SELECT COUNT(*) FROM agent_pool WHERE status='idle') as idle_agents,
  (SELECT COUNT(*) FROM agent_pool WHERE status='busy') as busy_agents,
  (SELECT COUNT(*) FROM pool_tasks WHERE status='queued') as queued_tasks,
  (SELECT COUNT(*) FROM pool_tasks WHERE status='completed') as completed_tasks;
"

echo ""
echo "✨ Agent Pool Deployment Complete!"
echo ""
echo "📱 Test it: Send a message to your Telegram bot"
echo "🔍 Monitor: docker compose --profile with-db logs -f app-with-db"
echo ""
echo "🎉 You now have 5x parallel vibe coding!"
