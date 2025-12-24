#!/usr/bin/env python3
"""
Claude Code Agent Chain Runner
Displays multi-agent workflows step by step.
"""

import sys
import yaml
from pathlib import Path

def get_chains_dir():
    return Path.home() / ".claude" / "chains"

def list_chains():
    chains_dir = get_chains_dir()
    if not chains_dir.exists():
        print("No chains directory found.")
        return
    
    chains = sorted(chains_dir.glob("*.yaml"))
    
    print("=" * 60)
    print("⛓️  AGENT CHAINS")
    print("=" * 60)
    print()
    
    for chain_file in chains:
        try:
            with open(chain_file) as f:
                chain = yaml.safe_load(f)
            
            name = chain.get("name", chain_file.stem)
            desc = chain.get("description", "")
            time = chain.get("estimated_time", "?")
            steps = len(chain.get("steps", []))
            
            print(f"  {chain_file.stem:20} {steps} steps, ~{time}")
            print(f"  {' '*20} {desc[:50]}...")
            print()
        except Exception as e:
            print(f"  {chain_file.stem:20} (error loading: {e})")
    
    print()
    print("Usage:")
    print("  claude-chain <name>      # Show workflow steps")
    print("  claude-chain <name> -r   # Run mode (copy-paste commands)")
    print()

def show_chain(name: str, run_mode: bool = False):
    chains_dir = get_chains_dir()
    
    # Find matching chain
    matches = list(chains_dir.glob(f"*{name}*.yaml"))
    
    if not matches:
        print(f"❌ No chain found matching '{name}'")
        print("Run 'claude-chain' to see available chains.")
        return
    
    if len(matches) > 1:
        print(f"Multiple matches:")
        for m in matches:
            print(f"  - {m.stem}")
        return
    
    chain_file = matches[0]
    
    with open(chain_file) as f:
        chain = yaml.safe_load(f)
    
    name = chain.get("name", chain_file.stem)
    desc = chain.get("description", "")
    time = chain.get("estimated_time", "?")
    steps = chain.get("steps", [])
    summary = chain.get("summary", "")
    
    print("=" * 60)
    print(f"⛓️  {name}")
    print("=" * 60)
    print()
    print(f"📝 {desc}")
    print(f"⏱️  Estimated time: {time}")
    print(f"📊 {len(steps)} steps")
    print()
    
    if run_mode:
        print("=" * 60)
        print("🚀 RUN MODE - Copy these commands into Claude Code")
        print("=" * 60)
        print()
        
        for i, step in enumerate(steps, 1):
            agent = step.get("agent", "unknown")
            task = step.get("task", "")
            output = step.get("output")
            compact = step.get("compact_after", False)
            
            print(f"# Step {i}: {agent}")
            print(f"@{agent} {task}")
            if output:
                print(f"# → Output: {output}")
            if compact and i < len(steps):
                print()
                print("# Then run:")
                print("/compact")
            print()
            print("-" * 40)
            print()
    else:
        print("WORKFLOW STEPS:")
        print("-" * 60)
        print()
        
        for i, step in enumerate(steps, 1):
            agent = step.get("agent", "unknown")
            task = step.get("task", "")
            output = step.get("output")
            compact = step.get("compact_after", False)
            
            print(f"  {i}. @{agent}")
            print(f"     Task: {task}")
            if output:
                print(f"     Output: {output}")
            if compact:
                print(f"     → /compact after")
            print()
        
        if summary:
            print("-" * 60)
            print("SUMMARY:")
            print(summary)
        
        print()
        print("💡 Run with -r flag for copy-paste commands:")
        print(f"   claude-chain {chain_file.stem} -r")
        print()

def main():
    if len(sys.argv) < 2:
        list_chains()
        return
    
    name = sys.argv[1]
    
    if name in ["-h", "--help", "help"]:
        list_chains()
        return
    
    run_mode = "-r" in sys.argv or "--run" in sys.argv
    
    show_chain(name, run_mode)

if __name__ == "__main__":
    main()
