# First-Time Lightsail Deployment Setup

This guide walks through setting up the Lugh platform on AWS Lightsail for the first time.

## Prerequisites

- AWS Lightsail instance running (Ubuntu 22.04+ recommended)
- Docker and Docker Compose installed on the instance
- SSH access configured
- GitHub repository secrets configured

## 1. Initial Server Setup

SSH into your Lightsail instance:

```bash
ssh bitnami@<your-lightsail-ip>
```

### Install Docker (if not already installed)

```bash
# Update package index
sudo apt update

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group (avoid sudo for docker commands)
sudo usermod -aG docker $USER

# Install Docker Compose V2
sudo apt install docker-compose-plugin

# Log out and back in for group changes to take effect
exit
```

### Install Git (if not already installed)

```bash
sudo apt install git
```

## 2. Clone Repository

```bash
# Clone the repository
cd ~
git clone https://github.com/StreetsDigital/lugh.git
cd lugh
```

## 3. Create Production Environment File

Create `.env` file with production secrets:

```bash
cd ~/lugh
nano .env
```

Add the following (replace with your actual values):

```env
# Database (will be created by docker-compose)
DATABASE_URL=postgresql://postgres:YOUR_SECURE_PASSWORD@postgres:5432/lugh

# AI Assistants
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
# OR
ANTHROPIC_API_KEY=sk-ant-...

# Platforms
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_from_botfather
TELEGRAM_ALLOWED_USER_IDS=your_telegram_user_id
DISCORD_BOT_TOKEN=your_discord_token
SLACK_BOT_TOKEN=xoxb-your-slack-token
GITHUB_TOKEN=ghp_your_github_token

# Optional: GitHub App credentials
GITHUB_APP_ID=12345
GITHUB_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----...
WEBHOOK_SECRET=your_webhook_secret

# Feature Flags (optional)
BLOCKING_APPROVALS=false
LOAD_BUILTIN_COMMANDS=true

# Observability (optional)
BOT_DISPLAY_NAME=Lugh
VERBOSE_LOGGING=false
```

Save and exit (Ctrl+O, Enter, Ctrl+X).

## 4. Create Necessary Directories

```bash
# Create Lugh home directory structure
mkdir -p ~/.lugh/workspaces
mkdir -p ~/.lugh/worktrees
```

## 5. Initial Deployment

Now the automated deployment workflow will work. Trigger it manually:

```bash
# Pull latest code
git fetch origin
git reset --hard origin/main

# Start services (this is what CI/CD will do)
docker compose --profile with-db up -d --build
```

Wait for services to start (15-30 seconds), then verify:

```bash
# Check container status
docker compose ps

# Check logs
docker compose logs app-with-db

# Test health endpoint
curl http://localhost:3000/health
```

Expected response:

```json
{ "status": "ok", "timestamp": "2025-01-02T..." }
```

## 6. Configure GitHub Secrets

In your GitHub repository, go to Settings → Secrets and variables → Actions, and add:

- `LIGHTSAIL_HOST`: Your Lightsail instance IP address
- `LIGHTSAIL_USER`: SSH username (usually `bitnami` or `ubuntu`)
- `LIGHTSAIL_SSH_KEY`: Private SSH key for authentication
- `TELEGRAM_CHAT_ID`: Your Telegram chat ID (for deploy notifications)
- `TELEGRAM_BOT_TOKEN`: Bot token for deploy notifications (can be same as main bot)

## 7. Test Automated Deployment

Push a commit to `main` branch and watch the GitHub Actions workflow:

```bash
# On your local machine
git commit --allow-empty -m "test: trigger deployment"
git push origin main
```

Monitor the deployment:

- GitHub Actions: https://github.com/StreetsDigital/lugh/actions
- Telegram: You'll receive deploy notifications

## 8. Verify Running Services

```bash
# SSH into server
ssh bitnami@<your-lightsail-ip>

# Check running containers
docker compose ps

# View logs
docker compose logs -f app-with-db

# Test Telegram bot
# Send a message to your bot on Telegram
```

## Troubleshooting

### Docker Compose Fails with "no .env file"

**Solution**: Make sure you created `.env` in `~/lugh/.env` with all required variables.

```bash
cd ~/lugh
ls -la .env  # Should show the file
```

### Health Check Fails

**Solution**: Check logs for startup errors:

```bash
docker compose logs app-with-db
```

Common issues:

- Database connection errors → Check `DATABASE_URL` in `.env`
- Missing credentials → Check `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`

### Port Already in Use

**Solution**: Stop existing services:

```bash
docker compose --profile with-db down
# Or kill specific process
sudo lsof -ti:3000 | xargs kill -9
```

### Permission Denied on Docker Commands

**Solution**: Add user to docker group and re-login:

```bash
sudo usermod -aG docker $USER
exit
# SSH back in
```

## Updating After Initial Setup

Once setup is complete, deployments are automatic:

1. Push to `main` branch
2. GitHub Actions runs tests
3. If tests pass, deploys to Lightsail
4. Sends Telegram notification

Manual deployment:

```bash
cd ~/lugh
git pull origin main
docker compose --profile with-db up -d --build
```

## Monitoring

### View Logs

```bash
# Real-time logs
docker compose logs -f app-with-db

# Last 100 lines
docker compose logs --tail=100 app-with-db
```

### Check Resource Usage

```bash
docker stats
```

### Restart Services

```bash
docker compose --profile with-db restart
```

### Stop Services

```bash
docker compose --profile with-db down
```

### Clean Up (careful!)

```bash
# Remove stopped containers
docker compose down

# Remove images (will rebuild on next start)
docker compose down --rmi all

# Remove volumes (DELETES DATABASE!)
docker compose down -v
```

## Next Steps

- Configure Telegram bot commands with BotFather
- Set up monitoring/alerting (optional)
- Configure backups for PostgreSQL database
- Set up SSL/HTTPS with reverse proxy (nginx/caddy)
