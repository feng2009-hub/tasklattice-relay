"""Admin-only TaskLattice Guard connection endpoints.

These endpoints intentionally bypass LiteLLM's generic Guardrail form.  The
service owns the fixed safety policy and the credential reference lifecycle;
the HTTP surface only accepts the two values a human needs to provide.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, SecretStr

from litellm._logging import verbose_proxy_logger
from litellm.proxy._types import LitellmUserRoles, UserAPIKeyAuth
from litellm.proxy.auth.user_api_key_auth import user_api_key_auth

from .service import (
    TaskLatticeGuardConnectionError,
    create_tasklattice_guard_connection,
    delete_tasklattice_guard_connection,
    get_tasklattice_guard_connection,
    update_tasklattice_guard_connection,
)

router = APIRouter()


class CreateTaskLatticeGuardRequest(BaseModel):
    endpoint: str
    secret: SecretStr


class UpdateTaskLatticeGuardRequest(BaseModel):
    endpoint: Optional[str] = None
    secret: Optional[SecretStr] = None


def _require_admin(user_api_key_dict: UserAPIKeyAuth) -> None:
    if user_api_key_dict.user_role != LitellmUserRoles.PROXY_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required to manage guardrails",
        )


def _prisma_client():
    from litellm.proxy.proxy_server import prisma_client

    if prisma_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LiteLLM database is not ready",
        )
    return prisma_client


def _safe_error(error: TaskLatticeGuardConnectionError) -> HTTPException:
    message = str(error)
    response_status = (
        status.HTTP_404_NOT_FOUND
        if message == "TaskLattice Guard connection not found"
        else status.HTTP_400_BAD_REQUEST
    )
    return HTTPException(status_code=response_status, detail=message)


@router.post("/guardrails/tasklattice", tags=["Guardrails"])
async def create_tasklattice_guard(
    request: CreateTaskLatticeGuardRequest,
    user_api_key_dict: UserAPIKeyAuth = Depends(user_api_key_auth),
):
    _require_admin(user_api_key_dict)
    try:
        return await create_tasklattice_guard_connection(
            prisma_client=_prisma_client(),
            endpoint=request.endpoint,
            secret=request.secret.get_secret_value(),
            user_id=user_api_key_dict.user_id,
        )
    except TaskLatticeGuardConnectionError as error:
        raise _safe_error(error) from error
    except HTTPException:
        raise
    except Exception as error:
        verbose_proxy_logger.exception("TaskLattice Guard creation failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="TaskLattice Guard could not be created",
        ) from error


@router.get("/guardrails/tasklattice/{guardrail_id}", tags=["Guardrails"])
async def get_tasklattice_guard(
    guardrail_id: str,
    user_api_key_dict: UserAPIKeyAuth = Depends(user_api_key_auth),
):
    _require_admin(user_api_key_dict)
    try:
        return await get_tasklattice_guard_connection(
            prisma_client=_prisma_client(), guardrail_id=guardrail_id
        )
    except TaskLatticeGuardConnectionError as error:
        raise _safe_error(error) from error
    except HTTPException:
        raise
    except Exception as error:
        verbose_proxy_logger.exception("TaskLattice Guard lookup failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="TaskLattice Guard could not be loaded",
        ) from error


@router.patch("/guardrails/tasklattice/{guardrail_id}", tags=["Guardrails"])
async def update_tasklattice_guard(
    guardrail_id: str,
    request: UpdateTaskLatticeGuardRequest,
    user_api_key_dict: UserAPIKeyAuth = Depends(user_api_key_auth),
):
    _require_admin(user_api_key_dict)
    try:
        return await update_tasklattice_guard_connection(
            prisma_client=_prisma_client(),
            guardrail_id=guardrail_id,
            endpoint=request.endpoint,
            secret=(
                request.secret.get_secret_value()
                if request.secret is not None
                else None
            ),
            user_id=user_api_key_dict.user_id,
        )
    except TaskLatticeGuardConnectionError as error:
        raise _safe_error(error) from error
    except HTTPException:
        raise
    except Exception as error:
        verbose_proxy_logger.exception("TaskLattice Guard update failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="TaskLattice Guard could not be updated",
        ) from error


@router.delete(
    "/guardrails/tasklattice/{guardrail_id}",
    tags=["Guardrails"],
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_tasklattice_guard(
    guardrail_id: str,
    user_api_key_dict: UserAPIKeyAuth = Depends(user_api_key_auth),
) -> Response:
    _require_admin(user_api_key_dict)
    try:
        await delete_tasklattice_guard_connection(
            prisma_client=_prisma_client(), guardrail_id=guardrail_id
        )
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except TaskLatticeGuardConnectionError as error:
        raise _safe_error(error) from error
    except HTTPException:
        raise
    except Exception as error:
        verbose_proxy_logger.exception("TaskLattice Guard deletion failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="TaskLattice Guard could not be deleted",
        ) from error
