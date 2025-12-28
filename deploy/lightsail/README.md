# Lightsail Deployment Guide

Deploy Lugh (Remote Agentic Coding Platform) to AWS Lightsail.

## Prerequisites

- AWS Lightsail instance (Bitnami base image recommended)
- SSH access to your instance
- Domain name (optional, for HTTPS)

## Quick Start

### 1. SSH into your Lightsail instance

```bash
ssh -i your-key.pem bitnami@<your-instance-ip>
```

### 2. Run the deployment script

**Option A: One-liner (installs everything)**
```bash
curl -sL https://raw.githubusercontent.com/StreetsDigital/makewithLugh/main/deploy/lightsail/deploy.sh | bash
```

**Option B: Manual clone and run**
```bash
git clone https://github.com/StreetsDigital/makewithLugh.git
cd makewithLugh
chmod +x deploy/lightsail/deploy.sh
./deploy/lightsail/deploy.sh
```

### 3. Configure environment

Edit `.env` with your credentials:
```bash
nano ~/makewithLugh/.env
```

Required settings:
- `DATABASE_URL` - PostgreSQL connection string (or use included Postgres)
- `CLAUDE_CODE_OAUTH_TOKEN` - Get from `claude setup-token`
- `TELEGRAM_BOT_TOKEN` - Get from @BotFather on Telegram

### 4. Start the application

```bash
cd ~/makewithLugh
docker compose --profile with-db up -d
```

## Management Commands

```bash
# View logs
docker compose --profile with-db logs -f

# Restart services
docker compose --profile with-db restart

# Stop all services
docker compose --profile with-db down

# Update to latest version
git pull origin main && docker compose --profile with-db up -d --build
```

## Firewall Setup

Open port 3000 in your Lightsail instance networking:
1. Go to AWS Lightsail Console
2. Click on your instance
3. Go to "Networking" tab
4. Add custom TCP rule for port 3000

For production, use Caddy (port 443) instead:
```bash
docker compose -f docker-compose.yml -f docker-compose.cloud.yml --profile external-db up -d
```

## Troubleshooting

### Docker permission denied
```bash
sudo usermod -aG docker $USER
# Then log out and back in
```

### Database connection failed
Ensure PostgreSQL is healthy:
```bash
docker compose --profile with-db ps
docker compose --profile with-db logs postgres
```

### Application not responding
Check app logs:
```bash
docker compose --profile with-db logs app-with-db
```
