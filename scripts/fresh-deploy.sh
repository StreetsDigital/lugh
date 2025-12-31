#!/bin/bash
# Fresh Deploy Script for Lightsail
# Run this ON your Lightsail server to start clean
#
# Usage: curl -sL https://raw.githubusercontent.com/StreetsDigital/makewithLugh/claude/setup-dev-workstation-r77MO/scripts/fresh-deploy.sh | bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

DEPLOY_DIR="$HOME/makewithLugh"
BACKUP_DIR="$HOME/makewithLugh.backup.$(date +%Y%m%d_%H%M%S)"
BRANCH="main"  # Change to your preferred branch

log "=== Fresh Lugh Deployment ==="
echo ""

# Step 1: Stop existing containers
log "Stopping existing containers..."
if [ -d "$DEPLOY_DIR" ]; then
    cd "$DEPLOY_DIR"
    docker compose --profile with-db down 2>/dev/null || true
    docker compose down 2>/dev/null || true
fi

# Step 2: Backup existing deployment (just in case)
if [ -d "$DEPLOY_DIR" ]; then
    log "Backing up existing deployment to $BACKUP_DIR..."
    mv "$DEPLOY_DIR" "$BACKUP_DIR"

    # Preserve .env if it exists
    if [ -f "$BACKUP_DIR/.env" ]; then
        log "Found existing .env - will restore it after clone"
    fi
fi

# Step 3: Fresh clone
log "Cloning fresh repository..."
git clone https://github.com/StreetsDigital/makewithLugh.git "$DEPLOY_DIR"
cd "$DEPLOY_DIR"
git checkout "$BRANCH"

# Step 4: Restore or create .env
if [ -f "$BACKUP_DIR/.env" ]; then
    log "Restoring .env from backup..."
    cp "$BACKUP_DIR/.env" "$DEPLOY_DIR/.env"
else
    warn "No existing .env found. Creating from example..."
    cp .env.example .env
    echo ""
    echo "=========================================="
    echo "IMPORTANT: Edit .env before continuing!"
    echo ""
    echo "Required:"
    echo "  DATABASE_URL=postgresql://..."
    echo "  TELEGRAM_BOT_TOKEN=..."
    echo "  CLAUDE_CODE_OAUTH_TOKEN=... (or CLAUDE_API_KEY)"
    echo ""
    echo "Edit with: nano $DEPLOY_DIR/.env"
    echo "Then run: cd $DEPLOY_DIR && docker compose --profile with-db up -d"
    echo "=========================================="
    exit 0
fi

# Step 5: Build and start
log "Building and starting services..."
docker compose --profile with-db up -d --build

# Step 6: Wait and verify
log "Waiting for services to start..."
sleep 15

if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    log "Health check passed!"
else
    warn "Health check failed - services may still be starting"
fi

# Step 7: Show status
echo ""
log "=== Deployment Complete ==="
echo ""
docker compose --profile with-db ps
echo ""
log "View logs: docker compose --profile with-db logs -f"
log "Test bot: Send /status to your Telegram bot"
echo ""

# Step 8: Cleanup old backup after 7 days reminder
echo "Note: Old backup saved at $BACKUP_DIR"
echo "Delete it manually when you're confident everything works:"
echo "  rm -rf $BACKUP_DIR"
