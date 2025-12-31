#!/bin/bash
# =============================================================================
# Lugh Full Stack Deployment Script
# =============================================================================
# Deploys both Lugh (TypeScript) and LangGraph (Python) to Lightsail
#
# Usage:
#   ./scripts/deploy-full-stack.sh              # Deploy from local
#   curl -sL <raw-github-url> | bash            # Deploy directly on server
#
# Requirements:
#   - Docker & Docker Compose
#   - Git
#   - .env file configured
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }

# Configuration
REPO_URL="https://github.com/StreetsDigital/makewithLugh.git"
DEPLOY_DIR="${LUGH_DEPLOY_DIR:-$HOME/makewithLugh}"
BRANCH="${LUGH_BRANCH:-main}"

# Upstash Redis (shared between services)
REDIS_URL="${REDIS_URL:-rediss://default:Ae2RAAIncDFmNDFjNjQ4N2VmZTE0MjM1OTdiOTEwYzY5ZTQ5MGNlOHAxNjA4MTc@pleased-gator-60817.upstash.io:6379}"

echo ""
echo "=============================================="
echo "  🚀 Lugh Full Stack Deployment"
echo "=============================================="
echo ""

# =============================================================================
# Pre-flight Checks
# =============================================================================

log "Running pre-flight checks..."

# Check Docker
if ! command -v docker &> /dev/null; then
    warn "Docker not found. Installing..."
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker $USER
    warn "Docker installed. You may need to log out and back in."
fi

# Check Docker Compose
if ! docker compose version &> /dev/null; then
    warn "Docker Compose not found. Installing..."
    sudo apt-get update && sudo apt-get install -y docker-compose-plugin
fi

log "Pre-flight checks passed ✓"

# =============================================================================
# Stop Existing Services
# =============================================================================

log "Stopping existing services..."

if [ -d "$DEPLOY_DIR" ]; then
    cd "$DEPLOY_DIR"
    docker compose --profile with-db down 2>/dev/null || true
    docker compose -f langgraph-service/docker-compose.yml down 2>/dev/null || true
fi

# =============================================================================
# Update Code
# =============================================================================

if [ -d "$DEPLOY_DIR/.git" ]; then
    log "Updating existing repository..."
    cd "$DEPLOY_DIR"

    # Stash any local changes
    git stash 2>/dev/null || true

    # Fetch and checkout
    git fetch origin
    git checkout "$BRANCH"
    git pull origin "$BRANCH"

    log "Code updated to latest $BRANCH"
else
    log "Cloning fresh repository..."
    git clone "$REPO_URL" "$DEPLOY_DIR"
    cd "$DEPLOY_DIR"
    git checkout "$BRANCH"
    log "Repository cloned"
fi

# =============================================================================
# Configure Environment
# =============================================================================

log "Configuring environment..."

# Main Lugh .env
if [ ! -f "$DEPLOY_DIR/.env" ]; then
    if [ -f "$DEPLOY_DIR/.env.example" ]; then
        cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env"
        warn "Created .env from example - PLEASE CONFIGURE IT"
        warn "Edit: $DEPLOY_DIR/.env"
        warn "Required: DATABASE_URL, TELEGRAM_BOT_TOKEN, CLAUDE_CODE_OAUTH_TOKEN"
    else
        error ".env.example not found!"
    fi
fi

# Add Redis URL to main .env if not present
if ! grep -q "REDIS_URL" "$DEPLOY_DIR/.env" 2>/dev/null; then
    echo "" >> "$DEPLOY_DIR/.env"
    echo "# Redis (Upstash) for LangGraph pub/sub" >> "$DEPLOY_DIR/.env"
    echo "REDIS_URL=$REDIS_URL" >> "$DEPLOY_DIR/.env"
    log "Added REDIS_URL to .env"
fi

