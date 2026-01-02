# SaaS Legal Compliance Requirements Audit

**Audit Date:** 2025-12-28  
**Auditor:** Privacy Police Agent  
**Platform:** Lugh - Remote Agentic Coding Platform  
**Codebase:** /home/user/makewithLugh

---

## Executive Summary

This audit researches and documents the legal compliance requirements for the Lugh platform - a remote agentic coding platform that:

- Stores conversation history in PostgreSQL
- Processes code repositories (cloned repositories, git worktrees)
- Integrates with GitHub, Slack, Telegram, Discord
- Uses AI APIs (Anthropic Claude, OpenAI Codex)

The audit identifies actionable requirements across GDPR, CCPA/CPRA, SOC 2 Type II, AI regulations, and third-party data processing.

---

## 1. GDPR Requirements

### 1.1 Personal Data Categories in Lugh

Based on codebase analysis, Lugh processes the following personal data:

| Data Type           | Location                                              | GDPR Category          |
| ------------------- | ----------------------------------------------------- | ---------------------- |
| Platform User IDs   | `remote_agent_conversations.platform_conversation_id` | Identifier             |
| Chat/Thread IDs     | `remote_agent_conversations.platform_conversation_id` | Communication metadata |
| Session History     | `remote_agent_sessions.metadata` (JSONB)              | Behavioral data        |
| Repository URLs     | `remote_agent_codebases.repository_url`               | Professional data      |
| Working Directories | `remote_agent_conversations.cwd`                      | Technical identifiers  |
| Approval Records    | `remote_agent_approvals` table                        | Authorization history  |
| Git Author Info     | Extracted from git operations                         | Professional identity  |

### 1.2 Legal Basis Requirements

**Actionable Requirements:**

1. **Consent Management**
   - [ ] Implement consent collection before first use on each platform
   - [ ] Store consent records with timestamps
   - [ ] Provide mechanism to withdraw consent
   - [ ] Document consent for AI API data processing

2. **Legitimate Interest Assessment**
   - [ ] Document legitimate interest for core functionality
   - [ ] Conduct Legitimate Interest Assessment (LIA) for analytics
   - [ ] Balance test: user expectations vs. platform needs

3. **Contract Performance**
   - [ ] Terms of Service defining data processing scope
   - [ ] Privacy Policy accessible before first interaction

### 1.3 Data Subject Rights Implementation

**Required Features:**

```typescript
// Suggested API endpoints for GDPR compliance
// File: src/api/privacy.ts

// Right to Access (Article 15)
GET /api/privacy/data-export/:userId
// Returns all personal data in machine-readable format (JSON)

// Right to Erasure (Article 17)
DELETE /api/privacy/data/:userId
// Deletes all user data, conversations, sessions

// Right to Rectification (Article 16)
PATCH /api/privacy/data/:userId
// Updates incorrect personal data

// Right to Data Portability (Article 20)
GET /api/privacy/data-export/:userId?format=json
// Exports data in portable format
```

**Current Gap Analysis:**

| Right         | Current Status                                 | Implementation Needed          |
| ------------- | ---------------------------------------------- | ------------------------------ |
| Access        | NOT IMPLEMENTED                                | Add data export endpoint       |
| Erasure       | PARTIAL (cleanup-service.ts handles worktrees) | Add user data deletion cascade |
| Rectification | NOT IMPLEMENTED                                | Add data update capability     |
| Portability   | NOT IMPLEMENTED                                | Add JSON/CSV export            |
| Restriction   | NOT IMPLEMENTED                                | Add processing pause flag      |
| Objection     | NOT IMPLEMENTED                                | Add opt-out mechanism          |

### 1.4 Data Retention Policy Requirements

**Recommended Retention Periods:**

| Data Type            | Retention Period            | Justification                 |
| -------------------- | --------------------------- | ----------------------------- |
| Active Conversations | Until user deletion request | Operational necessity         |
| Inactive Sessions    | 90 days                     | Reasonable operational window |
| Approval Records     | 12 months                   | Audit trail requirement       |
| Log Files            | 30 days                     | Security investigation        |
| Error Logs (no PII)  | 12 months                   | Debugging purposes            |

