# Agent Command Codebase Consolidation Plan

## Current State Analysis

### Directory Structure (Before)

```
V1/
├── remote-coding-agent-main/      ← PRIMARY CODEBASE
│   ├── src/                       ← V1.0 Stable (76 TS files)
│   │   ├── adapters/              [Telegram, Slack, Discord, GitHub]
│   │   ├── clients/               [Claude, Codex]
│   │   ├── config/                [Config + Feature Flags ✅]
│   │   ├── db/                    [PostgreSQL layer]
│   │   ├── handlers/              [Command handler]
│   │   ├── orchestrator/          [Single-agent orchestrator]
│   │   └── utils/                 [Utilities]
│   │
│   └── V1.1/                      ← EXPERIMENTAL (needs merge)
│       ├── agent/                 [Multi-agent workers]
│       ├── orchestrator/          [Pool manager, Swarm, LLM Config]
│       ├── redis/                 [Pub/sub messaging]
│       ├── electron/              [Desktop app]
│       └── public/                [Web dashboard]
│
├── Archon-main/                   ← SEPARATE SYSTEM (keep separate)
│   ├── archon-ui-main/            [React dashboard]
│   └── python/                    [Python orchestrator]
│
└── auto-claude-research/          ← RESEARCH (keep separate)
```

### Current State

| Component | Location | Status | Action |
|-----------|----------|--------|--------|
| Core adapters | `src/adapters/` | Stable | Keep as-is |
| Phone approvals | `src/adapters/telegram-approvals.ts` | Beta | Gate with feature flag |
| Single-agent orchestrator | `src/orchestrator/` | Stable | Keep as fallback |
| Multi-agent pool | `V1.1/orchestrator/` | Experimental | Merge with feature flag |
| Redis messaging | `V1.1/redis/` | Experimental | Merge with feature flag |
| LLM config API | `V1.1/orchestrator/llm-config-api.ts` | Experimental | Merge with feature flag |
| Swarm coordination | `V1.1/orchestrator/swarm/` | Experimental | Merge with feature flag |
| Electron app | `V1.1/electron/` | Experimental | Keep separate, link via feature flag |
| Archon | `Archon-main/` | Independent | Keep as separate project |

---

## Consolidation Strategy

### Phase 1: Feature Flag Integration (✅ DONE)

1. ✅ Created `src/config/features.ts` with all feature definitions
2. ✅ Updated `.env.example` with feature flag documentation
3. ✅ Set up dependency validation between features

### Phase 2: Merge V1.1 Components (✅ DONE)

**Step 1: Redis Messaging Layer** ✅
```
V1.1/redis/ → src/redis/
```
- Gate with `FEATURE_REDIS_MESSAGING`
- No dependencies on other features
- Files: `client.ts`, `channels.ts`, `messages.ts`, `index.ts`

**Step 2: Agent Pool Manager** ✅
```
V1.1/agent/ → src/agent/
V1.1/orchestrator/pool-manager.ts → src/orchestrator/pool-manager.ts
```
- Gate with `FEATURE_AGENT_POOL`
- Requires: `REDIS_MESSAGING`
- Files: `worker.ts`, `heartbeat.ts`, `providers/*`, `pool-manager.ts`

**Step 3: Multi-LLM Support** ✅
```
V1.1/orchestrator/llm-config-api.ts → src/api/llm-config.ts
V1.1/orchestrator/swarm/llm-providers.ts → src/llm/providers.ts
```
- Gate with `FEATURE_MULTI_LLM`
- No dependencies on agent pool
- Files: `llm-config.ts`, `providers.ts`

**Step 4: Swarm Coordination** ✅
```
V1.1/orchestrator/swarm/ → src/swarm/
V1.1/orchestrator/swarm-api.ts → src/api/swarm.ts
```
- Gate with `FEATURE_SWARM_COORDINATION`
- Requires: `AGENT_POOL`, `MULTI_LLM`
- Files: `types.ts`, `role-configs.ts`, `task-decomposer.ts`, `agent-spawner.ts`, `swarm-coordinator.ts`, `result-synthesizer.ts`, `index.ts`, `swarm.ts` (API)

