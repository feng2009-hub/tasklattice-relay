#!/opt/hermes/.venv/bin/python3
"""Build-time compatibility probe for Relay's Vector Database Hermes plugin."""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import tempfile
import threading


class _VectorHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002, ANN001
        pass

    def do_GET(self):  # noqa: N802
        if not self.path.startswith("/v1/hermes/vector-databases?"):
            self._send(404, {"error": "not found"})
            return
        self._send(200, {
            "vector_databases": {
                "probe": {
                    "name": "Build Probe",
                    "description": "Build-time Project Vector Database probe.",
                    "top_k": 4,
                    "url": self.server.search_url,
                },
            },
        })

    def do_POST(self):  # noqa: N802
        size = int(self.headers.get("content-length", "0"))
        request = json.loads(self.rfile.read(size))
        self._send(200, {
            "query": request["query"],
            "durationMs": 1,
            "results": [{
                "id": "probe-chunk",
                "content": "Project Vector Database plugin probe complete.",
                "filename": "probe.pdf",
                "score": 1.0,
                "pageNumber": 1,
                "sectionPath": ["Probe"],
            }],
        })

    def _send(self, status: int, body: dict) -> None:
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 0), _VectorHandler)
    origin = f"http://127.0.0.1:{server.server_port}"
    server.registry_url = (
        f"{origin}/v1/hermes/vector-databases?coordinatorInstanceId=build"
    )
    server.search_url = (
        f"{origin}/v1/hermes/vector-databases/probe/search"
        "?coordinatorInstanceId=build"
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with tempfile.TemporaryDirectory(prefix="tali-hermes-vector-plugin-") as temporary:
            home = Path(temporary)
            home.chmod(0o700)
            (home / "config.yaml").write_text(
                "plugins:\n"
                "  enabled:\n"
                "    - tali-vector-database\n"
                "toolsets:\n"
                "  - vector-database\n"
                "vector_database_registry:\n"
                f"  url: {server.registry_url}\n"
                "  timeout: 5\n"
                "  auth:\n"
                "    type: bearer\n"
                "    token: build-probe-token\n",
                encoding="utf-8",
            )
            (home / "config.yaml").chmod(0o600)
            os.environ["HERMES_HOME"] = str(home)

            from hermes_cli.plugins import discover_plugins, get_plugin_manager
            from tools.registry import registry

            discover_plugins(force=True)
            manager = get_plugin_manager()
            loaded = manager._plugins.get(
                "tali-vector-database"
            )  # compatibility assertion
            expected = {"vector_database_list", "vector_database_search"}
            actual = set(registry.get_tool_names_for_toolset("vector-database"))
            if loaded is None or not loaded.enabled or loaded.error:
                raise RuntimeError(
                    f"tali-vector-database plugin did not load: {loaded}"
                )
            if actual != expected:
                raise RuntimeError(
                    "tali-vector-database registered unexpected tools: "
                    f"expected={expected}, actual={actual}"
                )
            listed = json.loads(registry.dispatch("vector_database_list", {}))
            if listed.get("vector_databases", [{}])[0].get("id") != "probe":
                raise RuntimeError(f"Vector Database list probe failed: {listed}")
            result = json.loads(registry.dispatch("vector_database_search", {
                "database": "probe",
                "query": "Run the build probe.",
                "top_k": 1,
            }))
            if (
                result.get("results", [{}])[0].get("content")
                != "Project Vector Database plugin probe complete."
            ):
                raise RuntimeError(f"Vector Database search probe failed: {result}")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


if __name__ == "__main__":
    main()
