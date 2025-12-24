#!/usr/bin/env python3
"""
Claude Code Knowledge Base
Query and manage persistent project knowledge.
"""

import sys
import os
import re
from pathlib import Path
from datetime import datetime

def get_kb_dir():
    return Path.home() / ".claude" / "knowledge"

def list_knowledge():
    kb_dir = get_kb_dir()
    if not kb_dir.exists():
        print("No knowledge base found.")
        return
    
    files = sorted(kb_dir.glob("*.md"))
    files = [f for f in files if not f.name.startswith("_")]
    
    print("=" * 60)
    print("🧠 KNOWLEDGE BASE")
    print("=" * 60)
    print()
    
    for f in files:
        name = f.stem
        # Count sections
        content = f.read_text()
        sections = len(re.findall(r'^## ', content, re.MULTILINE))
        decisions = len(re.findall(r'^### ', content, re.MULTILINE))
        
        print(f"  {name:25} {sections} sections, {decisions} entries")
    
    print()
    print("Commands:")
    print("  claude-kb                    # List all knowledge bases")
    print("  claude-kb <project>          # View project knowledge")
    print("  claude-kb <project> <query>  # Search for specific topic")
    print("  claude-kb new <project>      # Create new knowledge base")
    print("  claude-kb add <project>      # Add entry to knowledge base")
    print()

def view_knowledge(project: str, query: str = None):
    kb_dir = get_kb_dir()
    
    # Find matching file
    matches = list(kb_dir.glob(f"*{project}*.md"))
    matches = [m for m in matches if not m.name.startswith("_")]
    
    if not matches:
        print(f"❌ No knowledge base found for '{project}'")
        print("Run 'claude-kb new {project}' to create one.")
        return
    
    if len(matches) > 1:
        print("Multiple matches:")
        for m in matches:
            print(f"  - {m.stem}")
        return
    
    kb_file = matches[0]
    content = kb_file.read_text()
    
    if query:
        # Search within the file
        print(f"🔍 Searching '{kb_file.stem}' for: {query}")
        print("=" * 60)
        
        lines = content.split('\n')
        matches_found = []
        current_section = ""
        current_subsection = ""
        
        for i, line in enumerate(lines):
            if line.startswith('## '):
                current_section = line[3:].strip()
            elif line.startswith('### '):
                current_subsection = line[4:].strip()
            
            if query.lower() in line.lower():
                # Get context (5 lines before and after)
                start = max(0, i - 2)
                end = min(len(lines), i + 5)
                context = '\n'.join(lines[start:end])
                matches_found.append({
                    'section': current_section,
                    'subsection': current_subsection,
                    'context': context
                })
        
        if matches_found:
            for m in matches_found[:5]:  # Show top 5 matches
                print(f"\n📍 {m['section']} > {m['subsection']}")
                print("-" * 40)
                print(m['context'])
                print()
        else:
            print(f"No matches found for '{query}'")
    else:
        # Show full knowledge base
        print(content)

def create_knowledge(project: str):
    kb_dir = get_kb_dir()
    kb_dir.mkdir(parents=True, exist_ok=True)
    
    kb_file = kb_dir / f"{project}.md"
    
    if kb_file.exists():
        print(f"❌ Knowledge base '{project}' already exists")
        return
    
    template = (kb_dir / "_template.md").read_text()
    content = template.replace("[Project Name]", project.replace("-", " ").title())
    content = content.replace("[Date]", datetime.now().strftime("%Y-%m-%d"))
    
    kb_file.write_text(content)
    print(f"✓ Created knowledge base: {kb_file}")
    print(f"Edit it: code {kb_file}")

def add_entry(project: str):
    kb_dir = get_kb_dir()
    
    matches = list(kb_dir.glob(f"*{project}*.md"))
    matches = [m for m in matches if not m.name.startswith("_")]
    
    if not matches:
        print(f"❌ No knowledge base found for '{project}'")
        return
    
    kb_file = matches[0]
    
    print("What type of entry?")
    print("  1. Architecture Decision")
    print("  2. Gotcha/Pitfall")
    print("  3. Runbook")
    
    choice = input("Choice (1-3): ").strip()
    
    if choice == "1":
        title = input("Decision title: ")
        decision = input("What was decided: ")
        rationale = input("Why: ")
        
        entry = f"""
### {title}
**Decision:** {decision}
**Rationale:** {rationale}
**Date:** {datetime.now().strftime("%Y-%m-%d")}
**Status:** Confirmed
"""
    elif choice == "2":
        title = input("Gotcha title: ")
        problem = input("Problem: ")
        solution = input("Solution: ")
        files = input("Relevant files: ")
        
        entry = f"""
### {title}
**Problem:** {problem}
**Solution:** {solution}
**Files:** {files}
"""
    elif choice == "3":
        title = input("Runbook title: ")
        steps = []
        print("Enter steps (empty line to finish):")
        i = 1
        while True:
            step = input(f"  {i}. ")
            if not step:
                break
            steps.append(f"{i}. {step}")
            i += 1
        
        entry = f"""
### {title}
{chr(10).join(steps)}
"""
    else:
        print("Invalid choice")
        return
    
    # Append to file
    with open(kb_file, 'a') as f:
        f.write(entry)
    
    print(f"✓ Added entry to {kb_file.stem}")

def main():
    if len(sys.argv) < 2:
        list_knowledge()
        return
    
    cmd = sys.argv[1]
    
    if cmd in ["-h", "--help", "help"]:
        list_knowledge()
        return
    
    if cmd == "new":
        if len(sys.argv) < 3:
            print("Usage: claude-kb new <project-name>")
            return
        create_knowledge(sys.argv[2])
        return
    
    if cmd == "add":
        if len(sys.argv) < 3:
            print("Usage: claude-kb add <project-name>")
            return
        add_entry(sys.argv[2])
        return
    
    # View or search
    project = cmd
    query = sys.argv[2] if len(sys.argv) > 2 else None
    view_knowledge(project, query)

if __name__ == "__main__":
    main()
