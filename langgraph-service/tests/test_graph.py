"""
Graph Tests
===========

Test the LangGraph state and node functions.
"""

import pytest
from datetime import datetime

from app.graph.state import (
    ConversationState,
    SwarmState,
    ExecutionPhase,
    SwarmPhase,
    InputType,
    ParsedCommand,
    create_conversation_state,
    create_swarm_state,
)
from app.nodes.input_nodes import parse_command, parse_input


class TestState:
    """Test state creation and manipulation."""

    def test_create_conversation_state(self):
        """Test creating initial conversation state."""
        state = create_conversation_state(
            conversation_id="test-123",
            platform_type="telegram",
            message="/help",
        )

        assert state.conversation_id == "test-123"
        assert state.platform_type == "telegram"
        assert state.raw_message == "/help"
        assert state.phase == ExecutionPhase.INPUT_RECEIVED
        assert state.input_type is None
        assert state.error is None

    def test_create_conversation_state_with_context(self):
        """Test creating state with optional context."""
        state = create_conversation_state(
            conversation_id="test-123",
            platform_type="github",
            message="Fix the bug",
            issue_context="Issue #42: Login broken",
            thread_context="Previous discussion...",
        )

        assert state.issue_context == "Issue #42: Login broken"
        assert state.thread_context == "Previous discussion..."

    def test_create_swarm_state(self):
        """Test creating swarm state."""
        state = create_swarm_state(
            swarm_id="swarm-abc123",
            conversation_id="test-123",
            user_request="Build a REST API",
            cwd="/home/user/project",
        )

        assert state.swarm_id == "swarm-abc123"
        assert state.conversation_id == "test-123"
        assert state.user_request == "Build a REST API"
        assert state.cwd == "/home/user/project"
        assert state.phase == SwarmPhase.DECOMPOSING
        assert len(state.sub_tasks) == 0


class TestInputParsing:
    """Test input parsing functions."""

    def test_parse_simple_command(self):
        """Test parsing a simple command."""
        result = parse_command("/help")

        assert result is not None
        assert result.command == "help"
        assert result.args == []
        assert result.raw == "/help"

    def test_parse_command_with_args(self):
        """Test parsing command with arguments."""
        result = parse_command("/command-invoke plan Add dark mode")

        assert result is not None
        assert result.command == "command-invoke"
        assert result.args == ["plan", "Add", "dark", "mode"]

    def test_parse_command_with_quoted_args(self):
        """Test parsing command with quoted arguments."""
        result = parse_command('/command-invoke plan "Add dark mode feature"')

        assert result is not None
        assert result.command == "command-invoke"
        assert result.args == ["plan", "Add dark mode feature"]

    def test_parse_non_command(self):
        """Test that non-commands return None."""
        result = parse_command("Hello, how are you?")
        assert result is None

    @pytest.mark.asyncio
    async def test_parse_input_deterministic(self):
        """Test classifying deterministic command."""
        state = create_conversation_state(
            conversation_id="test-123",
            platform_type="telegram",
            message="/help",
        )

        result = await parse_input(state)

        assert result["input_type"] == InputType.DETERMINISTIC_COMMAND
        assert result["parsed_command"].command == "help"
        assert result["phase"] == ExecutionPhase.INPUT_PARSED

    @pytest.mark.asyncio
    async def test_parse_input_ai_query(self):
        """Test classifying AI query."""
        state = create_conversation_state(
            conversation_id="test-123",
            platform_type="telegram",
            message="What is the meaning of life?",
        )

        result = await parse_input(state)

        assert result["input_type"] == InputType.AI_QUERY
        assert result["parsed_command"] is None

    @pytest.mark.asyncio
    async def test_parse_input_swarm(self):
        """Test classifying swarm request."""
        state = create_conversation_state(
            conversation_id="test-123",
            platform_type="telegram",
            message="/swarm Build a full REST API with auth",
        )

        result = await parse_input(state)

        assert result["input_type"] == InputType.SWARM_REQUEST
        assert result["parsed_command"].command == "swarm"


