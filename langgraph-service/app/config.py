"""
Configuration
=============

Environment-based configuration using Pydantic Settings.
"""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # === Service ===
    service_name: str = "lugh-langgraph"
    environment: Literal["development", "staging", "production"] = "development"
    debug: bool = False
    log_level: str = "INFO"

    # === Database ===
    database_url: str = "postgresql://postgres:postgres@localhost:5432/lugh"

    # === Redis ===
    redis_url: str = "redis://localhost:6379/0"

    # === LLM Providers ===
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None

    # Default model for orchestration
    default_model: str = "claude-sonnet-4-20250514"

    # === Graph Settings ===
    # Maximum concurrent agents in swarm
    max_concurrent_agents: int = 5
    # Timeout for individual agent execution (seconds)
    agent_timeout: int = 300
    # Enable checkpointing
    enable_checkpointing: bool = True

    # === Integration ===
    # Channel prefix for Redis pub/sub
    redis_channel_prefix: str = "lugh:langgraph:"
    # Callback URL for TypeScript service (optional)
    callback_url: str | None = None
    # Lugh TypeScript service URL (for LLM proxy)
    lugh_service_url: str = "http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
