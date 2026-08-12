from typing import List, Literal

from pydantic import BaseModel, Field


TaskLatticeGuardMode = Literal["pre_call", "post_call"]
TaskLatticeGuardFallback = Literal["fail_closed", "fail_open"]


class TaskLatticeGuardConfigModel(BaseModel):
    """Configuration accepted by the managed TaskLattice Guard provider."""

    endpoint: str = Field(
        description="TaskLattice Integration base URL ending in the Integration UUID",
        json_schema_extra={"ui_type": "url"},
    )
    secret: str = Field(
        description="One-time TaskLattice Integration credential",
        json_schema_extra={"ui_type": "password"},
    )
    mode: List[TaskLatticeGuardMode] = Field(
        default_factory=lambda: ["pre_call", "post_call"],
        min_length=1,
        max_length=2,
        description="LiteLLM request stages protected by TaskLattice Guard",
    )
    default_on: bool = Field(
        default=True,
        description="Apply this guardrail unless a request explicitly opts out",
    )
    unreachable_fallback: TaskLatticeGuardFallback = Field(
        default="fail_closed",
        description="Behavior when TaskLattice Guard is unreachable",
    )
    timeout_seconds: int = Field(
        default=10,
        ge=1,
        le=60,
        strict=True,
        description="Maximum runtime callback duration for each protected stage",
    )

    @staticmethod
    def ui_friendly_name() -> str:
        return "TaskLattice Guard"
