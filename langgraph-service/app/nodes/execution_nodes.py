"""
Execution Nodes
===============

Nodes for executing commands and AI queries.
Integrates with Claude via Lugh's LLM Proxy (uses Claude Code SDK with OAuth).
"""

import httpx
import structlog
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, BaseMessage

from app.graph.state import (
    ConversationState,
    ExecutionPhase,
    AIExecutionResult,
    FileOperations,
)
from app.config import get_settings
from app.services.redis_pubsub import publish_event, RedisEventType

logger = structlog.get_logger()


# === LLM Proxy Client ===


def _message_to_dict(msg: BaseMessage) -> dict:
    """Convert LangChain message to dict for API."""
    if isinstance(msg, SystemMessage):
        return {"role": "system", "content": str(msg.content)}
    elif isinstance(msg, HumanMessage):
        return {"role": "user", "content": str(msg.content)}
    elif isinstance(msg, AIMessage):
        return {"role": "assistant", "content": str(msg.content)}
    else:
        return {"role": "user", "content": str(msg.content)}


async def call_llm_proxy(
    messages: list[BaseMessage],
    model: str | None = None,
) -> dict:
    """
    Call Lugh's LLM proxy endpoint.

    This uses Claude Code SDK on the TypeScript side,
    which handles OAuth authentication.
    """
    settings = get_settings()
    base_url = settings.lugh_service_url or "http://localhost:3000"

    endpoint = f"{base_url}/api/llm/completion"

    # Convert LangChain messages to dicts
    message_dicts = [_message_to_dict(m) for m in messages]

    payload = {
        "messages": message_dicts,
        "model": model or settings.default_model,
    }

    logger.info(
        "calling_llm_proxy",
        endpoint=endpoint,
        message_count=len(message_dicts),
    )

    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(endpoint, json=payload)
        response.raise_for_status()
        return response.json()


# === Command Execution ===


async def execute_command(state: ConversationState) -> dict:
    """
    Execute a deterministic command (no AI).

    These are commands like /help, /status, /repos that
    don't need AI - they're handled by simple logic.
    """
    command = state.parsed_command
    if not command:
        return {
            "error": "No command to execute",
            "phase": ExecutionPhase.ERROR,
        }

    logger.info("executing_command", command=command.command, args=command.args)

    # Publish event
    await publish_event(
        RedisEventType.COMMAND_START,
        conversation_id=state.conversation_id,
        data={"command": command.command, "args": command.args},
    )

    # Handle commands
    response: str
    match command.command:
        case "help":
            response = """**Lugh Commands**

**Navigation:**
- `/repos` - List configured codebases
- `/repo <name>` - Switch to codebase
- `/getcwd` - Show current directory
- `/setcwd <path>` - Change directory

**Commands:**
- `/commands` - List codebase commands
- `/templates` - List global templates
- `/command-invoke <name> [args]` - Run command

**Session:**
- `/status` - Show current status
- `/reset` - Reset conversation
- `/stop` - Interrupt running operation

**Swarm:**
- `/swarm <request>` - Multi-agent execution"""

        case "status":
            ctx = state.context
            response = f"""**Status**
- Conversation: `{state.conversation_id}`
- Platform: `{state.platform_type}`
- Codebase: `{ctx.codebase_name or 'None' if ctx else 'None'}`
- Working Dir: `{ctx.cwd or 'Not set' if ctx else 'Not set'}`
- Phase: `{state.phase.value}`"""

        case "repos":
            response = "**Configured Codebases**\n\nNo codebases configured yet. Use `/clone <url>` to add one."

        case "getcwd":
            cwd = state.context.cwd if state.context else "Not set"
            response = f"Current directory: `{cwd}`"

        case "stop":
            response = "Operation stopped."
            await publish_event(
                RedisEventType.OPERATION_STOPPED,
                conversation_id=state.conversation_id,
            )
            return {
                "direct_response": response,
                "was_aborted": True,
                "skip_ai": True,
                "phase": ExecutionPhase.COMMAND_EXECUTED,
            }

        case _:
            response = f"Command `/{command.command}` not yet implemented in LangGraph service."

    logger.info("command_executed", command=command.command)

    return {
        "direct_response": response,
        "skip_ai": True,
        "phase": ExecutionPhase.COMMAND_EXECUTED,
    }


# === AI Execution ===


