"""Small, dependency-free A2A v1 JSON-RPC client used by the Hermes plugin."""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Any
import urllib.error
import urllib.parse
import urllib.request
import uuid


MAX_RESPONSE_BYTES = 1024 * 1024
DEFAULT_TIMEOUT_SECONDS = 120


class A2AClientError(RuntimeError):
    """A safe, operator-readable A2A transport or protocol failure."""


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        raise A2AClientError("A2A redirects are disabled")


_OPENER = urllib.request.build_opener(_NoRedirectHandler())


@dataclass(frozen=True)
class Peer:
    name: str
    url: str
    card_url: str | None
    timeout_seconds: int
    headers: dict[str, str]
    capabilities: tuple[str, ...]


def _non_empty_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise A2AClientError(f"A2A peer {field} must be a non-empty string")
    return value.strip()


def _validated_http_url(value: Any, field: str) -> str:
    url = _non_empty_string(value, field)
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise A2AClientError(f"A2A peer {field} must be an HTTP(S) URL")
    try:
        parsed.port
    except ValueError as exc:
        raise A2AClientError(f"A2A peer {field} contains an invalid port") from exc
    if parsed.username or parsed.password or parsed.fragment:
        raise A2AClientError(f"A2A peer {field} contains forbidden URL components")
    return url.rstrip("/")


def _same_origin(left: str, right: str) -> bool:
    a = urllib.parse.urlparse(left)
    b = urllib.parse.urlparse(right)

    def port(parsed: urllib.parse.ParseResult) -> int:
        if parsed.port is not None:
            return parsed.port
        return 443 if parsed.scheme == "https" else 80

    return (
        a.scheme == b.scheme
        and a.hostname == b.hostname
        and port(a) == port(b)
    )


def _auth_headers(raw: Any) -> dict[str, str]:
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise A2AClientError("A2A peer auth must be an object")
    auth_type = str(raw.get("type", "none")).strip().lower().replace("-", "_")
    if auth_type in {"", "none"}:
        return {}
    if auth_type == "bearer":
        token = _non_empty_string(raw.get("token"), "auth.token")
        if "\r" in token or "\n" in token:
            raise A2AClientError("A2A bearer token contains invalid characters")
        return {"Authorization": f"Bearer {token}"}
    if auth_type == "basic":
        username = _non_empty_string(raw.get("username"), "auth.username")
        password = _non_empty_string(raw.get("password"), "auth.password")
        encoded = base64.b64encode(f"{username}:{password}".encode()).decode("ascii")
        return {"Authorization": f"Basic {encoded}"}
    if auth_type in {"api_key", "apikey"}:
        value = _non_empty_string(raw.get("token") or raw.get("value"), "auth.token")
        header = str(raw.get("header", "X-API-Key")).strip()
        if not header or not all(character.isalnum() or character == "-" for character in header):
            raise A2AClientError("A2A API key header name is invalid")
        if "\r" in value or "\n" in value:
            raise A2AClientError("A2A API key contains invalid characters")
        return {header: value}
    raise A2AClientError(f"Unsupported A2A authentication type: {auth_type}")


def parse_peer(name: str, raw: Any) -> Peer:
    if not isinstance(raw, dict):
        raise A2AClientError(f"A2A peer {name!r} must be an object")
    url = _validated_http_url(raw.get("url"), "url")
    card_url = raw.get("card_url")
    if card_url is not None:
        card_url = _validated_http_url(card_url, "card_url")
        if not _same_origin(url, card_url):
            raise A2AClientError("A2A card_url must share the peer endpoint origin")
    try:
        timeout = int(raw.get("timeout", DEFAULT_TIMEOUT_SECONDS))
    except (TypeError, ValueError) as exc:
        raise A2AClientError("A2A peer timeout must be an integer") from exc
    if not 1 <= timeout <= DEFAULT_TIMEOUT_SECONDS:
        raise A2AClientError(
            f"A2A peer timeout must be between 1 and {DEFAULT_TIMEOUT_SECONDS} seconds"
        )
    capabilities = raw.get("capabilities", [])
    if not isinstance(capabilities, list) or not all(
        isinstance(item, str) and item.strip() for item in capabilities
    ):
        raise A2AClientError("A2A peer capabilities must be a string array")
    return Peer(
        name=name,
        url=url,
        card_url=card_url,
        timeout_seconds=timeout,
        headers=_auth_headers(raw.get("auth")),
        capabilities=tuple(item.strip() for item in capabilities),
    )


