"""
Input Processing Nodes
======================

Nodes for parsing and classifying user input.
"""

import re
import structlog

from app.graph.state import (
    ConversationState,
    ConversationContext,
    ExecutionPhase,
    InputType,
    ParsedCommand,
)

logger = structlog.get_logger()

# Deterministic commands (no AI needed)
DETERMINISTIC_COMMANDS = {
    "help",
    "status",
    "getcwd",
    "setcwd",
    "clone",
    "repos",
    "repo",
    "repo-remove",
    "reset",
    "reset-context",
    "command-set",
    "load-commands",
    "commands",
    "template-add",
    "template-list",
    "templates",
    "template-delete",
    "worktree",
    "init",
    "verbose",
    "stop",
    "quickref",
    "agents",
    "chains",
    "prompts",
    "commands-all",
}


def parse_command(message: str) -> ParsedCommand | None:
    """Parse a slash command from message."""
    if not message.startswith("/"):
        return None

    # Split command and args
    parts = message[1:].split(maxsplit=1)
    command = parts[0].lower()

    # Parse args (handle quoted strings)
    args: list[str] = []
    if len(parts) > 1:
        # Simple arg parsing - respects quoted strings
        arg_str = parts[1]
        # Match quoted strings or non-whitespace sequences
        pattern = r'"([^"]+)"|\'([^\']+)\'|(\S+)'
        for match in re.finditer(pattern, arg_str):
            args.append(match.group(1) or match.group(2) or match.group(3))

    return ParsedCommand(command=command, args=args, raw=message)


async def parse_input(state: ConversationState) -> dict:
    """
    Parse and classify user input.

    This is the first node in the graph - it determines what type
    of input we're dealing with and how to route it.
    """
    logger.info(
        "parsing_input",
        conversation_id=state.conversation_id,
        message_length=len(state.raw_message),
    )

    message = state.raw_message.strip()

    # Check if it's a slash command
    if message.startswith("/"):
        parsed = parse_command(message)
        if not parsed:
            return {
                "phase": ExecutionPhase.ERROR,
                "error": "Failed to parse command",
            }

        # Classify command type
        if parsed.command in DETERMINISTIC_COMMANDS:
            input_type = InputType.DETERMINISTIC_COMMAND
        elif parsed.command == "command-invoke":
            input_type = InputType.CODEBASE_COMMAND
        elif parsed.command == "swarm":
            input_type = InputType.SWARM_REQUEST
        else:
            # Assume it's a template command
            input_type = InputType.TEMPLATE_COMMAND

        logger.info(
            "input_classified",
            input_type=input_type.value,
            command=parsed.command,
        )

        return {
            "input_type": input_type,
            "parsed_command": parsed,
            "command_name": parsed.command,
            "phase": ExecutionPhase.INPUT_PARSED,
        }

    # Regular AI query
    logger.info("input_classified", input_type=InputType.AI_QUERY.value)

    return {
        "input_type": InputType.AI_QUERY,
        "parsed_command": None,
        "command_name": None,
        "phase": ExecutionPhase.INPUT_PARSED,
    }


async def load_context(state: ConversationState) -> dict:
    """
    Load conversation context from database.

    In production, this would query PostgreSQL for:
    - Conversation record
    - Associated codebase
    - Active session
    - Isolation environment
    """
    logger.info(
        "loading_context",
        conversation_id=state.conversation_id,
        platform=state.platform_type,
    )

    # TODO: Replace with actual database queries
    # For now, create a mock context
    context = ConversationContext(
        conversation_id=state.conversation_id,
        platform_type=state.platform_type,
        codebase_id=None,  # Would be loaded from DB
        cwd="/home/user",  # Default
        ai_assistant_type="claude",
    )

    logger.info(
        "context_loaded",
        has_codebase=context.codebase_id is not None,
        cwd=context.cwd,
    )

    return {
        "context": context,
        "phase": ExecutionPhase.CONTEXT_LOADED,
    }
