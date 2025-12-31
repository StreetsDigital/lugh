"""
LangGraph State Definitions
===========================

Typed state schemas that flow through the conversation graph.
This is the "single source of truth" for all orchestration logic.
"""

from datetime import datetime
from enum import Enum
from typing import Annotated, Any, Literal

from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field
from langchain_core.messages import BaseMessage


# =============================================================================
# Enums
# =============================================================================


class InputType(str, Enum):
    """Classification of user input."""

    DETERMINISTIC_COMMAND = "deterministic_command"  # /help, /status, etc.
    CODEBASE_COMMAND = "codebase_command"  # /command-invoke
    TEMPLATE_COMMAND = "template_command"  # Global templates
    AI_QUERY = "ai_query"  # Regular conversation
    SWARM_REQUEST = "swarm_request"  # Multi-agent execution


class ExecutionPhase(str, Enum):
    """Current phase of graph execution."""

    INPUT_RECEIVED = "input_received"
    INPUT_PARSED = "input_parsed"
    CONTEXT_LOADED = "context_loaded"
    COMMAND_ROUTING = "command_routing"
    COMMAND_EXECUTED = "command_executed"
    ISOLATION_RESOLVED = "isolation_resolved"
    SESSION_PREPARED = "session_prepared"
    AI_EXECUTING = "ai_executing"
    AI_STREAMING = "ai_streaming"
    AI_COMPLETED = "ai_completed"
    SWARM_DECOMPOSING = "swarm_decomposing"
    SWARM_EXECUTING = "swarm_executing"
    SWARM_SYNTHESIZING = "swarm_synthesizing"
    SWARM_COMPLETED = "swarm_completed"
    RESPONSE_SENT = "response_sent"
    ERROR = "error"
    COMPLETED = "completed"


class AgentRole(str, Enum):
    """Specialized agent roles for swarm execution."""

    ARCHITECT = "architect"
    IMPLEMENTER = "implementer"
    REVIEWER = "reviewer"
    TESTER = "tester"
    RESEARCHER = "researcher"
    DOCUMENTER = "documenter"
    SECURITY = "security"
    PERFORMANCE = "performance"
    CUSTOM = "custom"


class SwarmPhase(str, Enum):
    """Phase of swarm execution."""

    DECOMPOSING = "decomposing"
    SPAWNING = "spawning"
    RUNNING = "running"
    SYNTHESIZING = "synthesizing"
    COMPLETED = "completed"
    FAILED = "failed"


# =============================================================================
# Pydantic Models for Structured Data
# =============================================================================


class ParsedCommand(BaseModel):
    """Result of parsing a slash command."""

    command: str
    args: list[str] = Field(default_factory=list)
    raw: str


class IsolationContext(BaseModel):
    """Resolved isolation environment."""

    cwd: str
    env_id: str | None = None
    branch_name: str | None = None
    is_new: bool = False


class FileOperations(BaseModel):
    """Tracked file operations during execution."""

    read: list[str] = Field(default_factory=list)
    written: list[str] = Field(default_factory=list)
    edited: list[str] = Field(default_factory=list)
    searches: list[dict[str, str]] = Field(default_factory=list)


class AIExecutionResult(BaseModel):
    """Result from AI execution."""

    success: bool
    session_id: str | None = None
    error: str | None = None
    files_written: list[str] = Field(default_factory=list)
    file_operations: FileOperations = Field(default_factory=FileOperations)
    token_usage: dict[str, int] = Field(default_factory=dict)


class SubTask(BaseModel):
    """A decomposed sub-task for swarm execution."""

    id: str
    role: AgentRole
    title: str
    description: str
    prompt: str
    dependencies: list[str] = Field(default_factory=list)
    priority: Literal["critical", "high", "medium", "low"] = "medium"
    requires_tools: bool = False
    status: Literal["pending", "ready", "running", "completed", "failed"] = "pending"


