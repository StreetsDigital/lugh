# SaaS Readiness Plan

**Created:** 2025-12-28
**Status:** Planning
**Current State:** Single-developer tool
**Target State:** Multi-tenant SaaS platform

---

## Executive Summary

Lugh is currently designed as a **single-developer tool** with explicit architectural decisions that avoid multi-tenant complexity. Transitioning to SaaS requires addressing **4 critical**, **6 high**, and **8 medium** priority security gaps, plus implementing legal compliance frameworks.

### Key Gaps by Category

| Category | Critical Issues |
|----------|-----------------|
| **Multi-tenancy** | No tenant isolation in database or filesystem |
| **Security** | AI runs with bypass permissions, default-open auth |
| **Compliance** | No GDPR rights implementation, no DPAs |
| **Audit** | No structured audit logging |

---

## Phase 1: Foundation (Critical)

### 1.1 Multi-tenant Database Schema

**Current:** No `owner_id` on any table, no row-level security (RLS)

**Required Changes:**

```sql
-- Migration: Add tenant isolation
ALTER TABLE remote_agent_codebases ADD COLUMN owner_id UUID NOT NULL;
ALTER TABLE remote_agent_conversations ADD COLUMN owner_id UUID NOT NULL;
ALTER TABLE remote_agent_sessions ADD COLUMN owner_id UUID NOT NULL;
ALTER TABLE remote_agent_approvals ADD COLUMN owner_id UUID NOT NULL;

-- Create users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  plan_tier VARCHAR(50) DEFAULT 'free',
  settings JSONB DEFAULT '{}'
);

-- Platform identity linking
CREATE TABLE user_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL, -- 'telegram', 'slack', 'github', 'discord'
  platform_user_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(platform, platform_user_id)
);

-- Row-Level Security
ALTER TABLE remote_agent_codebases ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON remote_agent_codebases
  FOR ALL USING (owner_id = current_setting('app.current_user_id')::uuid);
-- Repeat for all tables
```

**Files to Modify:**
- `migrations/` - Add new migration file
- `src/db/connection.ts` - Set `app.current_user_id` on each request
- All query files in `src/db/` - Add owner_id filters

### 1.2 Per-User Workspace Isolation

**Current:** `~/.lugh/workspaces/` shared globally

**Required Structure:**
```
~/.lugh/
├── users/
│   └── {user_id}/
│       ├── workspaces/
│       │   └── owner/repo/
│       ├── worktrees/
│       │   └── repo/branch/
│       └── config.yaml
```

**Files to Modify:**
- `src/utils/lugh-paths.ts` - Add user-scoped path functions
- `src/isolation/providers/worktree.ts` - Add user context
- `src/handlers/command-handler.ts` - Pass user context

### 1.3 Default-Deny Authentication

**Current:** All platform adapters default to `return true` when whitelist empty

**Required Change:**
```typescript
// src/utils/telegram-auth.ts (and all other *-auth.ts files)
export function isUserAuthorized(userId: number | undefined, allowedIds: number[]): boolean {
  // CHANGE: Default deny for SaaS
  if (allowedIds.length === 0) {
    return false; // Require explicit registration
  }
  // ... existing whitelist check
}
```

**Alternative (SaaS mode):** Implement registration flow:
```typescript
// New: src/services/registration.ts
export async function registerUser(platform: string, platformUserId: string): Promise<User> {
  // 1. Create user record
  // 2. Link platform identity
  // 3. Return user with owner_id
}
```

### 1.4 Remove Permission Bypass (for production)

**Current:** `src/clients/claude.ts:153-154`
```typescript
permissionMode: 'bypassPermissions',
allowDangerouslySkipPermissions: true,
```

**Options:**
1. **Use approval workflow for all tools** - Already exists, make mandatory
2. **Whitelist safe tools** - Define allowed tools per user tier
3. **Sandbox execution** - Run in isolated containers

**Recommendation:** Make `BLOCKING_APPROVALS=true` the default for SaaS, with optional bypass for enterprise self-hosted.

---

## Phase 2: Compliance Implementation

### 2.1 GDPR Data Subject Rights

**Required Endpoints:**

