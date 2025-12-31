"""
Swarm Execution Nodes
=====================

Nodes for multi-agent swarm execution.
Implements the decompose -> spawn -> execute -> synthesize flow.
"""

import asyncio
import uuid
from datetime import datetime

import structlog

from app.graph.state import (
    SwarmState,
    SwarmPhase,
    SubTask,
    AgentRole,
    AgentResult,
)

logger = structlog.get_logger()


async def decompose_task(state: SwarmState) -> dict:
    """
    Decompose user request into sub-tasks.

    Uses an LLM to analyze the request and break it into
    parallelizable sub-tasks with dependencies.
    """
    logger.info(
        "decomposing_task",
        swarm_id=state.swarm_id,
        request_length=len(state.user_request),
    )

    # TODO: Replace with actual LLM-based decomposition
    # For now, create example sub-tasks based on keywords

    request_lower = state.user_request.lower()
    sub_tasks: list[SubTask] = []

    # Analyze request and create appropriate sub-tasks
    if "build" in request_lower or "implement" in request_lower:
        sub_tasks.extend([
            SubTask(
                id=f"task-{uuid.uuid4().hex[:8]}",
                role=AgentRole.ARCHITECT,
                title="Architecture Design",
                description="Design the high-level architecture and component structure",
                prompt=f"Design the architecture for: {state.user_request}",
                dependencies=[],
                priority="critical",
                requires_tools=False,
            ),
            SubTask(
                id=f"task-{uuid.uuid4().hex[:8]}",
                role=AgentRole.IMPLEMENTER,
                title="Core Implementation",
                description="Implement the core functionality",
                prompt=f"Implement: {state.user_request}",
                dependencies=[],  # Will be filled after architect completes
                priority="high",
                requires_tools=True,
            ),
            SubTask(
                id=f"task-{uuid.uuid4().hex[:8]}",
                role=AgentRole.TESTER,
                title="Testing",
                description="Write and run tests",
                prompt=f"Write tests for: {state.user_request}",
                dependencies=[],  # Will depend on implementer
                priority="high",
                requires_tools=True,
            ),
        ])
        # Set up dependencies
        sub_tasks[1].dependencies = [sub_tasks[0].id]
        sub_tasks[2].dependencies = [sub_tasks[1].id]
        strategy = "sequential"

    elif "review" in request_lower or "audit" in request_lower:
        sub_tasks.extend([
            SubTask(
                id=f"task-{uuid.uuid4().hex[:8]}",
                role=AgentRole.REVIEWER,
                title="Code Review",
                description="Review code quality and patterns",
                prompt=f"Review: {state.user_request}",
                dependencies=[],
                priority="high",
                requires_tools=True,
            ),
            SubTask(
                id=f"task-{uuid.uuid4().hex[:8]}",
                role=AgentRole.SECURITY,
                title="Security Audit",
                description="Check for security vulnerabilities",
                prompt=f"Security audit: {state.user_request}",
                dependencies=[],
                priority="high",
                requires_tools=True,
            ),
            SubTask(
                id=f"task-{uuid.uuid4().hex[:8]}",
                role=AgentRole.PERFORMANCE,
                title="Performance Analysis",
                description="Analyze performance characteristics",
                prompt=f"Performance analysis: {state.user_request}",
                dependencies=[],
                priority="medium",
                requires_tools=True,
            ),
        ])
        strategy = "parallel"

    else:
        # Default: single researcher task
        sub_tasks.append(
            SubTask(
                id=f"task-{uuid.uuid4().hex[:8]}",
                role=AgentRole.RESEARCHER,
                title="Research & Analysis",
                description="Research and analyze the request",
                prompt=state.user_request,
                dependencies=[],
                priority="high",
                requires_tools=False,
            )
        )
        strategy = "sequential"

    # Mark tasks without dependencies as ready
    for task in sub_tasks:
        if not task.dependencies:
            task.status = "ready"

    logger.info(
        "task_decomposed",
        swarm_id=state.swarm_id,
        task_count=len(sub_tasks),
        strategy=strategy,
    )

    return {
        "sub_tasks": sub_tasks,
        "strategy": strategy,
        "phase": SwarmPhase.SPAWNING,
    }


