"""
Execution Nodes
===============

Nodes for executing commands and AI queries.
Integrates with Claude via LangChain for actual LLM calls.
"""

import structlog
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI

from app.graph.state import (
    ConversationState,
    ExecutionPhase,
    AIExecutionResult,
    FileOperations,
)
from app.config import get_settings
from app.services.redis_pubsub import publish_event, RedisEventType

logger = structlog.get_logger()


# === LLM Factory ===


def get_llm(model: str | None = None):
    """
    Get an LLM instance based on configuration.

    Supports Claude (Anthropic) and OpenAI models.
    """
    settings = get_settings()
    model_name = model or settings.default_model

    # Determine provider from model name
    if model_name.startswith("claude") or model_name.startswith("anthropic"):
        if not settings.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY not configured")

        return ChatAnthropic(
            model=model_name,
            api_key=settings.anthropic_api_key,
            max_tokens=4096,
            temperature=0.7,
        )

    elif model_name.startswith("gpt") or model_name.startswith("o1"):
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY not configured")

        return ChatOpenAI(
            model=model_name,
            api_key=settings.openai_api_key,
            max_tokens=4096,
            temperature=0.7,
        )

    else:
        # Default to Claude
        if settings.anthropic_api_key:
            return ChatAnthropic(
                model="claude-sonnet-4-20250514",
                api_key=settings.anthropic_api_key,
                max_tokens=4096,
            )
        elif settings.openai_api_key:
            return ChatOpenAI(
                model="gpt-4o",
                api_key=settings.openai_api_key,
                max_tokens=4096,
            )
        else:
            raise ValueError("No LLM API key configured (need ANTHROPIC_API_KEY or OPENAI_API_KEY)")


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
    Execute AI query using LangChain with Claude or OpenAI.

    This node:
    1. Prepares the prompt with system context
    2. Calls the LLM (Claude/OpenAI)
    3. Streams responses via Redis
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
    messages = []

    # Add system message with context
    system_prompt = _build_system_prompt(state)
    if system_prompt:
        messages.append(SystemMessage(content=system_prompt))

    # Add conversation history from state
    messages.extend(state.messages)

    # Add current user message
    messages.append(HumanMessage(content=state.prompt_to_send))

    try:
        # Get LLM instance
        llm = get_llm(settings.default_model)

        # Stream the response
        full_response = ""
        chunk_count = 0

        async for chunk in llm.astream(messages):
            if hasattr(chunk, 'content') and chunk.content:
                full_response += chunk.content
                chunk_count += 1

                # Publish streaming chunk every few chunks (avoid flooding)
                if chunk_count % 5 == 0:
                    await publish_event(
                        RedisEventType.AI_CHUNK,
                        conversation_id=state.conversation_id,
                        data={
                            "chunk": chunk.content,
                            "chunk_count": chunk_count,
                        },
                    )

        # Calculate token usage (approximate)
        input_tokens = len(state.prompt_to_send) // 4  # Rough estimate
        output_tokens = len(full_response) // 4

        # Track result
        result = AIExecutionResult(
            success=True,
            session_id=None,
            file_operations=FileOperations(),
            token_usage={
                "input": input_tokens,
                "output": output_tokens,
                "total": input_tokens + output_tokens,
            },
        )

        logger.info(
            "ai_completed",
            response_length=len(full_response),
            tokens=result.token_usage,
            chunks=chunk_count,
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
