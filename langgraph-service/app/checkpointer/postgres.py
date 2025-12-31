"""
PostgreSQL Checkpointer
=======================

Integrates LangGraph's PostgreSQL checkpointer with Lugh's database.
Enables state persistence, resume capability, and conversation history.
"""

import structlog
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from app.config import get_settings

logger = structlog.get_logger()

# Global checkpointer instance
_checkpointer: AsyncPostgresSaver | None = None


async def setup_checkpointer() -> AsyncPostgresSaver:
    """
    Initialize the PostgreSQL checkpointer.

    This creates the necessary tables in the database for
    storing graph checkpoints and state.
    """
    global _checkpointer

    settings = get_settings()

    logger.info("setting_up_checkpointer", database_url=settings.database_url[:50] + "...")

    # Create checkpointer from connection string
    _checkpointer = AsyncPostgresSaver.from_conn_string(settings.database_url)

    # Setup creates the checkpoint tables if they don't exist
    await _checkpointer.setup()

    logger.info("checkpointer_ready")

    return _checkpointer


async def get_checkpointer() -> AsyncPostgresSaver | None:
    """
    Get the checkpointer instance.

    Returns None if checkpointing is disabled or not initialized.
    """
    settings = get_settings()

    if not settings.enable_checkpointing:
        return None

    if _checkpointer is None:
        return await setup_checkpointer()

    return _checkpointer


async def cleanup_checkpointer() -> None:
    """Cleanup checkpointer resources."""
    global _checkpointer

    if _checkpointer:
        # Close any open connections
        logger.info("cleaning_up_checkpointer")
        _checkpointer = None
