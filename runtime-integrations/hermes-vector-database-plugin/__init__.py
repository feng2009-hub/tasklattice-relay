"""TaskLattice Project Vector Database tools for the pinned Hermes runtime."""

from __future__ import annotations

import json
from typing import Any

from .client import (
    VectorDatabaseClientError,
    fetch_vector_database_registry,
    public_database,
    search_vector_database,
)


LIST_SCHEMA = {
    "name": "vector_database_list",
    "description": (
        "List the Vector Databases currently shared by this Project. Use this before "
        "searching when the relevant database is not already known."
    ),
    "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
}

SEARCH_SCHEMA = {
    "name": "vector_database_search",
    "description": (
        "Semantically search one Project Vector Database. Use this for questions about "
        "uploaded Project documents or Project-specific knowledge. Base the answer on "
        "returned chunks and cite their filename, page, and section when available."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "database": {
                "type": "string",
                "description": "Vector Database id returned by vector_database_list.",
            },
            "query": {
                "type": "string",
                "description": "Focused natural-language semantic search query.",
            },
            "top_k": {
                "type": "integer",
                "minimum": 1,
                "maximum": 50,
                "description": "Optional maximum result count; defaults to the database setting.",
            },
        },
        "required": ["database", "query"],
        "additionalProperties": False,
    },
}


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _registry():
    from hermes_cli.config import load_config

    config = load_config()
    if not isinstance(config, dict):
        raise VectorDatabaseClientError("Hermes configuration is invalid")
    registry = config.get("vector_database_registry")
    if not isinstance(registry, dict):
        raise VectorDatabaseClientError("Vector Database registry is not configured")
    try:
        timeout = int(registry.get("timeout", 10))
    except (TypeError, ValueError) as exc:
        raise VectorDatabaseClientError(
            "Vector Database registry timeout must be an integer"
        ) from exc
    return fetch_vector_database_registry(
        registry.get("url"),
        registry.get("auth"),
        timeout,
    )


def _handle_list(args: dict, **kwargs) -> str:  # noqa: ARG001
    return _json({
        "vector_databases": [
            public_database(database) for database in _registry().values()
        ],
    })


def _handle_search(args: dict, **kwargs) -> str:  # noqa: ARG001
    database_id = args.get("database")
    if not isinstance(database_id, str) or not database_id.strip():
        raise VectorDatabaseClientError("database is required")
    database = _registry().get(database_id.strip())
    if database is None:
        raise VectorDatabaseClientError(
            f"Unknown Project Vector Database {database_id!r}; use vector_database_list first"
        )
    return _json(search_vector_database(
        database,
        args.get("query"),
        args.get("top_k"),
    ))


def register(ctx) -> None:
    """Register Project Vector Database tools with Hermes' stable PluginContext API."""
    for name, schema, handler, emoji in (
        ("vector_database_list", LIST_SCHEMA, _handle_list, "🗂️"),
        ("vector_database_search", SEARCH_SCHEMA, _handle_search, "🔎"),
    ):
        ctx.register_tool(
            name=name,
            toolset="vector-database",
            schema=schema,
            handler=handler,
            emoji=emoji,
        )
