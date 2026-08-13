#!/opt/hermes/.venv/bin/python3
"""Authenticated HTTP/WebSocket proxy for the Hermes Dashboard.

The public OpenShell service points at this process. A short-lived access token
is exchanged once for an HttpOnly session cookie before any Dashboard traffic
is forwarded to the loopback-only Hermes listener.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import hmac
import json
import os
import secrets
import signal
import time
from dataclasses import dataclass, field
from http.cookies import SimpleCookie
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from aiohttp import ClientSession, ClientTimeout, ClientWSTimeout, WSMsgType, web


ACCESS_QUERY = "access_token"
SESSION_COOKIE = "tali_hermes_session"
AUDIENCE = "tali-hermes-dashboard"
MAX_ACCESS_LIFETIME_SECONDS = 15 * 60
SESSION_LIFETIME_SECONDS = 4 * 60 * 60
HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}


def _base64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _signed_token(secret: bytes, payload: dict[str, Any]) -> str:
    encoded = _base64url_encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signature = hmac.new(secret, encoded.encode("ascii"), hashlib.sha256).digest()
    return f"{encoded}.{_base64url_encode(signature)}"


def _secure_request(request: web.Request) -> bool:
    forwarded = request.headers.get("x-forwarded-proto", "").split(",", 1)[0]
    return request.secure or forwarded.strip().lower() == "https"


def _unauthorized(message: str) -> web.Response:
    body = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Hermes access required</title></head>
<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:10vh auto;padding:2rem;line-height:1.5">
<h1 style="font-size:1.5rem">Hermes access required</h1><p>{message}</p>
<p>Return to TaskLattice Relay and choose <strong>Open Web UI</strong> again.</p></body></html>"""
    return web.Response(
        status=401,
        text=body,
        content_type="text/html",
        headers={"cache-control": "no-store", "referrer-policy": "no-referrer"},
    )


@dataclass
class ProxyState:
    secret: bytes
    upstream: str
    client: ClientSession
    secure_cookie: bool = False
    parent_pid: int | None = None
    secret_file: Path | None = None
    redeemed: dict[str, int] = field(default_factory=dict)

    def verify(self, token: str, token_type: str) -> dict[str, Any] | None:
        try:
            encoded, supplied_signature = token.split(".", 1)
            expected_signature = hmac.new(
                self.secret, encoded.encode("ascii"), hashlib.sha256
            ).digest()
            if not hmac.compare_digest(
                expected_signature, _base64url_decode(supplied_signature)
            ):
                return None
            payload = json.loads(_base64url_decode(encoded))
            now = int(time.time())
            if (
                not isinstance(payload, dict)
                or payload.get("aud") != AUDIENCE
                or payload.get("typ") != token_type
                or not isinstance(payload.get("sub"), str)
                or not isinstance(payload.get("jti"), str)
                or not isinstance(payload.get("iat"), int)
                or not isinstance(payload.get("exp"), int)
                or payload["iat"] > now + 30
                or payload["exp"] < now
            ):
                return None
            lifetime = payload["exp"] - payload["iat"]
            maximum = (
                MAX_ACCESS_LIFETIME_SECONDS
                if token_type == "access"
                else SESSION_LIFETIME_SECONDS
            )
            if lifetime < 1 or lifetime > maximum:
                return None
            return payload
        except (ValueError, TypeError, json.JSONDecodeError):
            return None

    def exchange(self, token: str) -> str | None:
        payload = self.verify(token, "access")
        if payload is None:
            return None
        now = int(time.time())
        self.redeemed = {
            nonce: expiry for nonce, expiry in self.redeemed.items() if expiry >= now
        }
        nonce = payload["jti"]
        if nonce in self.redeemed:
            return None
        self.redeemed[nonce] = payload["exp"]
        return _signed_token(
            self.secret,
            {
                "aud": AUDIENCE,
                "exp": now + SESSION_LIFETIME_SECONDS,
                "iat": now,
                "jti": secrets.token_urlsafe(18),
                "sub": payload["sub"],
                "typ": "session",
            },
        )