async def execute_ai(state: ConversationState) -> dict:
    """
    Execute AI query via Lugh's LLM Proxy.

    This node:
    1. Prepares the prompt with system context
    2. Calls Lugh's LLM proxy (which uses Claude Code SDK with OAuth)
    3. Publishes events via Redis
    4. Tracks token usage
    """
    if not state.prompt_to_send:
        return {
            "error": "No prompt to execute",
            "phase": ExecutionPhase.ERROR,
        }

    settings = get_settings()

    logger.info(
        "executing_ai",
        prompt_length=len(state.prompt_to_send),
        input_type=state.input_type.value if state.input_type else None,
        model=settings.default_model,
    )

    # Publish start event
    await publish_event(
        RedisEventType.AI_START,
        conversation_id=state.conversation_id,
        data={
            "model": settings.default_model,
            "prompt_length": len(state.prompt_to_send),
        },
    )

    # Build message list
    messages: list[SystemMessage | HumanMessage | AIMessage] = []

    # Add system message with context
    system_prompt = _build_system_prompt(state)
    if system_prompt:
        messages.append(SystemMessage(content=system_prompt))

    # Add conversation history from state
    messages.extend(state.messages)

    # Add current user message
    messages.append(HumanMessage(content=state.prompt_to_send))

    try:
        # Call Lugh's LLM proxy (uses Claude Code SDK with OAuth)
        llm_response = await call_llm_proxy(messages, settings.default_model)

        full_response = llm_response.get("content", "")
        usage = llm_response.get("usage", {})

        # Track result
        result = AIExecutionResult(
            success=True,
            session_id=None,
            file_operations=FileOperations(),
            token_usage={
                "input": usage.get("input_tokens", 0),
                "output": usage.get("output_tokens", 0),
                "total": usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
            },
        )

        logger.info(
            "ai_completed",
            response_length=len(full_response),
            tokens=result.token_usage,
        )

        # Publish completion event
        await publish_event(
            RedisEventType.AI_COMPLETE,
            conversation_id=state.conversation_id,
            data={
                "response_length": len(full_response),
                "tokens": result.token_usage,
            },
        )

        return {
            "messages": [HumanMessage(content=state.prompt_to_send), AIMessage(content=full_response)],
            "ai_result": result,
            "phase": ExecutionPhase.AI_COMPLETED,
        }

    except Exception as e:
        logger.error("ai_execution_failed", error=str(e))

        # Publish error event
        await publish_event(
            RedisEventType.AI_ERROR,
            conversation_id=state.conversation_id,
            data={"error": str(e)},
        )

        return {
            "error": f"AI execution failed: {e}",
            "ai_result": AIExecutionResult(success=False, error=str(e)),
            "phase": ExecutionPhase.ERROR,
        }


def _build_system_prompt(state: ConversationState) -> str:
    """Build system prompt with context."""
    parts = []

    parts.append("You are Lugh, an AI coding assistant integrated with a remote development platform.")
    parts.append("You help users with software engineering tasks via Telegram, Slack, and GitHub.")

    if state.context:
        if state.context.codebase_name:
            parts.append(f"\nCurrent codebase: {state.context.codebase_name}")
        if state.context.cwd:
            parts.append(f"Working directory: {state.context.cwd}")

    parts.append("\nBe concise and helpful. Use markdown formatting for code and structure.")

    return "\n".join(parts)


# === Response Sending ===


async def send_response(state: ConversationState) -> dict:
    """
    Send response back to the platform via Redis pub/sub.

    This is the final node - it publishes the response
    to Redis for the TypeScript service to consume.
    """
    logger.info(
        "sending_response",
        conversation_id=state.conversation_id,
        has_direct=state.direct_response is not None,
        has_ai=state.ai_result is not None,
        has_swarm=state.swarm_result is not None,
    )

    responses: list[str] = []

    # Direct response (from commands)
    if state.direct_response:
        responses.append(state.direct_response)

    # AI response
    elif state.ai_result and state.messages:
        # Get last AI message
        for msg in reversed(state.messages):
            if isinstance(msg, AIMessage):
                responses.append(str(msg.content))
                break

    # Swarm response
    elif state.swarm_result:
        responses.append(state.swarm_result.summary)

    # Error response
    elif state.error:
        responses.append(f"Error: {state.error}")

    # Publish response to Redis for TypeScript service
    for response in responses:
        await publish_event(
            RedisEventType.RESPONSE,
            conversation_id=state.conversation_id,
            data={"message": response},
        )

    logger.info("response_sent", response_count=len(responses))

    return {
        "responses_sent": responses,
        "phase": ExecutionPhase.COMPLETED,
    }


async def handle_error(state: ConversationState) -> dict:
    """Handle errors in the graph."""
    logger.error(
        "handling_error",
        error=state.error,
        phase=state.phase.value,
    )

    error_message = f"An error occurred: {state.error or 'Unknown error'}"

    # Publish error event
    await publish_event(
        RedisEventType.ERROR,
        conversation_id=state.conversation_id,
        data={"error": state.error or "Unknown error"},
    )

    return {
        "direct_response": error_message,
        "phase": ExecutionPhase.ERROR,
    }
