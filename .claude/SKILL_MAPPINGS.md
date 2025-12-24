# Agent-Skill Integration

Skills are detailed instruction files that teach Claude Code best practices for specific tasks.
When agents have skill references, they automatically load that knowledge before starting work.

## ✅ Agents with Skills Integrated

| Agent | Skills Loaded |
|-------|---------------|
| `build-mcp` | MCP builder + Python/TypeScript guides |
| `audit-mcp` | MCP best practices |
| `perf-mcp` | MCP best practices |
| `arch-reporting` | xlsx + pptx (for outputs) |
| `arch-dashboard` | frontend-design |
| `arch-ui` | frontend-design |
| `arch-component` | frontend-design + theme-factory |
| `audit-docs` | docx |

## 📁 Available Skills

### Public Skills (Core)
```
/mnt/skills/public/
├── docx/SKILL.md          # Word documents
├── xlsx/SKILL.md          # Spreadsheets  
├── pptx/SKILL.md          # Presentations
├── pdf/SKILL.md           # PDF handling
└── frontend-design/SKILL.md # UI/UX design
```

### Example Skills (Advanced)
```
/mnt/skills/examples/
├── mcp-builder/SKILL.md    # Build MCP servers
├── skill-creator/SKILL.md  # Create new skills
├── theme-factory/SKILL.md  # Theming systems
├── canvas-design/SKILL.md  # Visual design
├── algorithmic-art/SKILL.md # Generative art
└── internal-comms/SKILL.md  # Comms templates
```

### User Skills (Custom)
```
/mnt/skills/user/
├── apollo-icp-refiner/SKILL.md    # Lead generation
└── automate-engage-brand/SKILL.md # Brand guidelines
```

## 🔧 How to Add Skills to an Agent

1. Identify relevant skill(s) from the lists above
2. Edit the agent file in `~/.claude/agents/`
3. Add a SKILLS section after the YAML front matter:

```markdown
---
name: my-agent
description: Does something
tools: Read, Grep, Glob, Bash
model: sonnet
---

SKILLS:
Before starting, read these skills:
- /mnt/skills/public/xlsx/SKILL.md
- /mnt/skills/examples/mcp-builder/SKILL.md

You are a specialist in...
```

4. The agent will now read those skills before each task

## 💡 Tips

- Only add skills that are directly relevant to the agent's domain
- Skills add context but also consume tokens — be selective
- For output-focused agents (reports, docs), add the relevant format skill
- For builder agents, add the relevant framework/protocol skill

## 🆕 Creating New Skills

Use the skill-creator skill to build your own:
```
Read /mnt/skills/examples/skill-creator/SKILL.md
```

Skills go in `/mnt/skills/user/` and can include:
- SKILL.md (main instructions)
- Reference files
- Templates
- Examples