def public_peer(peer: Peer) -> dict[str, Any]:
    """Return peer metadata without credentials."""
    return {
        "name": peer.name,
        "url": peer.url,
        "timeout_seconds": peer.timeout_seconds,
        "capabilities": list(peer.capabilities),
        "authenticated": bool(peer.headers),
    }


def fetch_peer_registry(
    url: Any,
    auth: Any,
    timeout_seconds: int = 10,
) -> dict[str, Any]:
    """Load the current Project-scoped peer map from the Runtime Bridge."""
    registry_url = _validated_http_url(url, "registry.url")
    if not 1 <= timeout_seconds <= DEFAULT_TIMEOUT_SECONDS:
        raise A2AClientError(
            f"A2A registry timeout must be between 1 and {DEFAULT_TIMEOUT_SECONDS} seconds"
        )
    payload = _request_json(
        registry_url,
        method="GET",
        headers=_auth_headers(auth),
        timeout_seconds=timeout_seconds,
    )
    peers = payload.get("a2a_agents") if isinstance(payload, dict) else None
    if not isinstance(peers, dict):
        raise A2AClientError("A2A registry returned an invalid peer map")
    validated: dict[str, Any] = {}
    for name, raw in peers.items():
        if not isinstance(name, str) or not name.strip() or not isinstance(raw, dict):
            raise A2AClientError("A2A registry returned an invalid peer")
        peer_url = _validated_http_url(raw.get("url"), "url")
        parsed_peer_url = urllib.parse.urlparse(peer_url)
        if not _same_origin(registry_url, peer_url) or not parsed_peer_url.path.startswith(
            "/v1/a2a/"
        ):
            raise A2AClientError("A2A registry returned an out-of-bound peer URL")
        candidate = dict(raw)
        candidate["auth"] = auth
        parse_peer(name, candidate)
        validated[name] = candidate
    return validated


def _read_json(response: Any) -> Any:
    content_type = str(response.headers.get("content-type", "")).lower()
    if "json" not in content_type:
        raise A2AClientError("A2A endpoint returned a non-JSON content type")
    raw = response.read(MAX_RESPONSE_BYTES + 1)
    if len(raw) > MAX_RESPONSE_BYTES:
        raise A2AClientError("A2A response exceeded the 1 MiB limit")
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise A2AClientError("A2A endpoint returned invalid JSON") from exc


def _request_json(
    url: str,
    *,
    method: str,
    headers: dict[str, str],
    timeout_seconds: int,
    payload: Any | None = None,
) -> Any:
    request_headers = {
        "Accept": "application/a2a+json, application/json",
        "A2A-Version": "1.0",
        **headers,
    }
    body = None
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        url,
        data=body,
        headers=request_headers,
        method=method,
    )
    try:
        with _OPENER.open(request, timeout=timeout_seconds) as response:
            return _read_json(response)
    except A2AClientError:
        raise
    except urllib.error.HTTPError as exc:
        raise A2AClientError(f"A2A endpoint returned HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", None)
        reason_name = type(reason).__name__ if reason is not None else "network error"
        raise A2AClientError(f"A2A endpoint is unavailable ({reason_name})") from exc
    except TimeoutError as exc:
        raise A2AClientError("A2A request timed out") from exc


def _card_candidates(peer: Peer) -> tuple[str, ...]:
    if peer.card_url:
        return (peer.card_url,)
    return (
        f"{peer.url}/.well-known/agent-card.json",
        f"{peer.url}/.well-known/agent.json",
    )


def discover_agent(peer: Peer) -> dict[str, Any]:
    last_error: A2AClientError | None = None
    card: Any = None
    for url in _card_candidates(peer):
        try:
            card = _request_json(
                url,
                method="GET",
                headers=peer.headers,
                timeout_seconds=peer.timeout_seconds,
            )
            break
        except A2AClientError as exc:
            last_error = exc
    if not isinstance(card, dict):
        raise last_error or A2AClientError("A2A Agent Card is invalid")
    interfaces = card.get("supportedInterfaces")
    if interfaces is not None and not isinstance(interfaces, list):
        raise A2AClientError("A2A Agent Card supportedInterfaces must be an array")
    return card


