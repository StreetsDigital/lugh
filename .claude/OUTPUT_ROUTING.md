# Output Routing Convention

When agents complete work, they save outputs to these locations:

## Standard Directories

```
{project}/
├── docs/
│   └── audits/           # Audit findings go here
│       ├── 2025-12-20-security-api.md
│       ├── 2025-12-20-audit-go.md
│       └── ...
├── reports/              # Generated reports
│   ├── production-readiness.md
│   ├── cost-analysis.md
│   └── ...
└── .claude/
    └── checkpoints/      # Work-in-progress saves
```

## Naming Convention

`{date}-{agent-name}.md`

Examples:
- `2025-12-20-security-api.md`
- `2025-12-20-audit-go.md`
- `2025-12-20-meta-production-readiness.md`

## How Agents Use This

Agents with OUTPUT_ROUTING in their prompt will:
1. Create the output directory if needed
2. Save findings as markdown
3. Print the file path at the end

## Quick Commands

```bash
# View recent audits
ls -lt docs/audits/ | head -10

# View all reports
ls reports/

# Find today's outputs
find . -name "2025-12-20-*.md" -type f
```
