from pydantic import BaseModel, Field


class TaskLatticeGuardConfigModel(BaseModel):
    """The two values intentionally exposed by the TaskLattice setup UI."""
    endpoint: str = Field(
        description="TaskLattice Integration base URL ending in the Integration UUID",
        json_schema_extra={"ui_type": "url"},
    )
    secret: str = Field(
        description="One-time TaskLattice Integration credential",
        json_schema_extra={"ui_type": "password"},
    )

    @staticmethod
    def ui_friendly_name() -> str:
        return "TaskLattice Guard"
