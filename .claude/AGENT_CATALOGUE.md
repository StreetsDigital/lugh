# Agent Army Catalogue

**59 specialist agents** organised by category.
Quick reference for finding the right agent.

---

## 🎯 Quick Start

**Don't know which agent?** → `meta-dispatcher`
**Production launch?** → `meta-production-readiness`
**Building something new?** → Check `build-` or `arch-` categories
**Reviewing code?** → Check `audit-` category

---

## Categories at a Glance

| Prefix | Count | Purpose |
|--------|-------|---------|
| `adtech-` | 9 | Programmatic advertising |
| `arch-` | 9 | Architecture and design |
| `audit-` | 12 | Code review and quality |
| `auto-` | 4 | Automation platforms |
| `ai-` | 4 | AI/ML frameworks |
| `build-` | 3 | Creating new things |
| `infra-` | 7 | Infrastructure and ops |
| `perf-` | 5 | Performance and cost |
| `security-` | 3 | Security and compliance |
| `meta-` | 3 | Workflow and routing |

---

## 📺 Ad Tech (`adtech-`)

| Agent | Model | Use For |
|-------|-------|---------|
| `adtech-adapter-auditor` | sonnet | Review bidder adapters |
| `adtech-analytics-engineer` | sonnet | Define metrics precisely |
| `adtech-bidder-manager` | sonnet | Dynamic bidder system audit |
| `adtech-floors` | sonnet | Currency conversion, bid floors |
| `adtech-fpd` | sonnet | First party data handling |
| `adtech-idr` | **opus** | IDR ML scoring logic |
| `adtech-prebid` | sonnet | Prebid.js specialist |
| `adtech-stored-requests` | sonnet | Stored request handling |
| `adtech-video-native` | sonnet | Video/native format support |

---

## 🏗️ Architecture (`arch-`)

| Agent | Model | Use For |
|-------|-------|---------|
| `arch-agentic-systems` | **opus** | Multi-agent AI design |
| `arch-auction` | **opus** | Auction engine architecture |
| `arch-automation` | **opus** | Automation system design |
| `arch-component` | sonnet | Frontend component library |
| `arch-dashboard` | sonnet | Publisher dashboard design |
| `arch-reporting` | **opus** | Reporting infrastructure |
| `arch-taxonomy` | sonnet | Data hierarchy restructure |
| `arch-ui` | sonnet | UI structure audit |
| `arch-ux` | sonnet | UX strategy |

---

## 🔍 Audit (`audit-`)

| Agent | Model | Use For |
|-------|-------|---------|
| `audit-code` | **opus** | Deep forensic code review |
| `audit-concurrency` | **opus** | Go concurrency safety |
| `audit-config` | sonnet | Configuration files |
| `audit-cross-language` | sonnet | Go/Python boundary |
| `audit-dependencies` | sonnet | Dependency health, CVEs |
| `audit-docs` | sonnet | Documentation accuracy |
| `audit-errors` | sonnet | Error handling patterns |
| `audit-go` | sonnet | Go best practices |
| `audit-hygiene` | sonnet | General code quality |
| `audit-mcp` | sonnet | MCP server security |
| `audit-python` | sonnet | Python best practices |
| `audit-tests` | sonnet | Test coverage and quality |

---

## ⚡ Automation (`auto-`)

| Agent | Model | Use For |
|-------|-------|---------|
| `auto-apify` | sonnet | Apify actors, web scraping |
| `auto-make` | sonnet | Make.com scenarios |
| `auto-n8n` | sonnet | n8n workflows |
| `auto-zapier` | sonnet | Zapier zaps |

---

## 🤖 AI/ML (`ai-`)

| Agent | Model | Use For |
|-------|-------|---------|
| `ai-langchain` | sonnet | LangChain apps, RAG basics |
| `ai-langgraph` | **opus** | Stateful agent workflows |
| `ai-prompts` | **opus** | Prompt engineering |
| `ai-rag` | **opus** | RAG pipeline architecture |

---

## 🔨 Build (`build-`)

| Agent | Model | Use For |
|-------|-------|---------|
| `build-cicd` | sonnet | CI/CD pipelines |
| `build-mcp` | **opus** | MCP server development |
| `build-openapi` | sonnet | OpenAPI specifications |

---

## 🖥️ Infrastructure (`infra-`)

| Agent | Model | Use For |
|-------|-------|---------|
| `infra-circuit-breaker` | sonnet | Resilience patterns |
| `infra-docker` | sonnet | Docker, deployment config |
| `infra-investigator` | sonnet | General infra audit |
| `infra-observability` | sonnet | Metrics, logging, tracing |
| `infra-redis` | sonnet | Redis optimisation |
| `infra-supabase` | sonnet | Supabase backends |
| `infra-timescaledb` | sonnet | TimescaleDB tuning |

---

## 📈 Performance (`perf-`)

| Agent | Model | Use For |
|-------|-------|---------|
| `perf-cost` | sonnet | Cost optimisation |
| `perf-load-tests` | sonnet | k6 load test review |
| `perf-mcp` | sonnet | MCP performance tuning |
| `perf-profiler` | sonnet | Bottleneck identification |
| `perf-resources` | sonnet | Resource monitoring |

---

## 🔒 Security (`security-`)

| Agent | Model | Use For |
|-------|-------|---------|
| `security-api` | **opus** | API security audit |
| `security-identity` | sonnet | Cookie sync, user IDs |
| `security-privacy` | **opus** | GDPR/CCPA compliance |

---

## 🎛️ Meta (`meta-`)

| Agent | Model | Use For |
|-------|-------|---------|
| `meta-claude-code` | **opus** | Workflow optimisation |
| `meta-dispatcher` | haiku | Route to right agent |
| `meta-production-readiness` | **opus** | Go/no-go assessment |

---

## 🔥 Common Workflows

### The Nexus Engine Audit (Phases 1-8)

**Phase 1: Critical Path**
```
meta-production-readiness → arch-auction → security-privacy → security-api
```

**Phase 2: Code Quality**
```
audit-go → audit-python → audit-cross-language → audit-errors
```

**Phase 3: Infrastructure**
```
infra-investigator → perf-cost → infra-circuit-breaker → infra-docker
```

**Phase 4: Adapters & Bidding**
```
adtech-adapter-auditor → adtech-bidder-manager → adtech-floors → adtech-idr
```

**Phase 5: Testing & Observability**
```
audit-tests → infra-observability → perf-load-tests → audit-concurrency
```

### New MCP Server
```
build-mcp → audit-mcp → perf-mcp
```

### New Automation Workflow
```
arch-automation → auto-n8n (or auto-zapier/auto-make) → perf-cost
```

### RAG System Build
```
ai-rag → ai-langchain → build-openapi
```

### Production Launch Checklist
```
meta-production-readiness → security-api → security-privacy → infra-docker
```

---

## 💡 Tips

- Run `/compact` between agents to free context
- Use `/compact <focus>` to bias retention
- Check context with `/cost`
- Opus agents = complex reasoning, use for architecture/security
- Haiku agents = fast routing (just meta-dispatcher)
- Consider parallel Claude Code sessions with git worktrees

---

*Last updated: December 2025*
*Total agents: 59*