class AgentResult(BaseModel):
    """Result from a single agent in the swarm."""

    sub_task_id: str
    role: AgentRole
    summary: str
    details: str = ""
    artifacts: list[dict[str, Any]] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    success: bool = True
    duration_ms: int = 0
    tokens_used: int = 0


class SwarmResult(BaseModel):
    """Final synthesized result from swarm execution."""

    swarm_id: str
    status: Literal["completed", "failed"]
    summary: str
    agent_count: int
    completed_count: int
    failed_count: int
    duration_ms: int
    total_tokens: int = 0
    recommendations: list[str] = Field(default_factory=list)


class ConversationContext(BaseModel):
    """Database context loaded for conversation."""

    conversation_id: str
    platform_type: str
    codebase_id: str | None = None
    codebase_name: str | None = None
    cwd: str | None = None
    ai_assistant_type: str = "claude"
    session_id: str | None = None
    assistant_session_id: str | None = None


# =============================================================================
# LangGraph State Definitions
# =============================================================================


class ConversationState(BaseModel):
    """
    Main conversation state that flows through the graph.

    This replaces the implicit state scattered throughout orchestrator.ts
    with explicit, type-safe state managed by LangGraph.
    """

    # === Input ===
    conversation_id: str
    platform_type: str
    raw_message: str
    issue_context: str | None = None
    thread_context: str | None = None

    # === Messages (LangGraph managed) ===
    messages: Annotated[list[BaseMessage], add_messages] = Field(default_factory=list)

    # === Classification ===
    input_type: InputType | None = None
    parsed_command: ParsedCommand | None = None
    command_name: str | None = None

    # === Context ===
    context: ConversationContext | None = None
    isolation: IsolationContext | None = None

    # === Prompt ===
    prompt_to_send: str | None = None
    skip_ai: bool = False
    direct_response: str | None = None

    # === Execution ===
    ai_result: AIExecutionResult | None = None
    swarm_result: SwarmResult | None = None

    # === Error Handling ===
    error: str | None = None
    was_aborted: bool = False

    # === Tracking ===
    phase: ExecutionPhase = ExecutionPhase.INPUT_RECEIVED
    started_at: datetime = Field(default_factory=datetime.utcnow)
    responses_sent: list[str] = Field(default_factory=list)

    class Config:
        arbitrary_types_allowed = True


class SwarmState(BaseModel):
    """
    State for swarm (multi-agent) execution subgraph.

    Models the decompose -> spawn -> execute -> synthesize flow.
    """

    # === Context ===
    swarm_id: str
    conversation_id: str
    user_request: str
    cwd: str

    # === Decomposition ===
    sub_tasks: list[SubTask] = Field(default_factory=list)
    strategy: Literal["parallel", "sequential", "hybrid"] | None = None

    # === Execution ===
    running_agents: list[str] = Field(default_factory=list)
    completed_results: list[AgentResult] = Field(default_factory=list)

    # === Synthesis ===
    synthesized_summary: str | None = None

    # === Tracking ===
    phase: SwarmPhase = SwarmPhase.DECOMPOSING
    error: str | None = None
    started_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        arbitrary_types_allowed = True


# =============================================================================
# State Factory Functions
# =============================================================================


def create_conversation_state(
    conversation_id: str,
    platform_type: str,
    message: str,
    *,
    issue_context: str | None = None,
    thread_context: str | None = None,
) -> ConversationState:
    """Create initial conversation state."""
    return ConversationState(
        conversation_id=conversation_id,
        platform_type=platform_type,
        raw_message=message,
        issue_context=issue_context,
        thread_context=thread_context,
    )


def create_swarm_state(
    swarm_id: str,
    conversation_id: str,
    user_request: str,
    cwd: str,
) -> SwarmState:
    """Create initial swarm state."""
    return SwarmState(
        swarm_id=swarm_id,
        conversation_id=conversation_id,
        user_request=user_request,
        cwd=cwd,
    )
