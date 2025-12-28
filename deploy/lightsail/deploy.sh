#!/bin/bash
# Lugh/Lugh Lightsail Deployment Script
# Usage: curl -sL https://raw.githubusercontent.com/StreetsDigital/makewithLugh/main/deploy/lightsail/deploy.sh | bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Configuration
REPO_URL="https://github.com/StreetsDigital/makewithLugh.git"
DEPLOY_DIR="$HOME/makewithLugh"
BRANCH="main"

log "Starting Lugh deployment on Lightsail..."

# Check for Docker
if ! command -v docker &> /dev/null; then
    log "Docker not found. Installing Docker..."
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker $USER
    warn "Docker installed. You may need to log out and back in for group changes."
fi

# Check for Docker Compose
if ! docker compose version &> /dev/null; then
    log "Docker Compose not found. Installing..."
    sudo apt-get update
    sudo apt-get install -y docker-compose-plugin
fi

# Clone or update repository
if [ -d "$DEPLOY_DIR" ]; then
    log "Repository exists. Pulling latest changes..."
    cd "$DEPLOY_DIR"
    git fetch origin
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
else
    log "Cloning repository..."
    git clone "$REPO_URL" "$DEPLOY_DIR"
    cd "$DEPLOY_DIR"
    git checkout "$BRANCH"
fi

# Check for .env file
if [ ! -f "$DEPLOY_DIR/.env" ]; then
    log "Creating .env from example..."
    cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env"
    warn "IMPORTANT: Edit $DEPLOY_DIR/.env with your credentials before starting!"
    echo ""
    echo "Required configurations:"
    echo "  - DATABASE_URL (PostgreSQL connection string)"
    echo "  - CLAUDE_CODE_OAUTH_TOKEN or CODEX tokens"
    echo "  - TELEGRAM_BOT_TOKEN (or other platform tokens)"
    echo ""
    echo "After editing .env, run:"
    echo "  cd $DEPLOY_DIR && docker compose --profile with-db up -d"
    exit 0
fi

# Build and start services
log "Building and starting services..."
cd "$DEPLOY_DIR"

# Use with-db profile to include PostgreSQL
docker compose --profile with-db down 2>/dev/null || true
docker compose --profile with-db up -d --build

# Wait for services to be healthy
log "Waiting for services to start..."
sleep 10

# Check health
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    log "Deployment successful!"
    echo ""
    echo "Services running:"
    docker compose --profile with-db ps
    echo ""
    echo "View logs: docker compose --profile with-db logs -f"
    echo "Stop: docker compose --profile with-db down"
else
    warn "Application may still be starting. Check logs with:"
    echo "  docker compose --profile with-db logs -f"
fi

log "Done!"