```typescript
// src/api/privacy.ts

// Right to Access (Article 15)
router.get('/api/privacy/export', async (req, res) => {
  const userId = req.user.id;
  const data = {
    conversations: await getConversationsByUser(userId),
    sessions: await getSessionsByUser(userId),
    codebases: await getCodebasesByUser(userId),
    approvals: await getApprovalsByUser(userId),
  };
  res.json(data);
});

// Right to Erasure (Article 17)
router.delete('/api/privacy/data', async (req, res) => {
  const userId = req.user.id;
  await purgeUserData(userId);
  res.json({ success: true });
});
```

**Database Functions:**
```sql
-- Cascade delete for user data
CREATE FUNCTION delete_user_data(p_user_id UUID) RETURNS void AS $$
BEGIN
  DELETE FROM remote_agent_approvals WHERE owner_id = p_user_id;
  DELETE FROM remote_agent_sessions WHERE owner_id = p_user_id;
  DELETE FROM remote_agent_conversations WHERE owner_id = p_user_id;
  DELETE FROM remote_agent_codebases WHERE owner_id = p_user_id;
  DELETE FROM user_identities WHERE user_id = p_user_id;
  DELETE FROM users WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;
```

### 2.2 Data Retention Policy

**Implement in:** `src/services/data-retention.ts`

```typescript
interface RetentionPolicy {
  inactiveSessions: number;  // days
  approvalRecords: number;   // days
  logFiles: number;          // days
}

const DEFAULT_POLICY: RetentionPolicy = {
  inactiveSessions: 90,
  approvalRecords: 365,
  logFiles: 30,
};

export async function enforceRetention(): Promise<void> {
  // Run daily via cron or scheduled job
}
```

### 2.3 Privacy Policy & Terms

**Required Documents:**
- [ ] Privacy Policy (`docs/legal/PRIVACY_POLICY.md`)
- [ ] Terms of Service (`docs/legal/TERMS_OF_SERVICE.md`)
- [ ] Cookie Policy (if applicable)
- [ ] Data Processing Agreement template

**Display Requirements:**
- Show privacy notice on first interaction
- Link to full policy in bot responses
- Require acceptance before first use

### 2.4 Third-Party DPAs

**Required Agreements:**

| Provider | Type | Priority | Contact |
|----------|------|----------|---------|
| Anthropic | DPA for Claude API | HIGH | sales@anthropic.com |
| OpenAI | DPA for Codex API | HIGH | dpa@openai.com |
| Database Host | DPA for PostgreSQL | HIGH | Depends on provider |
| GitHub | Verify Microsoft DPA coverage | MEDIUM | Via enterprise agreement |

---

## Phase 3: Security Hardening

### 3.1 Audit Logging System

**New Table:**
```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  event_type VARCHAR(50) NOT NULL,
  user_id UUID REFERENCES users(id),
  platform VARCHAR(50),
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  action VARCHAR(50) NOT NULL,
  outcome VARCHAR(20) NOT NULL, -- 'success', 'failure', 'denied'
  metadata JSONB,
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_log_event_type ON audit_log(event_type);
```

**Implementation:**
```typescript
// src/utils/audit-logger.ts
export interface AuditEvent {
  eventType: 'auth' | 'access' | 'modify' | 'delete' | 'ai_call';
  userId?: string;
  platform?: string;
  resourceType: string;
  resourceId: string;
  action: string;
  outcome: 'success' | 'failure' | 'denied';
  metadata?: Record<string, unknown>;
}

export async function logAudit(event: AuditEvent): Promise<void> {
  // Insert to audit_log table
  // Consider async queue for performance
}
```

**Events to Log:**
- [ ] Authentication attempts (success/failure)
- [ ] Conversation access
- [ ] Command execution
- [ ] AI API calls (anonymized)
- [ ] Data exports
- [ ] Data deletions
- [ ] Admin actions

### 3.2 Rate Limiting

**Middleware:**
```typescript
// src/middleware/rate-limit.ts
import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // per user/IP
  message: 'Too many requests, please try again later.',
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // AI calls per minute
  message: 'AI rate limit exceeded.',
});
```

**Apply to:**
- [ ] `/test/*` endpoints (or disable in production)
- [ ] All message handlers
- [ ] Per-user quotas for AI API calls

### 3.3 Secure Test Endpoints

**Option 1:** Disable in production
```typescript
if (process.env.NODE_ENV !== 'development') {
  // Don't register /test/* routes
}
```

**Option 2:** Add authentication
```typescript
router.use('/test', requireAuth);
```

### 3.4 Encryption Requirements

