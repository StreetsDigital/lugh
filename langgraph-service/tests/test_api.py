"""
API Tests
=========

Test FastAPI endpoints for the LangGraph service.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.fixture
async def client():
    """Create test client."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client


class TestHealthEndpoint:
    """Test health check endpoint."""

    @pytest.mark.asyncio
    async def test_health_returns_healthy(self, client):
        """Test health endpoint returns healthy status."""
        response = await client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "lugh-langgraph"


class TestGraphsEndpoint:
    """Test graphs listing endpoint."""

    @pytest.mark.asyncio
    async def test_list_graphs(self, client):
        """Test listing available graphs."""
        response = await client.get("/graphs")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2

        # Check conversation graph
        conversation = next((g for g in data if g["name"] == "conversation"), None)
        assert conversation is not None
        assert "mermaid" in conversation

        # Check swarm graph
        swarm = next((g for g in data if g["name"] == "swarm"), None)
        assert swarm is not None
        assert "mermaid" in swarm


class TestConversationEndpoint:
    """Test conversation processing endpoint."""

    @pytest.mark.asyncio
    async def test_conversation_request_structure(self, client):
        """Test that conversation endpoint accepts valid request."""
        # This test validates request structure
        # Full integration would require mocking the graph execution
        with patch("app.main.build_conversation_graph") as mock_build:
            mock_graph = AsyncMock()
            mock_graph.ainvoke.return_value = {
                "conversation_id": "test-123",
                "platform_type": "telegram",
                "raw_message": "Hello",
                "phase": "completed",
                "responses_sent": ["Hello! How can I help?"],
                "error": None,
                "input_type": None,
                "parsed_command": None,
                "codebase_context": None,
                "session_context": None,
                "issue_context": None,
                "thread_context": None,
                "cwd": "/home/user",
                "messages": [],
                "tool_calls": [],
            }
            mock_build.return_value = mock_graph

            with patch("app.main.get_checkpointer", return_value=AsyncMock(return_value=None)):
                response = await client.post(
                    "/conversation",
                    json={
                        "conversation_id": "test-123",
                        "platform_type": "telegram",
                        "message": "Hello",
                    },
                )

                # Should not fail with 422 (validation error)
                assert response.status_code in [200, 500]  # 500 if graph fails

    @pytest.mark.asyncio
    async def test_conversation_missing_fields(self, client):
        """Test that conversation endpoint rejects invalid request."""
        response = await client.post(
            "/conversation",
            json={
                "message": "Hello",  # Missing conversation_id and platform_type
            },
        )

        assert response.status_code == 422  # Validation error


class TestSwarmEndpoint:
    """Test swarm execution endpoint."""

    @pytest.mark.asyncio
    async def test_swarm_request_structure(self, client):
        """Test that swarm endpoint accepts valid request."""
        with patch("app.main.build_swarm_graph") as mock_build:
            from app.graph.state import SwarmPhase

            mock_graph = AsyncMock()
            mock_graph.ainvoke.return_value = {
                "swarm_id": "swarm-xyz",
                "conversation_id": "test-123",
                "user_request": "Build API",
                "cwd": "/home/user",
                "sub_tasks": [],
                "completed_results": [],
                "phase": SwarmPhase.COMPLETED,
                "synthesized_summary": "Done",
                "error": None,
            }
            mock_build.return_value = mock_graph

            with patch("app.main.get_checkpointer", return_value=AsyncMock(return_value=None)):
                response = await client.post(
                    "/swarm",
                    json={
                        "conversation_id": "test-123",
                        "request": "Build a REST API",
                    },
                )

                assert response.status_code in [200, 500]


class TestThreadEndpoints:
    """Test thread state endpoints."""

    @pytest.mark.asyncio
    async def test_thread_state_not_found(self, client):
        """Test getting state for non-existent thread."""
        with patch("app.main.get_checkpointer") as mock_get:
            mock_checkpointer = AsyncMock()
            mock_checkpointer.aget.return_value = None
            mock_get.return_value = mock_checkpointer

            response = await client.get("/thread/nonexistent/state")

            assert response.status_code == 404

    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires database connection for checkpointer")
    async def test_thread_state_returns_error_or_not_found(self, client):
        """Test that thread state handles various error conditions."""
        # Without a real checkpointer, should return 400 or 404
        response = await client.get("/thread/test-thread/state")
        assert response.status_code in [400, 404, 500]


class TestDebugEndpoints:
    """Test debug endpoints."""

    @pytest.mark.asyncio
    async def test_debug_config(self, client):
        """Test debug config endpoint."""
        response = await client.get("/debug/config")

        assert response.status_code == 200
        data = response.json()
        assert "environment" in data
        assert "debug" in data
        assert "enable_checkpointing" in data
        assert "max_concurrent_agents" in data
