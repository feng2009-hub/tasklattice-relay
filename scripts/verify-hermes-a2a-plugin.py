#!/opt/hermes/.venv/bin/python3
"""Build-time compatibility probe for Relay's plugin and pinned Hermes."""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading


class _A2AHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002, ANN001
        pass

    def do_GET(self):  # noqa: N802
        if not self.path.endswith("/.well-known/agent-card.json"):
            self._send(404, {"error": "not found"})
            return
        self._send(200, {
            "name": "Build Probe",
            "version": "1.0.0",
            "supportedInterfaces": [{
                "url": self.server.endpoint,
                "protocolBinding": "JSONRPC",
                "protocolVersion": "1.0",
            }],
            "skills": [{"id": "probe", "name": "Probe"}],
        })

    def do_POST(self):  # noqa: N802
        size = int(self.headers.get("content-length", "0"))
        request = json.loads(self.rfile.read(size))
        if request.get("method") != "SendMessage":
            self._send(400, {"error": "wrong method"})
            return
        self._send(200, {
            "jsonrpc": "2.0",
            "id": request["id"],
            "result": {
                "message": {
                    "messageId": "probe-message",
                    "role": "ROLE_AGENT",
                    "parts": [{"text": "probe complete"}],
                },
            },
        })

    def _send(self, status: int, body: dict) -> None:
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 0), _A2AHandler)
    server.endpoint = f"http://127.0.0.1:{server.server_port}/agent"
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with tempfile.TemporaryDirectory(prefix="tali-hermes-plugin-") as temporary:
            home = Path(temporary)
            home.chmod(0o700)
            (home / "config.yaml").write_text(
                "plugins:\n"
                "  enabled:\n"
                "    - tali-a2a\n"
                "toolsets:\n"
                "  - kanban\n"
                "  - a2a\n"
                "a2a_agents:\n"
                "  probe:\n"
                f"    url: {server.endpoint}\n"
                "    timeout: 5\n"
                "    capabilities:\n"
                "      - probe\n",
                encoding="utf-8",
            )
            (home / "config.yaml").chmod(0o600)
            os.environ["HERMES_HOME"] = str(home)

            from hermes_cli import kanban_db
            from hermes_cli.plugins import discover_plugins, get_plugin_manager
            from tools.registry import registry

            discover_plugins(force=True)
            manager = get_plugin_manager()
            loaded = manager._plugins.get("tali-a2a")  # compatibility assertion
            expected = {"a2a_list", "a2a_discover", "a2a_call"}
            actual = set(registry.get_tool_names_for_toolset("a2a"))
            if loaded is None or not loaded.enabled or loaded.error:
                raise RuntimeError(f"tali-a2a plugin did not load: {loaded}")
            if actual != expected:
                raise RuntimeError(
                    f"tali-a2a registered unexpected tools: expected={expected}, actual={actual}"
                )

            with kanban_db.connect_closing() as connection:
                task_id = kanban_db.create_task(
                    connection,
                    title="A2A build-time dispatch probe",
                    assignee="tali-a2a",
                    created_by="image-build",
                    initial_status="blocked",
                )
            result = json.loads(registry.dispatch("a2a_call", {
                "agent": "probe",
                "message": "Run the image compatibility probe.",
                "task_id": task_id,
            }))
            if result.get("ok") is not True or result.get("text") != "probe complete":
                raise RuntimeError(f"tali-a2a dispatch probe failed: {result}")
            with kanban_db.connect_closing() as connection:
                comments = kanban_db.list_comments(connection, task_id)
            bodies = [comment.body for comment in comments]
            if len(bodies) != 2 or "started" not in bodies[0] or "returned" not in bodies[1]:
                raise RuntimeError(f"tali-a2a Kanban audit probe failed: {bodies}")

            dashboard_api = (
                Path("/opt/hermes/plugins/kanban/dashboard/plugin_api.py")
            )
            spec = importlib.util.spec_from_file_location(
                "tali_kanban_dashboard_probe",
                dashboard_api,
            )
            if spec is None or spec.loader is None:
                raise RuntimeError("Hermes Kanban dashboard API is unavailable")
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            detail = module.get_task(
                task_id,
                board=None,
                run_state_type=None,
                run_state_name=None,
            )
            if detail["task"]["status"] != "running" or len(detail["comments"]) != 2:
                raise RuntimeError(
                    f"Hermes Kanban dashboard cannot read A2A scheduling state: {detail}"
                )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


if __name__ == "__main__":
    main()
