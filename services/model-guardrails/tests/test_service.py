from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from app.config import Settings
from app.contracts import RailResult
from app.main import create_app


class Runtime:
    def __init__(self):
        self.calls = []

    async def check(self, input_type, text, context_messages):
        self.calls.append((input_type, text, context_messages))
        if "blocked" in text:
            return RailResult(status="BLOCKED", content=text, rail="test rail")
        if "redact" in text:
            return RailResult(status="MODIFIED", content=text.replace("redact", "[redacted]"))
        return RailResult(status="PASSED", content=text)


def settings() -> Settings:
    return Settings(
        api_key="test-key",
        profile_path=Path("unused"),
    )


def test_evaluator_settings_require_model_and_base_url(monkeypatch):
    monkeypatch.setenv("MODEL_GUARDRAILS_EVALUATOR_MODEL", "provider/safety")
    monkeypatch.delenv("MODEL_GUARDRAILS_EVALUATOR_BASE_URL", raising=False)

    with pytest.raises(ValueError, match="must be configured together"):
        Settings.from_env()


def test_evaluator_settings_reject_unknown_kind(monkeypatch):
    monkeypatch.setenv("MODEL_GUARDRAILS_EVALUATOR_KIND", "unknown")

    with pytest.raises(ValueError, match="must be self_check or content_safety"):
        Settings.from_env()


@pytest.mark.asyncio
async def test_litellm_contract_blocks_and_requires_api_key():
    app = create_app(settings=settings(), runtime=Runtime())
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        unauthorized = await client.post(
            "/beta/litellm_basic_guardrail_api",
            json={"input_type": "request", "texts": ["hello"]},
        )
        assert unauthorized.status_code == 401

        blocked = await client.post(
            "/beta/litellm_basic_guardrail_api",
            headers={"x-api-key": "test-key"},
            json={"input_type": "request", "texts": ["blocked"]},
        )
        assert blocked.status_code == 200
        assert blocked.json() == {
            "action": "BLOCKED",
            "blocked_reason": "Model input blocked by test rail.",
        }


@pytest.mark.asyncio
async def test_pre_call_context_is_reused_for_post_call():
    runtime = Runtime()
    app = create_app(settings=settings(), runtime=runtime)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        headers={"x-api-key": "test-key"},
    ) as client:
        before = await client.post(
            "/beta/litellm_basic_guardrail_api",
            json={
                "input_type": "request",
                "litellm_call_id": "call-1",
                "model": "tali-routing-routing-a",
                "texts": ["question"],
                "structured_messages": [{"role": "user", "content": "question"}],
            },
        )
        after = await client.post(
            "/beta/litellm_basic_guardrail_api",
            json={
                "input_type": "response",
                "litellm_call_id": "call-1",
                "model": "provider/model",
                "texts": ["redact this"],
            },
        )

    assert before.json() == {"action": "NONE"}
    assert after.json() == {
        "action": "GUARDRAIL_INTERVENED",
        "texts": ["[redacted] this"],
    }
    assert runtime.calls[-1][2] == [{"role": "user", "content": "question"}]


@pytest.mark.asyncio
async def test_post_call_block_stops_the_response():
    app = create_app(settings=settings(), runtime=Runtime())
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        headers={"x-api-key": "test-key"},
    ) as client:
        response = await client.post(
            "/beta/litellm_basic_guardrail_api",
            json={"input_type": "response", "texts": ["blocked"]},
        )

    assert response.status_code == 200
    assert response.json() == {
        "action": "BLOCKED",
        "blocked_reason": "Model output blocked by test rail.",
    }


@pytest.mark.asyncio
async def test_service_always_executes_when_litellm_invokes_it():
    runtime = Runtime()
    app = create_app(settings=settings(), runtime=runtime)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        headers={"x-api-key": "test-key"},
    ) as client:
        response = await client.post(
            "/beta/litellm_basic_guardrail_api",
            json={"input_type": "request", "texts": ["blocked"]},
        )

    assert response.json() == {
        "action": "BLOCKED",
        "blocked_reason": "Model input blocked by test rail.",
    }
    assert runtime.calls == [("request", "blocked", [])]
