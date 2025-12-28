# Dual Instance Architecture

**Purpose:** Develop on staging (@LughDev), deploy stable to prod (@Lugh).

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           SERVER                                     │
│                    (Lightsail / Hetzner)                            │
│                                                                      │
│   ┌─────────────────────────┐   ┌─────────────────────────┐         │
│   │   STAGING (:3001)       │   │   PROD (:3000)          │         │
│   │                         │   │                         │         │
│   │   @LughDev bot          │   │   @Lugh bot             │         │
│   │   staging_lugh DB       │   │   prod_lugh DB          │         │
│   │   ~/.lugh-staging/      │   │   ~/.lugh-prod/         │         │
│   │   develop branch        │   │   main branch           │         │
│   │                         │   │                         │         │
│   │   YOU WORK HERE         │   │   USERS USE THIS        │         │
│   └─────────────────────────┘   └─────────────────────────┘         │
│                                                                      │
│   ┌─────────────────────────────────────────────────────────┐       │
│   │   SHARED INFRASTRUCTURE                                  │       │
│   │   • PostgreSQL (two databases)                          │       │
│   │   • Redis (two prefixes)                                │       │
│   │   • Docker network                                       │       │
│   └─────────────────────────────────────────────────────────┘       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Isolation Matrix

| Aspect | Staging | Prod |
|--------|---------|------|
| **Telegram Bot** | @LughDev | @Lugh |
| **Bot Token** | `TELEGRAM_BOT_TOKEN_STAGING` | `TELEGRAM_BOT_TOKEN_PROD` |
| **Port** | 3001 | 3000 |
| **Database** | `staging_lugh` | `prod_lugh` |
| **LUGH_HOME** | `~/.lugh-staging` | `~/.lugh-prod` |
| **Redis Prefix** | `staging:` | `prod:` |
| **Git Branch** | `develop` / feature | `main` |
| **Auto-deploy** | On push to develop | On push to main |
| **Users** | Just you | Real customers |
| **Can break?** | Yes | Never |

---

## Docker Compose Files

### docker-compose.staging.yml
```yaml
version: '3.8'

services:
  lugh-staging:
    build: .
    container_name: lugh-staging
    environment:
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN_STAGING}
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/staging_lugh
      - REDIS_URL=redis://redis:6379
      - REDIS_PREFIX=staging:
      - LUGH_HOME=/.lugh-staging
      - BOT_DISPLAY_NAME=Lugh Dev
      - PORT=3000
    ports:
      - "3001:3000"
    volumes:
      - lugh-staging-data:/.lugh-staging
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  lugh-staging-data:
  postgres-data:
```

### docker-compose.prod.yml
```yaml
version: '3.8'

services:
  lugh-prod:
    build: .
    container_name: lugh-prod
    environment:
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN_PROD}
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/prod_lugh
      - REDIS_URL=redis://redis:6379
      - REDIS_PREFIX=prod:
      - LUGH_HOME=/.lugh-prod
      - BOT_DISPLAY_NAME=Lugh
      - PORT=3000
    ports:
      - "3000:3000"
    volumes:
      - lugh-prod-data:/.lugh-prod
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  # Postgres and Redis shared with staging
  # Run staging compose first to create them

volumes:
  lugh-prod-data:
```

---

## Environment Files

### .env.staging
```bash
# Telegram
TELEGRAM_BOT_TOKEN=123456789:AAA_your_staging_bot_token

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/staging_lugh

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PREFIX=staging:

# Paths
LUGH_HOME=~/.lugh-staging

# Display
BOT_DISPLAY_NAME=Lugh Dev

# AI
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...

# Features (enable experimental)
FEATURE_AGENT_POOL=true
FEATURE_REDIS_MESSAGING=true
FEATURE_SIMULATION_LAYER=true
```

### .env.prod
```bash
# Telegram
TELEGRAM_BOT_TOKEN=987654321:BBB_your_prod_bot_token

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/prod_lugh

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PREFIX=prod:

# Paths
LUGH_HOME=~/.lugh-prod

# Display
BOT_DISPLAY_NAME=Lugh

# AI
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...

# Features (only stable)
FEATURE_AGENT_POOL=false
FEATURE_REDIS_MESSAGING=false
FEATURE_SIMULATION_LAYER=false
```

---

## Workflow

### Development Cycle

```
1. YOU (phone) → @LughDev
   "Fix the booking confirmation bug"

2. STAGING runs agents
   - Investigates code
   - Makes changes
   - Creates PR to develop branch

3. YOU review PR
   - Check diff on phone (GitHub mobile)
   - Approve or request changes

4. PR merges to develop
   - CI/CD deploys to staging
   - @LughDev has the fix

5. YOU test in staging
   - Verify fix works
   - Test edge cases

6. YOU promote to prod
   - Create PR: develop → main
   - Or: /promote command

7. PR merges to main
   - CI/CD deploys to prod
   - @Lugh has the fix

8. USERS get improvement
```

### Promotion Command
```
@LughDev: /promote
Bot: Creating PR from develop → main...
Bot: PR #42 created: https://github.com/...
Bot: Waiting for CI checks...
Bot: ✅ All checks passed. Merge? [Yes] [No]
You: [Yes]
Bot: Merged. Deploying to prod...
Bot: ✅ @Lugh updated with latest changes.
```

---

## Database Setup

```sql
-- Run once on postgres

-- Staging database
CREATE DATABASE staging_lugh;

-- Prod database
CREATE DATABASE prod_lugh;

-- Apply migrations to both
\c staging_lugh
\i migrations/001_initial_schema.sql

\c prod_lugh
\i migrations/001_initial_schema.sql
```

---

## Deployment Commands

### Initial Setup
```bash
# SSH to server
ssh user@your-server

# Clone repo
git clone https://github.com/StreetsDigital/agent-commander lugh
cd lugh

# Create env files
cp .env.example .env.staging
cp .env.example .env.prod
nano .env.staging  # Add staging tokens
nano .env.prod     # Add prod tokens

# Start staging first (creates shared infra)
docker-compose -f docker-compose.staging.yml up -d

# Create databases
docker exec -it lugh-postgres psql -U postgres
CREATE DATABASE staging_lugh;
CREATE DATABASE prod_lugh;
\q

# Run migrations
docker exec -it lugh-staging bun run migrate

# Start prod
docker-compose -f docker-compose.prod.yml up -d
```

### Daily Operations
```bash
# View logs
docker logs -f lugh-staging
docker logs -f lugh-prod

# Restart staging
docker-compose -f docker-compose.staging.yml restart

# Deploy update to staging
cd lugh && git pull origin develop
docker-compose -f docker-compose.staging.yml up -d --build

# Deploy update to prod
cd lugh && git pull origin main
docker-compose -f docker-compose.prod.yml up -d --build
```

---

## Safety Rules

1. **Never test on prod** - Always use @LughDev first
2. **Never force push main** - Only merge via PR
3. **Always verify in staging** - Before promoting
4. **Keep databases separate** - No cross-queries
5. **Feature flags for experimental** - Disabled in prod by default
