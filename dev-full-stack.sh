#!/bin/bash
# Full Stack Development Setup
# ============================
# Runs both Lugh (TypeScript) and LangGraph (Python) services
#
# Prerequisites:
#   - .env.staging.local (Lugh config)
#   - langgraph-service/.env.local (LangGraph config)
#   - Supabase PostgreSQL
#   - Upstash Redis

set -e

echo "🚀 Lugh Full Stack Development"
echo "=============================="
echo ""

# Check environment files
MISSING=""
[ ! -f ".env.staging.local" ] && MISSING="$MISSING .env.staging.local"
[ ! -f "langgraph-service/.env.local" ] && MISSING="$MISSING langgraph-service/.env.local"

if [ -n "$MISSING" ]; then
    echo "❌ Missing configuration files:$MISSING"
    echo ""
    echo "Setup steps:"
    echo "  1. cp .env.staging.local.example .env.staging.local"
    echo "  2. cp langgraph-service/.env.example langgraph-service/.env.local"
    echo "  3. Configure both with Supabase + Upstash credentials"
    echo ""
    echo "Get free services:"
    echo "  - PostgreSQL: https://supabase.com (free tier)"
    echo "  - Redis: https://upstash.com (free tier)"
    exit 1
fi

# Load Lugh environment
export $(grep -v '^#' .env.staging.local | grep -v '^$' | xargs)

# Enable LangGraph integration
export LANGGRAPH_ENABLED=true
export LANGGRAPH_URL=http://localhost:8000

echo "🐍 Starting LangGraph service (port 8000)..."
cd langgraph-service
./dev-local.sh &
LANGGRAPH_PID=$!
cd ..

# Wait for LangGraph to be healthy
echo "⏳ Waiting for LangGraph..."
for i in {1..30}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo "  ✅ LangGraph ready"
        break
    fi
    sleep 1
done

echo ""
echo "📱 Starting Lugh service (port 3000)..."
bun run dev &
LUGH_PID=$!

echo ""
echo "=============================="
echo "✅ Full stack running!"
echo ""
echo "Services:"
echo "  - Lugh (TypeScript):  http://localhost:3000"
echo "  - LangGraph (Python): http://localhost:8000"
echo ""
echo "Test:"
echo "  - Health: curl http://localhost:3000/health"
echo "  - LangGraph: curl http://localhost:8000/health"
echo "  - Telegram: Send /status to your staging bot"
echo ""
echo "Stop with Ctrl+C"
echo ""

# Handle cleanup
trap "echo 'Stopping...'; kill $LANGGRAPH_PID $LUGH_PID 2>/dev/null; exit 0" SIGINT SIGTERM

# Wait for either to exit
wait
