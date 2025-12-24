#!/usr/bin/env python3
"""
Claude Code Cost Calculator
Reads ~/.claude/stats-cache.json and calculates actual costs.
"""

import json
from pathlib import Path
from datetime import datetime

# Pricing per 1M tokens (USD) - December 2024
PRICING = {
    "claude-opus-4-5-20251101": {
        "input": 15.00,
        "output": 75.00,
        "cache_read": 1.50,      # 90% cheaper than input
        "cache_create": 18.75,   # 25% more than input
    },
    "claude-sonnet-4-5-20250929": {
        "input": 3.00,
        "output": 15.00,
        "cache_read": 0.30,
        "cache_create": 3.75,
    },
    "claude-haiku-4-5-20251001": {
        "input": 0.80,
        "output": 4.00,
        "cache_read": 0.08,
        "cache_create": 1.00,
    },
}

# Fallback for unknown models (use sonnet pricing)
DEFAULT_PRICING = PRICING["claude-sonnet-4-5-20250929"]

# USD to GBP conversion (approximate)
USD_TO_GBP = 0.79

def load_stats():
    stats_path = Path.home() / ".claude" / "stats-cache.json"
    if not stats_path.exists():
        print(f"❌ Stats file not found: {stats_path}")
        return None
    
    with open(stats_path) as f:
        return json.load(f)

def get_pricing(model: str) -> dict:
    return PRICING.get(model, DEFAULT_PRICING)

def calc_cost(tokens: int, rate_per_million: float) -> float:
    return (tokens / 1_000_000) * rate_per_million

def format_tokens(n: int) -> str:
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    elif n >= 1_000:
        return f"{n/1_000:.1f}K"
    return str(n)

def main():
    stats = load_stats()
    if not stats:
        return

    print("=" * 60)
    print("🧾 CLAUDE CODE COST REPORT")
    print("=" * 60)
    print()

    # Daily breakdown
    print("📅 DAILY TOKEN USAGE")
    print("-" * 60)
    
    daily_tokens = stats.get("dailyModelTokens", [])
    daily_activity = {d["date"]: d for d in stats.get("dailyActivity", [])}
    
    for day in daily_tokens[-7:]:  # Last 7 days
        date = day["date"]
        activity = daily_activity.get(date, {})
        messages = activity.get("messageCount", 0)
        sessions = activity.get("sessionCount", 0)
        tools = activity.get("toolCallCount", 0)
        
        print(f"\n{date} ({sessions} sessions, {messages} messages, {tools} tool calls)")
        
        for model, tokens in day.get("tokensByModel", {}).items():
            model_short = model.split("-")[1]  # opus, sonnet, haiku
            print(f"  {model_short:8} {format_tokens(tokens):>10} tokens")

    # Cumulative model usage and costs
    print()
    print("=" * 60)
    print("💰 CUMULATIVE COSTS BY MODEL")
    print("-" * 60)
    
    model_usage = stats.get("modelUsage", {})
    total_usd = 0.0
    
    for model, usage in model_usage.items():
        pricing = get_pricing(model)
        model_short = model.split("-")[1].upper()
        
        input_tokens = usage.get("inputTokens", 0)
        output_tokens = usage.get("outputTokens", 0)
        cache_read = usage.get("cacheReadInputTokens", 0)
        cache_create = usage.get("cacheCreationInputTokens", 0)
        
        cost_input = calc_cost(input_tokens, pricing["input"])
        cost_output = calc_cost(output_tokens, pricing["output"])
        cost_cache_read = calc_cost(cache_read, pricing["cache_read"])
        cost_cache_create = calc_cost(cache_create, pricing["cache_create"])
        
        model_total = cost_input + cost_output + cost_cache_read + cost_cache_create
        total_usd += model_total
        
        print(f"\n{model_short}")
        print(f"  Input:        {format_tokens(input_tokens):>12} → ${cost_input:>8.2f}")
        print(f"  Output:       {format_tokens(output_tokens):>12} → ${cost_output:>8.2f}")
        print(f"  Cache read:   {format_tokens(cache_read):>12} → ${cost_cache_read:>8.2f}")
        print(f"  Cache create: {format_tokens(cache_create):>12} → ${cost_cache_create:>8.2f}")
        print(f"  {'─' * 40}")
        print(f"  Model total:  {' ':>12}    ${model_total:>8.2f}")

    total_gbp = total_usd * USD_TO_GBP
    
    print()
    print("=" * 60)
    print(f"💵 TOTAL:  ${total_usd:,.2f} USD  /  £{total_gbp:,.2f} GBP")
    print("=" * 60)
    
    # Cache efficiency
    print()
    print("📊 CACHE EFFICIENCY")
    print("-" * 60)
    
    for model, usage in model_usage.items():
        model_short = model.split("-")[1]
        cache_read = usage.get("cacheReadInputTokens", 0)
        cache_create = usage.get("cacheCreationInputTokens", 0)
        input_tokens = usage.get("inputTokens", 0)
        
        total_input = cache_read + cache_create + input_tokens
        if total_input > 0:
            cache_hit_rate = (cache_read / total_input) * 100
            print(f"  {model_short:8} cache hit rate: {cache_hit_rate:.1f}%")

    print()
    print("💡 PRO VS API")
    print("-" * 60)
    print(f"  API cost:        ${total_usd:>10,.2f} USD / £{total_gbp:>10,.2f} GBP")
    print(f"  Pro sub (Max):   $        200.00 USD / £       158.00 GBP")
    
    if total_usd > 200:
        savings = total_usd - 200
        savings_gbp = savings * USD_TO_GBP
        print(f"  {'─' * 40}")
        print(f"  You're saving:   ${savings:>10,.2f} USD / £{savings_gbp:>10,.2f} GBP")
        print(f"  ROI:             {(total_usd / 200):.1f}x value from Pro Max")
    
    print()
    print(f"Last updated: {stats.get('lastComputedDate', 'unknown')}")
    print()

if __name__ == "__main__":
    main()
