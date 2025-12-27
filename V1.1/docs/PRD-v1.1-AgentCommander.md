# AgentCommander v1.1 PRD
## "God-Tier Orchestration with Multi-Surface Control"

**Author:** Auto-generated from Auto-Claude analysis
**Date:** December 2024
**Status:** Draft
**Based on:** Auto-Claude architecture patterns + Phone Vibecoding V1

---

## Executive Summary

AgentCommander v1.1 evolves from "phone notifications with stop button" to a **God-tier orchestrator** that manages multiple Claude Code agents across multiple control surfaces (Telegram, Slack, WhatsApp, Web Dashboard, Browser Extension).

**Key insight from Auto-Claude:** Agents execute tasks; Python/TypeScript orchestrates agents. The orchestrator is the "God-tier" - it doesn't trust agent claims, verifies externally, and escalates systematically.

---

## Problem Statement

### Current State (v1.0 - Phone Vibecoding)
- Single Claude Code session per conversation
- Notification-only mode (no blocking approvals due to SDK timeouts)
- `/stop` is the only control mechanism
- No visibility into what agent is actually doing (tool streaming helps but is passive)
- No memory across sessions
- No validation that agent actually completed task

### Pain Points
1. **No trust verification** - Agent says "done" but did it actually commit?
2. **No recovery** - Session dies, context is lost
3. **No parallel work** - One agent per conversation
4. **No QA loop** - Ship broken code, find out later
5. **Limited control surfaces** - Telegram only, no web dashboard

---

## Solution: God-Tier Orchestration

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONTROL SURFACES                              │
├─────────────┬─────────────┬─────────────┬──────────────────────┤
│  Telegram   │    Slack    │  WhatsApp   │   Browser Extension  │
│  (Mobile)   │  (Desktop)  │  (Mobile)   │   (Multi-window)     │
└──────┬──────┴──────┬──────┴──────┬──────┴──────────┬───────────┘
       │             │             │                  │
       └─────────────┴──────┬──────┴──────────────────┘
                            │
                    ┌───────▼───────┐
                    │  WEB GATEWAY  │  ← REST API + WebSocket
                    │   (Express)   │
                    └───────┬───────┘
                            │
              ┌─────────────▼─────────────┐
              │    GOD-TIER ORCHESTRATOR  │
              │                           │
              │  • Task Queue Manager     │
              │  • Agent Pool (1-12)      │
              │  • Verification Engine    │
              │  • Recovery Manager       │
              │  • Memory Layer           │
              └─────────────┬─────────────┘
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
┌──────▼──────┐      ┌──────▼──────┐      ┌──────▼──────┐
│   Agent 1   │      │   Agent 2   │      │   Agent N   │
│ (Worktree A)│      │ (Worktree B)│      │ (Worktree N)│
└─────────────┘      └─────────────┘      └─────────────┘
```

---

## Core Components

### 1. God-Tier Orchestrator

The orchestrator is **TypeScript code** (not an AI agent) that:

```typescript
class GodTierOrchestrator {
  // Task management
  taskQueue: PriorityQueue<Task>;
  agentPool: Map<string, AgentInstance>;

  // Verification (don't trust agents)
  verificationEngine: VerificationEngine;

  // Recovery (agents fail, we continue)
  recoveryManager: RecoveryManager;

  // Memory (cross-session context)
  memoryLayer: MemoryLayer;

