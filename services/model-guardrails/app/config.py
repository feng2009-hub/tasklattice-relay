from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class Settings:
    api_key: str
    profile_path: Path
    evaluator_model: str | None = None
    evaluator_base_url: str | None = None
    evaluator_kind: str = "self_check"
    evaluator_api_key_env_var: str = "MODEL_GUARDRAILS_EVALUATOR_API_KEY"

    @classmethod
    def from_env(cls) -> "Settings":
        root = Path(__file__).resolve().parent.parent
        evaluator_model = os.environ.get("MODEL_GUARDRAILS_EVALUATOR_MODEL", "").strip()
        evaluator_base_url = os.environ.get(
            "MODEL_GUARDRAILS_EVALUATOR_BASE_URL",
            "",
        ).strip()
        if bool(evaluator_model) != bool(evaluator_base_url):
            raise ValueError(
                "MODEL_GUARDRAILS_EVALUATOR_MODEL and "
                "MODEL_GUARDRAILS_EVALUATOR_BASE_URL must be configured together."
            )
        evaluator_kind = os.environ.get(
            "MODEL_GUARDRAILS_EVALUATOR_KIND",
            "self_check",
        ).strip()
        if evaluator_kind not in {"self_check", "content_safety"}:
            raise ValueError(
                "MODEL_GUARDRAILS_EVALUATOR_KIND must be self_check or content_safety."
            )
        return cls(
            api_key=os.environ.get("MODEL_GUARDRAILS_API_KEY", "local-model-guardrails-key"),
            profile_path=Path(
                os.environ.get(
                    "MODEL_GUARDRAILS_PROFILE_PATH",
                    str(root / "profiles" / "model-io-default-v1"),
                )
            ),
            evaluator_model=evaluator_model or None,
            evaluator_base_url=evaluator_base_url.rstrip("/") or None,
            evaluator_kind=evaluator_kind,
        )
