"""
Redis Pub/Sub Service
=====================

Handles real-time communication between the Python LangGraph service
and the TypeScript Lugh platform via Redis pub/sub.

Channel Structure:
- lugh:langgraph:request         - TypeScript → Python (conversation requests)
- lugh:langgraph:response:{id}   - Python → TypeScript (conversation responses)
- lugh:langgraph:events:{id}     - Python → TypeScript (streaming events)
- lugh:langgraph:control         - Bidirectional (stop signals, health checks)
"""

import asyncio
import json
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Awaitable

import structlog
from redis.asyncio import Redis

from app.config import get_settings

logger = structlog.get_logger()

# Global Redis client
_redis_client: Redis | None = None


class RedisEventType(str, Enum):
    """Event types for Redis pub/sub."""

    # Requests (TypeScript → Python)
    REQUEST = "request"
    STOP = "stop"

    # Responses (Python → TypeScript)
    RESPONSE = "response"
    ERROR = "error"

    # Streaming events
    AI_START = "ai_start"
    AI_CHUNK = "ai_chunk"
    AI_COMPLETE = "ai_complete"
    AI_ERROR = "ai_error"

    # Command events
    COMMAND_START = "command_start"
    COMMAND_COMPLETE = "command_complete"
    OPERATION_STOPPED = "operation_stopped"

    # Swarm events
    SWARM_START = "swarm_start"
    SWARM_TASK_DECOMPOSED = "swarm_task_decomposed"
    SWARM_AGENT_SPAWNED = "swarm_agent_spawned"
    SWARM_AGENT_PROGRESS = "swarm_agent_progress"
    SWARM_AGENT_COMPLETE = "swarm_agent_complete"
    SWARM_COMPLETE = "swarm_complete"

    # Control
    HEALTH = "health"
    PING = "ping"
    PONG = "pong"


async def get_redis() -> Redis:
    """
    Get or create Redis client.

    Uses a singleton pattern for connection reuse.
    """
    global _redis_client

    if _redis_client is None:
        settings = get_settings()
        _redis_client = Redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        logger.info("redis_connected", url=settings.redis_url[:30] + "...")

    return _redis_client


async def close_redis() -> None:
    """Close Redis connection."""
    global _redis_client

    if _redis_client:
        await _redis_client.close()
        _redis_client = None
        logger.info("redis_disconnected")


def _get_channel(channel_type: str, conversation_id: str | None = None) -> str:
    """Build channel name with prefix."""
    settings = get_settings()
    prefix = settings.redis_channel_prefix

    if conversation_id:
        return f"{prefix}{channel_type}:{conversation_id}"
    return f"{prefix}{channel_type}"


async def publish_event(
    event_type: RedisEventType,
    conversation_id: str,
    data: dict[str, Any] | None = None,
) -> None:
    """
    Publish an event to Redis for the TypeScript service.

    Events are published to conversation-specific channels
    so the TypeScript service can route them appropriately.
    """
    redis = await get_redis()

    # Build event payload
    payload = {
        "type": event_type.value,
        "conversation_id": conversation_id,
        "timestamp": datetime.utcnow().isoformat(),
        "data": data or {},
    }

    # Determine channel based on event type
    if event_type == RedisEventType.RESPONSE:
        channel = _get_channel("response", conversation_id)
    elif event_type in (RedisEventType.AI_CHUNK, RedisEventType.SWARM_AGENT_PROGRESS):
        channel = _get_channel("events", conversation_id)
    else:
        channel = _get_channel("events", conversation_id)

    # Publish
    try:
        await redis.publish(channel, json.dumps(payload))
        logger.debug(
            "event_published",
            event_type=event_type.value,
            channel=channel,
            conversation_id=conversation_id,
        )
    except Exception as e:
        logger.error(
            "publish_failed",
            event_type=event_type.value,
            error=str(e),
        )


