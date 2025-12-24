#!/usr/bin/env python3
"""
Claude Code Session Inspector
Shows what's in each session so you can decide what to resume.
"""

import json
import os
from pathlib import Path
from datetime import datetime
import argparse

def get_projects_dir():
    return Path.home() / ".claude" / "projects"

def list_projects():
    projects_dir = get_projects_dir()
    if not projects_dir.exists():
        return []
    
    projects = []
    for p in projects_dir.iterdir():
        if p.is_dir():
            # Convert path format back to readable name
            name = p.name.replace("-Users-andrewstreets-", "~/")
            projects.append((name, p))
    return sorted(projects, key=lambda x: x[0])

def get_sessions(project_path: Path):
    """Get all session files for a project."""
    sessions = []
    for f in project_path.glob("*.jsonl"):
        if f.stat().st_size == 0:
            continue
        
        is_agent = f.name.startswith("agent-")
        session_id = f.stem
        
        # Get file stats
        stat = f.stat()
        modified = datetime.fromtimestamp(stat.st_mtime)
        size_kb = stat.st_size / 1024
        
        sessions.append({
            "id": session_id,
            "path": f,
            "is_agent": is_agent,
            "modified": modified,
            "size_kb": size_kb,
        })
    
    return sorted(sessions, key=lambda x: x["modified"], reverse=True)

def parse_session(session_path: Path, max_messages: int = 10):
    """Parse a session file and extract key info."""
    messages = []
    tool_calls = []
    agents_invoked = []
    
    with open(session_path) as f:
        for line in f:
            try:
                entry = json.loads(line.strip())
            except:
                continue
            
            entry_type = entry.get("type")
            
            # User or assistant message
            if entry_type == "user" or entry_type == "assistant":
                content = entry.get("message", {}).get("content", "")
                if isinstance(content, list):
                    # Extract text from content blocks
                    text_parts = []
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            text_parts.append(block.get("text", ""))
                        elif isinstance(block, str):
                            text_parts.append(block)
                    content = " ".join(text_parts)
                
                if content:
                    messages.append({
                        "type": entry_type,
                        "content": content[:200] + "..." if len(content) > 200 else content,
                        "timestamp": entry.get("timestamp"),
                    })
            
            # Tool calls
            if entry_type == "tool_use":
                tool_calls.append(entry.get("name", "unknown"))
            
            # Agent invocations
            subtype = entry.get("subtype")
            if subtype == "agent_invocation" or "agent" in str(entry.get("content", "")).lower():
                agents_invoked.append(entry)
    
    return {
        "message_count": len(messages),
        "last_messages": messages[-max_messages:] if messages else [],
        "tool_call_count": len(tool_calls),
        "tool_calls": list(set(tool_calls)),
        "agents_invoked": len(agents_invoked),
    }

def format_time_ago(dt: datetime) -> str:
    now = datetime.now()
    diff = now - dt
    
    if diff.days > 0:
        return f"{diff.days}d ago"
    elif diff.seconds > 3600:
        return f"{diff.seconds // 3600}h ago"
    elif diff.seconds > 60:
        return f"{diff.seconds // 60}m ago"
    else:
        return "just now"

def main():
    parser = argparse.ArgumentParser(description="Inspect Claude Code sessions")
    parser.add_argument("--project", "-p", help="Filter by project name (partial match)")
    parser.add_argument("--session", "-s", help="Show details for specific session ID")
    parser.add_argument("--last", "-n", type=int, default=5, help="Number of recent sessions to show")
    parser.add_argument("--messages", "-m", type=int, default=5, help="Number of messages to show per session")
    args = parser.parse_args()

    print("=" * 70)
    print("🔍 CLAUDE CODE SESSION INSPECTOR")
    print("=" * 70)
    print()

    projects = list_projects()
    
    if not projects:
        print("No projects found.")
        return

    for proj_name, proj_path in projects:
        if args.project and args.project.lower() not in proj_name.lower():
            continue
        
        sessions = get_sessions(proj_path)
        if not sessions:
            continue
        
        print(f"📁 {proj_name}")
        print("-" * 70)
        
        for session in sessions[:args.last]:
            if args.session and args.session not in session["id"]:
                continue
            
            prefix = "🤖" if session["is_agent"] else "💬"
            time_ago = format_time_ago(session["modified"])
            
            print(f"\n{prefix} {session['id']}")
            print(f"   Modified: {session['modified'].strftime('%Y-%m-%d %H:%M')} ({time_ago})")
            print(f"   Size: {session['size_kb']:.1f} KB")
            
            # Parse session details
            details = parse_session(session["path"], args.messages)
            print(f"   Messages: {details['message_count']}, Tool calls: {details['tool_call_count']}")
            
            if details["tool_calls"]:
                print(f"   Tools used: {', '.join(details['tool_calls'][:5])}")
            
            # Show last few messages
            if details["last_messages"] and (args.session or args.messages > 0):
                print(f"\n   Last {len(details['last_messages'])} messages:")
                for msg in details["last_messages"]:
                    role = "👤" if msg["type"] == "user" else "🤖"
                    content = msg["content"].replace("\n", " ")[:100]
                    print(f"   {role} {content}...")
        
        print()
        
        # Show resume command
        if sessions:
            latest = sessions[0]
            print(f"   💡 To resume latest: claude --resume {latest['id']}")
        
        print()

if __name__ == "__main__":
    main()
