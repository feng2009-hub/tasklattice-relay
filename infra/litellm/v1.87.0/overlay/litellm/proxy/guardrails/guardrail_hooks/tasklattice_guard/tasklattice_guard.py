from typing import TYPE_CHECKING, Literal, Optional, Type

from litellm.integrations.custom_guardrail import log_guardrail_information
from litellm.litellm_core_utils.credential_accessor import CredentialAccessor
from litellm.llms.custom_httpx.http_handler import get_async_httpx_client
from litellm.proxy.guardrails.guardrail_hooks.generic_guardrail_api.generic_guardrail_api import (
    GenericGuardrailAPI,
)
from litellm.types.llms.custom_http import httpxSpecialProvider
from litellm.types.proxy.guardrails.guardrail_hooks.tasklattice_guard import (
    TaskLatticeGuardConfigModel,
)
from litellm.types.utils import GenericGuardrailAPIInputs

if TYPE_CHECKING:
    from litellm.litellm_core_utils.litellm_logging import Logging as LiteLLMLoggingObj


class TaskLatticeGuard(GenericGuardrailAPI):
    """TaskLattice-branded Generic Guardrail API client."""

    def __init__(
        self,
        credential_name: Optional[str] = None,
        timeout_seconds: int = 10,
        **kwargs,
    ):
        if not credential_name:
            raise ValueError("TaskLattice Guard requires a credential reference")
        if (
            isinstance(timeout_seconds, bool)
            or not isinstance(timeout_seconds, int)
            or not 1 <= timeout_seconds <= 60
        ):
            raise ValueError(
                "TaskLattice Guard timeout_seconds must be between 1 and 60"
            )
        self.credential_name = credential_name
        self.timeout_seconds = timeout_seconds
        # Resolve lazily on every callback. LiteLLM's startup registers DB
        # guardrails immediately before it finishes materializing credentials;
        # a missing credential still fails closed at request time, while normal
        # startup and rotations require no guardrail re-registration.
        kwargs.pop("api_key", None)
        super().__init__(api_key=None, **kwargs)
        # GenericGuardrailAPI uses the shared GuardrailCallback client by
        # default. Give TaskLattice a separately cached client so this setting
        # is enforced for every callback without changing other providers.
        self.async_handler = get_async_httpx_client(
            llm_provider=httpxSpecialProvider.GuardrailCallback,
            params={
                "timeout": float(timeout_seconds),
                "client_alias": "tasklattice_guard",
            },
        )

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
