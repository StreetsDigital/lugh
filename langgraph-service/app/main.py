"""
FastAPI Application
===================

Main FastAPI app with endpoints for LangGraph orchestration.
Integrates with TypeScript service via Redis pub/sub and HTTP.

Modes:
- HTTP mode (default): FastAPI server for synchronous requests
- Worker mode: Redis pub/sub listener for async processing
- Hybrid mode: Both HTTP and Redis (recommended for production)
"""

import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.config import get_settings
from app.checkpointer import get_checkpointer, setup_checkpointer
from app.graph.builder import (
    build_conversation_graph,
    build_swarm_graph,
    get_conversation_graph_mermaid,
    get_swarm_graph_mermaid,
)
from app.graph.state import (
    ConversationState,
    create_conversation_state,
    ExecutionPhase,
)
from app.services.redis_pubsub import (
    get_redis,
    close_redis,
    request_handler,
    publish_event,
    RedisEventType,
)

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


# === Lifespan ===


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    logger.info("starting_langgraph_service")

    settings = get_settings()

    # Setup checkpointer
    if settings.enable_checkpointing:
        await setup_checkpointer()
        logger.info("checkpointer_initialized")

    # Initialize Redis connection
    try:
        await get_redis()
        logger.info("redis_initialized")

        # Start Redis worker if in hybrid mode
        enable_worker = os.getenv("ENABLE_REDIS_WORKER", "true").lower() == "true"
        if enable_worker:
            await request_handler.start()
            logger.info("redis_worker_started")
    except Exception as e:
        logger.warning("redis_init_failed", error=str(e))

    yield

    # Cleanup
    logger.info("shutting_down_langgraph_service")

    # Stop Redis worker
    await request_handler.stop()

    # Close Redis connection
    await close_redis()


# === App ===


app = FastAPI(
    title="Lugh LangGraph Service",
    description="LangGraph-based orchestration for AI workflows",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# === Request/Response Models ===


class ConversationRequest(BaseModel):
    """Request to process a conversation message."""

    conversation_id: str
    platform_type: str
    message: str
    issue_context: str | None = None
    thread_context: str | None = None
    thread_id: str | None = None  # For checkpointing


class ConversationResponse(BaseModel):
    """Response from conversation processing."""

    conversation_id: str
    thread_id: str
    phase: str
    responses: list[str]
    error: str | None = None
    duration_ms: int


class SwarmRequest(BaseModel):
    """Request for swarm execution."""

    conversation_id: str
    request: str
    cwd: str = "/home/user"


class SwarmResponse(BaseModel):
    """Response from swarm execution."""

    swarm_id: str
    status: str
    summary: str
    agent_count: int
    completed_count: int
    failed_count: int
    duration_ms: int


class GraphInfo(BaseModel):
    """Information about a graph."""

    name: str
    description: str
    mermaid: str


# === Endpoints ===


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "service": "lugh-langgraph"}


@app.get("/graphs", response_model=list[GraphInfo])
async def list_graphs():
    """List available graphs with their visualizations."""
    return [
        GraphInfo(
            name="conversation",
            description="Main conversation orchestration graph",
            mermaid=get_conversation_graph_mermaid(),
        ),
        GraphInfo(
            name="swarm",
            description="Multi-agent swarm execution graph",
            mermaid=get_swarm_graph_mermaid(),
        ),
    ]