**Current Implementation:** `/home/user/makewithLugh/src/services/cleanup-service.ts`

- Stale threshold: 14 days (configurable via `STALE_THRESHOLD_DAYS`)
- Currently cleans up isolation environments, NOT user data

**Required Changes:**

```typescript
// Add to cleanup-service.ts or new file: src/services/data-retention.ts

export async function purgeUserData(userId: string): Promise<void> {
  // 1. Delete from remote_agent_approvals (via session cascade)
  // 2. Delete from remote_agent_sessions
  // 3. Delete from remote_agent_conversations
  // 4. Remove git worktrees with user data
  // 5. Log deletion for audit trail
}

export async function scheduleRetentionCleanup(): Promise<void> {
  // Run daily to purge data past retention period
}
```

### 1.5 Cross-Border Transfer Considerations

**Third-Party AI APIs:**

- Anthropic (Claude): US-based - requires Standard Contractual Clauses (SCCs)
- OpenAI (Codex): US-based - requires SCCs
- GitHub: US-based (Microsoft) - has EU-US Data Privacy Framework certification

**Required Actions:**

- [ ] Execute DPAs with Anthropic and OpenAI
- [ ] Verify GitHub's DPA coverage under Microsoft agreement
- [ ] Document all data flows in Records of Processing Activities (RoPA)

---

## 2. CCPA/CPRA Requirements

### 2.1 Personal Information Under CCPA

In the context of Lugh, the following constitutes "personal information":

| Category          | Examples in Lugh                                 | CCPA Category |
| ----------------- | ------------------------------------------------ | ------------- |
| Identifiers       | Telegram user IDs, GitHub usernames, Discord IDs | Category A    |
| Internet Activity | Conversation history, command usage              | Category F    |
| Professional Info | Repository URLs, code contributions              | Category D    |
| Inferences        | AI session metadata, usage patterns              | Category K    |

### 2.2 Consumer Rights Implementation

**Required Features:**

1. **Right to Know**
   - [ ] Disclosure at collection (privacy notice)
   - [ ] Request mechanism (30-day response window)
   - [ ] Verification process for requests

2. **Right to Delete**
   - [ ] Delete endpoint similar to GDPR
   - [ ] Notify service providers to delete
   - [ ] Document exceptions (legal holds, security)

3. **Right to Opt-Out of Sale/Sharing**
   - [ ] Determine if Lugh "sells" or "shares" data
   - [ ] If yes: implement "Do Not Sell My Personal Information" link
   - [ ] Global Privacy Control (GPC) signal detection

### 2.3 Sale/Sharing Analysis for Lugh

**Current Analysis:**

- Lugh sends conversation data to Anthropic/OpenAI APIs
- This is **processing**, not **sale** (no monetary exchange)
- May constitute **sharing** if AI providers use data for their purposes

**Recommendation:**

- [ ] Review Anthropic and OpenAI terms for data usage rights
- [ ] If providers retain/use data: implement opt-out mechanism
- [ ] Document in privacy policy as "service provider" relationship

### 2.4 Notice Requirements

**Required Privacy Policy Disclosures:**

```markdown
## Categories of Personal Information Collected

- Identifiers (platform user IDs, usernames)
- Internet activity (conversation history)
- Professional information (repository access)

## Business Purposes for Collection

- Providing AI-assisted coding services
- Platform functionality and session management
- Security and access control

## Categories of Third Parties

- AI Service Providers (Anthropic, OpenAI)
- Platform Providers (GitHub, Slack, Telegram, Discord)
- Infrastructure Providers (database hosting)

## Retention Period

- Active data: Duration of account
- Session data: 90 days after inactivity
- Logs: 30 days
```

---

## 3. SOC 2 Type II Considerations

### 3.1 Trust Service Criteria Analysis

#### Security (Common Criteria)

