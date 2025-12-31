#!/bin/bash
# Start Lugh in development mode (Claude Code sandbox)
# Requires: .env.staging.local with valid credentials

set -e

# Check if staging env exists
if [ ! -f ".env.staging.local" ]; then
    echo "❌ .env.staging.local not found"
    echo "Copy and edit: cp .env.staging.local.example .env.staging.local"
    exit 1
fi

# Load staging env
echo "📝 Loading staging configuration..."
export $(grep -v '^#' .env.staging.local | xargs)

# Check required vars
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not set in .env.staging.local"
    exit 1
fi

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo "❌ TELEGRAM_BOT_TOKEN not set in .env.staging.local"
    exit 1
fi

# Run database migrations (idempotent)
echo "🗄️  Running migrations..."
psql "$DATABASE_URL" -f migrations/000_combined.sql 2>/dev/null || echo "Migrations may already be applied"

# Start development server
echo ""
echo "🚀 Starting Lugh development server..."
echo "📱 Test via Telegram: Send /status to your staging bot"
echo ""
bun run dev
