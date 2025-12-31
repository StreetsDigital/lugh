"""
PostgreSQL Checkpointer
=======================

Integrates LangGraph's PostgreSQL checkpointer with Lugh's database.
Enables state persistence, resume capability, and conversation history.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from app.config import get_settings

logger = structlog.get_logger()

# Global checkpointer instance
_checkpointer: AsyncPostgresSaver | None = None
# Context manager for the checkpointer
_checkpointer_cm: AsyncGenerator[AsyncPostgresSaver, None] | None = None


async def setup_checkpointer() -> AsyncPostgresSaver:
    """
    Initialize the PostgreSQL checkpointer.

    This creates the necessary tables in the database for
    storing graph checkpoints and state.
    """
    global _checkpointer, _checkpointer_cm

    settings = get_settings()

    logger.info("setting_up_checkpointer", database_url=settings.database_url[:50] + "...")

    # Create checkpointer from connection string (returns async context manager)
    _checkpointer_cm = AsyncPostgresSaver.from_conn_string(settings.database_url)

    # Enter the context manager to get the actual checkpointer
    _checkpointer = await _checkpointer_cm.__aenter__()

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
    global _checkpointer, _checkpointer_cm

    if _checkpointer_cm:
        # Close any open connections by exiting the context manager
        logger.info("cleaning_up_checkpointer")
        try:
            await _checkpointer_cm.__aexit__(None, None, None)
        except Exception as e:
            logger.warning("checkpointer_cleanup_error", error=str(e))
        finally:
            _checkpointer = None
            _checkpointer_cm = None