| Control                               | Current Status                         | Gap                     | Priority |
| ------------------------------------- | -------------------------------------- | ----------------------- | -------- |
| CC1.1 - Entity demonstrates integrity | NOT DOCUMENTED                         | Code of conduct needed  | Medium   |
| CC5.1 - Logical access                | PARTIAL - whitelist auth (`*-auth.ts`) | Formalize policies      | High     |
| CC5.2 - Access provisioning           | PARTIAL - env var whitelists           | Access request process  | Medium   |
| CC6.1 - Physical security             | N/A for single-dev                     | Cloud provider controls | Low      |
| CC6.6 - Threat detection              | NOT IMPLEMENTED                        | Add monitoring/alerting | High     |
| CC7.1 - Incident response             | NOT DOCUMENTED                         | Create IR playbook      | High     |

**Current Access Control Implementation:**

- `/home/user/makewithLugh/src/utils/telegram-auth.ts` - User ID whitelist
- `/home/user/makewithLugh/src/utils/github-auth.ts` - Username whitelist
- `/home/user/makewithLugh/src/utils/discord-auth.ts` - User ID whitelist
- `/home/user/makewithLugh/src/utils/slack-auth.ts` - User ID whitelist

**Gap:** No centralized access management, no access review process

#### Availability

| Control                    | Current Status  | Gap                       |
| -------------------------- | --------------- | ------------------------- |
| A1.1 - Capacity management | NOT IMPLEMENTED | Add monitoring            |
| A1.2 - Backup/recovery     | NOT DOCUMENTED  | Database backup procedure |
| A1.3 - Testing recovery    | NOT TESTED      | DR testing schedule       |

**Current Resilience:**

- `MAX_CONCURRENT_CONVERSATIONS` limit (env var, default 10)
- Database connection pooling (`pg` pool)
- Graceful shutdown handling

#### Confidentiality

| Control                           | Current Status            | Gap                        |
| --------------------------------- | ------------------------- | -------------------------- |
| C1.1 - Identify confidential info | PARTIAL                   | Data classification policy |
| C1.2 - Disposal procedures        | PARTIAL (cleanup-service) | Add secure deletion        |

### 3.2 Audit Logging Requirements

**Current Logging Analysis:**

- Basic `console.log` with structured data
- No centralized log aggregation
- No tamper-proof audit trail

**Required Implementation:**

```typescript
// Suggested: src/utils/audit-logger.ts

interface AuditEvent {
  timestamp: string;
  eventType: 'access' | 'modification' | 'deletion' | 'authentication';
  userId: string;
  platformType: string;
  resource: string;
  action: string;
  outcome: 'success' | 'failure';
  metadata?: Record<string, unknown>;
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  // Write to database audit table
  // Or send to centralized logging (e.g., CloudWatch, Datadog)
}
```

**Required Audit Events:**

- [ ] User authentication (success/failure)
- [ ] Access to conversations
- [ ] Command execution
- [ ] Data modification (session create/update/delete)
- [ ] Administrative actions
- [ ] AI API calls (anonymized)

### 3.3 Access Control Improvements

**Current State:**

```env
# From .env.example
TELEGRAM_ALLOWED_USER_IDS=123456789,987654321
DISCORD_ALLOWED_USER_IDS=123456789012345678
GITHUB_ALLOWED_USERS=octocat,monalisa
SLACK_ALLOWED_USER_IDS=U1234ABCD,W5678EFGH
```

**Required Enhancements:**

- [ ] Move access lists to database for dynamic management
- [ ] Implement role-based access (admin, user, read-only)
- [ ] Add access review workflow (quarterly)
- [ ] Session timeout enforcement
- [ ] Failed login attempt tracking

---

## 4. AI-Specific Regulations

### 4.1 EU AI Act Implications

**Risk Classification Analysis:**

Lugh appears to be a **Limited Risk** AI system under EU AI Act:

- Not prohibited (no manipulation, social scoring)
- Not high-risk (not in Annex III categories)
- Has transparency obligations

**Required Transparency Measures:**

1. **Disclosure that AI is being used**

   ```typescript
   // Add to initial platform messages
   const AI_DISCLOSURE = `
   This bot uses AI (Claude/Codex) to process your messages 
   and generate code. Your conversations are processed by 
   third-party AI providers.
   `;
   ```

