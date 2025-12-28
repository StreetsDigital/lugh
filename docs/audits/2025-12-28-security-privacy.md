# SaaS Security & Compliance Audit Report

**Project:** makewithLugh (Remote Agentic Coding Platform)  
**Audit Date:** 2025-12-28  
**Auditor:** Security & Privacy Agent  
**Scope:** src/adapters/, src/db/, src/orchestrator/, src/handlers/, migrations/

---

## Executive Summary

This codebase is currently designed as a **single-developer tool** and is NOT suitable for SaaS deployment without significant security enhancements. The architecture explicitly avoids multi-tenant complexity, which creates substantial gaps for shared service deployment.

| Risk Level | Count | Summary |
|------------|-------|---------|
| CRITICAL | 4 | Showstoppers for SaaS |
| HIGH | 6 | Significant security gaps |
| MEDIUM | 8 | Recommended improvements |
| LOW | 4 | Best practice suggestions |

---

## 1. Current Security Posture

### 1.1 Secrets & Credentials Handling

**Location:** Environment variables loaded via `dotenv/config`

**Findings:**

| Finding | Severity | File |
|---------|----------|------|
| All secrets stored in environment variables | OK | `src/index.ts:6-8` |
| No secrets in database or code | OK | N/A |
| OAuth tokens passed to AI SDK via env | MEDIUM | `src/clients/claude.ts:143-152` |
| GitHub token embedded in git clone URLs | HIGH | `src/adapters/github.ts:358-359` |
| Webhook secret partially logged | LOW | `src/adapters/github.ts:78` |

**Code Reference - GitHub Token Exposure:**
```typescript
// src/adapters/github.ts:354-364
const ghToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
const repoUrl = `https://github.com/${owner}/${repo}.git`;
let cloneCommand = `git clone ${repoUrl} ${repoPath}`;