  async runTask(task: Task): Promise<TaskResult> {
    // 1. Assign agent from pool
    const agent = await this.agentPool.acquire();

    // 2. Load context from memory
    const context = await this.memoryLayer.getContext(task);

    // 3. Run agent session
    const result = await agent.execute(task, context);

    // 4. VERIFY externally (don't trust agent claims)
    const verified = await this.verificationEngine.verify(result);

    // 5. If failed, attempt recovery
    if (!verified.success) {
      return this.recoveryManager.handleFailure(task, verified);
    }

    // 6. Save to memory
    await this.memoryLayer.save(task, result);

    return result;
  }
}
```

**Key principle:** The orchestrator verifies agent claims externally:
- Did commits actually happen? (`git log`)
- Did files actually change? (`git diff`)
- Do tests pass? (`npm test`)
- Does the code compile? (`tsc --noEmit`)

### 2. Verification Engine

Borrowed from Auto-Claude's post-session processing:

```typescript
class VerificationEngine {
  async verify(result: AgentResult): Promise<VerificationResult> {
    const checks: VerificationCheck[] = [];

    // 1. Commit verification
    if (result.claimsCommit) {
      const commitsBefore = result.commitCountBefore;
      const commitsAfter = await git.getCommitCount();
      checks.push({
        name: 'commits_created',
        passed: commitsAfter > commitsBefore,
        expected: 'New commits',
        actual: `${commitsAfter - commitsBefore} new commits`
      });
    }

    // 2. File modification verification
    if (result.claimsFileChanges) {
      const diff = await git.diff();
      checks.push({
        name: 'files_modified',
        passed: diff.filesChanged.length > 0,
        expected: result.expectedFiles,
        actual: diff.filesChanged
      });
    }

    // 3. Test verification (if applicable)
    if (result.taskType === 'implementation') {
      const testResult = await this.runTests();
      checks.push({
        name: 'tests_pass',
        passed: testResult.exitCode === 0,
        expected: 'All tests pass',
        actual: testResult.summary
      });
    }

    return {
      success: checks.every(c => c.passed),
      checks,
      timestamp: new Date()
    };
  }
}
```

### 3. Recovery Manager

Handles failures systematically (from Auto-Claude pattern):

```typescript
class RecoveryManager {
  private attemptCounts: Map<string, number> = new Map();
  private recoveryHints: Map<string, string[]> = new Map();

  async handleFailure(
    task: Task,
    verification: VerificationResult
  ): Promise<TaskResult> {
    const attempts = this.getAttemptCount(task.id);

    // Record what failed
    this.recordFailure(task.id, verification);

    if (attempts >= 3) {
      // Escalate to human
      return this.escalateToHuman(task, verification);
    }

    // Prepare recovery context for retry
    const hints = this.getRecoveryHints(task.id);
    const retryTask = {
      ...task,
      recoveryContext: {
        attemptNumber: attempts + 1,
        previousFailures: hints,
        whatToAvoid: this.extractFailurePatterns(hints)
      }
    };

    // Retry with recovery context
    return this.orchestrator.runTask(retryTask);
  }

  private escalateToHuman(task: Task, verification: VerificationResult) {
    // Send to all control surfaces
    this.notify({
      type: 'escalation',
      severity: 'high',
      task,
      verification,
      message: `Task failed 3 times. Human intervention needed.`,
      actions: ['retry', 'skip', 'modify_task']
    });
  }
}
```

### 4. Memory Layer (Dual-Layer from Auto-Claude)

```typescript
class MemoryLayer {
  private fileMemory: FileBasedMemory;  // Always available
  private graphMemory?: GraphitiMemory; // Optional, richer

  async getContext(task: Task): Promise<Context> {
    // Try Graphiti first (semantic search)
    if (this.graphMemory) {
      try {
        return await this.graphMemory.search(task.description);
      } catch {
        console.log('[Memory] Graphiti unavailable, using file memory');
      }
    }

    // Fallback to file-based
    return this.fileMemory.getContext(task);
  }

  async save(task: Task, result: TaskResult): Promise<void> {
    // Always save to file (reliable)
    await this.fileMemory.save(task, result);

    // Also save to Graphiti if available
    if (this.graphMemory) {
      try {
        await this.graphMemory.save(task, result);
      } catch {
        console.log('[Memory] Graphiti save failed, file memory has it');
      }
    }
  }
}

// File-based memory structure (human-readable, git-trackable)
interface FileMemoryStructure {
  sessions: {
    [sessionId: string]: {
      task: string;
      outcome: 'success' | 'failure';
      insights: string[];
      gotchas: string[];
      patterns: string[];
    }
  };
  codebaseMap: {
    [filePath: string]: string; // What this file does
  };
}
```

### 5. Agent Pool (Parallel Execution)

```typescript
class AgentPool {
  private agents: Map<string, AgentInstance> = new Map();
  private maxAgents: number = 12;
  private available: string[] = [];

