"""Dependency-free Project Vector Database client used by the Hermes plugin."""

from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any
import urllib.error
import urllib.parse
import urllib.request


MAX_RESPONSE_BYTES = 4 * 1024 * 1024
MAX_QUERY_CHARACTERS = 8_000
MAX_RESULTS = 50
DEFAULT_TIMEOUT_SECONDS = 30


class VectorDatabaseClientError(RuntimeError):
    """A safe, operator-readable Vector Database transport or protocol failure."""


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        raise VectorDatabaseClientError("Vector Database redirects are disabled")


_OPENER = urllib.request.build_opener(_NoRedirectHandler())


@dataclass(frozen=True)
class VectorDatabase:
    id: str
    name: str
    description: str
    url: str
    top_k: int
    headers: dict[str, str]


def _non_empty_string(value: Any, field: str, maximum: int = 1_000) -> str:
    if not isinstance(value, str) or not value.strip():
        raise VectorDatabaseClientError(f"Vector Database {field} must be a non-empty string")
    normalized = value.strip()
    if len(normalized) > maximum:
        raise VectorDatabaseClientError(f"Vector Database {field} is too long")
    return normalized


def _validated_http_url(value: Any, field: str) -> str:
    url = _non_empty_string(value, field, 2_048)
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise VectorDatabaseClientError(
            f"Vector Database {field} must be an HTTP(S) URL"
        )
    try:
        parsed.port
    except ValueError as exc:
        raise VectorDatabaseClientError(
            f"Vector Database {field} contains an invalid port"
        ) from exc
    if parsed.username or parsed.password or parsed.fragment:
        raise VectorDatabaseClientError(
            f"Vector Database {field} contains forbidden URL components"
        )
    return url


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
    if not isinstance(raw, dict):
        raise VectorDatabaseClientError("Vector Database registry auth must be an object")
    if str(raw.get("type", "")).strip().lower() != "bearer":
        raise VectorDatabaseClientError("Vector Database registry requires bearer auth")
    token = _non_empty_string(raw.get("token"), "auth.token", 2_048)
    if "\r" in token or "\n" in token:
        raise VectorDatabaseClientError(
            "Vector Database bearer token contains invalid characters"
        )
    return {"Authorization": f"Bearer {token}"}


def parse_database(
    database_id: str,
    raw: Any,
    auth: Any,
) -> VectorDatabase:
    identifier = _non_empty_string(database_id, "id", 160)
    if not isinstance(raw, dict):
        raise VectorDatabaseClientError(
            f"Vector Database {identifier!r} must be an object"
        )
    try:
        top_k = int(raw.get("top_k", 8))
    except (TypeError, ValueError) as exc:
        raise VectorDatabaseClientError("Vector Database top_k must be an integer") from exc
    if not 1 <= top_k <= MAX_RESULTS:
        raise VectorDatabaseClientError(
            f"Vector Database top_k must be between 1 and {MAX_RESULTS}"
        )
    return VectorDatabase(
        id=identifier,
        name=_non_empty_string(raw.get("name"), "name", 120),
        description=_non_empty_string(raw.get("description"), "description", 500),
        url=_validated_http_url(raw.get("url"), "url"),
        top_k=top_k,
        headers=_auth_headers(auth),
    )


def public_database(database: VectorDatabase) -> dict[str, Any]:
    return {
        "id": database.id,
        "name": database.name,
        "description": database.description,
        "default_top_k": database.top_k,
    }


def fetch_vector_database_registry(
    url: Any,
    auth: Any,
    timeout_seconds: int = 10,
) -> dict[str, VectorDatabase]:
    registry_url = _validated_http_url(url, "registry.url")
    if not 1 <= timeout_seconds <= DEFAULT_TIMEOUT_SECONDS:
        raise VectorDatabaseClientError(
            "Vector Database registry timeout must be between 1 and 30 seconds"
        )
    payload = _request_json(
        registry_url,
        method="GET",
        headers=_auth_headers(auth),
        timeout_seconds=timeout_seconds,
    )
    databases = payload.get("vector_databases") if isinstance(payload, dict) else None
    if not isinstance(databases, dict):
        raise VectorDatabaseClientError(
            "Vector Database registry returned an invalid database map"
        )
    validated: dict[str, VectorDatabase] = {}
    for database_id, raw in databases.items():
        database = parse_database(database_id, raw, auth)
        parsed_url = urllib.parse.urlparse(database.url)
        if (
            not _same_origin(registry_url, database.url)
            or not parsed_url.path.startswith("/v1/hermes/vector-databases/")
            or not parsed_url.path.endswith("/search")
        ):
            raise VectorDatabaseClientError(
                "Vector Database registry returned an out-of-bound search URL"
            )
        validated[database.id] = database
    return validated


