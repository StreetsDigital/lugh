#!/usr/bin/env python3
"""
Claude Code Prompt Library
Quick access to reusable prompts.
"""

import sys
from pathlib import Path

def get_prompts_dir():
    return Path.home() / ".claude" / "prompts"

def list_prompts():
    prompts_dir = get_prompts_dir()
    if not prompts_dir.exists():
        print("No prompts directory found.")
        return
    
    prompts = sorted(prompts_dir.glob("*.md"))
    
    print("=" * 50)
    print("📝 PROMPT LIBRARY")
    print("=" * 50)
    print()
    
    for p in prompts:
        name = p.stem
        # Get first non-header line as description
        lines = p.read_text().strip().split('\n')
        desc = ""
        for line in lines[1:5]:
            line = line.strip()
            if line and not line.startswith('#'):
                desc = line[:50] + "..." if len(line) > 50 else line
                break
        
        print(f"  {name:20} {desc}")
    
    print()
    print("Usage:")
    print("  claude-prompt <name>     # Copy prompt to clipboard")
    print("  claude-prompt <name> -p  # Print prompt")
    print()
    print("In Claude Code, paste the prompt after your context:")
    print("  > Review this file: src/main.go [paste prompt]")

def get_prompt(name: str, print_only: bool = False):
    prompts_dir = get_prompts_dir()
    
    # Find matching prompt
    matches = list(prompts_dir.glob(f"*{name}*.md"))
    
    if not matches:
        print(f"No prompt found matching '{name}'")
        print("Run 'claude-prompt' to see available prompts")
        return
    
    if len(matches) > 1:
        print(f"Multiple matches:")
        for m in matches:
            print(f"  - {m.stem}")
        return
    
    prompt_file = matches[0]
    content = prompt_file.read_text().strip()
    
    if print_only:
        print(content)
    else:
        # Copy to clipboard (macOS)
        try:
            import subprocess
            subprocess.run(['pbcopy'], input=content.encode(), check=True)
            print(f"✓ Copied '{prompt_file.stem}' to clipboard")
            print()
            print("Paste it into Claude Code after your context.")
        except Exception as e:
            print(f"Couldn't copy to clipboard: {e}")
            print()
            print(content)

def main():
    if len(sys.argv) < 2:
        list_prompts()
        return
    
    name = sys.argv[1]
    print_only = "-p" in sys.argv or "--print" in sys.argv
    
    get_prompt(name, print_only)

if __name__ == "__main__":
    main()
