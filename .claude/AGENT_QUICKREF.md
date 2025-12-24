# Claude Code Agent Army — Quick Reference

## ⚡ ALL COMMANDS

```bash
source ~/.zshrc  # Load aliases first!
```

### 📚 Reference
```bash
claude-agents      # Full agent catalogue
claude-quickref    # This cheatsheet
claude-guide       # HTML guide (opens browser)
claude-skills      # Skill mappings
claude-hooks       # Hook documentation
claude-outputs     # Output routing guide
```

### 🔧 Utilities
```bash
claude-cost        # Token usage + cost report
claude-digest      # Daily activity summary
claude-sessions    # Find past sessions
claude-checkpoints # View saved progress
```

### 🚀 Workflows
```bash
claude-chain       # Multi-agent workflows
claude-prompt      # Reusable prompts
claude-new         # Scaffold new projects
claude-context     # Generate CLAUDE.md
claude-git         # Git workflow helper
claude-kb          # Knowledge base
```

---

## 🤖 AGENT CATEGORIES (59 total)

| Prefix | Purpose | Count |
|--------|---------|-------|
| `adtech-` | Programmatic ads | 7 |
| `arch-` | Architecture | 10 |
| `audit-` | Code review | 11 |
| `build-` | Creating | 5 |
| `infra-` | Infrastructure | 6 |
| `perf-` | Performance | 6 |
| `security-` | Security | 5 |
| `ai-` | AI/ML | 4 |
| `auto-` | Automation | 3 |
| `meta-` | Routing | 2 |

---

## ⛓️ CHAINS — Full Breakdown

```bash
claude-chain <name>      # View steps
claude-chain <name> -r   # Copy-paste commands
```

### full-audit (8 steps, 2-3h)
```
@audit-go → @audit-python → @audit-tests → @audit-concurrency
→ @security-api → @security-privacy → @perf-latency → @meta-production-readiness
```

### security-check (2 steps, 30-45m)
```
@security-api → @security-deps
```

### pr-review (3 steps, 30-60m)
```
@audit-code → @audit-tests → @security-api
```

### onboarding (3 steps, 1-2h)
```
@arch-investigator → @audit-docs → @audit-tests
```

### mcp-build (4 steps, 2-4h)
```
@build-mcp → @audit-mcp → @audit-tests → @audit-docs
```

### bidder-build (4 steps, 3-4h)
```
@adtech-bidder → @audit-go → @audit-tests → @adtech-ortb
```

### perf-analysis (3 steps, 1-2h)
```
@perf-latency → @perf-memory → @perf-cost
```

### docs-sprint (4 steps, 2-3h)
```
@arch-investigator → @audit-docs → @arch-api → @build-docs
```

### Pipelines (iterative loops)
- `pipeline-code-review` — Write → Review → Fix → Repeat
- `pipeline-security` — Scan → Fix → Verify → Repeat
- `pipeline-coverage` — Find gaps → Write tests → Verify

---

## 🎯 SKILLS — What's Available

Skills are instruction files that teach Claude Code best practices.

### Public Skills (Core)
| Skill | Path | Use For |
|-------|------|---------|
| `docx` | /mnt/skills/public/docx/SKILL.md | Word documents |
| `xlsx` | /mnt/skills/public/xlsx/SKILL.md | Spreadsheets |
| `pptx` | /mnt/skills/public/pptx/SKILL.md | Presentations |
| `pdf` | /mnt/skills/public/pdf/SKILL.md | PDF handling |
| `frontend-design` | /mnt/skills/public/frontend-design/SKILL.md | UI/UX design |

### Example Skills (Advanced)
| Skill | Path | Use For |
|-------|------|---------|
| `mcp-builder` | /mnt/skills/examples/mcp-builder/SKILL.md | Build MCP servers |
| `skill-creator` | /mnt/skills/examples/skill-creator/SKILL.md | Create new skills |
| `theme-factory` | /mnt/skills/examples/theme-factory/SKILL.md | Theming systems |
| `canvas-design` | /mnt/skills/examples/canvas-design/SKILL.md | Visual design |
| `internal-comms` | /mnt/skills/examples/internal-comms/SKILL.md | Comms templates |

### User Skills (Custom)
| Skill | Path | Use For |
|-------|------|---------|
| `apollo-icp-refiner` | /mnt/skills/user/apollo-icp-refiner/SKILL.md | Lead generation |
| `automate-engage-brand` | /mnt/skills/user/automate-engage-brand/SKILL.md | Brand guidelines |