**Step 5: Verification & Recovery** ✅
```
V1.1/orchestrator/verification.ts → src/orchestrator/verification.ts
V1.1/orchestrator/recovery.ts → src/orchestrator/recovery.ts
```
- Gate with `FEATURE_EXTERNAL_VERIFICATION`, `FEATURE_RECOVERY_SYSTEM`
- Requires: `AGENT_POOL`
- Files: `verification.ts`, `recovery.ts`

### Phase 3: Update Entry Points

**Modify `src/index.ts`:**
```typescript
import { isEnabled, printFeatureSummary } from './config/features';

// Print feature summary on startup
printFeatureSummary();

// Initialize Redis if needed
if (isEnabled('REDIS_MESSAGING')) {
  const { initRedis } = await import('./redis');
  await initRedis();
}

// Start appropriate orchestrator
if (isEnabled('AGENT_POOL')) {
  const { AgentPoolManager } = await import('./orchestrator/pool-manager');
  // Use multi-agent pool
} else if (isEnabled('LEGACY_SINGLE_AGENT')) {
  const { Orchestrator } = await import('./orchestrator/orchestrator');
  // Use single-agent orchestrator
}

// Mount APIs conditionally
if (isEnabled('MULTI_LLM')) {
  const { llmConfigRouter } = await import('./api/llm-config');
  app.use('/api/llm', llmConfigRouter);
}

if (isEnabled('SWARM_COORDINATION')) {
  const { swarmRouter } = await import('./api/swarm');
  app.use('/api/swarm', swarmRouter);
}
```

### Phase 4: Database Migrations

Migrations that need feature flag awareness:
- `008_add_approvals_table.sql` → Required only when `FEATURE_PHONE_APPROVALS=true`
- `009_llm_configuration.sql` → Required only when `FEATURE_MULTI_LLM=true`

**Add migration runner logic:**
```typescript
if (isEnabled('PHONE_APPROVALS')) {
  await runMigration('008_add_approvals_table.sql');
}
if (isEnabled('MULTI_LLM')) {
  await runMigration('009_llm_configuration.sql');
}
```

---

## Target Directory Structure (After Consolidation)

```
remote-coding-agent-main/
├── src/
│   ├── adapters/                  # Platform integrations
│   │   ├── telegram.ts
│   │   ├── telegram-approvals.ts  # FEATURE_PHONE_APPROVALS
│   │   ├── slack.ts
│   │   ├── discord.ts
│   │   └── github.ts
│   │
│   ├── agent/                     # FEATURE_AGENT_POOL
│   │   ├── worker.ts
│   │   ├── heartbeat.ts
│   │   └── providers/
│   │
│   ├── api/                       # REST endpoints
│   │   ├── health.ts
│   │   ├── llm-config.ts          # FEATURE_MULTI_LLM
│   │   └── swarm.ts               # FEATURE_SWARM_COORDINATION
│   │
│   ├── clients/                   # AI clients
│   │   ├── claude.ts
│   │   └── codex.ts
│   │
│   ├── config/                    # Configuration
│   │   ├── config-loader.ts
│   │   ├── config-types.ts
│   │   ├── features.ts            # ✅ Feature flags
│   │   └── index.ts
│   │
│   ├── db/                        # Database layer
│   │   ├── connection.ts
│   │   ├── approvals.ts           # FEATURE_PHONE_APPROVALS
│   │   └── ...
│   │
│   ├── llm/                       # FEATURE_MULTI_LLM
│   │   ├── providers.ts
│   │   └── registry.ts
│   │
│   ├── orchestrator/              # Orchestration
│   │   ├── orchestrator.ts        # FEATURE_LEGACY_SINGLE_AGENT
│   │   ├── pool-manager.ts        # FEATURE_AGENT_POOL
│   │   ├── verification.ts        # FEATURE_EXTERNAL_VERIFICATION
│   │   └── recovery.ts            # FEATURE_RECOVERY_SYSTEM
│   │
│   ├── redis/                     # FEATURE_REDIS_MESSAGING
│   │   ├── client.ts
│   │   ├── channels.ts
│   │   └── messages.ts
│   │
│   ├── swarm/                     # FEATURE_SWARM_COORDINATION
│   │   ├── coordinator.ts
│   │   ├── task-decomposer.ts     # FEATURE_TASK_DECOMPOSER
│   │   └── roles.ts
│   │
│   └── index.ts                   # Entry point
│
├── electron/                      # FEATURE_ELECTRON_APP (separate build)
│   ├── main.js
│   ├── preload.js
│   └── ...
│
├── public/                        # Static assets
│   └── llm-config.html            # FEATURE_LLM_CONFIG_UI
│
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── ...
│   ├── 008_add_approvals_table.sql
│   └── 009_llm_configuration.sql
│
└── docs/
    ├── CONSOLIDATION_PLAN.md      # This document
    └── ...
```