@app.post("/conversation", response_model=ConversationResponse)
async def process_conversation(request: ConversationRequest):
    """
    Process a conversation message through the LangGraph.

    This is the main endpoint called by the TypeScript service.
    It runs the full conversation graph and returns the result.
    """
    start_time = datetime.utcnow()
    thread_id = request.thread_id or f"thread-{uuid.uuid4().hex[:8]}"

    logger.info(
        "processing_conversation",
        conversation_id=request.conversation_id,
        platform=request.platform_type,
        thread_id=thread_id,
    )

    try:
        # Get checkpointer
        checkpointer = await get_checkpointer()

        # Build graph
        graph = build_conversation_graph(checkpointer)

        # Create initial state
        initial_state = create_conversation_state(
            conversation_id=request.conversation_id,
            platform_type=request.platform_type,
            message=request.message,
            issue_context=request.issue_context,
            thread_context=request.thread_context,
        )

        # Run graph with thread config for checkpointing
        config = {"configurable": {"thread_id": thread_id}}
        result = await graph.ainvoke(initial_state.model_dump(), config)

        # Extract final state
        final_state = ConversationState(**result)
        duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

        logger.info(
            "conversation_completed",
            conversation_id=request.conversation_id,
            phase=final_state.phase.value,
            duration_ms=duration_ms,
        )

        return ConversationResponse(
            conversation_id=request.conversation_id,
            thread_id=thread_id,
            phase=final_state.phase.value,
            responses=final_state.responses_sent,
            error=final_state.error,
            duration_ms=duration_ms,
        )

    except Exception as e:
        logger.error(
            "conversation_failed",
            conversation_id=request.conversation_id,
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/conversation/stream")
async def stream_conversation(request: ConversationRequest):
    """
    Stream conversation processing via Server-Sent Events.

    Returns real-time updates as the graph executes:
    - Phase changes
    - Tool calls
    - AI responses
    - Final result
    """
    thread_id = request.thread_id or f"thread-{uuid.uuid4().hex[:8]}"

    async def event_generator() -> AsyncGenerator[dict, None]:
        """Generate SSE events during graph execution."""
        try:
            checkpointer = await get_checkpointer()
            graph = build_conversation_graph(checkpointer)

            initial_state = create_conversation_state(
                conversation_id=request.conversation_id,
                platform_type=request.platform_type,
                message=request.message,
                issue_context=request.issue_context,
                thread_context=request.thread_context,
            )

            config = {"configurable": {"thread_id": thread_id}}

            # Stream graph execution
            async for event in graph.astream(initial_state.model_dump(), config):
                # Extract node name and state updates
                for node_name, state_update in event.items():
                    yield {
                        "event": "node_update",
                        "data": {
                            "node": node_name,
                            "thread_id": thread_id,
                            "update": state_update,
                        },
                    }

            yield {
                "event": "complete",
                "data": {"thread_id": thread_id},
            }

        except Exception as e:
            yield {
                "event": "error",
                "data": {"error": str(e)},
            }

    return EventSourceResponse(event_generator())


@app.post("/swarm", response_model=SwarmResponse)
async def execute_swarm(request: SwarmRequest):
    """
    Execute a swarm (multi-agent) request.

    This runs the swarm graph directly for complex,
    multi-step tasks that benefit from parallelization.
    """
    start_time = datetime.utcnow()
    swarm_id = f"swarm-{uuid.uuid4().hex[:8]}"

    logger.info(
        "executing_swarm",
        swarm_id=swarm_id,
        conversation_id=request.conversation_id,
    )

    try:
        from app.graph.state import create_swarm_state, SwarmState, SwarmPhase

        checkpointer = await get_checkpointer()
        graph = build_swarm_graph(checkpointer)

        initial_state = create_swarm_state(
            swarm_id=swarm_id,
            conversation_id=request.conversation_id,
            user_request=request.request,
            cwd=request.cwd,
        )

        config = {"configurable": {"thread_id": swarm_id}}
        result = await graph.ainvoke(initial_state.model_dump(), config)

        final_state = SwarmState(**result)
        duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

        return SwarmResponse(
            swarm_id=swarm_id,
            status="completed" if final_state.phase == SwarmPhase.COMPLETED else "failed",
            summary=final_state.synthesized_summary or "Swarm execution completed",
            agent_count=len(final_state.sub_tasks),
            completed_count=len([r for r in final_state.completed_results if r.success]),
            failed_count=len([r for r in final_state.completed_results if not r.success]),
            duration_ms=duration_ms,
        )

    except Exception as e:
        logger.error("swarm_failed", swarm_id=swarm_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/thread/{thread_id}/history")
async def get_thread_history(thread_id: str):
    """
    Get checkpoint history for a thread.

    Returns all checkpoints, enabling:
    - Conversation replay
    - State inspection
    - Time-travel debugging
    """
    checkpointer = await get_checkpointer()

    if not checkpointer:
        raise HTTPException(status_code=400, detail="Checkpointing not enabled")

    config = {"configurable": {"thread_id": thread_id}}

    # List all checkpoints for this thread
    checkpoints = []
    async for checkpoint in checkpointer.alist(config):
        checkpoints.append({
            "thread_id": checkpoint.config["configurable"]["thread_id"],
            "checkpoint_id": checkpoint.config["configurable"].get("checkpoint_id"),
            "timestamp": checkpoint.metadata.get("created_at"),
        })

    return {"thread_id": thread_id, "checkpoints": checkpoints}


@app.get("/thread/{thread_id}/state")
async def get_thread_state(thread_id: str):
    """
    Get the current state for a thread.

    Returns the latest checkpoint state, useful for:
    - Resuming conversations
    - Inspecting current context
    """
    checkpointer = await get_checkpointer()

    if not checkpointer:
        raise HTTPException(status_code=400, detail="Checkpointing not enabled")

    config = {"configurable": {"thread_id": thread_id}}

    # Get latest checkpoint
    checkpoint = await checkpointer.aget(config)

    if not checkpoint:
        raise HTTPException(status_code=404, detail="Thread not found")

    return {
        "thread_id": thread_id,
        "state": checkpoint.values,
    }


# === Dev Endpoints ===


@app.get("/debug/config")
async def debug_config():
    """Show current configuration (redacted)."""
    settings = get_settings()
    return {
        "environment": settings.environment,
        "debug": settings.debug,
        "enable_checkpointing": settings.enable_checkpointing,
        "max_concurrent_agents": settings.max_concurrent_agents,
        "default_model": settings.default_model,
        "has_anthropic_key": bool(settings.anthropic_api_key),
        "has_openai_key": bool(settings.openai_api_key),
        "redis_url": settings.redis_url[:30] + "..." if settings.redis_url else None,
        "redis_channel_prefix": settings.redis_channel_prefix,
    }


@app.get("/debug/redis")
async def debug_redis():
    """Check Redis connection status."""
    try:
        redis = await get_redis()
        info = await redis.info("server")
        return {
            "status": "connected",
            "redis_version": info.get("redis_version"),
            "worker_running": request_handler._running,
        }
    except Exception as e:
        return {
            "status": "disconnected",
            "error": str(e),
            "worker_running": False,
        }


@app.post("/debug/publish")
async def debug_publish(conversation_id: str, message: str):
    """Test publishing a message to Redis."""
    await publish_event(
        RedisEventType.RESPONSE,
        conversation_id=conversation_id,
        data={"message": message, "source": "debug"},
    )
    return {"status": "published", "conversation_id": conversation_id}
