"""
Execution Nodes
===============

Nodes for executing commands and AI queries.
"""

import structlog
from langchain_core.messages import AIMessage, HumanMessage

from app.graph.state import (
    ConversationState,
    ExecutionPhase,
    AIExecutionResult,
    FileOperations,
    InputType,
)

logger = structlog.get_logger()


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
- Codebase: `{ctx.codebase_name or 'None'}`
- Working Dir: `{ctx.cwd or 'Not set'}`
- Phase: `{state.phase.value}`"""

        case "repos":
            # TODO: Query database for codebases
            response = "**Configured Codebases**\n\nNo codebases configured yet. Use `/clone <url>` to add one."

        case "getcwd":
            cwd = state.context.cwd if state.context else "Not set"
            response = f"Current directory: `{cwd}`"

        case "stop":
            response = "Operation stopped."
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


async def execute_ai(state: ConversationState) -> dict:
    """
    Execute AI query using LangChain.

    This node:
    1. Prepares the prompt
    2. Calls the LLM (Claude/OpenAI)
    3. Streams responses
    4. Tracks file operations
    """
    if not state.prompt_to_send:
        return {
            "error": "No prompt to execute",
            "phase": ExecutionPhase.ERROR,
        }

    logger.info(
        "executing_ai",
        prompt_length=len(state.prompt_to_send),
        input_type=state.input_type.value if state.input_type else None,
    )

    # Add user message to state
    messages = [HumanMessage(content=state.prompt_to_send)]

    try:
        # TODO: Replace with actual LangChain LLM call
        # For now, simulate a response
        from app.config import get_settings

        settings = get_settings()

        # In production, this would use langchain-anthropic or langchain-openai
        # response = await llm.ainvoke(messages)

        # Simulated response
        ai_response = f"""I received your request and am processing it.

**Input Type:** {state.input_type.value if state.input_type else 'unknown'}
**Command:** {state.command_name or 'N/A'}
**Model:** {settings.default_model}

This is a placeholder response. In production, this would be the actual AI response."""

        # Track result
        result = AIExecutionResult(
            success=True,
            session_id=None,  # Would be set for resumable sessions
            file_operations=FileOperations(),
            token_usage={"input": len(state.prompt_to_send), "output": len(ai_response)},
        )

        logger.info(
            "ai_completed",
            response_length=len(ai_response),
            tokens=result.token_usage,
        )

        return {
            "messages": messages + [AIMessage(content=ai_response)],
            "ai_result": result,
            "phase": ExecutionPhase.AI_COMPLETED,
        }

    except Exception as e:
        logger.error("ai_execution_failed", error=str(e))
        return {
            "error": f"AI execution failed: {e}",
            "ai_result": AIExecutionResult(success=False, error=str(e)),
            "phase": ExecutionPhase.ERROR,
        }


async def send_response(state: ConversationState) -> dict:
    """
    Send response back to the platform.

    This is the final node - it formats and sends the response
    via Redis pub/sub to the TypeScript service.
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

    # TODO: Actually publish to Redis
    # await redis.publish(f"lugh:responses:{state.conversation_id}", response)

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

    return {
        "direct_response": error_message,
        "phase": ExecutionPhase.ERROR,
    }
