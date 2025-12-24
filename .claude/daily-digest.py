#!/usr/bin/env python3
"""
Claude Code Daily Digest
Summarises recent Claude Code activity.
"""

import json
import os
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict

def get_stats():
    """Load stats cache."""
    stats_path = Path.home() / ".claude" / "stats-cache.json"
    if not stats_path.exists():
        return None
    with open(stats_path) as f:
        return json.load(f)

def get_projects_dir():
    return Path.home() / ".claude" / "projects"

def parse_sessions(target_date: str):
    """Parse session files for a specific date."""
    projects_dir = get_projects_dir()
    if not projects_dir.exists():
        return {}
    
    activity = defaultdict(lambda: {
        "sessions": 0,
        "messages": 0,
        "tools": defaultdict(int),
        "files_read": set(),
        "files_written": set(),
    })
    
    for project_dir in projects_dir.iterdir():
        if not project_dir.is_dir():
            continue
        
        project_name = project_dir.name.replace("-Users-andrewstreets-", "~/")
        
        for session_file in project_dir.glob("*.jsonl"):
            if session_file.stat().st_size == 0:
                continue
            
            # Check if session was active on target date
            mtime = datetime.fromtimestamp(session_file.stat().st_mtime)
            if mtime.strftime("%Y-%m-%d") != target_date:
                continue
            
            activity[project_name]["sessions"] += 1
            
            try:
                with open(session_file) as f:
                    for line in f:
                        try:
                            entry = json.loads(line.strip())
                        except:
                            continue
                        
                        # Count messages
                        if entry.get("type") in ["user", "assistant"]:
                            activity[project_name]["messages"] += 1
                        
                        # Track tool usage
                        if entry.get("type") == "tool_use":
                            tool_name = entry.get("name", "unknown")
                            activity[project_name]["tools"][tool_name] += 1
                        
                        # Track file operations (from tool results)
                        content = str(entry.get("content", ""))
                        if "Read" in content or "read_file" in content:
                            # Try to extract filename
                            pass
                        if "Write" in content or "write_file" in content:
                            pass
            except Exception as e:
                continue
    
    return dict(activity)

def format_tokens(n: int) -> str:
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    elif n >= 1_000:
        return f"{n/1_000:.1f}K"
    return str(n)

def main():
    # Default to yesterday, or today if run in morning
    now = datetime.now()
    if now.hour < 6:
        target = now - timedelta(days=1)
    else:
        target = now
    
    # Check for command line date
    import sys
    if len(sys.argv) > 1:
        if sys.argv[1] == "yesterday":
            target = now - timedelta(days=1)
        elif sys.argv[1] == "today":
            target = now
        else:
            try:
                target = datetime.strptime(sys.argv[1], "%Y-%m-%d")
            except:
                pass
    
    target_date = target.strftime("%Y-%m-%d")
    target_display = target.strftime("%A, %B %d")
    
    print("=" * 60)
    print(f"📊 CLAUDE CODE DAILY DIGEST")
    print(f"   {target_display}")
    print("=" * 60)
    print()
    
    # Get stats
    stats = get_stats()
    
    if stats:
        # Find daily stats for target date
        daily_tokens = None
        daily_activity = None
        
        for day in stats.get("dailyModelTokens", []):
            if day.get("date") == target_date:
                daily_tokens = day.get("tokensByModel", {})
                break
        
        for day in stats.get("dailyActivity", []):
            if day.get("date") == target_date:
                daily_activity = day
                break
        
        if daily_activity:
            print("📈 ACTIVITY")
            print("-" * 60)
            print(f"   Sessions:    {daily_activity.get('sessionCount', 0)}")
            print(f"   Messages:    {daily_activity.get('messageCount', 0)}")
            print(f"   Tool calls:  {daily_activity.get('toolCallCount', 0)}")
            print()
        
        if daily_tokens:
            print("🔢 TOKEN USAGE")
            print("-" * 60)
            total = 0
            for model, tokens in daily_tokens.items():
                model_short = model.split("-")[1].upper()
                print(f"   {model_short:10} {format_tokens(tokens):>12} tokens")
                total += tokens
            print(f"   {'TOTAL':10} {format_tokens(total):>12} tokens")
            print()
    
    # Parse sessions for more detail
    activity = parse_sessions(target_date)
    
    if activity:
        print("📁 PROJECTS WORKED ON")
        print("-" * 60)
        
        for project, data in sorted(activity.items(), key=lambda x: x[1]["messages"], reverse=True):
            print(f"\n   {project}")
            print(f"      Sessions: {data['sessions']}, Messages: {data['messages']}")
            
            if data["tools"]:
                top_tools = sorted(data["tools"].items(), key=lambda x: x[1], reverse=True)[:5]
                tools_str = ", ".join(f"{t}({c})" for t, c in top_tools)
                print(f"      Top tools: {tools_str}")
    
    print()
    
    # Quick tips based on activity
    if stats and daily_activity:
        msgs = daily_activity.get("messageCount", 0)
        tools = daily_activity.get("toolCallCount", 0)
        
        print("💡 INSIGHTS")
        print("-" * 60)
        
        if msgs > 500:
            print("   🔥 High activity day! Consider breaking work into smaller sessions.")
        
        if tools > 0 and msgs > 0:
            tool_ratio = tools / msgs
            if tool_ratio > 0.5:
                print("   🛠️  Heavy tool usage - agents are doing real work.")
            elif tool_ratio < 0.1:
                print("   💬 Mostly conversation - consider using agents for automation.")
        
        # Check cumulative stats
        model_usage = stats.get("modelUsage", {})
        for model, usage in model_usage.items():
            if "opus" in model.lower():
                cache_read = usage.get("cacheReadInputTokens", 0)
                cache_create = usage.get("cacheCreationInputTokens", 0)
                total_cache = cache_read + cache_create + usage.get("inputTokens", 0)
                if total_cache > 0:
                    hit_rate = (cache_read / total_cache) * 100
                    print(f"   📦 Opus cache hit rate: {hit_rate:.0f}%")
    
    print()
    print("Run with: claude-digest yesterday | today | 2025-12-19")
    print()

if __name__ == "__main__":
    main()