if (ghToken) {
  const authenticatedUrl = `https://${ghToken}@github.com/${owner}/${repo}.git`;
  cloneCommand = `git clone ${authenticatedUrl} ${repoPath}`;  // Token in URL!
}
```
**Risk:** Token may appear in process listings, git config, or error messages.

### 1.2 Authentication & Authorization

**Findings:**

| Platform | Auth Method | Default | File |
|----------|-------------|---------|------|
| Telegram | Whitelist (user IDs) | OPEN ACCESS | `src/utils/telegram-auth.ts:29-41` |
| Discord | Whitelist (user IDs) | OPEN ACCESS | `src/utils/discord-auth.ts:26-38` |
| Slack | Whitelist (user IDs) | OPEN ACCESS | `src/utils/slack-auth.ts:27-37` |
| GitHub | Whitelist (usernames) + HMAC webhook | OPEN ACCESS | `src/utils/github-auth.ts:28-44` |
| Test Adapter | No authentication | FULLY OPEN | `src/adapters/test.ts` |

**Critical Issue - Default Open Access:**
```typescript
// src/utils/telegram-auth.ts:29-33
export function isUserAuthorized(userId: number | undefined, allowedIds: number[]): boolean {
  // Open access mode - no whitelist configured
  if (allowedIds.length === 0) {
    return true;  // ANYONE CAN USE THE BOT
  }
```

**Severity:** HIGH - Without explicit whitelist configuration, any user can interact with the bot and execute code.

### 1.3 Data Storage & Access

**Database:** PostgreSQL with `pg` driver using parameterized queries (SQL injection protected)

**Findings:**

| Finding | Severity | File |
|---------|----------|------|
| Parameterized queries used consistently | OK | `src/db/*.ts` |
| No row-level security (RLS) | CRITICAL | `migrations/000_combined.sql` |
| No tenant isolation column | CRITICAL | All tables |
| Connection string from env (no rotation) | MEDIUM | `src/db/connection.ts:6-7` |
| Pool error exits process | OK | `src/db/connection.ts:15-19` |

### 1.4 Audit Logging

**Current State:** Minimal - console.log only

| Logged | Not Logged |
|--------|-----------|
| Message receipt (platform, ID) | User identity details |
| Tool executions (tool name) | Full tool inputs/outputs |
| Session start/end | Failed auth attempts |
| Clone/worktree operations | Data access patterns |

**Missing for Compliance:**
- No structured audit log table
- No immutable audit trail
- No log shipping to secure storage
- Verbose mode logs potentially sensitive prompts

---

## 2. Multi-tenancy Gaps

### 2.1 Database Schema (CRITICAL)

**File:** `migrations/000_combined.sql`

**Issues:**
1. **No tenant/user_id column** - All data shared globally
2. **No row-level security policies** - Any query sees all data
3. **Platform conversation ID is unique per platform** - Collision risk if same ID on different deployments

```sql
-- Current schema has no isolation
CREATE TABLE remote_agent_codebases (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  -- NO owner_id, NO tenant_id, NO user_id
);
```

**Required for SaaS:**
```sql
-- Would need:
ALTER TABLE remote_agent_codebases ADD COLUMN owner_id UUID NOT NULL;
ALTER TABLE remote_agent_conversations ADD COLUMN owner_id UUID NOT NULL;
CREATE POLICY tenant_isolation ON remote_agent_codebases
  FOR ALL USING (owner_id = current_setting('app.current_user_id')::uuid);
```

### 2.2 File Storage Isolation (CRITICAL)

**Files:** `src/utils/lugh-paths.ts`, `src/isolation/providers/worktree.ts`

**Current Structure:**
```
~/.lugh/
├── workspaces/owner/repo/    # Cloned repos
└── worktrees/owner/repo/     # Git worktrees
```

**Issues:**
1. Single namespace for all users
2. No per-user directory isolation
3. AI has access to all cloned repos in workspace
4. Path traversal protection exists but applies to single workspace root

**Code Reference:**
```typescript
// src/utils/path-validation.ts:20-24
export function isPathWithinWorkspace(targetPath: string, basePath?: string): boolean {
  const workspaceRoot = getWorkspaceRoot();  // Single global root
  const effectiveBase = basePath ?? workspaceRoot;
  const resolvedTarget = resolve(effectiveBase, targetPath);
  return resolvedTarget === workspaceRoot || resolvedTarget.startsWith(workspaceRoot + sep);
}
```

### 2.3 Session Isolation

**File:** `src/db/sessions.ts`

**Issues:**
1. Sessions linked to conversation, not user
2. No session ownership verification
3. Assistant session IDs stored as plain strings

### 2.4 API Endpoint Protection

**File:** `src/index.ts`

**Unprotected Endpoints:**
| Endpoint | Auth | Risk |
|----------|------|------|
| `GET /health` | None | OK (public) |
| `GET /health/db` | None | LOW (info disclosure) |
| `GET /health/concurrency` | None | MEDIUM (operational info) |
| `POST /test/message` | None | HIGH (can trigger AI) |
| `GET /test/messages/:id` | None | HIGH (can read responses) |
| `POST /test/mock-approval` | None | MEDIUM (test data) |

---

## 3. Compliance Concerns

### 3.1 Personal Data Handling

**Data Collected:**
| Data Type | Storage | Retention |
|-----------|---------|-----------|
| Platform user IDs | In memory only | Session lifetime |
| Conversation content | Not stored | N/A |
| Tool inputs | Database (approvals table) | Indefinite |
| File paths accessed | Logs only | Log rotation |
| Session metadata | Database | Indefinite |

**GDPR Concerns:**
1. No data subject access request (DSAR) support
2. No right-to-deletion implementation
3. Tool inputs in `remote_agent_approvals.tool_input` may contain PII
4. No consent mechanism for data processing

### 3.2 Data Retention Policies

**Current State:** No retention policies implemented

```sql
-- remote_agent_approvals keeps all tool executions indefinitely
-- No automatic cleanup of old sessions
-- last_activity_at used for staleness but not deletion
```

### 3.3 Encryption Status

| Layer | Encrypted | Notes |
|-------|-----------|-------|
| Database at rest | NO* | Depends on Postgres config |
| Database in transit | DEPENDS | If DATABASE_URL uses SSL |
| Redis in transit | NO | Default redis:// URL |
| File storage at rest | NO | Plain filesystem |
| API in transit | DEPENDS | If behind HTTPS proxy |

*Docker compose uses unencrypted local connection

### 3.4 Logging of Sensitive Data

**File:** `src/utils/logger.ts`

```typescript
// Verbose mode logs full prompts (may contain secrets, PII)
export function logPrompt(prompt: string): void {
  if (!verboseEnabled) return;
  // ... logs full prompt content
  console.log(prompt.length > 5000 ? prompt.substring(0, 5000) + '...' : prompt);
}
```

**Risk:** If verbose logging enabled in production, prompts containing user data, API keys, or sensitive code may be logged.

---

## 4. AI/LLM Specific Risks

### 4.1 API Key Handling

**File:** `src/clients/claude.ts:119-124`

```typescript
const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
if (!oauthToken && !apiKey) {
  throw new Error('No credentials found...');
}
```

**Issues:**
1. Single set of credentials for all users (no per-user API keys)
2. OAuth token not rotated automatically
3. Credentials passed in env to child processes

**Critical Configuration:**
```typescript
// src/clients/claude.ts:153-154
permissionMode: 'bypassPermissions',  // CRITICAL: AI can execute any tool
allowDangerouslySkipPermissions: true,
```

**Risk:** AI has unrestricted file and command execution capabilities.

### 4.2 Prompt Injection Risks

**Locations:**
1. **User messages** - Direct input to AI
2. **GitHub issue/PR bodies** - Parsed and sent to AI
3. **Thread context** - Accumulated messages sent as context
4. **Command templates** - User-defined with variable substitution

**Code Reference:**
```typescript
// src/orchestrator/orchestrator.ts:740-742
if (threadContext) {
  promptToSend = `## Thread Context (previous messages)\n\n${threadContext}\n\n---\n\n## Current Request\n\n${promptToSend}`;
}
```

**Risk:** Malicious content in thread history could manipulate AI behavior.

### 4.3 Data Leakage Through AI Responses

**Concerns:**
1. AI has access to all files in working directory
2. AI can read any file via `Read` tool
3. No content filtering on AI outputs
4. `.env` files blocked from auto-send but AI can still read them

**Blocked Patterns (partial protection):**
```typescript
// src/orchestrator/orchestrator.ts:143
/\.env$/,           // Actual .env files
/\.env\.local$/,
```

### 4.4 Session/Conversation Privacy

**Issues:**
1. Sessions tied to conversation, not authenticated user
2. If conversation ID is predictable, sessions could be hijacked
3. No session expiration beyond inactivity-based staleness

---

## 5. Security Recommendations

### CRITICAL (Must Fix for SaaS)

1. **Add Multi-tenant Support**
   - Add `owner_id` to all tables
   - Implement row-level security
   - Per-user workspace directories

2. **Remove Bypass Permissions**
   - Use approval workflow for all tool executions
   - Implement proper permission scopes

3. **Secure Test Endpoints**
   - Add authentication to `/test/*` endpoints
   - Disable in production

4. **Change Default Auth to Deny**
   - Require explicit whitelist configuration
   - Fail closed, not open

### HIGH Priority

5. **Rate Limiting**
   - Add rate limits per user/IP
   - Protect against abuse

6. **Audit Logging**
   - Implement structured audit log table
   - Log all sensitive operations

7. **Secret Management**
   - Use secret manager (AWS Secrets Manager, Vault)
   - Rotate credentials automatically

8. **Input Validation**
   - Sanitize GitHub issue/PR content
   - Limit prompt sizes

### MEDIUM Priority

9. **Encryption at Rest**
   - Enable PostgreSQL encryption
   - Encrypt file storage

10. **HTTPS Enforcement**
    - Add SSL termination
    - Enforce HTTPS redirects

11. **Data Retention**
    - Implement automatic cleanup
    - Add retention period configuration

12. **CSRF Protection**
    - Add CSRF tokens for webhook endpoints

---

## 6. Compliance Checklist

| Requirement | Status | Gap |
|-------------|--------|-----|
| **GDPR** | | |
| Lawful basis for processing | MISSING | No consent mechanism |
| Data minimization | PARTIAL | Tool inputs may contain excess data |
| Right to access | MISSING | No DSAR support |
| Right to deletion | MISSING | No deletion mechanism |
| Data portability | MISSING | No export functionality |
| **SOC 2** | | |
| Access controls | PARTIAL | Auth exists but defaults open |
| Audit logging | MISSING | No structured audit trail |
| Encryption | MISSING | No encryption at rest |
| Incident response | MISSING | No alerting or procedures |
| **HIPAA** | | |
| PHI handling | NOT APPLICABLE | Unless used with healthcare data |
| BAA requirements | NOT APPLICABLE | N/A |

---

## 7. Files Analyzed

| File Path | Purpose |
|-----------|---------|
| `/home/user/makewithLugh/src/index.ts` | Main entry point, endpoint definitions |
| `/home/user/makewithLugh/src/adapters/telegram.ts` | Telegram adapter with auth |
| `/home/user/makewithLugh/src/adapters/github.ts` | GitHub webhook handler |
| `/home/user/makewithLugh/src/adapters/discord.ts` | Discord adapter |
| `/home/user/makewithLugh/src/adapters/slack.ts` | Slack adapter |
| `/home/user/makewithLugh/src/db/connection.ts` | Database pool config |
| `/home/user/makewithLugh/src/db/sessions.ts` | Session operations |
| `/home/user/makewithLugh/src/db/conversations.ts` | Conversation operations |
| `/home/user/makewithLugh/src/db/approvals.ts` | Approval workflow |
| `/home/user/makewithLugh/src/orchestrator/orchestrator.ts` | AI conversation management |
| `/home/user/makewithLugh/src/clients/claude.ts` | Claude SDK integration |
| `/home/user/makewithLugh/src/utils/telegram-auth.ts` | Telegram auth utilities |
| `/home/user/makewithLugh/src/utils/github-auth.ts` | GitHub auth utilities |
| `/home/user/makewithLugh/src/utils/slack-auth.ts` | Slack auth utilities |
| `/home/user/makewithLugh/src/utils/discord-auth.ts` | Discord auth utilities |
| `/home/user/makewithLugh/src/utils/path-validation.ts` | Path traversal protection |
| `/home/user/makewithLugh/src/utils/logger.ts` | Logging utilities |
| `/home/user/makewithLugh/src/redis/client.ts` | Redis client |
| `/home/user/makewithLugh/migrations/000_combined.sql` | Database schema |
| `/home/user/makewithLugh/docker-compose.yml` | Container configuration |

---

## 8. Conclusion

This codebase is well-designed for its intended purpose as a **single-developer tool** but requires significant security enhancements for SaaS deployment:

1. **Multi-tenancy** is the biggest gap - the entire architecture assumes single ownership
2. **AI permission bypass** is a deliberate design choice that increases risk
3. **Authentication** exists but defaults to open access
4. **No audit trail** makes compliance and forensics difficult

**Recommendation:** Before SaaS deployment, conduct a dedicated security sprint to address CRITICAL and HIGH issues. Consider a security architecture review to properly design multi-tenant isolation.

---

*Report generated by Security & Privacy Audit Agent*
