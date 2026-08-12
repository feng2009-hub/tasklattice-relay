from typing import TYPE_CHECKING, Literal, Optional, Type

from litellm.integrations.custom_guardrail import log_guardrail_information
from litellm.litellm_core_utils.credential_accessor import CredentialAccessor
from litellm.proxy.guardrails.guardrail_hooks.generic_guardrail_api.generic_guardrail_api import (
    GenericGuardrailAPI,
)
from litellm.types.proxy.guardrails.guardrail_hooks.tasklattice_guard import (
    TaskLatticeGuardConfigModel,
)
from litellm.types.utils import GenericGuardrailAPIInputs

if TYPE_CHECKING:
    from litellm.litellm_core_utils.litellm_logging import Logging as LiteLLMLoggingObj


class TaskLatticeGuard(GenericGuardrailAPI):
    """TaskLattice-branded Generic Guardrail API client."""

    def __init__(self, credential_name: Optional[str] = None, **kwargs):
        if not credential_name:
            raise ValueError("TaskLattice Guard requires a credential reference")
        self.credential_name = credential_name
        # Resolve lazily on every callback. LiteLLM's startup registers DB
        # guardrails immediately before it finishes materializing credentials;
        # a missing credential still fails closed at request time, while normal
        # startup and rotations require no guardrail re-registration.
        kwargs.pop("api_key", None)
        kwargs["unreachable_fallback"] = "fail_closed"
        kwargs["default_on"] = True
        kwargs["event_hook"] = ["pre_call", "post_call"]
        super().__init__(api_key=None, **kwargs)

    def _get_secret(self) -> str:
        values = CredentialAccessor.get_credential_values(self.credential_name)
        secret = values.get("api_key")
        if not isinstance(secret, str) or not secret:
            raise ValueError(
                f"TaskLattice Guard credential '{self.credential_name}' is unavailable"
            )
        return secret

    def _build_request_headers(self) -> dict:
        return {"Content-Type": "application/json", "x-api-key": self._get_secret()}

    @log_guardrail_information
    async def apply_guardrail(
        self,
        inputs: GenericGuardrailAPIInputs,
        request_data: dict,
        input_type: Literal["request", "response"],
        logging_obj: Optional["LiteLLMLoggingObj"] = None,
    ) -> GenericGuardrailAPIInputs:
        # LiteLLM's unified router checks for this method on the concrete class.
        return await super().apply_guardrail(
            inputs=inputs,
            request_data=request_data,
            input_type=input_type,
            logging_obj=logging_obj,
        )

    @classmethod
    def get_config_model(cls) -> Optional[Type[TaskLatticeGuardConfigModel]]:
        return TaskLatticeGuardConfigModel