def search_vector_database(
    database: VectorDatabase,
    query: Any,
    top_k: Any = None,
) -> dict[str, Any]:
    prompt = _non_empty_string(query, "query", MAX_QUERY_CHARACTERS)
    try:
        result_limit = database.top_k if top_k is None else int(top_k)
    except (TypeError, ValueError) as exc:
        raise VectorDatabaseClientError("Vector Database top_k must be an integer") from exc
    if not 1 <= result_limit <= MAX_RESULTS:
        raise VectorDatabaseClientError(
            f"Vector Database top_k must be between 1 and {MAX_RESULTS}"
        )
    payload = _request_json(
        database.url,
        method="POST",
        headers=database.headers,
        timeout_seconds=DEFAULT_TIMEOUT_SECONDS,
        payload={"query": prompt, "topK": result_limit},
    )
    return _search_result(payload, database)


def _search_result(payload: Any, database: VectorDatabase) -> dict[str, Any]:
    if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
        raise VectorDatabaseClientError("Vector Database returned invalid search results")
    raw_results = payload["results"]
    if len(raw_results) > MAX_RESULTS:
        raise VectorDatabaseClientError("Vector Database returned too many search results")
    results = []
    for index, raw in enumerate(raw_results):
        if not isinstance(raw, dict):
            raise VectorDatabaseClientError("Vector Database returned an invalid result")
        filename = _non_empty_string(raw.get("filename"), "result.filename", 500)
        content = _non_empty_string(raw.get("content"), "result.content", 50_000)
        page_number = raw.get("pageNumber")
        if page_number is not None and (
            not isinstance(page_number, int) or isinstance(page_number, bool) or page_number < 1
        ):
            raise VectorDatabaseClientError(
                "Vector Database result pageNumber must be a positive integer or null"
            )
        section_path = raw.get("sectionPath", [])
        if not isinstance(section_path, list) or not all(
            isinstance(item, str) for item in section_path
        ):
            raise VectorDatabaseClientError(
                "Vector Database result sectionPath must be a string array"
            )
        score = raw.get("score")
        if not isinstance(score, (int, float)) or isinstance(score, bool):
            raise VectorDatabaseClientError("Vector Database result score must be numeric")
        citation_parts = [filename]
        if page_number is not None:
            citation_parts.append(f"page {page_number}")
        if section_path:
            citation_parts.append(" > ".join(section_path))
        results.append({
            "rank": index + 1,
            "content": content,
            "score": float(score),
            "filename": filename,
            "page_number": page_number,
            "section_path": section_path,
            "citation": ", ".join(citation_parts),
        })
    return {
        "database": public_database(database),
        "query": _non_empty_string(payload.get("query"), "result.query", MAX_QUERY_CHARACTERS),
        "duration_ms": payload.get("durationMs"),
        "results": results,
    }


def _read_json(response: Any) -> Any:
    content_type = str(response.headers.get("content-type", "")).lower()
    if "json" not in content_type:
        raise VectorDatabaseClientError(
            "Vector Database endpoint returned a non-JSON content type"
        )
    raw = response.read(MAX_RESPONSE_BYTES + 1)
    if len(raw) > MAX_RESPONSE_BYTES:
        raise VectorDatabaseClientError(
            "Vector Database response exceeded the 4 MiB limit"
        )
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise VectorDatabaseClientError(
            "Vector Database endpoint returned invalid JSON"
        ) from exc


def _request_json(
    url: str,
    *,
    method: str,
    headers: dict[str, str],
    timeout_seconds: int,
    payload: Any | None = None,
) -> Any:
    request_headers = {"Accept": "application/json", **headers}
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
    except VectorDatabaseClientError:
        raise
    except urllib.error.HTTPError as exc:
        raise VectorDatabaseClientError(
            f"Vector Database endpoint returned HTTP {exc.code}"
        ) from exc
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", None)
        reason_name = type(reason).__name__ if reason is not None else "network error"
        raise VectorDatabaseClientError(
            f"Vector Database endpoint is unavailable ({reason_name})"
        ) from exc
    except TimeoutError as exc:
        raise VectorDatabaseClientError("Vector Database request timed out") from exc
