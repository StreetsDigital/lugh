# GitHub Secrets Setup

The deployment workflow requires these GitHub Secrets to be configured.

## Required Secrets

Go to: **Settings → Secrets and variables → Actions → New repository secret**

### SSH Access Secrets

| Secret Name         | Description                    | Example                                                                               |
| ------------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| `LIGHTSAIL_HOST`    | Server IP or hostname          | `54.123.45.67`                                                                        |
| `LIGHTSAIL_USER`    | SSH username                   | `bitnami` or `ubuntu`                                                                 |
| `LIGHTSAIL_SSH_KEY` | Private SSH key (full content) | `-----BEGIN OPENSSH PRIVATE KEY-----`<br>`...`<br>`-----END OPENSSH PRIVATE KEY-----` |

### Application Secrets

| Secret Name                 | Description                       | Where to Get                                                  |
| --------------------------- | --------------------------------- | ------------------------------------------------------------- |
| `CLAUDE_CODE_OAUTH_TOKEN`   | Claude OAuth token                | From your `.env.prod` file or Claude Max subscription         |
| `TELEGRAM_BOT_TOKEN`        | Production Telegram bot token     | From @BotFather after creating bot                            |
| `TELEGRAM_ALLOWED_USER_IDS` | Comma-separated Telegram user IDs | Your Telegram user ID (send message to @userinfobot)          |
| `GH_TOKEN`                  | GitHub Personal Access Token      | GitHub Settings → Developer settings → Personal access tokens |
| `WEBHOOK_SECRET`            | GitHub webhook secret             | Random string (e.g., `openssl rand -hex 32`)                  |
| `GITHUB_ALLOWED_USERS`      | Comma-separated GitHub usernames  | e.g., `streetsdigital,octocat`                                |

### Notification Secrets

| Secret Name        | Description                                      | Where to Get                 |
| ------------------ | ------------------------------------------------ | ---------------------------- |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID (for deploy notifications) | Send message to @userinfobot |

## Getting Your Telegram User ID

1. Open Telegram
2. Search for `@userinfobot`
3. Send `/start`
4. Bot will reply with your user ID (e.g., `821748830`)
5. Use this for both `TELEGRAM_ALLOWED_USER_IDS` and `TELEGRAM_CHAT_ID`

## Getting Your GitHub Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Name: `Lugh Production`
4. Expiration: Choose your preferred expiration
5. Scopes: Select:
   - `repo` (full control)
   - `workflow` (update GitHub Actions workflows)
6. Click "Generate token"
7. Copy the token (starts with `ghp_` or `github_pat_`)
8. Use for `GH_TOKEN` secret

## Creating Your Production Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Send `/newbot`
3. Follow prompts:
   - Bot name: `Lugh` (or your preferred name)
   - Username: `Lugh_bot` (or available username ending in `_bot`)
4. BotFather will give you a token like: `8054824735:AAHGyYqoJ5ZQLFdTEn4tuZKfYrdQHHyMS9U`
5. Use this token for `TELEGRAM_BOT_TOKEN` secret

## Getting Your Lightsail SSH Key

If you don't have SSH access set up yet:

### Option 1: Use Existing Key Pair

If you created the instance with a key pair:

1. Find your downloaded `.pem` file (e.g., `LightsailDefaultKey.pem`)
2. Copy the **entire content** of the file
3. Paste into `LIGHTSAIL_SSH_KEY` secret

### Option 2: Create New Key Pair

On your local machine:

```bash
# Generate new SSH key pair
ssh-keygen -t rsa -b 4096 -f ~/.ssh/lightsail_lugh

# Copy public key to server (you'll need existing access first)
ssh-copy-id -i ~/.ssh/lightsail_lugh.pub bitnami@<your-server-ip>

# Copy private key content for GitHub Secret
cat ~/.ssh/lightsail_lugh
```

Copy the output and paste into `LIGHTSAIL_SSH_KEY` secret.

## Verification

After adding all secrets, verify they're set:

1. Go to: **Settings → Secrets and variables → Actions**
2. You should see all required secrets listed
3. Click on each to verify (GitHub masks the values)

## Testing the Deployment

Once all secrets are configured:

1. Push a commit to `main` branch
2. Go to **Actions** tab
3. Watch the "Deploy to Lightsail" workflow
4. Check for successful deployment
5. You should receive a Telegram notification

## Troubleshooting

### "Error: Process completed with exit code 1"

- Check the workflow logs for specific error messages
- Common issues:
  - Missing secret (check all secrets are set)
  - Invalid SSH key format (should include BEGIN/END markers)
  - Wrong server IP or username
  - Firewall blocking SSH access (port 22)

### "SSH Connection Failed"

- Verify `LIGHTSAIL_HOST` is correct (server IP or hostname)
- Verify `LIGHTSAIL_USER` is correct (`bitnami` for Bitnami, `ubuntu` for Ubuntu)
- Verify `LIGHTSAIL_SSH_KEY` contains the **full private key** including:
  ```
  -----BEGIN OPENSSH PRIVATE KEY-----
  ...
  -----END OPENSSH PRIVATE KEY-----
  ```

### "Telegram Notification Not Sent"

- Verify `TELEGRAM_CHAT_ID` is your user ID (not the bot token)
- Verify you've sent at least one message to your bot (so it knows your chat)
- Check GitHub Actions logs for Telegram API errors

## Security Best Practices

1. ✅ Use unique tokens for production vs staging bots
2. ✅ Rotate tokens periodically (especially GitHub PAT)
3. ✅ Use principle of least privilege (minimal token scopes)
4. ✅ Never commit secrets to git (use .gitignore for .env files)
5. ✅ Restrict bot access to specific user IDs
6. ✅ Enable 2FA on GitHub account
7. ✅ Review GitHub Actions logs for security issues

## Next Steps

After configuring secrets:

1. ✅ Push a test commit to trigger deployment
2. ✅ Verify services start successfully
3. ✅ Send a message to your Telegram bot to test
4. ✅ Check application logs: `docker compose logs -f app-with-db`