def resolve_jsonrpc_endpoint(peer: Peer, card: dict[str, Any]) -> str:
    interfaces = card.get("supportedInterfaces")
    if isinstance(interfaces, list):
        for interface in interfaces:
            if not isinstance(interface, dict):
                continue
            binding = str(interface.get("protocolBinding", "")).upper()
            if binding not in {"JSONRPC", "JSON-RPC"}:
                continue
            candidate = _validated_http_url(interface.get("url"), "interface.url")
            if not _same_origin(peer.url, candidate):
                raise A2AClientError(
                    "A2A Agent Card attempted to redirect calls to another origin"
                )
            return candidate
    return peer.url


def _part_text(part: Any) -> str | None:
    if not isinstance(part, dict):
        return None
    text = part.get("text")
    if isinstance(text, str):
        return text
    nested = part.get("data")
    if isinstance(nested, dict) and isinstance(nested.get("text"), str):
        return nested["text"]
    return None


def _message_text(message: Any) -> list[str]:
    if not isinstance(message, dict):
        return []
    parts = message.get("parts")
    if not isinstance(parts, list):
        return []
    return [text for text in (_part_text(part) for part in parts) if text]


def _extract_result(result: Any) -> dict[str, Any]:
    if not isinstance(result, dict):
        raise A2AClientError("A2A result must be an object")
    message = result.get("message")
    task = result.get("task")
    if message is None and task is None:
        kind = str(result.get("kind", "")).lower()
        if kind == "message" or isinstance(result.get("parts"), list):
            message = result
        elif kind == "task" or isinstance(result.get("artifacts"), list):
            task = result

    texts = _message_text(message)
    remote_task_id = None
    remote_status = None
    context_id = None
    if isinstance(message, dict):
        context_id = message.get("contextId")
    if isinstance(task, dict):
        remote_task_id = task.get("id")
        context_id = task.get("contextId") or context_id
        status = task.get("status")
        if isinstance(status, dict):
            remote_status = status.get("state")
            texts.extend(_message_text(status.get("message")))
        artifacts = task.get("artifacts")
        if isinstance(artifacts, list):
            for artifact in artifacts:
                if isinstance(artifact, dict):
                    texts.extend(_message_text(artifact))
    if not texts:
        if isinstance(task, dict) and (remote_task_id or remote_status):
            texts.append("Remote A2A task returned state without text output.")
        else:
            raise A2AClientError("A2A response did not contain text output")
    return {
        "text": "\n".join(texts),
        "context_id": context_id,
        "remote_task_id": remote_task_id,
        "remote_status": remote_status,
    }


def send_message(peer: Peer, message: str, context_id: str | None = None) -> dict[str, Any]:
    prompt = _non_empty_string(message, "message")
    card = discover_agent(peer)
    endpoint = resolve_jsonrpc_endpoint(peer, card)
    request_id = str(uuid.uuid4())
    outbound_message: dict[str, Any] = {
        "messageId": str(uuid.uuid4()),
        "role": "ROLE_USER",
        "parts": [{"text": prompt}],
    }
    if context_id:
        outbound_message["contextId"] = _non_empty_string(context_id, "context_id")
    payload = {
        "jsonrpc": "2.0",
        "id": request_id,
        "method": "SendMessage",
        "params": {"message": outbound_message},
    }
    response = _request_json(
        endpoint,
        method="POST",
        headers=peer.headers,
        timeout_seconds=peer.timeout_seconds,
        payload=payload,
    )
    if not isinstance(response, dict) or response.get("jsonrpc") != "2.0":
        raise A2AClientError("A2A endpoint returned an invalid JSON-RPC response")
    if response.get("id") != request_id:
        raise A2AClientError("A2A JSON-RPC response id did not match the request")
    error = response.get("error")
    if isinstance(error, dict):
        code = error.get("code")
        message_text = str(error.get("message") or "remote Agent rejected the request")
        raise A2AClientError(f"A2A error {code}: {message_text[:240]}")
    return _extract_result(response.get("result"))
