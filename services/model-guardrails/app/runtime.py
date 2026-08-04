from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol

from .contracts import RailResult


class GuardrailsRuntime(Protocol):
    async def check(
        self,
        input_type: str,
        text: str,
        context_messages: list[dict[str, Any]],
    ) -> RailResult: ...


class NemoGuardrailsRuntime:
    """Thin adapter around NeMo Guardrails' I/O-only check API."""

    def __init__(
        self,
        profile_path: Path,
        *,
        evaluator_model: str | None = None,
        evaluator_base_url: str | None = None,
        evaluator_kind: str = "self_check",
        evaluator_api_key_env_var: str = "MODEL_GUARDRAILS_EVALUATOR_API_KEY",
    ):
        from nemoguardrails import LLMRails, RailsConfig
        from nemoguardrails.rails.llm.config import Model

        if bool(evaluator_model) != bool(evaluator_base_url):
            raise ValueError("Evaluator model and base URL must be configured together.")
        if evaluator_kind not in {"self_check", "content_safety"}:
            raise ValueError("Evaluator kind must be self_check or content_safety.")

        config = RailsConfig.from_path(str(profile_path))
        if evaluator_model and evaluator_base_url:
            if evaluator_kind == "content_safety":
                config.models.append(
                    Model(
                        type="content_safety",
                        engine="nim",
                        model=evaluator_model,
                        api_key_env_var=evaluator_api_key_env_var,
                        parameters={"base_url": evaluator_base_url},
                    )
                )
                config.rails.input.flows.append(
                    "content safety check input $model=content_safety"
                )
                config.rails.output.flows.append(
                    "content safety check output $model=content_safety"
                )
            else:
                config.models.append(
                    Model(
                        type="main",
                        engine="openai",
                        model=evaluator_model,
                        api_key_env_var=evaluator_api_key_env_var,
                        parameters={
                            "base_url": evaluator_base_url,
                            "temperature": 0,
                        },
                    )
                )
                config.rails.input.flows.append("self check input")
                config.rails.output.flows.append("self check output")

        self._rails = LLMRails(config)

    async def check(
        self,
        input_type: str,
        text: str,
        context_messages: list[dict[str, Any]],
    ) -> RailResult:
        from nemoguardrails.rails.llm.options import RailStatus, RailType

        if input_type == "request":
            messages = [{"role": "user", "content": text}]
            rail_types = [RailType.INPUT]
        else:
            messages = [
                message
                for message in context_messages
                if message.get("role") in {"system", "user", "assistant"}
                and isinstance(message.get("content"), str)
            ]
            messages.append({"role": "assistant", "content": text})
            rail_types = [RailType.OUTPUT]

        result = await self._rails.check_async(messages, rail_types=rail_types)
        if result.status == RailStatus.BLOCKED:
            status = "BLOCKED"
        elif result.status == RailStatus.MODIFIED:
            status = "MODIFIED"
        else:
            status = "PASSED"
        return RailResult(
            status=status,
            content=result.content,
            rail=result.rail,
        )
