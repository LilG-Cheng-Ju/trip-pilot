"""Pluggable Auth Strategy Chain supporting PAT, DEV bypass, and Firebase Auth."""

import hashlib
import secrets
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path
from typing import Annotated

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.models import ApiToken, User

PAT_PREFIX = "tp_pat_"

ALL_SCOPES: tuple[str, ...] = (
    "trips:read",
    "trips:write",
    "expenses:read",
    "expenses:write",
    "stats:read",
)


class AuthMethod(StrEnum):
    """Authentication mechanism that established the current request identity."""

    FIREBASE = "FIREBASE"
    PAT = "PAT"
    DEV = "DEV"


@dataclass(frozen=True)
class AuthContext:
    """Verified caller identity and granted permission scopes."""

    user: User
    method: AuthMethod
    scopes: frozenset[str]

    def has_scope(self, scope: str) -> bool:
        return scope in self.scopes


_bearer = HTTPBearer(auto_error=False)


def hash_token(plaintext: str) -> str:
    """Return the SHA-256 hex digest of a Personal API Token."""
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


def generate_personal_token() -> tuple[str, str, str]:
    """Generate a new (plaintext, prefix, sha256_hash) Personal API Token tuple."""
    raw = secrets.token_urlsafe(32)
    plaintext = f"{PAT_PREFIX}{raw}"
    prefix = plaintext[:14]
    return plaintext, prefix, hash_token(plaintext)


def _ensure_firebase_initialized(settings: Settings) -> None:
    if firebase_admin._apps:
        return

    cred_path = (
        Path(settings.firebase_credentials_path)
        if settings.firebase_credentials_path
        else Path(__file__).resolve().parents[2]
        / "config"
        / "firebase-service-account.json"
    )
    if cred_path.exists():
        firebase_admin.initialize_app(credentials.Certificate(str(cred_path)))
    else:
        firebase_admin.initialize_app()


async def _get_or_create_user(
    db: AsyncSession, firebase_uid: str, email: str | None
) -> User:
    user = await db.scalar(select(User).where(User.firebase_uid == firebase_uid))
    if user is not None:
        return user

    user = User(
        firebase_uid=firebase_uid,
        email=email,
        display_name=email.split("@")[0] if email else "Traveler",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _verify_pat(db: AsyncSession, raw_token: str) -> AuthContext:
    token_hash = hash_token(raw_token)
    api_token = await db.scalar(
        select(ApiToken).where(ApiToken.token_hash == token_hash)
    )
    now = datetime.now(UTC)
    if api_token is None or api_token.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API token",
        )
    if api_token.expires_at is not None:
        expires = (
            api_token.expires_at
            if api_token.expires_at.tzinfo is not None
            else api_token.expires_at.replace(tzinfo=UTC)
        )
        if expires <= now:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="API token has expired",
            )

    user = await db.get(User, api_token.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token owner not found",
        )

    api_token.last_used_at = now
    await db.commit()
    return AuthContext(
        user=user,
        method=AuthMethod.PAT,
        scopes=frozenset(api_token.scopes or []),
    )


async def _verify_firebase(
    db: AsyncSession, raw_token: str, settings: Settings
) -> AuthContext:
    try:
        _ensure_firebase_initialized(settings)
        decoded = firebase_auth.verify_id_token(raw_token)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        ) from exc

    uid = decoded.get("uid")
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed Firebase token",
        )
    user = await _get_or_create_user(db, uid, decoded.get("email"))
    return AuthContext(
        user=user,
        method=AuthMethod.FIREBASE,
        scopes=frozenset(ALL_SCOPES),
    )


async def get_auth_context(
    credentials_obj: Annotated[
        HTTPAuthorizationCredentials | None, Depends(_bearer)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthContext:
    """Resolve the caller's AuthContext via PAT -> DEV -> Firebase strategy chain."""
    if credentials_obj is None or not credentials_obj.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )

    raw_token = credentials_obj.credentials

    if raw_token.startswith(PAT_PREFIX):
        return await _verify_pat(db, raw_token)

    # Strictly fail-closed: DEV bypass is honored only when APP_ENV == "DEV".
    if (
        settings.is_dev
        and settings.dev_user_id
        and secrets.compare_digest(raw_token, settings.dev_user_id)
    ):
        user = await _get_or_create_user(db, settings.dev_user_id, "dev@local.host")
        return AuthContext(
            user=user,
            method=AuthMethod.DEV,
            scopes=frozenset(ALL_SCOPES),
        )

    return await _verify_firebase(db, raw_token, settings)


def require_scope(scope: str) -> Callable[..., AuthContext]:
    """Dependency factory enforcing that the authenticated caller holds a scope."""

    def _checker(
        auth_ctx: Annotated[AuthContext, Depends(get_auth_context)],
    ) -> AuthContext:
        if not auth_ctx.has_scope(scope):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required scope: {scope}",
            )
        return auth_ctx

    return _checker
