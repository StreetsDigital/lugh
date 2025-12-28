# Master Todo List

**For Orchestration Agent:** Read this file, pick highest priority unclaimed task, execute it.

**Legend:**
- `[ ]` = Not started
- `[~]` = In progress (check AGENT_ASSIGNMENTS.md)
- `[x]` = Completed
- `[!]` = Blocked

---

## CRITICAL PATH (Do These First)

### Infrastructure Setup
- [ ] **INFRA-001**: Create Lightsail instance (2GB RAM, Ubuntu)
- [ ] **INFRA-002**: Install Docker and Docker Compose on server
- [ ] **INFRA-003**: Clone agent-commander repo to server
- [ ] **INFRA-004**: Create .env file with credentials
- [ ] **INFRA-005**: Start with `docker-compose --profile with-db up -d`
- [ ] **INFRA-006**: Verify Telegram bot responds from phone

### Dual Instance Setup
- [ ] **DUAL-001**: Create second Telegram bot via @BotFather (@LughDev)
- [ ] **DUAL-002**: Create docker-compose.staging.yml
- [ ] **DUAL-003**: Create docker-compose.prod.yml
- [ ] **DUAL-004**: Create .env.staging with staging bot token
- [ ] **DUAL-005**: Create .env.prod with prod bot token
- [ ] **DUAL-006**: Create staging database (staging_lugh)
- [ ] **DUAL-007**: Deploy both instances to same server (different ports)
- [ ] **DUAL-008**: Test isolation - changes in staging don't affect prod

---

## HIGH PRIORITY

### Rename Completion
- [x] **RENAME-001**: Rename archon → lugh in src/ *(completed 2024-12-27)*
- [ ] **RENAME-002**: Rename in Dockerfile
- [ ] **RENAME-003**: Rename in docker-compose.yml
- [ ] **RENAME-004**: Rename in .env.example
- [ ] **RENAME-005**: Rename in CLAUDE.md
- [ ] **RENAME-006**: Rename in README.md
- [ ] **RENAME-007**: Rename in all docs/
- [ ] **RENAME-008**: Create .lugh/ directory structure template

### Multi-Agent Activation
- [ ] **AGENT-001**: Review V1.1 agent pool code
- [ ] **AGENT-002**: Enable FEATURE_AGENT_POOL flag
- [ ] **AGENT-003**: Enable FEATURE_REDIS_MESSAGING flag
- [ ] **AGENT-004**: Test agent spawning with 2 agents
- [ ] **AGENT-005**: Test task distribution via Redis
- [ ] **AGENT-006**: Add agent health check endpoint
- [ ] **AGENT-007**: Scale to 3 agents, verify coordination

### MCP Server
- [ ] **MCP-001**: Create src/mcp/server.ts skeleton
- [ ] **MCP-002**: Define tool schemas (spawn_agent, assign_task, etc.)
- [ ] **MCP-003**: Wire tools to existing orchestrator
- [ ] **MCP-004**: Add resource providers (projects, agents)
- [ ] **MCP-005**: Test with Claude Code as MCP client
- [ ] **MCP-006**: Document MCP usage in README

---

## MEDIUM PRIORITY

### Knowledge Layer
- [ ] **KNOW-001**: Fork/clone Archon repo
- [ ] **KNOW-002**: Deploy Archon as Docker service
- [ ] **KNOW-003**: Configure Supabase for vector storage
- [ ] **KNOW-004**: Create MCP client in Lugh to call Archon
- [ ] **KNOW-005**: Add /knowledge command for document upload
- [ ] **KNOW-006**: Inject RAG results into agent prompts
- [ ] **KNOW-007**: Test per-project knowledge isolation

### Save State System
- [ ] **SAVE-001**: Design checkpoint schema
- [ ] **SAVE-002**: Implement /checkpoint command
- [ ] **SAVE-003**: Add auto-checkpoint triggers
- [ ] **SAVE-004**: Implement /restore command
- [ ] **SAVE-005**: Test checkpoint/restore cycle
- [ ] **SAVE-006**: Add checkpoint listing (/checkpoints)

### CI/CD Pipeline
- [ ] **CICD-001**: Create .github/workflows/deploy.yml
- [ ] **CICD-002**: Set up GitHub secrets for SSH
- [ ] **CICD-003**: Auto-deploy main → prod
- [ ] **CICD-004**: Auto-deploy develop → staging
- [ ] **CICD-005**: Add deployment notifications to Telegram

---

## LOW PRIORITY

### Testing
- [ ] **TEST-001**: Add tests for lugh-paths.ts
- [ ] **TEST-002**: Add integration tests for MCP server
- [ ] **TEST-003**: Add tests for multi-agent coordination
- [ ] **TEST-004**: Set up test coverage reporting

### Documentation
- [ ] **DOCS-001**: Update README with Lugh branding
- [ ] **DOCS-002**: Document dual-instance setup
- [ ] **DOCS-003**: Document MCP server API
- [ ] **DOCS-004**: Create getting-started guide
- [ ] **DOCS-005**: Document feature flags

### Polish
- [ ] **POLISH-001**: Improve Telegram message formatting
- [ ] **POLISH-002**: Add progress indicators for long tasks
- [ ] **POLISH-003**: Better error messages
- [ ] **POLISH-004**: Add /help improvements

---

## BLOCKED

*None currently*

---

## COMPLETED

- [x] **RENAME-001**: Rename archon → lugh in src/ *(2024-12-27)*

---

## How to Use This File

**For Orchestration Agent:**
```
1. Read this file
2. Find first unclaimed [ ] task in CRITICAL PATH
3. If CRITICAL PATH done, move to HIGH PRIORITY
4. Claim task by updating [ ] to [~]
5. Update AGENT_ASSIGNMENTS.md with your agent ID
6. Execute the task
7. Create PR with changes
8. Update task to [x] when merged
```

**For Human:**
```
1. Review PRs created by agents
2. Approve/reject changes
3. Add new tasks as needed
4. Reprioritize by moving tasks between sections
```