class TestPhases:
    """Test phase transitions."""

    def test_execution_phases(self):
        """Test all execution phases exist."""
        phases = [
            ExecutionPhase.INPUT_RECEIVED,
            ExecutionPhase.INPUT_PARSED,
            ExecutionPhase.CONTEXT_LOADED,
            ExecutionPhase.COMMAND_ROUTING,
            ExecutionPhase.AI_EXECUTING,
            ExecutionPhase.AI_COMPLETED,
            ExecutionPhase.SWARM_EXECUTING,
            ExecutionPhase.COMPLETED,
            ExecutionPhase.ERROR,
        ]
        assert len(phases) > 0

    def test_swarm_phases(self):
        """Test all swarm phases exist."""
        phases = [
            SwarmPhase.DECOMPOSING,
            SwarmPhase.SPAWNING,
            SwarmPhase.RUNNING,
            SwarmPhase.SYNTHESIZING,
            SwarmPhase.COMPLETED,
            SwarmPhase.FAILED,
        ]
        assert len(phases) == 6


class TestGraphBuilder:
    """Test graph construction."""

    def test_build_conversation_graph(self):
        """Test building conversation graph without checkpointer."""
        from app.graph.builder import build_conversation_graph

        graph = build_conversation_graph(checkpointer=None)
        assert graph is not None

    def test_build_swarm_graph(self):
        """Test building swarm graph without checkpointer."""
        from app.graph.builder import build_swarm_graph

        graph = build_swarm_graph(checkpointer=None)
        assert graph is not None

    def test_conversation_graph_mermaid(self):
        """Test generating Mermaid diagram for conversation graph."""
        from app.graph.builder import get_conversation_graph_mermaid

        mermaid = get_conversation_graph_mermaid()
        assert "graph" in mermaid.lower() or "stateDiagram" in mermaid.lower() or "---" in mermaid

    def test_swarm_graph_mermaid(self):
        """Test generating Mermaid diagram for swarm graph."""
        from app.graph.builder import get_swarm_graph_mermaid

        mermaid = get_swarm_graph_mermaid()
        assert "graph" in mermaid.lower() or "stateDiagram" in mermaid.lower() or "---" in mermaid


class TestRouting:
    """Test routing logic."""

    def test_route_deterministic_command(self):
        """Test routing to deterministic command execution."""
        from app.nodes.routing import get_routing_decision

        state = create_conversation_state(
            conversation_id="test-123",
            platform_type="telegram",
            message="/help",
        )
        state.input_type = InputType.DETERMINISTIC_COMMAND
        state.parsed_command = ParsedCommand(command="help", args=[], raw="/help")

        decision = get_routing_decision(state)
        assert decision == "execute_command"

    def test_route_ai_query(self):
        """Test routing to AI execution."""
        from app.nodes.routing import get_routing_decision

        state = create_conversation_state(
            conversation_id="test-123",
            platform_type="telegram",
            message="What is Python?",
        )
        state.input_type = InputType.AI_QUERY

        decision = get_routing_decision(state)
        assert decision == "execute_ai"

    def test_route_swarm(self):
        """Test routing to swarm execution."""
        from app.nodes.routing import get_routing_decision

        state = create_conversation_state(
            conversation_id="test-123",
            platform_type="telegram",
            message="/swarm Build an API",
        )
        state.input_type = InputType.SWARM_REQUEST
        state.parsed_command = ParsedCommand(command="swarm", args=["Build", "an", "API"], raw="/swarm Build an API")

        decision = get_routing_decision(state)
        assert decision == "execute_swarm"


class TestRedisPubSub:
    """Test Redis pub/sub utilities."""

    def test_event_types(self):
        """Test all event types are defined."""
        from app.services.redis_pubsub import RedisEventType

        assert RedisEventType.REQUEST == "request"
        assert RedisEventType.RESPONSE == "response"
        assert RedisEventType.AI_START == "ai_start"
        assert RedisEventType.AI_CHUNK == "ai_chunk"
        assert RedisEventType.AI_COMPLETE == "ai_complete"
        assert RedisEventType.SWARM_START == "swarm_start"
        assert RedisEventType.SWARM_COMPLETE == "swarm_complete"

    def test_channel_naming(self):
        """Test channel name generation."""
        from app.services.redis_pubsub import _get_channel

        # Test with conversation ID
        channel = _get_channel("response", "test-123")
        assert "response" in channel
        assert "test-123" in channel

        # Test without conversation ID
        channel = _get_channel("request")
        assert "request" in channel
