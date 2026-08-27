from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
import threading
import unittest


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PLUGIN_ROOT))

from client import (  # noqa: E402
    VectorDatabaseClientError,
    fetch_vector_database_registry,
    public_database,
    search_vector_database,
)


class _VectorHandler(BaseHTTPRequestHandler):
    authorization = ""
    request_body: dict = {}

    def log_message(self, format, *args):  # noqa: A002, ANN001
        pass

    def do_GET(self):  # noqa: N802
        type(self).authorization = self.headers.get("authorization", "")
        if self.path == "/v1/hermes/vector-databases?coordinatorInstanceId=hermes-1":
            self._json(200, {
                "vector_databases": {
                    "papers": {
                        "name": "Research Papers",
                        "description": "Project-scoped research papers.",
                        "top_k": 8,
                        "url": self.server.search_url,
                    },
                },
            })
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802
        type(self).authorization = self.headers.get("authorization", "")
        size = int(self.headers.get("content-length", "0"))
        type(self).request_body = json.loads(self.rfile.read(size))
        self._json(200, {
            "query": type(self).request_body["query"],
            "durationMs": 14,
            "results": [{
                "id": "chunk-1",
                "content": "Multi-agent teams can hold experts back.",
                "filename": "Multi-Agent Teams Hold Experts Back.pdf",
                "score": 0.93,
                "pageNumber": 3,
                "sectionPath": ["Results"],
            }],
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
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), _VectorHandler)
        origin = f"http://127.0.0.1:{cls.server.server_port}"
        cls.server.registry_url = (
            f"{origin}/v1/hermes/vector-databases?coordinatorInstanceId=hermes-1"
        )
        cls.server.search_url = (
            f"{origin}/v1/hermes/vector-databases/papers/search"
            "?coordinatorInstanceId=hermes-1"
        )
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def registry(self):
        return fetch_vector_database_registry(
            self.server.registry_url,
            {"type": "bearer", "token": "coordinator-token"},
            5,
        )

    def test_lists_project_databases_without_credentials_or_urls(self):
        database = self.registry()["papers"]
        self.assertEqual(public_database(database), {
            "id": "papers",
            "name": "Research Papers",
            "description": "Project-scoped research papers.",
            "default_top_k": 8,
        })
        self.assertEqual(_VectorHandler.authorization, "Bearer coordinator-token")

    def test_searches_and_returns_citation_metadata(self):
        result = search_vector_database(
            self.registry()["papers"],
            "What happens to experts?",
            5,
        )
        self.assertEqual(_VectorHandler.request_body, {
            "query": "What happens to experts?",
            "topK": 5,
        })
        self.assertEqual(result["results"][0]["page_number"], 3)
        self.assertEqual(
            result["results"][0]["citation"],
            "Multi-Agent Teams Hold Experts Back.pdf, page 3, Results",
        )

    def test_rejects_cross_origin_search_urls(self):
        from client import _request_json

        original = _request_json
        try:
            import client

            client._request_json = lambda *args, **kwargs: {
                "vector_databases": {
                    "bad": {
                        "name": "Bad Database",
                        "description": "A malicious database endpoint.",
                        "top_k": 8,
                        "url": "https://attacker.example/v1/hermes/vector-databases/bad/search",
                    },
                },
            }
            with self.assertRaisesRegex(
                VectorDatabaseClientError,
                "out-of-bound",
            ):
                fetch_vector_database_registry(
                    self.server.registry_url,
                    {"type": "bearer", "token": "coordinator-token"},
                    5,
                )
        finally:
            client._request_json = original

    def test_rejects_invalid_limits_and_queries(self):
        database = self.registry()["papers"]
        with self.assertRaisesRegex(VectorDatabaseClientError, "between 1 and 50"):
            search_vector_database(database, "query", 51)
        with self.assertRaisesRegex(VectorDatabaseClientError, "non-empty"):
            search_vector_database(database, "", 8)


if __name__ == "__main__":
    unittest.main()
