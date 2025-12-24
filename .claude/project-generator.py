#!/usr/bin/env python3
"""
Claude Code Project Generator
Scaffold new projects from templates.
"""

import os
import sys
import shutil
from pathlib import Path


def get_templates_dir():
    return Path.home() / ".claude" / "templates"


def list_templates():
    templates_dir = get_templates_dir()
    if not templates_dir.exists():
        print("No templates directory found.")
        return []
    
    templates = [d.name for d in templates_dir.iterdir() if d.is_dir()]
    return sorted(templates)


def show_help():
    print("=" * 50)
    print("🏗️  PROJECT GENERATOR")
    print("=" * 50)
    print()
    print("Usage:")
    print("  claude-new <template> <name> [description]")
    print()
    print("Templates:")
    for t in list_templates():
        desc = {
            "mcp-typescript": "MCP server in TypeScript",
            "mcp-python": "MCP server in Python",
            "fastapi": "FastAPI service with Docker",
            "prebid-adapter": "Prebid Server bidder adapter (Go)",
            "n8n-workflow": "n8n workflow template",
        }.get(t, "Custom template")
        print(f"  {t:20} {desc}")
    print()
    print("Examples:")
    print('  claude-new mcp-typescript my-mcp "My MCP server"')
    print('  claude-new fastapi my-api "REST API for widgets"')
    print('  claude-new prebid-adapter acme "Acme SSP adapter"')
    print()
    print("Output: Creates ./<name>/ directory with scaffolded project")


def replace_placeholders(content: str, replacements: dict) -> str:
    """Replace all placeholders in content."""
    for key, value in replacements.items():
        content = content.replace(f"{{{{{key}}}}}", value)
    return content


def generate_project(template: str, name: str, description: str = None):
    templates_dir = get_templates_dir()
    template_dir = templates_dir / template
    
    if not template_dir.exists():
        print(f"❌ Template '{template}' not found")
        print(f"Available: {', '.join(list_templates())}")
        return False
    
    # Output directory
    output_dir = Path.cwd() / name
    
    if output_dir.exists():
        print(f"❌ Directory '{name}' already exists")
        return False
    
    # Default description
    if not description:
        description = f"{name} - generated from {template} template"
    
    # Replacements
    replacements = {
        "NAME": name,
        "NAME_LOWER": name.lower().replace("-", "_"),
        "NAME_UPPER": name.upper().replace("-", "_"),
        "DESCRIPTION": description,
    }
    
    # Copy template
    print(f"Creating {name}/ from {template} template...")
    
    output_dir.mkdir(parents=True)
    
    for root, dirs, files in os.walk(template_dir):
        # Get relative path
        rel_root = Path(root).relative_to(template_dir)
        target_dir = output_dir / rel_root
        
        # Create directories
        for d in dirs:
            (target_dir / d).mkdir(exist_ok=True)
        
        # Copy and process files
        for f in files:
            source_file = Path(root) / f
            target_file = target_dir / f
            
            # Read content
            try:
                content = source_file.read_text()
                # Replace placeholders
                content = replace_placeholders(content, replacements)
                # Write
                target_file.write_text(content)
                print(f"  ✓ {target_file.relative_to(output_dir)}")
            except UnicodeDecodeError:
                # Binary file, just copy
                shutil.copy2(source_file, target_file)
                print(f"  ✓ {target_file.relative_to(output_dir)} (binary)")
    
    # Create CLAUDE.md for context
    claude_md = f"""# {name} - Claude Code Context

## Project Overview

{description}

Generated from template: {template}

---

## Before Starting

This project was scaffolded from a template. You may need to:

1. Review and update configuration
2. Add your API keys/secrets
3. Implement the TODO sections
4. Add tests

---

## Key Files

Check the README.md for setup instructions.
"""
    
    (output_dir / "CLAUDE.md").write_text(claude_md)
    print(f"  ✓ CLAUDE.md")
    
    print()
    print(f"✅ Created {name}/")
    print()
    print("Next steps:")
    print(f"  cd {name}")
    
    if template.startswith("mcp-"):
        if "typescript" in template:
            print("  npm install")
            print("  npm run build")
        else:
            print("  pip install -e .")
            print("  python src/server.py")
    elif template == "fastapi":
        print("  pip install -e .")
        print("  python src/main.py")
    elif template == "prebid-adapter":
        print("  # Copy files to your PBS adapters directory")
        print("  # Register adapter in exchange/adapter_builders.go")
    elif template == "n8n-workflow":
        print("  # Import workflow.json into n8n")
    
    return True


def main():
    if len(sys.argv) < 2:
        show_help()
        return
    
    if sys.argv[1] in ["-h", "--help", "help"]:
        show_help()
        return
    
    if len(sys.argv) < 3:
        print("❌ Missing project name")
        print("Usage: claude-new <template> <name> [description]")
        return
    
    template = sys.argv[1]
    name = sys.argv[2]
    description = sys.argv[3] if len(sys.argv) > 3 else None
    
    generate_project(template, name, description)


if __name__ == "__main__":
    main()