async def spawn_agents(state: SwarmState) -> dict:
    """
    Spawn agents for ready tasks.

    Finds tasks that are ready (dependencies satisfied)
    and spawns agents to execute them.
    """
    logger.info(
        "spawning_agents",
        swarm_id=state.swarm_id,
        total_tasks=len(state.sub_tasks),
    )

    # Find completed task IDs
    completed_ids = {r.sub_task_id for r in state.completed_results}

    # Find ready tasks
    ready_tasks: list[SubTask] = []
    for task in state.sub_tasks:
        if task.status == "pending":
            # Check if all dependencies are complete
            deps_complete = all(dep in completed_ids for dep in task.dependencies)
            if deps_complete:
                task.status = "ready"

        if task.status == "ready":
            ready_tasks.append(task)

    if not ready_tasks:
        # Check if all tasks are done
        if len(completed_ids) == len(state.sub_tasks):
            logger.info("all_tasks_completed", swarm_id=state.swarm_id)
            return {"phase": SwarmPhase.SYNTHESIZING}

        # Waiting for running tasks
        logger.info(
            "waiting_for_tasks",
            swarm_id=state.swarm_id,
            completed=len(completed_ids),
            total=len(state.sub_tasks),
        )
        return {}

    # Mark tasks as running and track agent IDs
    running_agents: list[str] = list(state.running_agents)
    for task in ready_tasks:
        task.status = "running"
        running_agents.append(task.id)

    logger.info(
        "agents_spawned",
        swarm_id=state.swarm_id,
        spawned_count=len(ready_tasks),
        tasks=[t.title for t in ready_tasks],
    )

    return {
        "sub_tasks": state.sub_tasks,  # Updated with new statuses
        "running_agents": running_agents,
        "phase": SwarmPhase.RUNNING,
    }


async def execute_agents(state: SwarmState) -> dict:
    """
    Execute running agents and collect results.

    Runs agents in parallel (respecting max concurrency)
    and collects their results.
    """
    from app.config import get_settings

    settings = get_settings()

    # Find running tasks
    running_tasks = [t for t in state.sub_tasks if t.status == "running"]

    if not running_tasks:
        logger.info("no_running_tasks", swarm_id=state.swarm_id)
        return {"phase": SwarmPhase.SPAWNING}  # Go back to spawn more

    logger.info(
        "executing_agents",
        swarm_id=state.swarm_id,
        running_count=len(running_tasks),
        max_concurrent=settings.max_concurrent_agents,
    )

    async def execute_single_agent(task: SubTask) -> AgentResult:
        """Execute a single agent task."""
        start_time = datetime.utcnow()

        try:
            # TODO: Replace with actual LLM execution
            # Would use Claude Code for requires_tools=True
            # Or plain Claude for requires_tools=False

            # Simulate execution
            await asyncio.sleep(0.5)  # Simulate work

            summary = f"Completed {task.title}: {task.description[:100]}"
            details = f"Agent {task.role.value} processed: {task.prompt[:200]}"

            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

            logger.info(
                "agent_completed",
                swarm_id=state.swarm_id,
                task_id=task.id,
                role=task.role.value,
                duration_ms=duration_ms,
            )

            return AgentResult(
                sub_task_id=task.id,
                role=task.role,
                summary=summary,
                details=details,
                success=True,
                duration_ms=duration_ms,
                tokens_used=500,  # Placeholder
            )

        except Exception as e:
            logger.error(
                "agent_failed",
                swarm_id=state.swarm_id,
                task_id=task.id,
                error=str(e),
            )

            return AgentResult(
                sub_task_id=task.id,
                role=task.role,
                summary=f"Failed: {e}",
                details="",
                success=False,
                duration_ms=0,
            )

    # Execute agents with concurrency limit
    semaphore = asyncio.Semaphore(settings.max_concurrent_agents)

    async def limited_execute(task: SubTask) -> AgentResult:
        async with semaphore:
            return await execute_single_agent(task)

    # Run all agents
    results = await asyncio.gather(*[limited_execute(t) for t in running_tasks])

    # Update task statuses
    result_map = {r.sub_task_id: r for r in results}
    for task in state.sub_tasks:
        if task.id in result_map:
            result = result_map[task.id]
            task.status = "completed" if result.success else "failed"

    # Clear running agents and add results
    new_completed = list(state.completed_results) + list(results)

    logger.info(
        "agents_batch_completed",
        swarm_id=state.swarm_id,
        completed_count=len(results),
        total_completed=len(new_completed),
    )

    return {
        "sub_tasks": state.sub_tasks,
        "running_agents": [],  # Clear running
        "completed_results": new_completed,
        "phase": SwarmPhase.SPAWNING,  # Go back to check for more tasks
    }