### Agents with Skills Pre-Loaded
| Agent | Skills |
|-------|--------|
| `build-mcp` | mcp-builder + Python/TS guides |
| `audit-mcp` | mcp-builder best practices |
| `perf-mcp` | mcp-builder best practices |
| `arch-reporting` | xlsx + pptx |
| `arch-dashboard` | frontend-design |
| `arch-ui` | frontend-design |
| `arch-component` | frontend-design + theme-factory |
| `audit-docs` | docx |

---

## 📝 PROMPTS (claude-prompt)

```bash
claude-prompt                # List all
claude-prompt pr-review      # Copy to clipboard
claude-prompt pr-review -p   # Print
```

| Prompt | Use For |
|--------|---------|
| `pr-review` | Thorough PR review (security, perf, tests) |
| `explain-codebase` | 5-min orientation to any codebase |
| `write-tests` | Comprehensive tests with edge cases |
| `fix-bug` | Debug → diagnose → fix → verify |
| `refactor` | Clean up without changing behaviour |
| `document-api` | Generate API docs in markdown |
| `performance` | Find bottlenecks and hotspots |
| `new-bidder` | Create SSP/DSP adapter |
| `quick-fix` | Minimal change, no extras |
| `debug-error` | Parse error → fix in 5 mins |
| `write-spec` | Technical spec for feature |
| `client-report` | Summarise for non-technical client |

---

## 🏗️ TEMPLATES (claude-new)

```bash
claude-new <template> <name> "description"
```

| Template | What You Get |
|----------|--------------|
| `mcp-typescript` | MCP server + TypeScript SDK setup |
| `mcp-python` | MCP server + Pydantic models |
| `fastapi` | FastAPI service + Docker + settings |
| `prebid-adapter` | Go bidder adapter for PBS |
| `n8n-workflow` | n8n workflow JSON template |

---

## 🪝 HOOKS (7 available)

```bash
claude-hooks    # View documentation
/hooks          # Enable in Claude Code
```

| Hook | Trigger | What It Does |
|------|---------|--------------|
| `notify-complete.py` | Notification | macOS alert when awaiting input |
| `safety-check.sh` | PreToolUse/Bash | Blocks `rm -rf /` etc. |
| `log-commands.sh` | PreToolUse/Bash | Logs to ~/.claude/logs/ |
| `auto-format.sh` | PostToolUse/Edit | Formats Go, Python, TS, JSON |
| `auto-test.sh` | PostToolUse/Edit | Runs tests on test files |
| `session-context.sh` | SessionStart | Shows git status |
| `slack-notify.sh` | Notification | Slack notification |

---

## 🔗 GIT WORKFLOW (claude-git)

```bash
claude-git branch audit-go fix-auth  # Create branch
claude-git save audit-go             # Quick commit
claude-git commit "Message"          # Full commit
claude-git pr "Title"                # Push + PR
claude-git wrap main "Title"         # Squash + Push + PR
claude-git status                    # Current state
claude-git diff                      # Diff from main
claude-git squash                    # Squash commits
```

---

## 🧠 KNOWLEDGE BASE (claude-kb)

```bash
claude-kb                 # List all
claude-kb nexus           # View project KB
claude-kb nexus redis     # Search for topic
claude-kb new copper-bot  # Create new
claude-kb add nexus       # Add entry
```

Contains: Architecture decisions, gotchas, conventions, runbooks, contacts.

---

## 🔄 RECOVERY

```bash
# Find sessions
claude-sessions --last 5

# Resume
claude --resume
claude --resume <session-id>

# Check checkpoints
claude-checkpoints
claude-checkpoints show nexus
```

---

## 💡 QUICK DECISIONS

| I need to... | Use |
|-------------|-----|
| Not sure what to do | `@meta-dispatcher` |
| Run full audit | `claude-chain full-audit -r` |
| Quick security check | `claude-chain security-check -r` |
| Review a PR | `claude-chain pr-review -r` |
| Understand new codebase | `claude-chain onboarding -r` |
| Build MCP server | `claude-new mcp-typescript my-mcp` |
| Production check | `@meta-production-readiness` |
| Review Go code | `@audit-go` |
| Review Python code | `@audit-python` |
| Security audit | `@security-api` + `@security-privacy` |
| Track costs | `claude-cost` |
| Daily summary | `claude-digest` |
| Resume crashed session | `claude-sessions` → `claude --resume` |
| Search project knowledge | `claude-kb <project> <query>` |

---

## ⚠️ CONTEXT MANAGEMENT

```bash
/compact                    # Free context
/compact focus on security  # Bias retention
/cost                       # Check usage
```

---

*59 agents • 16 commands • 11 chains • 12 prompts • 5 templates • 7 hooks*
*Built for Streets Digital Ltd — December 2025*
