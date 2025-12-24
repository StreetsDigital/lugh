#!/usr/bin/env python3
"""
Claude Code Context Generator
Creates CLAUDE.md files for projects to auto-load context.
"""

import os
import sys
from pathlib import Path

TEMPLATE = '''# {project_name} - Claude Code Context

## Project Overview

{description}

---

## Before Starting Any Task

Read these files to understand the system:
{key_files}

---

## Agent Recommendations

Use these agents from `~/.claude/agents/`:

| Task | Agent |
|------|-------|
| Production readiness | `meta-production-readiness` |
| Code review | `audit-go` or `audit-python` |
| Security audit | `security-api`, `security-privacy` |
| Infrastructure | `infra-investigator` |

Run `/compact` between agents to manage context.

---

## Key Directories

```
{directory_tree}
```

---

## Conventions

{conventions}
'''

def detect_project_type(project_path: Path) -> dict:
    """Detect project type and key files."""
    info = {
        "type": "unknown",
        "key_files": [],
        "conventions": []
    }
    
    # Check for Python
    if (project_path / "pyproject.toml").exists():
        info["type"] = "python"
        info["key_files"].append("pyproject.toml")
        info["conventions"].append("- **Python**: Use type hints, async/await where applicable")
    if (project_path / "requirements.txt").exists():
        info["key_files"].append("requirements.txt")
    
    # Check for Go
    if (project_path / "go.mod").exists():
        info["type"] = "go"
        info["key_files"].append("go.mod")
        info["conventions"].append("- **Go**: Standard project layout, error wrapping")
    
    # Check for Node
    if (project_path / "package.json").exists():
        info["type"] = "node"
        info["key_files"].append("package.json")
        info["conventions"].append("- **Node**: ESM modules, TypeScript preferred")
    
    # Common files
    if (project_path / "README.md").exists():
        info["key_files"].insert(0, "README.md")
    if (project_path / "docker-compose.yml").exists():
        info["key_files"].append("docker-compose.yml")
    if (project_path / ".env.example").exists():
        info["key_files"].append(".env.example")
    
    # Docs directory
    docs_dir = project_path / "docs"
    if docs_dir.exists():
        for f in docs_dir.glob("*.md"):
            info["key_files"].append(f"docs/{f.name}")
    
    return info

def get_directory_tree(project_path: Path, max_depth: int = 2) -> str:
    """Generate a simple directory tree."""
    lines = []
    
    def walk(path: Path, prefix: str = "", depth: int = 0):
        if depth > max_depth:
            return
        
        items = sorted(path.iterdir(), key=lambda x: (x.is_file(), x.name))
        dirs = [i for i in items if i.is_dir() and not i.name.startswith('.') and i.name not in ['node_modules', 'venv', '.venv', '__pycache__', '.git']]
        
        for i, d in enumerate(dirs[:10]):  # Limit to 10 dirs
            is_last = i == len(dirs) - 1
            lines.append(f"{prefix}{'└── ' if is_last else '├── '}{d.name}/")
            walk(d, prefix + ('    ' if is_last else '│   '), depth + 1)
    
    walk(project_path)
    return '\n'.join(lines) if lines else "(empty)"

def generate_claude_md(project_path: Path, project_name: str = None, description: str = None):
    """Generate CLAUDE.md for a project."""
    
    if project_name is None:
        project_name = project_path.name
    
    info = detect_project_type(project_path)
    
    if description is None:
        description = f"A {info['type']} project. Add a description here."
    
    key_files = '\n'.join(f"- `{f}`" for f in info['key_files'][:10])
    conventions = '\n'.join(info['conventions']) if info['conventions'] else "- Add project conventions here"
    directory_tree = get_directory_tree(project_path)
    
    content = TEMPLATE.format(
        project_name=project_name,
        description=description,
        key_files=key_files,
        directory_tree=directory_tree,
        conventions=conventions
    )
    
    return content

def main():
    if len(sys.argv) < 2:
        print("Usage: context-generator.py <project-path> [project-name] [description]")
        print()
        print("Generates a CLAUDE.md file for the project.")
        print("Claude Code automatically reads this file at session start.")
        return
    
    project_path = Path(sys.argv[1]).expanduser().resolve()
    
    if not project_path.exists():
        print(f"Error: {project_path} does not exist")
        return
    
    project_name = sys.argv[2] if len(sys.argv) > 2 else None
    description = sys.argv[3] if len(sys.argv) > 3 else None
    
    content = generate_claude_md(project_path, project_name, description)
    
    output_path = project_path / "CLAUDE.md"
    
    if output_path.exists():
        print(f"CLAUDE.md already exists at {output_path}")
        confirm = input("Overwrite? (y/N): ")
        if confirm.lower() != 'y':
            print("Cancelled.")
            return
    
    output_path.write_text(content)
    print(f"✓ Created {output_path}")
    print()
    print("Edit the file to add:")
    print("  - Project description")
    print("  - Key architecture decisions")
    print("  - Important files to read")
    print("  - Project conventions")

if __name__ == "__main__":
    main()