async def synthesize_results(state: SwarmState) -> dict:
    """
    Synthesize results from all agents.

    Combines individual agent outputs into a coherent
    final response.
    """
    logger.info(
        "synthesizing_results",
        swarm_id=state.swarm_id,
        result_count=len(state.completed_results),
    )

    # Build summary
    successful = [r for r in state.completed_results if r.success]
    failed = [r for r in state.completed_results if not r.success]

    total_duration = sum(r.duration_ms for r in state.completed_results)
    total_tokens = sum(r.tokens_used for r in state.completed_results)

    # Create synthesized summary
    sections: list[str] = []

    sections.append(f"## Swarm Execution Complete")
    sections.append(f"")
    sections.append(f"**Request:** {state.user_request}")
    sections.append(f"")
    sections.append(f"**Results:** {len(successful)}/{len(state.completed_results)} tasks succeeded")
    sections.append(f"")

    # Add individual results
    sections.append("### Agent Results")
    sections.append("")

    for result in state.completed_results:
        status_emoji = "pass" if result.success else "fail"
        sections.append(f"#### {result.role.value.title()} [{status_emoji}]")
        sections.append(f"{result.summary}")
        if result.details:
            sections.append(f"\n{result.details[:500]}")
        sections.append("")

    # Add recommendations
    all_recommendations = []
    for result in successful:
        all_recommendations.extend(result.recommendations)

    if all_recommendations:
        sections.append("### Recommendations")
        for rec in all_recommendations[:10]:  # Limit to 10
            sections.append(f"- {rec}")
        sections.append("")

    # Stats
    sections.append("### Statistics")
    sections.append(f"- Total Duration: {total_duration}ms")
    sections.append(f"- Total Tokens: {total_tokens}")
    sections.append(f"- Agents: {len(state.completed_results)}")

    summary = "\n".join(sections)

    logger.info(
        "synthesis_complete",
        swarm_id=state.swarm_id,
        summary_length=len(summary),
    )

    return {
        "synthesized_summary": summary,
        "phase": SwarmPhase.COMPLETED,
    }


def should_continue_spawning(state: SwarmState) -> str:
    """
    Determine if we should continue spawning or move to synthesis.

    Used by conditional edges in the swarm graph.
    """
    completed_ids = {r.sub_task_id for r in state.completed_results}
    pending_tasks = [
        t for t in state.sub_tasks
        if t.id not in completed_ids and t.status != "failed"
    ]

    if not pending_tasks:
        return "synthesize"

    # Check if any tasks are ready or running
    ready_or_running = [t for t in pending_tasks if t.status in ("ready", "running")]
    if ready_or_running:
        return "execute"

    # Check if dependencies can be satisfied
    for task in pending_tasks:
        deps_complete = all(dep in completed_ids for dep in task.dependencies)
        if deps_complete:
            return "spawn"

    # All remaining tasks have unsatisfied dependencies from failed tasks
    return "synthesize"
