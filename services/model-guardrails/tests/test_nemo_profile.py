from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

import pytest

from app.runtime import NemoGuardrailsRuntime


@pytest.mark.asyncio
async def test_default_nemo_profile_passes_and_blocks():
    profile = Path(__file__).parent.parent / "profiles" / "model-io-default-v1"
    runtime = NemoGuardrailsRuntime(profile)

    passed = await runtime.check("request", "Summarize this document.", [])
    blocked = await runtime.check("response", "api_key=abcdefghijklmnop", [])

    assert passed.status == "PASSED"
    assert blocked.status == "BLOCKED"


@pytest.mark.asyncio
async def test_provider_backed_self_check_uses_openai_compatible_evaluator(monkeypatch):
    class EvaluatorHandler(BaseHTTPRequestHandler):
        def do_POST(self):
            size = int(self.headers.get("content-length", "0"))
            request = json.loads(self.rfile.read(size))
            prompt = "\n".join(
                str(message.get("content", ""))
                for message in request.get("messages", [])
            )
            verdict = "yes" if "force-model-block" in prompt else "no"
            payload = json.dumps(
                {
                    "id": "guardrail-test",
                    "object": "chat.completion",
                    "created": 0,
                    "model": request.get("model", "test/evaluator"),
                    "choices": [
                        {
                            "index": 0,
                            "message": {"role": "assistant", "content": verdict},
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 1,
                        "completion_tokens": 1,
                        "total_tokens": 2,
                    },
                }
            ).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *_):
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), EvaluatorHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv("TEST_EVALUATOR_API_KEY", "test-key")
    profile = Path(__file__).parent.parent / "profiles" / "model-io-default-v1"
    try:
        runtime = NemoGuardrailsRuntime(
            profile,
            evaluator_model="test/evaluator",
            evaluator_base_url=f"http://127.0.0.1:{server.server_port}/v1",
            evaluator_api_key_env_var="TEST_EVALUATOR_API_KEY",
        )

        passed = await runtime.check("request", "Summarize this document.", [])
        blocked = await runtime.check("request", "force-model-block", [])
    finally:
        server.shutdown()
        thread.join(timeout=2)
        server.server_close()

    assert passed.status == "PASSED"
    assert blocked.status == "BLOCKED"
    assert blocked.rail == "self check input"


@pytest.mark.asyncio
async def test_nvidia_content_safety_evaluator_uses_nemo_json_contract(monkeypatch):
    class ContentSafetyHandler(BaseHTTPRequestHandler):
        def do_POST(self):
            size = int(self.headers.get("content-length", "0"))
            request = json.loads(self.rfile.read(size))
            prompt = "\n".join(
                str(message.get("content", ""))
                for message in request.get("messages", [])
            )
            verdict = "unsafe" if "force-model-block" in prompt else "safe"
            payload = json.dumps(
                {
                    "id": "content-safety-test",
                    "object": "chat.completion",
                    "created": 0,
                    "model": request.get("model", "test/content-safety"),
                    "choices": [
                        {
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": json.dumps(
                                    {
                                        "User Safety": verdict,
                                        "Response Safety": verdict,
                                    }
                                ),
                            },
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 1,
                        "completion_tokens": 1,
                        "total_tokens": 2,
                    },
                }
            ).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *_):
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), ContentSafetyHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv("TEST_NVIDIA_API_KEY", "test-key")
    profile = Path(__file__).parent.parent / "profiles" / "model-io-default-v1"

    try:
        runtime = NemoGuardrailsRuntime(
            profile,
            evaluator_kind="content_safety",
            evaluator_model="test/content-safety",
            evaluator_base_url=f"http://127.0.0.1:{server.server_port}/v1",
            evaluator_api_key_env_var="TEST_NVIDIA_API_KEY",
        )

        safe_input = await runtime.check("request", "Summarize this document.", [])
        unsafe_input = await runtime.check("request", "force-model-block", [])
        safe_output = await runtime.check(
            "response",
            "Here is a concise summary.",
            [{"role": "user", "content": "Summarize this document."}],
        )
        unsafe_output = await runtime.check(
            "response",
            "force-model-block",
            [{"role": "user", "content": "Summarize this document."}],
        )
    finally:
        server.shutdown()
        thread.join(timeout=2)
        server.server_close()

    models = runtime._rails.config.models
    assert [(model.type, model.engine) for model in models] == [
        ("content_safety", "nim")
    ]
    assert runtime._rails.config.rails.input.flows[-1] == (
        "content safety check input $model=content_safety"
    )
    assert runtime._rails.config.rails.output.flows[-1] == (
        "content safety check output $model=content_safety"
    )
    assert safe_input.status == "PASSED"
    assert unsafe_input.status == "BLOCKED"
    assert safe_output.status == "PASSED"
    assert unsafe_output.status == "BLOCKED"