PROXY_STATE_KEY = web.AppKey("proxy_state", ProxyState)
PARENT_WATCH_KEY = web.AppKey("parent_watch", asyncio.Task[None])


def _forward_headers(
    request: web.Request, *, websocket: bool = False
) -> dict[str, str]:
    headers = {
        key: value
        for key, value in request.headers.items()
        if key.lower() not in HOP_BY_HOP_HEADERS
        and key.lower() not in {"content-length", "host", "cookie"}
        and (not websocket or not key.lower().startswith("sec-websocket-"))
    }
    forwarded_cookies = SimpleCookie()
    for key, value in request.cookies.items():
        if key != SESSION_COOKIE:
            forwarded_cookies[key] = value
    cookie_header = forwarded_cookies.output(header="", sep=";").strip()
    if cookie_header:
        headers["cookie"] = cookie_header
    headers["x-forwarded-host"] = request.host
    headers["x-forwarded-proto"] = "https" if _secure_request(request) else "http"
    if request.remote:
        headers["x-forwarded-for"] = request.remote
    return headers


async def _proxy_websocket(request: web.Request, state: ProxyState) -> web.StreamResponse:
    requested_protocols = [
        value.strip()
        for value in request.headers.get("sec-websocket-protocol", "").split(",")
        if value.strip()
    ]
    browser = web.WebSocketResponse(protocols=requested_protocols)
    await browser.prepare(request)
    upstream_url = f"{state.upstream}{request.rel_url}"
    try:
        upstream = await state.client.ws_connect(
            upstream_url,
            headers=_forward_headers(request, websocket=True),
            protocols=requested_protocols,
            timeout=ClientWSTimeout(ws_close=10),
        )
    except Exception:
        await browser.close(code=1011, message=b"Hermes Dashboard unavailable")
        return browser

    async def browser_to_upstream() -> None:
        async for message in browser:
            if message.type == WSMsgType.TEXT:
                await upstream.send_str(message.data)
            elif message.type == WSMsgType.BINARY:
                await upstream.send_bytes(message.data)
            elif message.type == WSMsgType.ERROR:
                break

    async def upstream_to_browser() -> None:
        async for message in upstream:
            if message.type == WSMsgType.TEXT:
                await browser.send_str(message.data)
            elif message.type == WSMsgType.BINARY:
                await browser.send_bytes(message.data)
            elif message.type == WSMsgType.ERROR:
                break

    tasks = {
        asyncio.create_task(browser_to_upstream()),
        asyncio.create_task(upstream_to_browser()),
    }
    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    for task in pending:
        task.cancel()
    await asyncio.gather(*done, *pending, return_exceptions=True)
    await upstream.close()
    await browser.close()
    return browser


async def _proxy_http(request: web.Request, state: ProxyState) -> web.StreamResponse:
    upstream_url = f"{state.upstream}{request.rel_url}"
    try:
        upstream = await state.client.request(
            request.method,
            upstream_url,
            headers=_forward_headers(request),
            data=(
                request.content.iter_chunked(64 * 1024)
                if request.can_read_body
                else None
            ),
            allow_redirects=False,
        )
    except Exception:
        return web.Response(
            status=502,
            text="Hermes Dashboard is temporarily unavailable.",
            headers={"cache-control": "no-store"},
        )
    async with upstream:
        response = web.StreamResponse(status=upstream.status, reason=upstream.reason)
        for key, value in upstream.headers.items():
            if key.lower() not in HOP_BY_HOP_HEADERS and key.lower() != "content-length":
                response.headers.add(key, value)
        response.headers["referrer-policy"] = "no-referrer"
        await response.prepare(request)
        async for chunk in upstream.content.iter_chunked(64 * 1024):
            await response.write(chunk)
        await response.write_eof()
        return response


