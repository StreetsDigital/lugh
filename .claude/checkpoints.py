#!/usr/bin/env python3
"""
Claude Code Checkpoint Manager
View and manage agent checkpoint files.
"""

import os
from pathlib import Path
from datetime import datetime
import argparse

def get_checkpoints_dir():
    return Path.home() / ".claude" / "checkpoints"

def list_checkpoints():
    """List all checkpoint files."""
    cp_dir = get_checkpoints_dir()
    if not cp_dir.exists():
        print("No checkpoints directory found.")
        return []
    
    checkpoints = []
    for f in cp_dir.glob("*.md"):
        stat = f.stat()
        checkpoints.append({
            "name": f.stem,
            "path": f,
            "modified": datetime.fromtimestamp(stat.st_mtime),
            "size_kb": stat.st_size / 1024,
        })
    
    return sorted(checkpoints, key=lambda x: x["modified"], reverse=True)

def show_checkpoint(name: str):
    """Display contents of a checkpoint file."""
    cp_dir = get_checkpoints_dir()
    
    # Find matching checkpoint
    matches = list(cp_dir.glob(f"*{name}*.md"))
    
    if not matches:
        print(f"No checkpoint found matching '{name}'")
        return
    
    if len(matches) > 1:
        print(f"Multiple matches found:")
        for m in matches:
            print(f"  - {m.stem}")
        return
    
    cp_file = matches[0]
    print(f"📋 {cp_file.stem}")
    print("=" * 60)
    print(cp_file.read_text())

def clear_checkpoint(name: str):
    """Delete a checkpoint file."""
    cp_dir = get_checkpoints_dir()
    matches = list(cp_dir.glob(f"*{name}*.md"))
    
    if not matches:
        print(f"No checkpoint found matching '{name}'")
        return
    
    for m in matches:
        m.unlink()
        print(f"🗑️  Deleted: {m.stem}")

def clear_all():
    """Delete all checkpoint files."""
    cp_dir = get_checkpoints_dir()
    if not cp_dir.exists():
        return
    
    count = 0
    for f in cp_dir.glob("*.md"):
        f.unlink()
        count += 1
    
    print(f"🗑️  Deleted {count} checkpoint(s)")

def main():
    parser = argparse.ArgumentParser(description="Manage Claude Code checkpoints")
    parser.add_argument("command", nargs="?", default="list", 
                       choices=["list", "show", "clear", "clear-all"],
                       help="Command to run")
    parser.add_argument("name", nargs="?", help="Checkpoint name (partial match)")
    args = parser.parse_args()

    print("=" * 60)
    print("📍 CLAUDE CODE CHECKPOINT MANAGER")
    print("=" * 60)
    print()

    if args.command == "list":
        checkpoints = list_checkpoints()
        
        if not checkpoints:
            print("No checkpoints found.")
            print()
            print("Checkpoints are created by opus agents during long-running tasks.")
            print(f"Directory: {get_checkpoints_dir()}")
            return
        
        print(f"Found {len(checkpoints)} checkpoint(s):\n")
        
        for cp in checkpoints:
            age = datetime.now() - cp["modified"]
            if age.days > 0:
                age_str = f"{age.days}d ago"
            elif age.seconds > 3600:
                age_str = f"{age.seconds // 3600}h ago"
            else:
                age_str = f"{age.seconds // 60}m ago"
            
            print(f"  📋 {cp['name']}")
            print(f"     Modified: {cp['modified'].strftime('%Y-%m-%d %H:%M')} ({age_str})")
            print(f"     Size: {cp['size_kb']:.1f} KB")
            print()
        
        print("Commands:")
        print("  Show:   python3 ~/.claude/checkpoints.py show <name>")
        print("  Clear:  python3 ~/.claude/checkpoints.py clear <name>")
        print("  Wipe:   python3 ~/.claude/checkpoints.py clear-all")
    
    elif args.command == "show":
        if not args.name:
            print("Usage: checkpoints.py show <name>")
            return
        show_checkpoint(args.name)
    
    elif args.command == "clear":
        if not args.name:
            print("Usage: checkpoints.py clear <name>")
            return
        clear_checkpoint(args.name)
    
    elif args.command == "clear-all":
        confirm = input("Delete ALL checkpoints? (y/N): ")
        if confirm.lower() == "y":
            clear_all()
        else:
            print("Cancelled.")

if __name__ == "__main__":
    main()