  async acquire(): Promise<AgentInstance> {
    // Reuse existing agent if available
    if (this.available.length > 0) {
      const agentId = this.available.pop()!;
      return this.agents.get(agentId)!;
    }

    // Create new agent if under limit
    if (this.agents.size < this.maxAgents) {
      return this.createAgent();
    }

    // Wait for an agent to become available
    return this.waitForAvailable();
  }

  private async createAgent(): Promise<AgentInstance> {
    const agentId = uuid();

    // Each agent gets isolated worktree
    const worktreePath = await git.createWorktree(agentId);

    const agent = new AgentInstance({
      id: agentId,
      workingDirectory: worktreePath,
      client: new ClaudeClient()
    });

    this.agents.set(agentId, agent);
    return agent;
  }
}
```

---

## Control Surfaces

### 1. Telegram (Mobile - Existing)

Enhanced from v1.0:

```
/status - Show all active agents and tasks
/stop [agent_id] - Stop specific agent (or all)
/approve <id> - Approve pending action
/reject <id> - Reject pending action
/retry <task_id> - Retry failed task
/escalate <task_id> - Force human review
/agents - List agent pool status
/memory <query> - Search cross-session memory
```

### 2. Slack (Desktop)

Same commands, plus:
- Thread-based task tracking (each task = thread)
- Rich message blocks for verification results
- Slack Connect for team visibility

### 3. WhatsApp (Mobile)

Simplified command set:
- `/status` - Quick overview
- `/stop` - Emergency stop all
- Reply to message = approve that action

### 4. Web Dashboard (New)

React-based dashboard with:

```
┌─────────────────────────────────────────────────────────────────┐
│  AgentCommander Dashboard                           [Settings]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  TASK QUEUE                                    [+ Task]  │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │ 🔄 Add user authentication      Agent-1  00:05:32  │ │   │
│  │  │ ⏳ Fix payment bug              Queued   -         │ │   │
│  │  │ ✅ Update README                Agent-2  Completed │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────┐            │
│  │  AGENT TERMINALS     │  │  VERIFICATION        │            │
│  │  ┌────┐ ┌────┐ ┌────┐│  │  ✅ Commits: 3 new   │            │
│  │  │ A1 │ │ A2 │ │ A3 ││  │  ✅ Tests: 42/42     │            │
│  │  └────┘ └────┘ └────┘│  │  ⚠️ Lint: 2 warnings │            │
│  │  Click to expand     │  │  ✅ Types: OK        │            │
│  └──────────────────────┘  └──────────────────────┘            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  MEMORY / CONTEXT                          [Search...]   │   │
│  │  Recent insights: "API uses JWT, not sessions"          │   │
│  │  Gotchas: "Don't modify legacy/ folder"                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5. Browser Extension (New - Multi-Window Control)

Chrome/Firefox extension that:

1. **Detects Claude Code tabs** - Finds all claude.ai/code windows
2. **Injects control overlay** - Adds AgentCommander UI to each tab
3. **Cross-tab orchestration** - Coordinates multiple agents
4. **Keyboard shortcuts** - `Cmd+1-12` to focus agent windows

```typescript
// Extension popup
interface ExtensionState {
  agents: {
    tabId: number;
    status: 'idle' | 'running' | 'waiting';
    currentTask: string;
    lastActivity: Date;
  }[];
  orchestratorConnected: boolean;
}

// Inject into claude.ai/code
function injectOverlay(tabId: number) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Add floating status bar
      const overlay = document.createElement('div');
      overlay.id = 'agentcommander-overlay';
      overlay.innerHTML = `
        <div class="ac-status">Agent 1 | Task: Add auth | 00:05:32</div>
        <button class="ac-stop">⏹ Stop</button>
      `;
      document.body.appendChild(overlay);
    }
  });
}
```

---

## QA Validation Loop

From Auto-Claude - self-validating builds:

