# Lugh - Minimum Viable Product

**Goal:** Control 12 AI agents from phone via Telegram to build software.

## Non-Negotiable Requirements

### 1. Telegram Control (EXISTS - needs polish)
- [x] Send messages to bot
- [x] Receive streaming responses
- [x] Slash commands work
- [ ] Inline approval buttons for risky actions
- [ ] File upload/download

### 2. Multi-Agent Pool (PARTIAL - code exists)
- [x] Spawn multiple Claude agents
- [x] Redis coordination
- [ ] Agent health monitoring
- [ ] Task distribution to available agents
- [ ] Agent specialization (reviewer, implementer, researcher)

### 3. Dual Instance (NOT STARTED)
- [ ] Two Telegram bots (@LughDev, @Lugh)
- [ ] Separate databases (staging, prod)
- [ ] Separate worktree paths
- [ ] Independent deployments
- [ ] PR-based promotion from staging → prod

### 4. Knowledge Layer (NOT STARTED)
- [ ] Integrate Archon MCP as knowledge server
- [ ] Per-project siloed knowledge
- [ ] Document upload (PDF, MD, code)
- [ ] RAG search during agent work

### 5. Save State System (NOT STARTED)
- [ ] Checkpoint command (/checkpoint)
- [ ] Auto-checkpoint on major milestones
- [ ] Restore to any checkpoint
- [ ] Checkpoint includes: code, DB state, agent states

### 6. MCP Server (NOT STARTED)
- [ ] Lugh exposes itself as MCP server
- [ ] Tools: spawn_agent, assign_task, query_knowledge
- [ ] Resources: projects, agents, sessions
- [ ] Other tools (Claude Code, Cursor) can call Lugh

---

## Minimum Tech Stack

| Component | Technology | Status |
|-----------|------------|--------|
| Runtime | Bun/TypeScript | ✅ Done |
| Database | PostgreSQL | ✅ Done |
| Message Bus | Redis | ✅ Done |
| AI | Claude Agent SDK | ✅ Done |
| Telegram | Telegraf | ✅ Done |
| Knowledge | Archon MCP | ❌ Not integrated |
| Deployment | Docker Compose | ✅ Done |
| Hosting | Lightsail/Hetzner | ❌ Not deployed |

---

## MVP Milestone Checklist

### Phase 1: Foundation (DO FIRST)
- [ ] Deploy to Lightsail (single instance)
- [ ] Verify Telegram bot works remotely
- [ ] Test basic agent spawning
- [ ] Confirm Redis coordination works

### Phase 2: Dual Instance
- [ ] Create second Telegram bot
- [ ] Set up staging database
- [ ] Deploy both instances
- [ ] Test isolation between them

### Phase 3: Multi-Agent
- [ ] Enable agent pool (3 agents initially)
- [ ] Implement task queue
- [ ] Add agent health checks
- [ ] Test parallel execution

### Phase 4: Knowledge
- [ ] Deploy Archon MCP alongside
- [ ] Connect Lugh → Archon
- [ ] Test document ingestion
- [ ] Verify RAG in agent prompts

### Phase 5: Self-Building
- [ ] Point @LughDev at agent-commander repo
- [ ] Load MASTER_TODO.md as context
- [ ] Have agents work on Lugh itself
- [ ] Complete the loop

---

## Success Criteria

**MVP is done when:**

1. You can message @LughDev from phone
2. Say "Pick a task from MASTER_TODO and do it"
3. Agent reads todo, picks task, executes
4. Creates PR with changes
5. You approve from phone
6. Merges to main
7. @Lugh (prod) gets the update

**That's it.** Everything else is enhancement.
