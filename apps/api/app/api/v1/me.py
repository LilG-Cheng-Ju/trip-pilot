"""User profile and Personal API Token endpoints."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    AuthContext,
    AuthMethod,
    generate_personal_token,
    get_auth_context,
)
from app.core.database import get_db
from app.models import ApiToken
from app.schemas.auth import (
    ApiTokenCreate,
    ApiTokenCreatedResponse,
    ApiTokenResponse,
    UserProfileResponse,
    UserProfileUpdate,
)

router = APIRouter(tags=["account"])

CurrentAuth = Annotated[AuthContext, Depends(get_auth_context)]
DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("/me", response_model=UserProfileResponse)
async def get_me(auth_ctx: CurrentAuth) -> UserProfileResponse:
    """Return the authenticated user's profile."""
    return UserProfileResponse.model_validate(auth_ctx.user)


@router.patch("/me", response_model=UserProfileResponse)
async def update_me(
    payload: UserProfileUpdate,
    auth_ctx: CurrentAuth,
    db: DbSession,
) -> UserProfileResponse:
    """Update the authenticated user's profile preferences."""
    user = auth_ctx.user
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return UserProfileResponse.model_validate(user)


@router.get("/tokens", response_model=list[ApiTokenResponse])
async def list_tokens(
    auth_ctx: CurrentAuth,
    db: DbSession,
) -> list[ApiTokenResponse]:
    """List Personal API Tokens owned by the current user."""
    tokens = (
        await db.scalars(
            select(ApiToken)
            .where(ApiToken.user_id == auth_ctx.user.id)
            .order_by(ApiToken.created_at.desc())
        )
    ).all()
    return [ApiTokenResponse.model_validate(t) for t in tokens]


@router.post(
    "/tokens",
    response_model=ApiTokenCreatedResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_token(
    payload: ApiTokenCreate,
    auth_ctx: CurrentAuth,
    db: DbSession,
) -> ApiTokenCreatedResponse:
    """Mint a new Personal API Token (disallowed when authenticating via PAT)."""
    if auth_ctx.method == AuthMethod.PAT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Personal API Tokens cannot mint additional tokens",
        )

    plaintext, prefix, token_hash = generate_personal_token()
    token = ApiToken(
        user_id=auth_ctx.user.id,
        name=payload.name,
        token_prefix=prefix,
        token_hash=token_hash,
        scopes=payload.scopes,
        expires_at=payload.expires_at,
    )
    db.add(token)
    await db.commit()
    await db.refresh(token)

    return ApiTokenCreatedResponse(
        **ApiTokenResponse.model_validate(token).model_dump(),
        plaintext_token=plaintext,
    )


@router.delete("/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(
    token_id: str,
    auth_ctx: CurrentAuth,
    db: DbSession,
) -> None:
    """Revoke an existing Personal API Token owned by the caller."""
    token = await db.scalar(
        select(ApiToken).where(
            ApiToken.id == token_id,
            ApiToken.user_id == auth_ctx.user.id,
        )
    )
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token not found",
        )
    token.revoked_at = datetime.now(UTC)
    await db.commit()
