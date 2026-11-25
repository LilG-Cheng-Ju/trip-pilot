"""Pluggable Auth Strategy Chain supporting PAT, DEV bypass, Firebase Auth, and RBAC."""

import asyncio
import hashlib
import logging
import secrets
import threading
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
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.constants import (
    API_TOKEN_PREFIX_LENGTH,
    PAT_LAST_USED_MIN_INTERVAL_SEC,
    USER_LAST_LOGIN_MIN_INTERVAL_SEC,
)
from app.core.database import get_db
from app.models import ApiToken, User, UserRole

PAT_PREFIX = "tp_pat_"
_firebase_init_lock = threading.Lock()
logger = logging.getLogger(__name__)

ALL_SCOPES: tuple[str, ...] = (
    "trips:read",
    "trips:write",
    "expenses:read",
    "expenses:write",
    "stats:read",
)

_ROLE_RANK: dict[str, int] = {
    UserRole.USER.value: 0,
    UserRole.FRIEND.value: 1,
    UserRole.ADMIN.value: 2,
    UserRole.OWNER.value: 3,
}

_MEMBER_ROLES: frozenset[str] = frozenset(
    {UserRole.OWNER.value, UserRole.ADMIN.value, UserRole.FRIEND.value}
)
_ADMIN_ROLES: frozenset[str] = frozenset(
    {UserRole.OWNER.value, UserRole.ADMIN.value}
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

    @property
    def has_member_access(self) -> bool:
        return self.user.role in _MEMBER_ROLES

    def is_admin(self, settings: Settings) -> bool:
        """Return True for DEV bypass, OWNER/ADMIN roles, or admin_emails."""
        if self.method == AuthMethod.DEV or self.user.role in _ADMIN_ROLES:
            return True
        return bool(
            self.user.email
            and self.user.email.strip().lower() in settings.admin_email_set
        )


_bearer = HTTPBearer(auto_error=False)


def hash_token(plaintext: str) -> str:
    """Return the SHA-256 hex digest of a Personal API Token."""
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


def generate_personal_token() -> tuple[str, str, str]:
    """Generate a new (plaintext, prefix, sha256_hash) Personal API Token tuple."""
    raw = secrets.token_urlsafe(32)
    plaintext = f"{PAT_PREFIX}{raw}"
    prefix = plaintext[:API_TOKEN_PREFIX_LENGTH]
    return plaintext, prefix, hash_token(plaintext)


def _normalize_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


def _resolve_bootstrap_role(
    email: str | None,
    settings: Settings,
    *,
    is_dev_bypass: bool = False,
) -> UserRole:
    if is_dev_bypass:
        return UserRole.OWNER
    normalized = email.strip().lower() if isinstance(email, str) else ""
    if normalized:
        if normalized in settings.admin_email_set:
            return UserRole.OWNER
        if normalized in settings.allowed_email_set:
            return UserRole.FRIEND
    return UserRole.USER


def _ensure_active_user(user: User) -> None:
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been suspended",
        )


def _ensure_firebase_initialized(settings: Settings) -> None:
    if firebase_admin._apps:
        return
    with _firebase_init_lock:
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
    db: AsyncSession,
    firebase_uid: str,
    email: str | None,
    settings: Settings,
    *,
    is_dev_bypass: bool = False,
) -> User:
    now = datetime.now(UTC)
    bootstrap_role = _resolve_bootstrap_role(
        email, settings, is_dev_bypass=is_dev_bypass
    )
    user = await db.scalar(select(User).where(User.firebase_uid == firebase_uid))
    if user is not None:
        changed = False
        if email and user.email != email:
            user.email = email
            changed = True
        if _ROLE_RANK.get(bootstrap_role.value, 0) > _ROLE_RANK.get(user.role, 0):
            user.role = bootstrap_role.value
            changed = True
        last_login = _normalize_utc(user.last_login_at)
        if (
            last_login is None
            or (now - last_login).total_seconds() >= USER_LAST_LOGIN_MIN_INTERVAL_SEC
        ):
            user.last_login_at = now
            changed = True
        if changed:
            await db.commit()
            await db.refresh(user)
        return user

    user = User(
        firebase_uid=firebase_uid,
        email=email,
        display_name=email.split("@")[0] if email else "Traveler",
        role=bootstrap_role.value,
        is_active=True,
        last_login_at=now,
    )
    db.add(user)
    try:
        await db.commit()
        await db.refresh(user)
        return user
    except IntegrityError:
        await db.rollback()
        existing = await db.scalar(
            select(User).where(User.firebase_uid == firebase_uid)
        )
        if existing is not None:
            return existing
        raise


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
    expires = _normalize_utc(api_token.expires_at)
    if expires is not None and expires <= now:
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
    _ensure_active_user(user)

    # Throttle last_used_at updates to cut write amplification on MCP reads.
    last_used = _normalize_utc(api_token.last_used_at)
    if (
        last_used is None
        or (now - last_used).total_seconds() >= PAT_LAST_USED_MIN_INTERVAL_SEC
    ):
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
        await asyncio.to_thread(_ensure_firebase_initialized, settings)
        decoded = await asyncio.to_thread(firebase_auth.verify_id_token, raw_token)
    except Exception as exc:
        logger.warning("Firebase ID token verification failed: %s", type(exc).__name__)
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

    email = decoded.get("email")
    user = await _get_or_create_user(db, uid, email, settings)
    _ensure_active_user(user)
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
        user = await _get_or_create_user(
            db, settings.dev_user_id, "dev@local.host", settings, is_dev_bypass=True
        )
        _ensure_active_user(user)
        return AuthContext(
            user=user,
            method=AuthMethod.DEV,
            scopes=frozenset(ALL_SCOPES),
        )

    return await _verify_firebase(db, raw_token, settings)


def require_member_auth(
    auth_ctx: Annotated[AuthContext, Depends(get_auth_context)],
) -> AuthContext:
    """Block uninvited USER accounts until they redeem an invite or get promoted."""
    if not auth_ctx.has_member_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invite code required",
        )
    return auth_ctx


def require_human_auth(
    auth_ctx: Annotated[AuthContext, Depends(get_auth_context)],
) -> AuthContext:
    """Restrict interactive account routes to Firebase or DEV sessions (reject PAT)."""
    if auth_ctx.method == AuthMethod.PAT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Personal API Tokens cannot manage account or token settings",
        )
    return auth_ctx


def require_member_human(
    auth_ctx: Annotated[AuthContext, Depends(require_human_auth)],
) -> AuthContext:
    """Require an approved human session for profile edits and PAT management."""
    if not auth_ctx.has_member_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invite code required",
        )
    return auth_ctx


def require_admin_human(
    auth_ctx: Annotated[AuthContext, Depends(require_human_auth)],
) -> AuthContext:
    """Restrict Admin Console endpoints to interactive OWNER or ADMIN sessions."""
    if auth_ctx.user.role not in _ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return auth_ctx


def require_scope(scope: str) -> Callable[..., AuthContext]:
    """Dependency factory enforcing invite membership and a required PAT scope."""

    def _checker(
        auth_ctx: Annotated[AuthContext, Depends(require_member_auth)],
    ) -> AuthContext:
        if not auth_ctx.has_scope(scope):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required scope: {scope}",
            )
        return auth_ctx

    return _checker
