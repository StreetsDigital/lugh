# Feature Backlog

**Priority:** P0 = MVP, P1 = Soon, P2 = Later, P3 = Vision

---

## P0 - MVP (Must Have)

### FEAT-001: Dual Instance Architecture

**Status:** Partial (infrastructure ready, needs bot setup + deployment)
**Description:** Two completely separate environments

- @LughDev bot (staging) for development
- @Lugh bot (prod) for stable usage
- Separate databases, worktrees, configs
- PR-based promotion between them

**Files created:**

- [x] `docker-compose.staging.yml` _(2024-12-28)_
- [x] `docker-compose.prod.yml` _(2024-12-28)_
- [x] `.env.staging.example` _(2024-12-28)_
- [x] `.env.prod.example` _(2024-12-28)_

**Remaining:**

- [ ] Create @LughDev bot via @BotFather
- [ ] Create @Lugh bot via @BotFather
- [ ] Deploy to server

---

### FEAT-002: Production Deployment

**Status:** Not Started
**Description:** Deploy to real server

- Lightsail or Hetzner instance
- Docker Compose deployment
- Environment variables configured
- Telegram bot accessible from phone

---

### FEAT-004: Knowledge Layer (Lugh MCP)

**Status:** Not Started
**Description:** Integrate Cole Medin's Lugh as MCP server

- Deploy Lugh alongside Lugh
- Per-project knowledge silos
- Document ingestion (PDF, MD, code)
- RAG retrieval in agent prompts

---

### FEAT-005: MCP Server Exposure

**Status:** Not Started
**Description:** Lugh itself as MCP server

- `lugh/spawn_agent` tool
- `lugh/assign_task` tool
- `lugh/query_knowledge` tool
- Resources for projects, agents, sessions

---

### FEAT-006: Phone Vibecoding V2 🎤📱

**Status:** Ready for Implementation ✅
**Description:** Next-gen mobile coding UX with voice, vision, and rich interactions

- [x] Full specification written _(2024-12-30)_
- [x] Database migration created _(2024-12-30)_
- [x] Implementation checklist created _(2024-12-30)_
- [ ] Voice commands (Whisper transcription)
- [ ] Inline quick actions (Telegram keyboards)
- [ ] Rich code previews (diffs with syntax highlighting)
- [ ] Photo-to-task (Claude Vision integration)
- [ ] Reaction shortcuts (emoji responses)
- [ ] Smart notifications (context-rich, priority-based)
- **See:** `features/FEAT-006-phone-vibecoding-v2.md` for full spec
- **Checklist:** `features/FEAT-006-CHECKLIST.md` for implementation tracking

---

## P1 - Soon (High Value)

### FEAT-010: Save State / Checkpoints

**Status:** Not Started
**Description:** Checkpoint and restore system

- `/checkpoint` command
- Auto-checkpoint on milestones
- Restore to any point
- Includes: git state, DB snapshot, agent states

---

### FEAT-011: Hierarchical Memory

**Status:** Not Started
**Description:** Multi-layer memory system

- Episodic (what happened)
- Semantic (what we know)
- Procedural (how to do things)
- Preference (user's style)

---

### FEAT-012: Simulation Layer

**Status:** Not Started
**Description:** Dry-run before execution

- Preview actions before running
- Show affected files/records
- Estimate costs/risks
- User approves or cancels

---

### FEAT-013: Memory Consolidation

**Status:** Not Started
**Description:** Nightly memory optimization

- Compress episodic → semantic
- Identify patterns
- Prune noise
- Strengthen important knowledge

---

### FEAT-014: Tool Synthesis

**Status:** Not Started
**Description:** Agents create their own tools

- Agent identifies missing capability
- Generates tool code
- Registers as MCP tool
- Persists for future use

---

## P2 - Later (Nice to Have)

### FEAT-019: Redis Upgrade Path

**Status:** Not Started
**Description:** Migrate to Redis if PostgreSQL pub/sub becomes a bottleneck

- Only needed if scaling to 50+ agents or distributed across machines
- Replace `PgPubSub` with Redis pub/sub
- Add Redis Streams for message replay/persistence
- Enables sub-millisecond task assignment
- **Trigger:** When PostgreSQL NOTIFY latency > 100ms or connection pool exhaustion

---

### FEAT-020: Business Templates

**Status:** Not Started
**Description:** Pre-built agent configurations

- Cat sitter template
- Consultant template
- E-commerce template
- Each includes: agents, integrations, automations

---

### FEAT-021: Multi-Modal Input

**Status:** Not Started
**Description:** Handle images, voice, files

- Photo → Vision agent analysis
- Voice → Transcription → Action
- File → Document processing

---

### FEAT-022: Explainable Decisions

**Status:** Not Started
**Description:** Agents explain their reasoning

- Every action includes reasoning chain
- User can ask "Why did you do that?"
- Audit trail for all decisions

---

### FEAT-023: Adaptive Prompts

**Status:** Not Started
**Description:** Self-optimizing prompts

- Track prompt success rates
- Identify failure patterns
- Auto-patch prompts based on learnings

---

### FEAT-024: Cross-Agent Memory

**Status:** Not Started
**Description:** Shared + isolated memory

- Shared: project structure, user prefs
- Isolated: per-agent working memory
- Broadcast channel for coordination

---

### FEAT-025: Integration Layer

**Status:** Not Started
**Description:** Third-party service connectors

- Stripe (payments)
- WhatsApp Business API
- Instagram/TikTok APIs
- Google Calendar
- Vercel/Netlify

---

## P3 - Vision (Future)

### FEAT-030: Federated Learning

**Description:** Learn across users, keep data private

- Anonymized pattern extraction
- Cross-user insights
- Privacy-preserving aggregation

---

### FEAT-031: Agent Marketplace

**Description:** Buy/sell pre-built agents

- Community agents
- Verified publishers
- Revenue sharing

---

### FEAT-032: Autonomous Goal Pursuit

**Description:** Agents set their own subgoals

- User says "Grow my business"
- Agent decomposes into actionable tasks
- Pursues goals autonomously
- Reports progress

---

### FEAT-033: Time-Travel Debugging

**Description:** Replay any point in history

- See exact agent state
- See exact memory
- See exact decisions
- Re-run from any point

---

### FEAT-034: Google Replacement Suite

**Description:** Lightweight AI-native alternatives

- Calendar Agent (replaces Google Calendar)
- Docs Agent (replaces Google Docs)
- Email Agent (replaces Gmail)
- All unified, all MCP-accessible
