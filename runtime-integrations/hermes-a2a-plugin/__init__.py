"""TaskLattice outbound A2A tools for the pinned Hermes runtime."""

from __future__ import annotations

import json
from typing import Any

from .client import A2AClientError, discover_agent, parse_peer, public_peer, send_message


LIST_SCHEMA = {
    "name": "a2a_list",
    "description": (
        "List A2A specialists connected to this Project. Returns only agents "
        "approved for the current Hermes Coordinator and never exposes credentials."
    ),
    "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
}

DISCOVER_SCHEMA = {
    "name": "a2a_discover",
    "description": (
        "Fetch the A2A Agent Card for one Project-approved specialist before delegation."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "agent": {"type": "string", "description": "Agent id returned by a2a_list."},
        },
        "required": ["agent"],
        "additionalProperties": False,
    },
}

CALL_SCHEMA = {
    "name": "a2a_call",
    "description": (
        "Delegate a bounded task to one Project-approved A2A specialist. First create "
        "a blocked Hermes Kanban task assigned to 'tali-a2a'; this tool atomically "
        "claims it as running and writes dispatch start/success/failure to the card."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "agent": {"type": "string", "description": "Agent id returned by a2a_list."},
            "message": {"type": "string", "description": "Self-contained delegated task."},
            "task_id": {
                "type": "string",
                "description": (
                    "Existing blocked/ready Kanban task assigned to the reserved "
                    "'tali-a2a' assignee, or a running task already owned by this tool."
                ),
            },
            "context_id": {
                "type": "string",
                "description": "Optional A2A contextId when continuing a remote conversation.",
            },
            "board": {
                "type": "string",
                "description": "Optional Hermes Kanban board name.",
            },
        },
        "required": ["agent", "message", "task_id"],
        "additionalProperties": False,
    },
}


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _agent_config() -> dict[str, Any]:
    from hermes_cli.config import load_config

    config = load_config()
    raw_agents = config.get("a2a_agents") if isinstance(config, dict) else None
    if not isinstance(raw_agents, dict):
        return {}
    return raw_agents


def _peer(agent: Any):
    if not isinstance(agent, str) or not agent.strip():
        raise A2AClientError("agent is required")
    name = agent.strip()
    raw = _agent_config().get(name)
    if raw is None:
        raise A2AClientError(
            f"Unknown A2A agent {name!r}; use a2a_list to inspect Project-approved peers"
        )
    return parse_peer(name, raw)


def _kanban_comment(task_id: Any, body: str, board: Any = None) -> None:
    if not isinstance(task_id, str) or not task_id.strip():
        raise A2AClientError("task_id is required")
    from hermes_cli import kanban_db

    board_name = board.strip() if isinstance(board, str) and board.strip() else None
    try:
        with kanban_db.connect_closing(board=board_name) as connection:
            kanban_db.add_comment(
                connection,
                task_id.strip(),
                author="tali-a2a",
                body=body,
            )
    except ValueError as exc:
        raise A2AClientError(f"Kanban dispatch audit failed: {exc}") from exc


def _claim_kanban_task(task_id: Any, timeout_seconds: int, board: Any = None) -> None:
    if not isinstance(task_id, str) or not task_id.strip():
        raise A2AClientError("task_id is required")
    from hermes_cli import kanban_db

    task_id = task_id.strip()
    board_name = board.strip() if isinstance(board, str) and board.strip() else None
    claim_lock = f"tali-a2a:{task_id}"
    with kanban_db.connect_closing(board=board_name) as connection:
        task = kanban_db.get_task(connection, task_id)
        if task is None:
            raise A2AClientError(f"Kanban dispatch audit failed: unknown task {task_id}")
        if task.assignee != "tali-a2a":
            raise A2AClientError(
                "A2A dispatch tasks must use the reserved 'tali-a2a' assignee"
            )
        if task.status == "running":
            if task.claim_lock != claim_lock or not kanban_db.heartbeat_claim(
                connection,
                task_id,
                ttl_seconds=timeout_seconds + 600,
                claimer=claim_lock,
            ):
                raise A2AClientError("Kanban task is already running under another owner")
            return
        if task.status == "blocked":
            promoted, reason = kanban_db.promote_task(
                connection,
                task_id,
                actor="tali-a2a",
                reason="Project A2A dispatch",
            )
            if not promoted:
                raise A2AClientError(f"Kanban task cannot be promoted: {reason}")
        elif task.status != "ready":
            raise A2AClientError(
                f"Kanban task must be blocked or ready before dispatch (got {task.status})"
            )
        claimed = kanban_db.claim_task(
            connection,
            task_id,
            ttl_seconds=timeout_seconds + 600,
            claimer=claim_lock,
        )
        if claimed is None:
            raise A2AClientError("Kanban task could not be claimed for A2A dispatch")


def _handle_list(args: dict, **kwargs) -> str:  # noqa: ARG001
    agents = []
    invalid = []
    for name, raw in _agent_config().items():
        if not isinstance(name, str) or not name.strip():
            invalid.append(str(name))
            continue
        try:
            agents.append(public_peer(parse_peer(name, raw)))
        except A2AClientError:
            invalid.append(name)
    return _json({"agents": agents, "invalid_configurations": invalid})


def _handle_discover(args: dict, **kwargs) -> str:  # noqa: ARG001
    peer = _peer(args.get("agent"))
    card = discover_agent(peer)
    return _json({"agent": peer.name, "agent_card": card})


def _handle_call(args: dict, **kwargs) -> str:  # noqa: ARG001
    peer = _peer(args.get("agent"))
    task_id = args.get("task_id")
    board = args.get("board")
    _claim_kanban_task(task_id, peer.timeout_seconds, board)
    _kanban_comment(
        task_id,
        f"A2A dispatch started for Project Agent '{peer.name}'.",
        board,
    )
    try:
        result = send_message(peer, args.get("message"), args.get("context_id"))
    except Exception as exc:
        safe_error = exc if isinstance(exc, A2AClientError) else A2AClientError(
            f"Unexpected A2A client failure ({type(exc).__name__})"
        )
        try:
            _kanban_comment(
                task_id,
                f"A2A dispatch failed for Project Agent '{peer.name}'. "
                "See the Supervisor tool result for details.",
                board,
            )
        except Exception:
            pass
        raise safe_error
    evidence = []
    if result.get("remote_task_id"):
        evidence.append(f"remote_task_id={result['remote_task_id']}")
    if result.get("context_id"):
        evidence.append(f"context_id={result['context_id']}")
    if result.get("remote_status"):
        evidence.append(f"status={result['remote_status']}")
    suffix = f" ({', '.join(evidence)})" if evidence else ""
    _kanban_comment(
        task_id,
        f"A2A dispatch returned from Project Agent '{peer.name}'{suffix}.",
        board,
    )
    return _json({"ok": True, "agent": peer.name, "task_id": task_id, **result})


def register(ctx) -> None:
    """Register outbound tools against Hermes v0.19's stable PluginContext API."""
    for name, schema, handler, emoji in (
        ("a2a_list", LIST_SCHEMA, _handle_list, "🧭"),
        ("a2a_discover", DISCOVER_SCHEMA, _handle_discover, "🪪"),
        ("a2a_call", CALL_SCHEMA, _handle_call, "🤝"),
    ):
        ctx.register_tool(
            name=name,
            toolset="a2a",
            schema=schema,
            handler=handler,
            emoji=emoji,
        )