```typescript
class QALoop {
  private maxIterations = 50;
  private recurringThreshold = 3;

  async validate(task: Task, result: TaskResult): Promise<QAResult> {
    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      // 1. QA Review
      const review = await this.runQAReview(task, result);

      if (review.approved) {
        return { approved: true, iterations: iteration };
      }

      // 2. Check for recurring issues
      if (this.hasRecurringIssues(review.issues)) {
        return this.escalate(task, review, 'Recurring issues detected');
      }

      // 3. Attempt fix
      result = await this.runQAFix(task, review.issues);
    }

    return this.escalate(task, null, 'Max iterations reached');
  }

  private hasRecurringIssues(issues: Issue[]): boolean {
    return issues.some(issue =>
      this.issueHistory.filter(h => h.matches(issue)).length >= this.recurringThreshold
    );
  }
}
```

---

## Implementation Plan

### Phase 1: Core Orchestrator (Week 1-2)
- [ ] God-Tier Orchestrator class
- [ ] Verification Engine (git checks, test runner)
- [ ] Recovery Manager (attempt tracking, escalation)
- [ ] Task Queue with priorities

### Phase 2: Memory Layer (Week 2-3)
- [ ] File-based memory (always available)
- [ ] Memory search/retrieval
- [ ] Context injection into prompts
- [ ] Session insight extraction

### Phase 3: Agent Pool (Week 3-4)
- [ ] Multi-agent management
- [ ] Worktree isolation per agent
- [ ] Agent health monitoring
- [ ] Resource cleanup

### Phase 4: Control Surfaces (Week 4-6)
- [ ] Enhanced Telegram commands
- [ ] Slack adapter
- [ ] WhatsApp adapter (Twilio)
- [ ] Web Dashboard (React)
- [ ] Browser Extension (Chrome)

### Phase 5: QA Loop (Week 6-7)
- [ ] QA Reviewer integration
- [ ] QA Fixer integration
- [ ] Issue tracking
- [ ] Recurring issue detection

### Phase 6: Polish (Week 7-8)
- [ ] Documentation
- [ ] Testing
- [ ] Performance optimization
- [ ] Production deployment

---

## Technical Decisions

### Why TypeScript Orchestrator (not AI)?

Auto-Claude insight: AI agents are unreliable for orchestration. They:
- Claim tasks complete when they're not
- Skip verification steps
- Don't track state reliably

TypeScript orchestrator:
- 100% reliable state management
- External verification (git, tests)
- Systematic recovery
- Predictable escalation

### Why Dual-Layer Memory?

1. **File-based** - Zero dependencies, human-readable, git-trackable
2. **Graph-based** - Semantic search, rich relationships, optional

File-based is the fallback. Graph-based is the upgrade.

### Why Browser Extension?

For users who prefer:
- Visual control (not command-line)
- Multiple browser windows
- Real-time observation
- Keyboard shortcuts

Extension talks to orchestrator via WebSocket.

---

## Success Metrics

| Metric | v1.0 | v1.1 Target |
|--------|------|-------------|
| Tasks completed without intervention | ~60% | 85%+ |
| False "done" claims caught | 0% | 95%+ |
| Recovery success rate | N/A | 70%+ |
| Mean time to escalation | N/A | <15 min |
| Parallel agents supported | 1 | 12 |
| Control surfaces | 1 | 5 |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SDK timeout on verification | High | Async verification, don't block stream |
| Memory layer complexity | Medium | File-based first, graph optional |
| Browser extension security | Medium | Minimal permissions, open source |
| Multi-agent race conditions | High | Isolated worktrees, queue-based |
| User overwhelm | Medium | Progressive disclosure, sane defaults |

---

## Appendix: Auto-Claude Patterns Adopted

1. **Implementation Plan as Source of Truth** - JSON file tracks all tasks
2. **Post-Session Processing** - Python/TS verifies, not agent
3. **Recovery Manager** - 3 attempts then escalate
4. **Dual Memory** - File (reliable) + Graph (rich)
5. **QA Loop** - Self-validating with max iterations
6. **Phase Dependencies** - Tasks respect execution order
7. **Worktree Isolation** - Each agent in separate git worktree

---

---

## Productization & Configuration

### Vision

AgentCommander v1.1 is designed to be **productized** - users can self-serve configure their integrations, LLM providers, billing, and preferences through a unified web portal.

