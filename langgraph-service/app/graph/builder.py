"""
Graph Builder
=============

Builds the LangGraph StateGraphs for conversation and swarm orchestration.
This is the heart of the LangGraph integration.
"""

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from app.graph.state import ConversationState, SwarmState, ExecutionPhase, SwarmPhase
from app.nodes.input_nodes import parse_input, load_context
from app.nodes.routing_nodes import route_input, build_prompt, get_routing_decision
from app.nodes.execution_nodes import execute_command, execute_ai, send_response, handle_error
from app.nodes.swarm_nodes import (
    decompose_task,
    spawn_agents,
    execute_agents,
    synthesize_results,
    should_continue_spawning,
)


def build_conversation_graph(checkpointer: AsyncPostgresSaver | None = None) -> StateGraph:
    """
    Build the main conversation orchestration graph.

    This graph handles all conversation flow:
    - Input parsing and classification
    - Command routing (deterministic vs AI vs swarm)
    - Prompt building and context injection
    - AI execution
    - Response delivery

    The graph structure:

    ```
    START
      │
      ▼
    parse_input
      │
      ▼
    load_context
      │
      ▼
    route_input ─────────────────────────┐
      │                                  │
      ├──[deterministic]──► execute_command
      │                           │
      ├──[template/codebase]──► build_prompt
      │                           │
      ├──[ai_query]───────────► build_prompt
      │                           │
      └──[swarm]──────────────► swarm_subgraph
                                  │
                                  ▼
                              execute_ai
                                  │
                                  ▼
                              send_response
                                  │
                                  ▼
                                 END
    ```
    """
    # Create the graph with our state schema
    graph = StateGraph(ConversationState)

    # === Add Nodes ===

    # Input processing
    graph.add_node("parse_input", parse_input)
    graph.add_node("load_context", load_context)

    # Routing
    graph.add_node("route_input", route_input)

    # Command execution
    graph.add_node("execute_command", execute_command)

    # Prompt building
    graph.add_node("build_prompt", build_prompt)

    # AI execution
    graph.add_node("execute_ai", execute_ai)

    # Swarm (will be a subgraph)
    graph.add_node("swarm_subgraph", _create_swarm_node())

    # Response
    graph.add_node("send_response", send_response)

    # Error handling
    graph.add_node("error_handler", handle_error)

    # === Add Edges ===

    # Start -> Parse
    graph.add_edge(START, "parse_input")

    # Parse -> Load Context
    graph.add_edge("parse_input", "load_context")

    # Load Context -> Route
    graph.add_edge("load_context", "route_input")

    # Conditional routing based on input type
    graph.add_conditional_edges(
        "route_input",
        get_routing_decision,
        {
            "execute_command": "execute_command",
            "build_prompt": "build_prompt",
            "swarm_subgraph": "swarm_subgraph",
            "error_handler": "error_handler",
        },
    )

    # Command -> Response
    graph.add_edge("execute_command", "send_response")

    # Build Prompt -> Execute AI
    graph.add_edge("build_prompt", "execute_ai")

    # AI -> Response
    graph.add_edge("execute_ai", "send_response")

    # Swarm -> Response
    graph.add_edge("swarm_subgraph", "send_response")

    # Error -> Response
    graph.add_edge("error_handler", "send_response")

    # Response -> End
    graph.add_edge("send_response", END)

    # Compile with optional checkpointer
    if checkpointer:
        return graph.compile(checkpointer=checkpointer)

    return graph.compile()


def build_swarm_graph(checkpointer: AsyncPostgresSaver | None = None) -> StateGraph:
    """
    Build the swarm execution subgraph.

    This handles multi-agent task execution:
    - Task decomposition
    - Agent spawning
    - Parallel execution
    - Result synthesis

    The graph structure:

    ```
    START
      │
      ▼
    decompose_task
      │
      ▼
    spawn_agents ◄────────────┐
      │                       │
      ▼                       │
    execute_agents ───────────┘
      │
      ▼ (when all done)
    synthesize_results
      │
      ▼
     END
    ```
    """
    graph = StateGraph(SwarmState)

    # === Add Nodes ===
    graph.add_node("decompose", decompose_task)
    graph.add_node("spawn", spawn_agents)
    graph.add_node("execute", execute_agents)
    graph.add_node("synthesize", synthesize_results)

    # === Add Edges ===

    # Start -> Decompose
    graph.add_edge(START, "decompose")

    # Decompose -> Spawn
    graph.add_edge("decompose", "spawn")

    # Conditional: Spawn -> Execute or Synthesize
    graph.add_conditional_edges(
        "spawn",
        _spawn_routing,
        {
            "execute": "execute",
            "synthesize": "synthesize",
        },
    )

    # Execute -> back to Spawn (to check for more tasks)
    graph.add_conditional_edges(
        "execute",
        should_continue_spawning,
        {
            "spawn": "spawn",
            "execute": "execute",
            "synthesize": "synthesize",
        },
    )

    # Synthesize -> End
    graph.add_edge("synthesize", END)

    if checkpointer:
        return graph.compile(checkpointer=checkpointer)

    return graph.compile()


