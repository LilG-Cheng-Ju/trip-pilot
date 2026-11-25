"""Invite code redemption and Admin Console management endpoints."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    AuthContext,
    require_admin_human,
    require_human_auth,
)
from app.core.config import Settings, get_settings
from app.core.constants import INVITE_REDEEM_MAX_PER_MIN
from app.core.database import get_db
from app.core.rate_limit import enforce_key_rate_limit
from app.models.enums import UserRole
from app.schemas.admin import (
    AdminUserItem,
    AdminUserListResponse,
    AdminUserUpdate,
    InviteCodeBatchCreate,
    InviteCodeResponse,
    InviteRedeemRequest,
)
from app.schemas.auth import UserProfileResponse
from app.services.admin_service import AdminService

router = APIRouter(tags=["admin"])

HumanAuth = Annotated[AuthContext, Depends(require_human_auth)]
AdminAuth = Annotated[AuthContext, Depends(require_admin_human)]
DbSession = Annotated[AsyncSession, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.post("/invites/redeem", response_model=UserProfileResponse)
async def redeem_invite(
    payload: InviteRedeemRequest,
    auth_ctx: HumanAuth,
    db: DbSession,
    settings: SettingsDep,
) -> UserProfileResponse:
    """Redeem an invite code to unlock member access for the current user."""
    if settings.is_rate_limit_enabled and not auth_ctx.is_admin(settings):
        enforce_key_rate_limit(
            f"invite_redeem:{auth_ctx.user.id}",
            INVITE_REDEEM_MAX_PER_MIN,
        )
    updated_user = await AdminService(db).redeem_invite_code(
        auth_ctx.user, payload.code
    )
    return UserProfileResponse.model_validate(updated_user)


@router.get("/admin/users", response_model=AdminUserListResponse)
async def list_admin_users(
    _admin: AdminAuth,
    db: DbSession,
    q: Annotated[str | None, Query(max_length=120)] = None,
    role: Annotated[UserRole | None, Query()] = None,
    sort_by: Annotated[
        Literal["created_at", "last_login_at", "role"], Query()
    ] = "created_at",
    order: Annotated[Literal["asc", "desc"], Query()] = "desc",
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> AdminUserListResponse:
    """List users, role summary counts, and activity metrics."""
    return await AdminService(db).list_users(
        q=q,
        role=role,
        sort_by=sort_by,
        descending=(order == "desc"),
        skip=skip,
        limit=limit,
    )


@router.patch("/admin/users/{user_id}", response_model=AdminUserItem)
async def update_admin_user(
    user_id: str,
    payload: AdminUserUpdate,
    admin_ctx: AdminAuth,
    db: DbSession,
) -> AdminUserItem:
    """Update a user's role or active status within admin RBAC hierarchy."""
    return await AdminService(db).update_user(
        actor=admin_ctx.user,
        target_user_id=user_id,
        payload=payload,
    )


@router.post("/admin/users/{user_id}/revoke-tokens")
async def revoke_admin_user_tokens(
    user_id: str,
    admin_ctx: AdminAuth,
    db: DbSession,
) -> dict[str, int]:
    """Revoke all active Personal API Tokens belonging to a target user."""
    revoked_count = await AdminService(db).revoke_user_tokens(
        actor=admin_ctx.user,
        target_user_id=user_id,
    )
    return {"revoked_count": revoked_count}


@router.delete("/admin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin_user(
    user_id: str,
    admin_ctx: AdminAuth,
    db: DbSession,
) -> None:
    """Delete a user account and all its associated records (OWNER only)."""
    await AdminService(db).delete_user(
        actor=admin_ctx.user,
        target_user_id=user_id,
    )


@router.get("/admin/invites", response_model=list[InviteCodeResponse])
async def list_admin_invites(
    _admin: AdminAuth,
    db: DbSession,
) -> list[InviteCodeResponse]:
    """List all invite codes and their usage/expiration state."""
    return await AdminService(db).list_invite_codes()


@router.post(
    "/admin/invites",
    response_model=list[InviteCodeResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_admin_invites(
    payload: InviteCodeBatchCreate,
    admin_ctx: AdminAuth,
    db: DbSession,
) -> list[InviteCodeResponse]:
    """Generate a batch of single-use invite codes."""
    return await AdminService(db).create_invite_codes(
        actor=admin_ctx.user,
        payload=payload,
    )


@router.delete("/admin/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_admin_invite(
    invite_id: str,
    _admin: AdminAuth,
    db: DbSession,
) -> None:
    """Revoke an unused invite code."""
    await AdminService(db).revoke_invite_code(invite_id)