async def publish_response(
    conversation_id: str,
    message: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    """
    Publish a response message for a conversation.

    This is the main way to send AI responses back to the TypeScript service.
    """
    await publish_event(
        RedisEventType.RESPONSE,
        conversation_id=conversation_id,
        data={
            "message": message,
            **(metadata or {}),
        },
    )


async def subscribe_to_requests(
    handler: Callable[[dict[str, Any]], Awaitable[None]],
) -> None:
    """
    Subscribe to incoming requests from TypeScript.

    This runs continuously, processing requests as they come in.
    Used for the worker mode where Python listens for work.
    """
    redis = await get_redis()
    pubsub = redis.pubsub()

    request_channel = _get_channel("request")
    control_channel = _get_channel("control")

    await pubsub.subscribe(request_channel, control_channel)
    logger.info("subscribed_to_channels", channels=[request_channel, control_channel])

    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue

            try:
                data = json.loads(message["data"])
                channel = message["channel"]

                logger.info(
                    "message_received",
                    channel=channel,
                    type=data.get("type"),
                )

                # Handle control messages
                if channel == control_channel:
                    if data.get("type") == RedisEventType.PING.value:
                        await redis.publish(
                            control_channel,
                            json.dumps({
                                "type": RedisEventType.PONG.value,
                                "timestamp": datetime.utcnow().isoformat(),
                            }),
                        )
                        continue

                # Handle requests
                await handler(data)

            except json.JSONDecodeError as e:
                logger.error("invalid_json", error=str(e), raw=message["data"][:100])
            except Exception as e:
                logger.error("handler_error", error=str(e))

    finally:
        await pubsub.unsubscribe()


class RedisRequestHandler:
    """
    Handler for processing Redis requests.

    Integrates with the LangGraph orchestrator to process
    conversations received via pub/sub.
    """

    def __init__(self):
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        """Start listening for requests."""
        if self._running:
            return

        self._running = True
        self._task = asyncio.create_task(self._listen())
        logger.info("redis_handler_started")

    async def stop(self) -> None:
        """Stop listening for requests."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("redis_handler_stopped")

    async def _listen(self) -> None:
        """Main listen loop."""
        await subscribe_to_requests(self._handle_request)

    async def _handle_request(self, data: dict[str, Any]) -> None:
        """
        Process an incoming request.

        Expected format:
        {
            "type": "request",
            "conversation_id": "telegram-123",
            "platform_type": "telegram",
            "message": "/help",
            "issue_context": "...",  # optional
            "thread_context": "..."  # optional
        }
        """
        from app.graph.builder import build_conversation_graph
        from app.graph.state import create_conversation_state
        from app.checkpointer import get_checkpointer

        request_type = data.get("type")

        if request_type == RedisEventType.STOP.value:
            # Handle stop request
            conversation_id = data.get("conversation_id")
            logger.info("stop_requested", conversation_id=conversation_id)
            # TODO: Implement cancellation
            return

        if request_type != RedisEventType.REQUEST.value:
            logger.warning("unknown_request_type", type=request_type)
            return

        conversation_id = data.get("conversation_id")
        if not conversation_id:
            logger.error("missing_conversation_id")
            return

        logger.info(
            "processing_request",
            conversation_id=conversation_id,
            message_length=len(data.get("message", "")),
        )

        try:
            # Get checkpointer
            checkpointer = await get_checkpointer()

            # Build graph
            graph = build_conversation_graph(checkpointer)

            # Create initial state
            state = create_conversation_state(
                conversation_id=conversation_id,
                platform_type=data.get("platform_type", "unknown"),
                message=data.get("message", ""),
                issue_context=data.get("issue_context"),
                thread_context=data.get("thread_context"),
            )

            # Run graph
            thread_id = data.get("thread_id", f"thread-{conversation_id}")
            config = {"configurable": {"thread_id": thread_id}}

            await graph.ainvoke(state.model_dump(), config)

            logger.info("request_completed", conversation_id=conversation_id)

        except Exception as e:
            logger.error(
                "request_failed",
                conversation_id=conversation_id,
                error=str(e),
            )
            await publish_event(
                RedisEventType.ERROR,
                conversation_id=conversation_id,
                data={"error": str(e)},
            )


# Global handler instance
request_handler = RedisRequestHandler()
