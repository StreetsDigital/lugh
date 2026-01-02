# Branch Catalog & Work Inventory

**Generated:** 2025-12-31
**Total Branches:** 28 (excluding main/master)

---

## 🟢 ACTIVE / KEEP

### `claude/setup-dev-workstation-r77MO` ⭐ CURRENT

**Last Updated:** 2025-12-31
**Status:** Active development
**Description:** Full stack setup including:

- LangGraph Python service integration
- LLM Proxy for OAuth authentication
- Upstash Redis configuration
- Supabase PostgreSQL setup
- Full-stack deployment scripts
- Dev workflow documentation

**Key Commits:**

- feat: add full-stack deployment script for Lightsail
- feat: LangGraph uses Lugh LLM proxy for OAuth auth
- feat: add local development scripts for full stack
- Merged: LangGraph work from research-ai-projects branch

**TODO Cross-Reference:** INFRA-001 through INFRA-006, DUAL-007

---

### `claude/research-ai-projects-46YPW`

**Last Updated:** 2025-12-31
**Status:** ✅ Merged into setup-dev-workstation
**Description:** LangGraph service implementation

- Python FastAPI service
- Graph-based conversation orchestration
- Redis pub/sub for real-time streaming
- Checkpointing with PostgreSQL

**Action:** Can be deleted (merged)

---

### `master` (main branch)

**Last Updated:** 2025-12-30
**Status:** Production baseline
**Description:** Last stable release (pre-LangGraph)

**Action:** Needs update from setup-dev-workstation branch

---

## 🟡 POTENTIALLY USEFUL (Review Before Delete)

### `claude/autonomous-improvement-agents-VE6JU`

**Last Updated:** 2025-12-29
**Description:** Fire-and-forget background task execution

- `/spawn` command for background tasks
- `/tasks` command to list running tasks

**TODO Cross-Reference:** AGENT-001 through AGENT-007
**Action:** Review - may have useful code for agent pool

---

### `claude/agent-task-distribution-jjdjM`

**Last Updated:** 2025-12-30
**Description:** Dual reasoning strategies (ATOM and Sequential)

- Thinking/reasoning implementations

**TODO Cross-Reference:** AGENT-005 (task distribution)
**Action:** Review - experimental reasoning code

---

### `claude/multi-agent-no-redis-Af1ZK`

**Last Updated:** 2025-12-29
**Description:** Agent pool WITHOUT Redis dependency

- Comprehensive test suite for agent pool
- PostgreSQL-based coordination

**TODO Cross-Reference:** AGENT-001 through AGENT-007
**Action:** Review - tests may be valuable

---

### `claude/multi-agent-framework-jOorj`

**Last Updated:** 2025-12-28
**Description:** CAMEL-style multi-agent framework with debate chains

**TODO Cross-Reference:** AGENT-\* tasks
**Action:** Review - alternative multi-agent approach

---

### `claude/compare-camel-lugh-v0EK3`

**Last Updated:** 2025-12-30
**Description:** CAMEL ecosystem implementation guide

- Comparison documentation
- Implementation patterns

**Action:** Review - documentation may be useful

---

### `claude/telegram-bot-github-links-apLxt`

**Last Updated:** 2025-12-29
**Description:** Clickable GitHub links in Telegram messages

- UX improvement for file references

**TODO Cross-Reference:** POLISH-001, POLISH-002
**Action:** Review - nice UX feature

---

### `claude/setup-redis-lightsail-8l7l2`

**Last Updated:** 2025-12-31
**Description:** Redis service in docker-compose configurations

**Note:** Superseded by Upstash in current branch
**Action:** Can be deleted (superseded)

---

### `claude/langsmith-observability-integration-x2xK8`

**Last Updated:** 2025-12-28
**Description:** FEAT-006 LangSmith observability backlog item

**TODO Cross-Reference:** Could add as KNOW-\* or separate
**Action:** Review - observability planning

---

### `StreetsDigital-mcp-prp`

**Last Updated:** 2025-12-30
**Description:** MCP (Model Context Protocol) planning/research

**TODO Cross-Reference:** MCP-001 through MCP-006
**Action:** Review - MCP planning docs

---

## 🔴 LIKELY STALE (Safe to Delete)

### Rename/Cleanup Branches (COMPLETED)

These were for the Archon → Lugh rename:

| Branch                                        | Date       | Description                      |
| --------------------------------------------- | ---------- | -------------------------------- |
| `claude/fix-remote-agent-conversations-bEs2c` | 2025-12-28 | Archon→Lugh rename in docs       |
| `claude/list-workspaces-lmNla`                | 2025-12-28 | Archon→Lugh rename               |
| `claude/cleanup-add-telegram-mn4xF`           | 2025-12-28 | GitHub integration + branch mgmt |

**TODO Cross-Reference:** RENAME-001 through RENAME-008 (mostly done)
**Action:** Delete - rename work completed

