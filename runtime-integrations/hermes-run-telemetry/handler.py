from __future__ import annotations

import asyncio
import json
import os
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Any


_runs: dict[str, tuple[str, datetime]] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _key(context: dict[str, Any]) -> str:
    return ":".join(
        str(context.get(field) or "")
        for field in ("platform", "user_id", "chat_id", "thread_id", "session_id")
    )


def _post(payload: dict[str, Any]) -> None:
    endpoint = os.environ.get("TALI_RUN_TELEMETRY_ENDPOINT", "")
    token = os.environ.get("TALI_RUN_TELEMETRY_TOKEN", "")
    if not endpoint or not token:
        return
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=2) as response:
        if response.status >= 400:
            raise RuntimeError(f"Run telemetry returned HTTP {response.status}")


async def _report(payload: dict[str, Any]) -> None:
    try:
        await asyncio.to_thread(_post, payload)
    except Exception as error:
        print(f"[tali-run-telemetry] {error}", flush=True)


async def handle(event_type: str, context: dict[str, Any]) -> None:
    key = _key(context)
    now = _now()
    if event_type == "agent:start":
        run_id = str(uuid.uuid4())
        _runs[key] = (run_id, now)
        await _report({
            "event": "started",
            "runId": run_id,
            "occurredAt": now.isoformat().replace("+00:00", "Z"),
            "triggerType": "USER",
        })
        return
    if event_type != "agent:end":
        return
    run_id, start = _runs.pop(key, (str(uuid.uuid4()), now))
    await _report({
        "event": "finished",
        "runId": run_id,
        "occurredAt": now.isoformat().replace("+00:00", "Z"),
        "status": "SUCCEEDED",
        "terminalReason": "COMPLETED",
        "durationMs": max(0, int((now - start).total_seconds() * 1000)),
    })