2. **Clear attribution of AI-generated content**
   - Current: AI responses are streamed directly
   - Recommendation: Consider visual indicators for AI output

### 4.2 Data Processing for AI Training

**Critical Question:** Do Anthropic/OpenAI use customer data for training?

**Current Status:**

- Anthropic API: By default, does NOT train on API data
- OpenAI API: By default, does NOT train on API data (since March 2023)

**Required Actions:**

- [ ] Verify current API terms with both providers
- [ ] Document data processing in privacy policy
- [ ] Implement data minimization (don't send unnecessary context)

**Recommendation for Privacy Policy:**

```markdown
## AI Processing

Your messages are processed by AI services (Anthropic Claude, OpenAI).
These providers do not use API data to train their models per their
current terms of service. We retain your conversation data according
to our retention policy.
```

### 4.3 AI Output Accountability

**Recommendations:**

- [ ] Document that AI outputs are suggestions, not guarantees
- [ ] Implement human review for critical operations (approval workflow exists)
- [ ] Log AI decision points for audit trail

---

## 5. Third-Party Data Processing

### 5.1 Data Processing Agreement Requirements

**Required DPAs:**

| Provider      | Data Processed                | DPA Status                  | Action          |
| ------------- | ----------------------------- | --------------------------- | --------------- |
| Anthropic     | Conversation content, prompts | REQUIRED                    | Execute DPA     |
| OpenAI        | Conversation content, prompts | REQUIRED                    | Execute DPA     |
| GitHub        | Repository access, webhooks   | COVERED by GitHub TOS       | Review scope    |
| Slack         | Message content, user IDs     | COVERED by Slack TOS        | Review scope    |
| Telegram      | Message content, user IDs     | Review Telegram Bot API TOS | Verify coverage |
| Discord       | Message content, user IDs     | COVERED by Discord TOS      | Review scope    |
| Database Host | All database content          | REQUIRED                    | Execute DPA     |

### 5.2 Anthropic DPA Considerations

**Key Terms to Verify:**

- Data processing location (US vs. EU)
- Sub-processor list and notification
- Audit rights
- Incident notification timeline (72 hours for GDPR)
- Data deletion upon termination

**API-Specific Concerns:**

- Prompt caching: Does Anthropic cache prompts?
- Model feedback: Is there any feedback loop?
- Rate limiting logs: What identifiers are logged?

### 5.3 OpenAI DPA Considerations

**Key Terms to Verify:**

- Zero data retention option
- API audit logs retention
- Enterprise vs. consumer terms
- Codex-specific processing terms

### 5.4 Cloud Provider Requirements

For database hosting (assumed PostgreSQL as a service):

**Required Controls:**

- [ ] Encryption at rest (database)
- [ ] Encryption in transit (TLS 1.2+)
- [ ] Access logging
- [ ] Backup encryption
- [ ] Geographic restrictions (if required)

**Current Database Security (from codebase):**

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lugh
```

- Local development uses plain connection
- Production MUST use SSL: `?sslmode=require`

---

## 6. Current Security Gaps (High Priority)

### 6.1 Credential Security

**Finding:** API keys in environment variables only
**Risk:** No rotation, no secrets manager integration
**Recommendation:**

- [ ] Integrate with secrets manager (HashiCorp Vault, AWS Secrets Manager)
- [ ] Implement key rotation schedule
- [ ] Remove default credentials from .env.example

### 6.2 Missing Rate Limiting

**Finding:** No rate limiting on test endpoints
**Risk:** DoS vulnerability, cost explosion on AI APIs
**Location:** `/home/user/makewithLugh/src/index.ts` lines 320-394
**Recommendation:**

- [ ] Add rate limiting middleware
- [ ] Implement per-user quotas

### 6.3 Session Security

**Finding:** No session expiration enforcement
**Risk:** Sessions persist indefinitely
**Location:** `/home/user/makewithLugh/src/db/sessions.ts`
**Recommendation:**

- [ ] Add session timeout (configurable)
- [ ] Implement session invalidation on security events

### 6.4 Logging PII Exposure

**Finding:** Some logs may contain user IDs and conversation content
**Risk:** PII in logs violates data minimization
**Example:**

```typescript
// From src/index.ts line 51
console.log(`[DB] Inheriting context from parent conversation: codebase=${...}`)
```

**Recommendation:**

- [ ] Audit all console.log statements
- [ ] Mask or hash user identifiers in logs
- [ ] Separate operational logs from audit logs

---

## 7. Implementation Roadmap

### Phase 1: Critical Compliance (0-30 days)

1. [ ] Draft Privacy Policy
2. [ ] Draft Terms of Service
3. [ ] Implement data export endpoint (GDPR Article 15)
4. [ ] Implement data deletion endpoint (GDPR Article 17)
5. [ ] Execute DPAs with Anthropic and OpenAI

### Phase 2: Security Hardening (30-60 days)

1. [ ] Add audit logging system
2. [ ] Implement rate limiting
3. [ ] Add session timeout
4. [ ] Mask PII in logs
5. [ ] Add database SSL requirement

### Phase 3: SOC 2 Preparation (60-120 days)

1. [ ] Centralize access management
2. [ ] Document security policies
3. [ ] Implement monitoring/alerting
4. [ ] Create incident response playbook
5. [ ] Establish backup/recovery procedures

### Phase 4: Continuous Compliance

1. [ ] Quarterly access reviews
2. [ ] Annual DPA reviews
3. [ ] Regular security assessments
4. [ ] Privacy impact assessments for new features

---

## 8. Code References

### Key Files for Privacy Implementation

| Purpose          | File Path                                                 |
| ---------------- | --------------------------------------------------------- |
| Access Control   | `/home/user/makewithLugh/src/utils/telegram-auth.ts`      |
| Access Control   | `/home/user/makewithLugh/src/utils/github-auth.ts`        |
| Access Control   | `/home/user/makewithLugh/src/utils/discord-auth.ts`       |
| Access Control   | `/home/user/makewithLugh/src/utils/slack-auth.ts`         |
| Data Storage     | `/home/user/makewithLugh/src/db/conversations.ts`         |
| Data Storage     | `/home/user/makewithLugh/src/db/sessions.ts`              |
| Data Cleanup     | `/home/user/makewithLugh/src/services/cleanup-service.ts` |
| Database Schema  | `/home/user/makewithLugh/migrations/000_combined.sql`     |
| Main Entry       | `/home/user/makewithLugh/src/index.ts`                    |
| Type Definitions | `/home/user/makewithLugh/src/types/index.ts`              |

---

## Appendix A: Privacy Policy Template

```markdown
# Privacy Policy for Lugh

Last Updated: [DATE]

## 1. What We Collect

- Platform identifiers (Telegram user ID, GitHub username, etc.)
- Conversation content and history
- Repository access information
- Session metadata

## 2. How We Use Your Data

- Provide AI-assisted coding services
- Manage sessions and conversations
- Improve service functionality

## 3. Third-Party Processing

Your data is processed by:

- Anthropic (Claude AI)
- OpenAI (Codex)
- Platform providers (GitHub, Slack, Telegram, Discord)

## 4. Your Rights

- Access your data
- Delete your data
- Export your data
- Opt out of processing

## 5. Data Retention

[Define retention periods per data type]

## 6. Contact

[Privacy contact information]
```

---

## Appendix B: Compliance Checklist Summary

### GDPR Checklist

- [ ] Legal basis documented
- [ ] Privacy policy published
- [ ] Data subject rights implemented
- [ ] Data retention policy defined
- [ ] DPAs executed
- [ ] Records of processing activities
- [ ] Data breach procedure documented

### CCPA Checklist

- [ ] Privacy notice at collection
- [ ] Right to know process
- [ ] Right to delete process
- [ ] Sale/sharing assessment
- [ ] Service provider contracts

### SOC 2 Checklist

- [ ] Access control policies
- [ ] Audit logging
- [ ] Incident response plan
- [ ] Change management process
- [ ] Vendor management program

---

**Audit Status:** COMPLETE  
**Next Review:** 2026-06-28 (6 months)