---

### Infrastructure/Setup Branches (SUPERSEDED)

| Branch                                  | Date       | Description                     |
| --------------------------------------- | ---------- | ------------------------------- |
| `claude/deploy-lightsail-xL9HD`         | 2025-12-28 | Auto-tagging safety feature     |
| `claude/start-postgres-container-NqUH3` | 2025-12-29 | Agent-registry test fixes       |
| `claude/start-postgres-container-b1goO` | 2025-12-29 | PostgreSQL pub/sub fixes        |
| `claude/setup-gh-auth-workspaces-PSnaj` | 2025-12-28 | Autonomous agent frameworks ref |
| `claude/clarify-python-porting-PZOOI`   | 2025-12-28 | Port 5434 for prod postgres     |

**Action:** Delete - superseded by current setup work

---

### Documentation/Research Branches

| Branch                                      | Date       | Description                     |
| ------------------------------------------- | ---------- | ------------------------------- |
| `claude/add-file-process-visibility-7pQDS`  | 2025-12-28 | Lugh planning docs              |
| `claude/add-docker-process-logs-wYfET`      | 2025-12-28 | Config file fixes               |
| `claude/research-langchain-langgraph-fS7yl` | 2025-12-28 | LangChain/LangGraph research    |
| `claude/saas-security-compliance-brRWd`     | 2025-12-28 | SaaS security audit checkpoints |
| `claude/sub-claude-docs-rAgLO`              | 2025-12-30 | Natural conversation onboarding |

**Action:** Review docs, then delete branches

---

### Bug Fix Branches (LIKELY MERGED)

| Branch                                    | Date       | Description                 |
| ----------------------------------------- | ---------- | --------------------------- |
| `claude/fix-github-actions-tests-bhbms`   | 2025-12-29 | GitHub Actions workflow fix |
| `claude/search-remote-coding-agent-BHn79` | 2025-12-29 | Real agent status from DB   |

**Action:** Verify merged, then delete

---

### Test Branches

| Branch               | Date       | Description              |
| -------------------- | ---------- | ------------------------ |
| `test-agent-push`    | 2025-12-27 | Agent container git test |
| `test-url-rewriting` | 2025-12-27 | URL rewriting test       |

**Action:** Delete - test artifacts

---

## 📋 TODO Cross-Reference Summary

### Completed in Current Branch

- ✅ INFRA-001 to INFRA-005 (partial) - Lightsail setup scripted
- ✅ DUAL-002 to DUAL-006 - Docker compose files created
- ✅ Infrastructure for LangGraph integration

### Still TODO

- [ ] INFRA-006 - Verify Telegram bot responds
- [ ] DUAL-007, DUAL-008 - Deploy and test isolation
- [ ] RENAME-002 to RENAME-008 - Complete rename
- [ ] AGENT-001 to AGENT-007 - Multi-agent activation
- [ ] MCP-001 to MCP-006 - MCP server implementation
- [ ] All KNOW-_, SAVE-_, CICD-_, TEST-_, DOCS-_, POLISH-_

### Branches with Relevant Code for TODOs

| TODO Area | Relevant Branches                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------- |
| AGENT-\*  | autonomous-improvement-agents, multi-agent-no-redis, multi-agent-framework, agent-task-distribution |
| MCP-\*    | StreetsDigital-mcp-prp                                                                              |
| POLISH-\* | telegram-bot-github-links                                                                           |

---

## 🎯 Recommended Actions

### Immediate (Before Deploy)

1. **Merge** `setup-dev-workstation` → `main`
2. **Delete** renamed/superseded branches (15+ branches)
3. **Deploy** to Lightsail from `main`

### After Review

1. **Cherry-pick** useful code from agent branches
2. **Archive** research/docs branches (or delete)
3. **Delete** test branches

### Cleanup Command (After Merge)

```bash
# Delete stale remote branches
git push origin --delete \
  claude/fix-remote-agent-conversations-bEs2c \
  claude/list-workspaces-lmNla \
  claude/deploy-lightsail-xL9HD \
  claude/start-postgres-container-NqUH3 \
  claude/start-postgres-container-b1goO \
  claude/setup-gh-auth-workspaces-PSnaj \
  claude/clarify-python-porting-PZOOI \
  claude/add-file-process-visibility-7pQDS \
  claude/add-docker-process-logs-wYfET \
  claude/research-langchain-langgraph-fS7yl \
  claude/cleanup-add-telegram-mn4xF \
  claude/setup-redis-lightsail-8l7l2 \
  claude/research-ai-projects-46YPW \
  test-agent-push \
  test-url-rewriting
```

---

## 📊 Statistics

- **Total branches:** 28
- **Active:** 2 (current + master)
- **Potentially useful:** 10
- **Safe to delete:** 16
- **Date range:** 2025-12-27 to 2025-12-31 (5 days!)

---

_Last Updated: 2025-12-31 by Claude Code_