| Layer | Requirement | Implementation |
|-------|-------------|----------------|
| Database at rest | Enable PostgreSQL encryption | Cloud provider setting |
| Database in transit | Require SSL | `?sslmode=require` in DATABASE_URL |
| File storage | Encrypt worktrees | LUKS or cloud provider encryption |
| API in transit | HTTPS only | Nginx/cloud load balancer SSL termination |
| Secrets | Use secrets manager | AWS Secrets Manager / HashiCorp Vault |

---

## Phase 4: SOC 2 Preparation

### 4.1 Security Policies (Documentation)

- [ ] Access Control Policy
- [ ] Data Classification Policy
- [ ] Incident Response Playbook
- [ ] Change Management Process
- [ ] Vendor Management Program
- [ ] Business Continuity Plan

### 4.2 Access Management

**Migrate from env vars to database:**
```sql
CREATE TABLE access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  role VARCHAR(50) NOT NULL, -- 'admin', 'user', 'readonly'
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  revoked_at TIMESTAMP
);
```

### 4.3 Monitoring & Alerting

- [ ] Application metrics (Prometheus/Datadog)
- [ ] Error tracking (Sentry)
- [ ] Uptime monitoring
- [ ] Security alerts (failed auth spikes, unusual patterns)
- [ ] Cost monitoring (AI API spend)

### 4.4 Backup & Recovery

- [ ] Database backup schedule (daily)
- [ ] Backup encryption
- [ ] Recovery testing (quarterly)
- [ ] Disaster recovery procedure

---

## Implementation Timeline

| Phase | Scope | Dependency |
|-------|-------|------------|
| **Phase 1** | Multi-tenancy, Auth, DB Schema | None |
| **Phase 2** | GDPR endpoints, Privacy Policy, DPAs | Phase 1 |
| **Phase 3** | Audit logging, Rate limiting, Encryption | Phase 1 |
| **Phase 4** | SOC 2 policies, Monitoring, Backup | Phases 1-3 |

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/api/privacy.ts` | GDPR endpoints |
| `src/services/data-retention.ts` | Retention enforcement |
| `src/services/registration.ts` | User registration flow |
| `src/utils/audit-logger.ts` | Audit logging |
| `src/middleware/rate-limit.ts` | Rate limiting |
| `migrations/XXX_multi_tenant.sql` | Schema changes |
| `docs/legal/PRIVACY_POLICY.md` | Privacy policy |
| `docs/legal/TERMS_OF_SERVICE.md` | Terms of service |

---

## Architecture Decision: Self-Hosted vs Fully Managed

### Option A: Keep Self-Hosted + Add SaaS Tier

```
┌─────────────────────────────────────────────────────────────┐
│                        Lugh Platform                        │
├─────────────────────────────────────────────────────────────┤
│  Self-Hosted (Current)     │  SaaS (New)                   │
│  ─────────────────────     │  ────────                     │
│  • Single tenant           │  • Multi-tenant               │
│  • Bypass permissions OK   │  • Approval workflow required │
│  • User manages keys       │  • Platform-managed keys      │
│  • No compliance burden    │  • Full GDPR/SOC 2            │
└─────────────────────────────────────────────────────────────┘
```

**Advantages:**
- Keep existing users happy
- Gradual migration path
- Enterprise option for security-conscious orgs

### Option B: Full SaaS Only

- Simpler codebase
- Consistent security model
- Higher compliance cost

**Recommendation:** Option A - Add SaaS tier while keeping self-hosted option. Use environment variable (`DEPLOYMENT_MODE=saas|selfhosted`) to toggle behavior.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data breach | Medium | High | Encryption, access controls, audit logging |
| GDPR fine | Medium | High | Implement data subject rights, DPAs |
| AI abuse | High | Medium | Rate limiting, approval workflow |
| Cost explosion | Medium | Medium | Per-user quotas, spend alerts |
| Availability issues | Low | Medium | Monitoring, backup, auto-scaling |

---

## References

- **Security Audit:** `docs/audits/2025-12-28-security-privacy.md`
- **Compliance Audit:** `docs/audits/2025-12-28-privacy-police.md`
- **GDPR Official Text:** https://gdpr-info.eu/
- **CCPA Official Text:** https://oag.ca.gov/privacy/ccpa
- **SOC 2 Overview:** https://www.aicpa.org/soc2
- **EU AI Act:** https://artificialintelligenceact.eu/