### 1. Web Administration Portal

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  AgentCommander                                    👤 user@example.com ▼   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐                                                        │
│  │  📊 Dashboard   │  ← Current agent status, queue, recent activity       │
│  │  🔧 Settings    │  ← Integrations, LLMs, preferences                    │
│  │  💳 Billing     │  ← Usage, invoices, subscription                      │
│  │  📚 Docs        │  ← Help, tutorials, API reference                     │
│  │  💬 Support     │  ← Chat, tickets, community                           │
│  └─────────────────┘                                                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  SETTINGS                                                           │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  INTEGRATIONS                                                │   │   │
│  │  │                                                              │   │   │
│  │  │  📱 Telegram      ✅ Connected     [Configure] [Disconnect] │   │   │
│  │  │  💬 Slack         ⚪ Not Connected [Connect]                 │   │   │
│  │  │  📲 WhatsApp      ⚪ Not Connected [Connect]                 │   │   │
│  │  │  🎮 Discord       ⚪ Not Connected [Connect]                 │   │   │
│  │  │  🌐 Browser Ext   ⚪ Not Installed [Install]                 │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  LLM PROVIDERS                                               │   │   │
│  │  │                                                              │   │   │
│  │  │  🤖 Claude API    ✅ Active (Pro)   [Configure] [Usage: $42] │   │   │
│  │  │  🧠 OpenAI        ⚪ Not Connected  [Add API Key]            │   │   │
│  │  │  🦙 Ollama        ⚪ Not Connected  [Configure Local]        │   │   │
│  │  │                                                              │   │   │
│  │  │  Default Provider: [Claude ▼]                                │   │   │
│  │  │  Fallback on Rate Limit: [OpenAI ▼]                          │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  AGENT CONFIGURATION                                         │   │   │
│  │  │                                                              │   │   │
│  │  │  Max Concurrent Agents: [3 ▼]                                │   │   │
│  │  │  Default Worktree Base: [~/.archon/worktrees]               │   │   │
│  │  │  Auto-cleanup Worktrees: [After 7 days ▼]                    │   │   │
│  │  │  Memory Layer: [File-based ▼] [Graphiti (Pro)]               │   │   │
│  │  │                                                              │   │   │
│  │  │  Verification Settings:                                      │   │   │
│  │  │  ☑ Run tests on completion                                   │   │   │
│  │  │  ☑ Type check on completion                                  │   │   │
│  │  │  ☑ Lint check on completion                                  │   │   │
│  │  │  ☐ Auto-push on success                                      │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. Multi-Platform Adapter System

Users can enable/disable control surfaces through the web UI:

```typescript
interface PlatformConfig {
  telegram?: {
    enabled: boolean;
    botToken: string;
    allowedUserIds?: string[];  // Optional whitelist
    streamingMode: 'stream' | 'batch';
  };
  slack?: {
    enabled: boolean;
    botToken: string;
    appToken: string;
    allowedUserIds?: string[];
    streamingMode: 'stream' | 'batch';
  };
  discord?: {
    enabled: boolean;
    botToken: string;
    allowedUserIds?: string[];
    streamingMode: 'stream' | 'batch';
  };
  whatsapp?: {
    enabled: boolean;
    provider: 'twilio' | 'whatsapp-business-api';
    accountSid?: string;  // Twilio
    authToken?: string;
    phoneNumber?: string;
  };
}
```

**Existing V1.0 Adapters to Port:**
- ✅ Telegram (already wired to V1.1)
- ✅ Slack (`src/adapters/slack.ts` - Socket Mode, markdown blocks)
- ✅ Discord (`src/adapters/discord.ts` - Thread support, mentions)
- 🆕 WhatsApp (Twilio integration)
- 🆕 Browser Extension (WebSocket to orchestrator)

### 3. Multi-LLM Provider Support