async def _handle(request: web.Request) -> web.StreamResponse:
    state = request.app[PROXY_STATE_KEY]
    if request.path == "/__tali/health":
        return web.json_response({"ok": True}, headers={"cache-control": "no-store"})

    access_token = request.query.get(ACCESS_QUERY)
    if access_token:
        session_token = state.exchange(access_token)
        existing_session = state.verify(
            request.cookies.get(SESSION_COOKIE, ""), "session"
        )
        if session_token is None and existing_session is None:
            return _unauthorized("This one-time access link is invalid or has expired.")
        clean_query = [(key, value) for key, value in request.query.items() if key != ACCESS_QUERY]
        location = request.path + (f"?{urlencode(clean_query)}" if clean_query else "")
        response = web.HTTPSeeOther(location=location)
        if session_token is not None:
            response.set_cookie(
                SESSION_COOKIE,
                session_token,
                httponly=True,
                max_age=SESSION_LIFETIME_SECONDS,
                path="/",
                samesite="Lax",
                secure=state.secure_cookie or _secure_request(request),
            )
        response.headers["cache-control"] = "no-store"
        response.headers["referrer-policy"] = "no-referrer"
        raise response

    session_token = request.cookies.get(SESSION_COOKIE, "")
    if state.verify(session_token, "session") is None:
        return _unauthorized("Your Hermes Web UI session is missing or has expired.")
    if request.path == "/__tali/logout":
        response = web.HTTPSeeOther(location="/")
        response.del_cookie(SESSION_COOKIE, path="/")
        raise response
    if request.headers.get("upgrade", "").lower() == "websocket":
        return await _proxy_websocket(request, state)
    return await _proxy_http(request, state)


async def _close_client(app: web.Application) -> None:
    state = app[PROXY_STATE_KEY]
    await state.client.close()
    if state.secret_file is not None:
        state.secret_file.unlink(missing_ok=True)


async def _watch_parent(app: web.Application) -> None:
    state = app[PROXY_STATE_KEY]
    if state.parent_pid is None:
        return
    while True:
        await asyncio.sleep(1)
        if os.getppid() != state.parent_pid:
            os.kill(os.getpid(), signal.SIGTERM)
            return


async def _start_parent_watch(app: web.Application) -> None:
    app[PARENT_WATCH_KEY] = asyncio.create_task(_watch_parent(app))


async def _stop_parent_watch(app: web.Application) -> None:
    task = app.get(PARENT_WATCH_KEY)
    if task is None:
        return
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)


async def _create_app(args: argparse.Namespace) -> web.Application:
    secret = args.secret_file.read_bytes().strip()
    if len(secret) < 32:
        raise SystemExit("Hermes Web UI proxy secret must contain at least 32 bytes")
    timeout = ClientTimeout(total=None, connect=15, sock_connect=15)
    client = ClientSession(timeout=timeout, auto_decompress=False)
    app = web.Application(client_max_size=32 * 1024 * 1024)
    app[PROXY_STATE_KEY] = ProxyState(
        secret=secret,
        upstream=f"http://127.0.0.1:{args.upstream_port}",
        client=client,
        secure_cookie=args.secure_cookie,
        parent_pid=args.parent_pid,
        secret_file=args.secret_file,
    )
    app.router.add_route("*", "/{path:.*}", _handle)
    app.on_startup.append(_start_parent_watch)
    app.on_shutdown.append(_stop_parent_watch)
    app.on_cleanup.append(_close_client)
    return app


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--listen-port", type=int, required=True)
    parser.add_argument("--upstream-port", type=int, required=True)
    parser.add_argument("--secret-file", type=Path, required=True)
    parser.add_argument("--parent-pid", type=int, required=True)
    parser.add_argument("--secure-cookie", action="store_true")
    args = parser.parse_args()
    web.run_app(
        _create_app(args), host="0.0.0.0", port=args.listen_port, access_log=None
    )


if __name__ == "__main__":
    main()
