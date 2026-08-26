from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
import threading
import unittest


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PLUGIN_ROOT))

from client import A2AClientError, discover_agent, parse_peer, public_peer, send_message  # noqa: E402


class _AgentHandler(BaseHTTPRequestHandler):
    authorization = ""
    request_body: dict = {}

    def log_message(self, format, *args):  # noqa: A002, ANN001
        pass

    def do_GET(self):  # noqa: N802
        type(self).authorization = self.headers.get("authorization", "")
        if self.path.endswith("/.well-known/agent-card.json"):
            body = {
                "name": "Test Specialist",
                "version": "1.0.0",
                "supportedInterfaces": [{
                    "url": self.server.endpoint,
                    "protocolBinding": "JSONRPC",
                    "protocolVersion": "1.0",
                }],
                "skills": [{"id": "test-skill", "name": "Test skill"}],
            }
            self._json(200, body)
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802
        size = int(self.headers.get("content-length", "0"))
        type(self).request_body = json.loads(self.rfile.read(size))
        request = type(self).request_body
        self._json(200, {
            "jsonrpc": "2.0",
            "id": request["id"],
            "result": {
                "message": {
                    "messageId": "remote-message-1",
                    "contextId": "remote-context-1",
                    "role": "ROLE_AGENT",
                    "parts": [{"text": "delegated result"}],
                },
            },
        })

    def _json(self, status: int, body: dict):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


class ClientTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), _AgentHandler)
        cls.server.endpoint = f"http://127.0.0.1:{cls.server.server_port}/agent"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def peer(self):
        return parse_peer("specialist", {
            "url": self.server.endpoint,
            "timeout": 5,
            "capabilities": ["test-skill"],
            "auth": {"type": "bearer", "token": "project-token"},
        })

    def test_discovers_card_without_exposing_credentials(self):
        peer = self.peer()
        card = discover_agent(peer)
        self.assertEqual(card["name"], "Test Specialist")
        self.assertEqual(_AgentHandler.authorization, "Bearer project-token")
        self.assertNotIn("headers", public_peer(peer))
        self.assertEqual(public_peer(peer)["capabilities"], ["test-skill"])

    def test_sends_a2a_v1_jsonrpc_message(self):
        result = send_message(self.peer(), "Review this change", "existing-context")
        request = _AgentHandler.request_body
        self.assertEqual(request["method"], "SendMessage")
        self.assertEqual(request["params"]["message"]["role"], "ROLE_USER")
        self.assertEqual(
            request["params"]["message"]["contextId"],
            "existing-context",
        )
        self.assertEqual(result["text"], "delegated result")
        self.assertEqual(result["context_id"], "remote-context-1")

    def test_rejects_agent_card_cross_origin_call_target(self):
        peer = self.peer()
        card = {
            "supportedInterfaces": [{
                "url": "https://attacker.example/a2a",
                "protocolBinding": "JSONRPC",
            }],
        }
        from client import resolve_jsonrpc_endpoint

        with self.assertRaisesRegex(A2AClientError, "another origin"):
            resolve_jsonrpc_endpoint(peer, card)

    def test_rejects_unbounded_or_malformed_peer_config(self):
        with self.assertRaisesRegex(A2AClientError, "between 1 and 120"):
            parse_peer("slow", {"url": self.server.endpoint, "timeout": 121})
        with self.assertRaisesRegex(A2AClientError, "HTTP"):
            parse_peer("local", {"url": "file:///etc/passwd"})

    def test_surfaces_an_accepted_remote_task_without_artifacts(self):
        from client import _extract_result

        result = _extract_result({
            "task": {
                "id": "remote-task-1",
                "contextId": "remote-context-1",
                "status": {"state": "TASK_STATE_SUBMITTED"},
                "artifacts": [],
            },
        })
        self.assertEqual(result["remote_task_id"], "remote-task-1")
        self.assertEqual(result["remote_status"], "TASK_STATE_SUBMITTED")
        self.assertIn("without text output", result["text"])


if __name__ == "__main__":
    unittest.main()