```typescript
interface LLMConfig {
  providers: {
    claude?: {
      enabled: boolean;
      authType: 'oauth' | 'api_key';
      oauthToken?: string;
      apiKey?: string;
      defaultModel: 'sonnet' | 'opus' | 'haiku';
    };
    openai?: {
      enabled: boolean;
      apiKey: string;
      defaultModel: 'gpt-4' | 'gpt-4-turbo' | 'gpt-3.5-turbo';
      organization?: string;
    };
    ollama?: {
      enabled: boolean;
      baseUrl: string;  // e.g., 'http://localhost:11434'
      defaultModel: string;  // e.g., 'codellama'
    };
    anthropic_bedrock?: {
      enabled: boolean;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
    };
  };
  defaultProvider: 'claude' | 'openai' | 'ollama' | 'anthropic_bedrock';
  fallbackProvider?: string;  // Use if primary hits rate limit
  costThreshold?: number;  // Alert if daily cost exceeds this
}
```

### 4. Billing & Usage

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BILLING                                                                    │
│                                                                             │
│  Current Plan: Pro ($29/mo)                    [Change Plan] [Cancel]       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  THIS MONTH                                                         │   │
│  │                                                                     │   │
│  │  Tasks Completed:        47                                         │   │
│  │  Agent Hours:            12.5 hrs                                   │   │
│  │  LLM Tokens Used:        2.1M tokens                                │   │
│  │  Estimated LLM Cost:     $42.30                                     │   │
│  │                                                                     │   │
│  │  ─────────────────────────────────────────────────────────────────  │   │
│  │                                                                     │   │
│  │  Usage Breakdown by Provider:                                       │   │
│  │  🤖 Claude:    1.8M tokens  ($38.50)                                │   │
│  │  🧠 OpenAI:    0.3M tokens  ($3.80)                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  INVOICES                                                           │   │
│  │                                                                     │   │
│  │  Dec 2024    $29.00 + $42.30 = $71.30    Paid ✅    [Download]     │   │
│  │  Nov 2024    $29.00 + $38.10 = $67.10    Paid ✅    [Download]     │   │
│  │  Oct 2024    $29.00 + $25.40 = $54.40    Paid ✅    [Download]     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Pricing Model Options:**
1. **Subscription + Usage** - Monthly fee + LLM costs pass-through
2. **Pure Usage** - Pay per task/token only
3. **Self-hosted** - Bring your own infrastructure, free software

### 5. Help & Documentation Portal

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DOCUMENTATION                                                              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🚀 GETTING STARTED                                                 │   │
│  │                                                                     │   │
│  │  1. Connect Your First Integration                                  │   │
│  │     → Quick setup for Telegram, Slack, or Discord                   │   │
│  │                                                                     │   │
│  │  2. Add Your Codebase                                               │   │
│  │     → Clone a repo or connect to GitHub                             │   │
│  │                                                                     │   │
│  │  3. Run Your First Task                                             │   │
│  │     → "Fix the bug in login.ts"                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  📚 GUIDES                                                          │   │
│  │                                                                     │   │
│  │  • Understanding the God-Tier Orchestrator                          │   │
│  │  • Verification: Why We Don't Trust Agents                          │   │
│  │  • Recovery: What Happens When Tasks Fail                           │   │
│  │  • Memory: Cross-Session Context                                    │   │
│  │  • Multi-Agent: Running 12 Agents in Parallel                       │   │
│  │  • Browser Extension: Visual Control                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🔌 API REFERENCE                                                   │   │
│  │                                                                     │   │
│  │  REST API: https://api.agentcommander.io/v1/                        │   │
│  │  WebSocket: wss://ws.agentcommander.io                              │   │
│  │                                                                     │   │
│  │  [View OpenAPI Spec] [Download SDK]                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6. Self-Service Configuration Flow

```typescript
// User onboarding flow
interface OnboardingStep {
  step: number;
  title: string;
  description: string;
  required: boolean;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    step: 1,
    title: 'Choose Your Control Surface',
    description: 'Connect Telegram, Slack, Discord, or start with the web dashboard',
    required: true
  },
  {
    step: 2,
    title: 'Add LLM Provider',
    description: 'Connect Claude (recommended), OpenAI, or local Ollama',
    required: true
  },
  {
    step: 3,
    title: 'Connect Your Codebase',
    description: 'Clone a GitHub repo or connect with OAuth',
    required: true
  },
  {
    step: 4,
    title: 'Configure Agent Pool',
    description: 'Set max agents, worktree location, verification rules',
    required: false
  },
  {
    step: 5,
    title: 'Set Up Billing',
    description: 'Choose plan and add payment method',
    required: false  // Can use free tier initially
  }
];
```

