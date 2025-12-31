"""
Routing Nodes
=============

Nodes for routing decisions and prompt building.
"""

import structlog

from app.graph.state import (
    ConversationState,
    ExecutionPhase,
    InputType,
)

logger = structlog.get_logger()


def get_routing_decision(state: ConversationState) -> str:
    """
    Determine the next node based on input type.

    This is used by conditional edges in the graph.
    Returns the name of the next node to execute.
    """
    if state.error:
        return "error_handler"

    match state.input_type:
        case InputType.DETERMINISTIC_COMMAND:
            return "execute_command"
        case InputType.CODEBASE_COMMAND:
            return "build_prompt"
        case InputType.TEMPLATE_COMMAND:
            return "build_prompt"
        case InputType.SWARM_REQUEST:
            return "swarm_subgraph"
        case InputType.AI_QUERY:
            return "build_prompt"
        case _:
            return "error_handler"


async def route_input(state: ConversationState) -> dict:
    """
    Route input to appropriate handler.

    This node updates phase and prepares for the next step.
    The actual routing is done by conditional edges.
    """
    logger.info(
        "routing_input",
        input_type=state.input_type.value if state.input_type else None,
        command=state.command_name,
    )

    return {
        "phase": ExecutionPhase.COMMAND_ROUTING,
    }


async def build_prompt(state: ConversationState) -> dict:
    """
    Build the final prompt to send to AI.

    Handles:
    - Variable substitution ($1, $2, $ARGUMENTS, etc.)
    - Context injection (issue context, thread context)
    - Command wrapping for execution
    """
    logger.info(
        "building_prompt",
        input_type=state.input_type.value if state.input_type else None,
        command=state.command_name,
    )

    prompt = state.raw_message

    # Handle codebase/template commands
    if state.input_type in (InputType.CODEBASE_COMMAND, InputType.TEMPLATE_COMMAND):
        if state.parsed_command:
            # TODO: Load command template from codebase or global templates
            # For now, use a placeholder
            command_name = state.command_name or "unknown"
            args = state.parsed_command.args

            # Variable substitution
            template = f"Execute the '{command_name}' command"  # Would load from DB
            for i, arg in enumerate(args, 1):
                template = template.replace(f"${i}", arg)
            template = template.replace("$ARGUMENTS", " ".join(args))

            # Wrap for execution
            prompt = f"""The user invoked the `/{command_name}` command. Execute the following instructions immediately without asking for confirmation:

---

{template}

---

Remember: The user already decided to run this command. Take action now."""

    # Prepend thread context if provided
    if state.thread_context:
        prompt = f"""## Thread Context (previous messages)

{state.thread_context}

---

## Current Request

{prompt}"""

    # Append issue context if provided
    if state.issue_context:
        prompt = f"{prompt}\n\n---\n\n{state.issue_context}"

    logger.info("prompt_built", prompt_length=len(prompt))

    return {
        "prompt_to_send": prompt,
        "phase": ExecutionPhase.SESSION_PREPARED,
    }
