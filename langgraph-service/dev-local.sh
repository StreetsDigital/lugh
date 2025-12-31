#!/bin/bash
# Start LangGraph service locally (no Docker)
# Requires: .env.local with Supabase + Upstash credentials

set -e

cd "$(dirname "$0")"

# Check for local env
if [ ! -f ".env.local" ]; then
    echo "❌ .env.local not found"
    echo "Copy and edit: cp .env.example .env.local"
    exit 1
fi

# Load environment
echo "📝 Loading .env.local..."
export $(grep -v '^#' .env.local | grep -v '^$' | xargs)

# Check required vars
if [ -z "$DATABASE_URL" ] || [ "$DATABASE_URL" = "postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres" ]; then
    echo "❌ DATABASE_URL not configured in .env.local"
    exit 1
fi

if [ -z "$REDIS_URL" ] || [[ "$REDIS_URL" == *"YOUR_PASSWORD"* ]]; then
    echo "❌ REDIS_URL not configured in .env.local"
    echo ""
    echo "Get free Redis from Upstash:"
    echo "  1. Go to https://upstash.com"
    echo "  2. Create Redis database"
    echo "  3. Copy connection string (rediss://...)"
    exit 1
fi

if [ -z "$ANTHROPIC_API_KEY" ] || [ "$ANTHROPIC_API_KEY" = "sk-ant-..." ]; then
    echo "❌ ANTHROPIC_API_KEY not configured in .env.local"
    exit 1
fi

# Check/create venv
if [ ! -d ".venv" ]; then
    echo "🐍 Creating Python virtual environment..."
    python3 -m venv .venv
fi

# Activate venv
source .venv/bin/activate

# Install dependencies if needed
if ! python -c "import fastapi" 2>/dev/null; then
    echo "📦 Installing dependencies..."
    pip install -e . --quiet
fi

# Test connections
echo "🔍 Testing connections..."

# Test Redis
python -c "
import redis
import os
r = redis.from_url(os.environ['REDIS_URL'])
r.ping()
print('  ✅ Redis connected')
" || { echo "  ❌ Redis connection failed"; exit 1; }

# Test PostgreSQL
python -c "
import psycopg
import os
conn = psycopg.connect(os.environ['DATABASE_URL'])
conn.close()
print('  ✅ PostgreSQL connected')
" 2>/dev/null || echo "  ⚠️ PostgreSQL check skipped (psycopg not installed)"

echo ""
echo "🚀 Starting LangGraph service on http://localhost:8000"
echo "📖 API docs: http://localhost:8000/docs"
echo "❤️ Health: http://localhost:8000/health"
echo ""

# Start uvicorn
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