---

## Updated Implementation Plan

### Phase 1: Core Orchestrator (Week 1-2) ✅ Done
- [x] God-Tier Orchestrator class
- [x] Verification Engine
- [x] Recovery Manager
- [x] Task Queue
- [x] Redis pub/sub messaging

### Phase 2: Multi-Platform Adapters (Week 2-3)
- [x] Telegram integration for V1.1
- [ ] Port Slack adapter to V1.1
- [ ] Port Discord adapter to V1.1
- [ ] WhatsApp adapter (Twilio)

### Phase 3: Web Administration Portal (Week 3-5)
- [ ] Authentication (OAuth2 / Magic Link)
- [ ] Dashboard (agent status, queue, activity)
- [ ] Settings UI (integrations, LLMs, preferences)
- [ ] Billing integration (Stripe)
- [ ] Help/docs portal

### Phase 4: Multi-LLM Support (Week 4-5)
- [ ] Abstract LLM provider interface
- [ ] OpenAI client wrapper
- [ ] Ollama client wrapper
- [ ] Provider selection logic
- [ ] Fallback handling

### Phase 5: Memory Layer (Week 5-6)
- [ ] File-based memory (always available)
- [ ] Memory search/retrieval
- [ ] Context injection into prompts
- [ ] Session insight extraction

### Phase 6: Browser Extension (Week 6-7)
- [ ] Chrome extension
- [ ] Tab detection (claude.ai)
- [ ] WebSocket to orchestrator
- [ ] Control overlay injection

### Phase 7: QA Loop (Week 7-8)
- [ ] QA Reviewer integration
- [ ] QA Fixer integration
- [ ] Issue tracking
- [ ] Recurring issue detection

### Phase 8: Polish & Launch (Week 8-10)
- [ ] Documentation
- [ ] Testing
- [ ] Performance optimization
- [ ] Production deployment
- [ ] Launch marketing

---

## Database Schema (Productization)

```sql
-- Users table (for multi-tenant support)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User configuration
CREATE TABLE user_config (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Platform configs (JSONB for flexibility)
  telegram_config JSONB,
  slack_config JSONB,
  discord_config JSONB,
  whatsapp_config JSONB,

  -- LLM configs
  llm_config JSONB,

  -- Agent settings
  max_agents INTEGER DEFAULT 3,
  worktree_base VARCHAR(255) DEFAULT '~/.archon/worktrees',
  verification_settings JSONB,

  -- Preferences
  default_streaming_mode VARCHAR(10) DEFAULT 'stream',
  timezone VARCHAR(50) DEFAULT 'UTC',

  PRIMARY KEY (user_id)
);

-- Billing
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  plan VARCHAR(50) NOT NULL,  -- 'free', 'pro', 'enterprise'
  status VARCHAR(50) NOT NULL,  -- 'active', 'cancelled', 'past_due'
  stripe_subscription_id VARCHAR(255),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage tracking
CREATE TABLE usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,  -- 'task_completed', 'tokens_used', 'agent_hour'
  provider VARCHAR(50),  -- 'claude', 'openai', etc.
  quantity NUMERIC NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_events_user_date ON usage_events(user_id, created_at);
```

---

## Tech Stack (Updated)

| Layer | Technology |
|-------|------------|
| **Frontend** | React + TypeScript + Tailwind |
| **Backend** | Bun + Express + TypeScript |
| **Database** | PostgreSQL 16 |
| **Cache/Queue** | Redis 7 |
| **Auth** | Clerk or Auth0 (OAuth2/OIDC) |
| **Payments** | Stripe |
| **Hosting** | Docker + Railway/Fly.io |
| **LLM SDKs** | Claude Agent SDK, OpenAI SDK, Ollama |

---

## Next Steps

1. **Review this PRD** with stakeholders
2. **Prototype** Web admin portal (auth + settings)
3. **Port** Slack/Discord adapters to V1.1
4. **Test** multi-LLM provider switching
5. **Iterate** based on real usage

---

*"Agents execute. Orchestrators verify. Humans approve. Users configure."*