def _spawn_routing(state: SwarmState) -> str:
    """Route after spawning."""
    running = [t for t in state.sub_tasks if t.status == "running"]
    if running:
        return "execute"
    return "synthesize"


def _create_swarm_node():
    """
    Create a swarm execution node that runs the swarm subgraph.

    This wraps the swarm graph as a node in the conversation graph.
    """
    import uuid
    from datetime import datetime
    from app.graph.state import SwarmResult, create_swarm_state

    swarm_graph = build_swarm_graph()

    async def swarm_node(state: ConversationState) -> dict:
        """Execute swarm subgraph."""
        import structlog
        logger = structlog.get_logger()

        logger.info(
            "entering_swarm_subgraph",
            conversation_id=state.conversation_id,
        )

        # Extract swarm request from command args
        request = state.raw_message
        if state.parsed_command and state.parsed_command.args:
            request = " ".join(state.parsed_command.args)

        # Get working directory
        cwd = state.context.cwd if state.context else "/home/user"

        # Create swarm state
        swarm_id = f"swarm-{uuid.uuid4().hex[:8]}"
        swarm_state = create_swarm_state(
            swarm_id=swarm_id,
            conversation_id=state.conversation_id,
            user_request=request,
            cwd=cwd,
        )

        start_time = datetime.utcnow()

        try:
            # Execute swarm graph
            result = await swarm_graph.ainvoke(swarm_state.model_dump())

            # Extract result
            final_state = SwarmState(**result)
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

            swarm_result = SwarmResult(
                swarm_id=swarm_id,
                status="completed" if final_state.phase == SwarmPhase.COMPLETED else "failed",
                summary=final_state.synthesized_summary or "Swarm execution completed",
                agent_count=len(final_state.sub_tasks),
                completed_count=len([r for r in final_state.completed_results if r.success]),
                failed_count=len([r for r in final_state.completed_results if not r.success]),
                duration_ms=duration_ms,
                total_tokens=sum(r.tokens_used for r in final_state.completed_results),
            )

            logger.info(
                "swarm_completed",
                swarm_id=swarm_id,
                duration_ms=duration_ms,
                agent_count=swarm_result.agent_count,
            )

            return {
                "swarm_result": swarm_result,
                "phase": ExecutionPhase.SWARM_COMPLETED,
            }

        except Exception as e:
            logger.error("swarm_failed", swarm_id=swarm_id, error=str(e))

            return {
                "error": f"Swarm execution failed: {e}",
                "phase": ExecutionPhase.ERROR,
            }

    return swarm_node


# === Graph Visualization ===


def get_conversation_graph_mermaid() -> str:
    """Get Mermaid diagram of the conversation graph."""
    return """
graph TD
    START((Start)) --> parse_input[Parse Input]
    parse_input --> load_context[Load Context]
    load_context --> route_input{Route Input}

    route_input -->|deterministic| execute_command[Execute Command]
    route_input -->|template/codebase| build_prompt[Build Prompt]
    route_input -->|ai_query| build_prompt
    route_input -->|swarm| swarm_subgraph[Swarm Subgraph]
    route_input -->|error| error_handler[Error Handler]

    execute_command --> send_response[Send Response]
    build_prompt --> execute_ai[Execute AI]
    execute_ai --> send_response
    swarm_subgraph --> send_response
    error_handler --> send_response

    send_response --> END((End))

    subgraph swarm[Swarm Subgraph]
        decompose[Decompose Task] --> spawn[Spawn Agents]
        spawn --> execute[Execute Agents]
        execute --> spawn
        execute --> synthesize[Synthesize Results]
    end
"""


def get_swarm_graph_mermaid() -> str:
    """Get Mermaid diagram of the swarm graph."""
    return """
graph TD
    START((Start)) --> decompose[Decompose Task]
    decompose --> spawn[Spawn Agents]
    spawn -->|has_running| execute[Execute Agents]
    spawn -->|all_done| synthesize[Synthesize Results]
    execute -->|more_tasks| spawn
    execute -->|all_done| synthesize
    synthesize --> END((End))
"""