---

## Feature Enablement Order

Enable features in this order to minimize risk:

### Stage 1: Core Stability (Now)
- ✅ `TELEGRAM_ADAPTER`
- ✅ `SLACK_ADAPTER`
- ✅ `DISCORD_ADAPTER`
- ✅ `GITHUB_ADAPTER`
- ✅ `LEGACY_SINGLE_AGENT`

### Stage 2: Phone Vibecoding (Next)
- ⬜ `PHONE_APPROVALS`
- ⬜ `BLOCKING_APPROVALS`

### Stage 3: Multi-LLM (After Stage 2 stable)
- ⬜ `MULTI_LLM`
- ⬜ `LLM_CONFIG_UI`
- ⬜ `COST_TRACKING`

### Stage 4: Multi-Agent (After Stage 3 stable)
- ⬜ `REDIS_MESSAGING`
- ⬜ `AGENT_POOL`
- ⬜ `AGENT_HEARTBEAT`
- ⬜ `EXTERNAL_VERIFICATION`
- ⬜ `RECOVERY_SYSTEM`

### Stage 5: Swarm (After Stage 4 stable)
- ⬜ `SWARM_COORDINATION`
- ⬜ `TASK_DECOMPOSER`

### Stage 6: Desktop (After Stage 3 stable)
- ⬜ `ELECTRON_APP`

---

## Deprecation Timeline

| Feature | Deprecated | Removal Target |
|---------|-----------|----------------|
| `LEGACY_SINGLE_AGENT` | When `AGENT_POOL` is stable | v2.0 |

---

## Testing Strategy

For each feature enablement:

1. **Unit Tests**: Run feature-specific tests
2. **Integration Tests**: Test feature with dependencies
3. **Regression Tests**: Ensure existing features still work
4. **Load Tests**: Validate performance under load

```bash
# Test with specific feature enabled
FEATURE_PHONE_APPROVALS=true npm test

# Test feature combination
FEATURE_AGENT_POOL=true FEATURE_REDIS_MESSAGING=true npm test
```

---

## Rollback Procedure

If a feature causes issues:

1. **Immediate**: Set `FEATURE_X=false` in environment
2. **Restart**: Application will run without the feature
3. **Investigate**: Check logs for feature-specific errors
4. **Fix**: Address issues before re-enabling

No code changes or deployments needed for rollback.

---

## Notes

- **Archon-main**: Kept as a separate project - it's an orchestration layer above Agent Command
- **auto-claude-research**: Research project, not part of consolidation
- **V1.1/electron**: Built separately, enabled via `FEATURE_ELECTRON_APP`