# Add LangGraph settings if not present
if ! grep -q "LANGGRAPH_ENABLED" "$DEPLOY_DIR/.env" 2>/dev/null; then
    echo "" >> "$DEPLOY_DIR/.env"
    echo "# LangGraph Integration" >> "$DEPLOY_DIR/.env"
    echo "LANGGRAPH_ENABLED=true" >> "$DEPLOY_DIR/.env"
    echo "LANGGRAPH_URL=http://langgraph:8000" >> "$DEPLOY_DIR/.env"
    log "Added LangGraph settings to .env"
fi

# LangGraph .env
LANGGRAPH_ENV="$DEPLOY_DIR/langgraph-service/.env"
if [ ! -f "$LANGGRAPH_ENV" ]; then
    cat > "$LANGGRAPH_ENV" << EOF
# LangGraph Service Configuration (Production)
SERVICE_NAME=lugh-langgraph
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=INFO

# Database (same as main Lugh)
DATABASE_URL=\${DATABASE_URL}

# Redis (Upstash)
REDIS_URL=$REDIS_URL

# LLM via Lugh Proxy (uses OAuth)
LUGH_SERVICE_URL=http://lugh:3000

# Default model
DEFAULT_MODEL=claude-sonnet-4-20250514

# Graph Settings
MAX_CONCURRENT_AGENTS=5
AGENT_TIMEOUT=300
ENABLE_CHECKPOINTING=true

# Integration
REDIS_CHANNEL_PREFIX=lugh:langgraph:
ENABLE_REDIS_WORKER=true
EOF
    log "Created LangGraph .env"
fi

# =============================================================================
# Build and Start Services
# =============================================================================

log "Building and starting services..."

cd "$DEPLOY_DIR"

# Create combined docker-compose for full stack
cat > docker-compose.fullstack.yml << 'EOF'
# Full Stack: Lugh + LangGraph + PostgreSQL
# Usage: docker compose -f docker-compose.fullstack.yml up -d

services:
  # === PostgreSQL ===
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: lugh
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - lugh-network

  # === Lugh TypeScript Service ===
  lugh:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/lugh
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - lugh-data:/.lugh
    networks:
      - lugh-network
    restart: unless-stopped

  # === LangGraph Python Service ===
  langgraph:
    build:
      context: ./langgraph-service
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/lugh
      - LUGH_SERVICE_URL=http://lugh:3000
    env_file:
      - ./langgraph-service/.env
    depends_on:
      - lugh
      - postgres
    networks:
      - lugh-network
    restart: unless-stopped

volumes:
  postgres-data:
  lugh-data:

networks:
  lugh-network:
    driver: bridge
EOF

log "Created docker-compose.fullstack.yml"

# Build and start
docker compose -f docker-compose.fullstack.yml up -d --build

# =============================================================================
# Health Checks
# =============================================================================

log "Waiting for services to start..."
sleep 15

echo ""
info "Checking service health..."

# Check Lugh
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    log "✅ Lugh (TypeScript) - healthy"
else
    warn "⚠️ Lugh may still be starting..."
fi

# Check LangGraph
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    log "✅ LangGraph (Python) - healthy"
else
    warn "⚠️ LangGraph may still be starting..."
fi

# Check LLM Proxy
if curl -s http://localhost:3000/api/llm/health > /dev/null 2>&1; then
    log "✅ LLM Proxy - healthy"
else
    warn "⚠️ LLM Proxy may still be starting..."
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "=============================================="
echo "  ✅ Deployment Complete!"
echo "=============================================="
echo ""
echo "Services:"
echo "  • Lugh (TypeScript):  http://localhost:3000"
echo "  • LangGraph (Python): http://localhost:8000"
echo "  • LLM Proxy:          http://localhost:3000/api/llm"
echo "  • PostgreSQL:         localhost:5432"
echo ""
echo "Commands:"
echo "  • View logs:    docker compose -f docker-compose.fullstack.yml logs -f"
echo "  • Stop:         docker compose -f docker-compose.fullstack.yml down"
echo "  • Restart:      docker compose -f docker-compose.fullstack.yml restart"
echo ""
echo "Test your bot:"
echo "  • Send /status to your Telegram bot"
echo ""
