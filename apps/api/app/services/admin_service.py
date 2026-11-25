"""Business logic for invite codes and Admin Console user governance."""

import secrets
from datetime import UTC, datetime, timedelta
from typing import cast

from fastapi import HTTPException, status
from sqlalchemy import asc, case, delete, desc, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApiToken, InviteCode, Trip, TripDay, User, UserRole
from app.schemas.admin import (
    AdminUserItem,
    AdminUserListResponse,
    AdminUserUpdate,
    InviteCodeBatchCreate,
    InviteCodeResponse,
    InviteStatus,
)

# Exclude visually ambiguous glyphs (0/O, 1/I) for human sharing.
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _normalize_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


def _compute_invite_status(invite: InviteCode, now: datetime) -> InviteStatus:
    if invite.is_used:
        return "used"
    if invite.revoked_at is not None:
        return "revoked"
    expires_at = _normalize_utc(invite.expires_at)
    if expires_at is not None and expires_at <= now:
        return "expired"
    return "available"


def _to_invite_response(
    invite: InviteCode, used_by_email: str | None, now: datetime
) -> InviteCodeResponse:
    return InviteCodeResponse(
        id=invite.id,
        code=invite.code,
        note=invite.note,
        is_used=invite.is_used,
        used_by_user_id=invite.used_by_user_id,
        used_by_email=used_by_email,
        used_at=invite.used_at,
        expires_at=invite.expires_at,
        revoked_at=invite.revoked_at,
        created_at=invite.created_at,
        status=_compute_invite_status(invite, now),
    )


def _generate_invite_code() -> str:
    left = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(4))
    right = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(4))
    return f"TP-{left}-{right}"


def _ensure_actor_can_manage_target(actor: User, target: User) -> None:
    if actor.id == target.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify your own account",
        )
    if target.role == UserRole.OWNER.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify an OWNER account",
        )
    if (
        actor.role == UserRole.ADMIN.value
        and target.role == UserRole.ADMIN.value
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only OWNER can modify ADMIN accounts",
        )


class AdminService:
    """Manages invite codes, user approvals, suspensions, and role transitions."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def redeem_invite_code(self, user: User, raw_code: str) -> User:
        """Atomically redeem a single-use invite code to promote USER -> FRIEND."""
        if user.role != UserRole.USER.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Account already has member access",
            )

        code = raw_code.strip().upper()
        now = datetime.now(UTC)
        redeemed_id = await self.db.scalar(
            update(InviteCode)
            .where(
                InviteCode.code == code,
                InviteCode.is_used.is_(False),
                InviteCode.revoked_at.is_(None),
                or_(InviteCode.expires_at.is_(None), InviteCode.expires_at > now),
            )
            .values(
                is_used=True,
                used_by_user_id=user.id,
                used_at=now,
            )
            .returning(InviteCode.id)
        )
        if redeemed_id is None:
            await self.db.rollback()
            existing = await self.db.scalar(
                select(InviteCode).where(InviteCode.code == code)
            )
            if existing is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Invalid invite code",
                )
            invite_status = _compute_invite_status(existing, now)
            detail_map = {
                "used": "Invite code has already been used",
                "revoked": "Invite code has been revoked",
                "expired": "Invite code has expired",
                "available": "Invite code could not be redeemed",
            }
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=detail_map[invite_status],
            )

        user.role = UserRole.FRIEND.value
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def _build_user_item(self, user: User) -> AdminUserItem:
        trip_count = int(
            await self.db.scalar(
                select(func.count(Trip.id)).where(Trip.user_id == user.id)
            )
            or 0
        )
        active_token_count = int(
            await self.db.scalar(
                select(func.count(ApiToken.id)).where(
                    ApiToken.user_id == user.id,
                    ApiToken.revoked_at.is_(None),
                )
            )
            or 0
        )
        return AdminUserItem(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=UserRole(user.role),
            is_active=user.is_active,
            trip_count=trip_count,
            active_token_count=active_token_count,
            last_login_at=user.last_login_at,
            created_at=user.created_at,
        )

    async def list_users(
        self,
        *,
        q: str | None = None,
        role: UserRole | None = None,
        sort_by: str = "created_at",
        descending: bool = True,
        skip: int = 0,
        limit: int = 50,
    ) -> AdminUserListResponse:
        """List users with aggregated trip/token counts, search, filter, and sort."""
        trip_count_sq = (
            select(func.count(Trip.id))
            .where(Trip.user_id == User.id)
            .correlate(User)
            .scalar_subquery()
        )
        token_count_sq = (
            select(func.count(ApiToken.id))
            .where(ApiToken.user_id == User.id, ApiToken.revoked_at.is_(None))
            .correlate(User)
            .scalar_subquery()
        )

        filters = []
        if q and q.strip():
            term = f"%{q.strip()}%"
            filters.append(
                or_(User.email.ilike(term), User.display_name.ilike(term))
            )
        if role is not None:
            filters.append(User.role == role.value)

        total = int(
            await self.db.scalar(
                select(func.count(User.id)).where(*filters)
            )
            or 0
        )
        active_friends_count = int(
            await self.db.scalar(
                select(func.count(User.id)).where(
                    User.is_active.is_(True),
                    User.role.in_(
                        [
                            UserRole.OWNER.value,
                            UserRole.ADMIN.value,
                            UserRole.FRIEND.value,
                        ]
                    ),
                )
            )
            or 0
        )
        now = datetime.now(UTC)
        available_invites_count = int(
            await self.db.scalar(
                select(func.count(InviteCode.id)).where(
                    InviteCode.is_used.is_(False),
                    InviteCode.revoked_at.is_(None),
                    or_(
                        InviteCode.expires_at.is_(None),
                        InviteCode.expires_at > now,
                    ),
                )
            )
            or 0
        )

        role_rank = case(
            (User.role == UserRole.OWNER.value, 1),
            (User.role == UserRole.ADMIN.value, 2),
            (User.role == UserRole.FRIEND.value, 3),
            (User.role == UserRole.USER.value, 4),
            else_=5,
        )
        sort_columns = {
            "created_at": User.created_at,
            "last_login_at": User.last_login_at,
            "role": role_rank,
        }
        sort_expr = sort_columns.get(sort_by, User.created_at)
        order_fn = desc if descending else asc

        stmt = (
            select(User, trip_count_sq, token_count_sq)
            .where(*filters)
            .order_by(order_fn(sort_expr), desc(User.created_at))
            .offset(skip)
            .limit(limit)
        )
        rows = (await self.db.execute(stmt)).all()
        items: list[AdminUserItem] = []
        for row in rows:
            user = cast(User, row[0])
            trips_cnt = int(cast(int | None, row[1]) or 0)
            tokens_cnt = int(cast(int | None, row[2]) or 0)
            items.append(
                AdminUserItem(
                    id=user.id,
                    email=user.email,
                    display_name=user.display_name,
                    role=UserRole(user.role),
                    is_active=user.is_active,
                    trip_count=trips_cnt,
                    active_token_count=tokens_cnt,
                    last_login_at=user.last_login_at,
                    created_at=user.created_at,
                )
            )
        return AdminUserListResponse(
            total=total,
            active_friends_count=active_friends_count,
            available_invites_count=available_invites_count,
            items=items,
        )

    async def update_user(
        self, *, actor: User, target_user_id: str, payload: AdminUserUpdate
    ) -> AdminUserItem:
        """Update role or suspension flag within strict RBAC boundaries."""
        target = await self.db.get(User, target_user_id)
        if target is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
            )
        _ensure_actor_can_manage_target(actor, target)

        if payload.role is not None:
            if payload.role == UserRole.OWNER:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="OWNER role is managed via ADMIN_EMAILS configuration",
                )
            if (
                payload.role == UserRole.ADMIN
                and actor.role != UserRole.OWNER.value
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only OWNER can grant ADMIN privileges",
                )
            target.role = payload.role.value

        if payload.is_active is not None:
            target.is_active = payload.is_active

        await self.db.commit()
        await self.db.refresh(target)
        return await self._build_user_item(target)

    async def revoke_user_tokens(self, *, actor: User, target_user_id: str) -> int:
        """Revoke all active Personal API Tokens belonging to a target user."""
        target = await self.db.get(User, target_user_id)
        if target is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
            )
        _ensure_actor_can_manage_target(actor, target)

        now = datetime.now(UTC)
        revoked_ids = (
            await self.db.scalars(
                update(ApiToken)
                .where(
                    ApiToken.user_id == target_user_id,
                    ApiToken.revoked_at.is_(None),
                )
                .values(revoked_at=now)
                .returning(ApiToken.id)
            )
        ).all()
        await self.db.commit()
        return len(revoked_ids)

    async def delete_user(self, *, actor: User, target_user_id: str) -> None:
        """Delete a non-OWNER user and cascade all associated records cleanly."""
        if actor.role != UserRole.OWNER.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only OWNER can delete user accounts",
            )
        target = await self.db.get(User, target_user_id)
        if target is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
            )
        _ensure_actor_can_manage_target(actor, target)

        # Break circular TripDay.active_option_id <-> DayOption.trip_day_id FKs first.
        trip_ids_subq = select(Trip.id).where(Trip.user_id == target_user_id)
        await self.db.execute(
            update(TripDay)
            .where(TripDay.trip_id.in_(trip_ids_subq))
            .values(active_option_id=None)
        )
        await self.db.execute(
            update(InviteCode)
            .where(InviteCode.created_by_user_id == target_user_id)
            .values(created_by_user_id=None)
        )
        await self.db.execute(
            update(InviteCode)
            .where(InviteCode.used_by_user_id == target_user_id)
            .values(used_by_user_id=None)
        )
        await self.db.execute(delete(Trip).where(Trip.user_id == target_user_id))
        await self.db.execute(
            delete(ApiToken).where(ApiToken.user_id == target_user_id)
        )
        await self.db.execute(delete(User).where(User.id == target_user_id))
        await self.db.commit()

    async def list_invite_codes(self) -> list[InviteCodeResponse]:
        """Return all invite codes newest-first with computed lifecycle status."""
        now = datetime.now(UTC)
        stmt = (
            select(InviteCode, User.email)
            .outerjoin(User, InviteCode.used_by_user_id == User.id)
            .order_by(InviteCode.created_at.desc())
        )
        rows = (await self.db.execute(stmt)).all()
        return [
            _to_invite_response(invite, used_email, now)
            for invite, used_email in rows
        ]

    async def create_invite_codes(
        self, *, actor: User, payload: InviteCodeBatchCreate
    ) -> list[InviteCodeResponse]:
        """Generate 1-20 unique friend invite codes."""
        now = datetime.now(UTC)
        expires_at = (
            now + timedelta(days=payload.expires_in_days)
            if payload.expires_in_days is not None
            else None
        )
        note = payload.note.strip() if payload.note and payload.note.strip() else None

        created: list[InviteCode] = []
        for _ in range(payload.count):
            for _attempt in range(5):
                candidate = _generate_invite_code()
                invite = InviteCode(
                    code=candidate,
                    note=note,
                    created_by_user_id=actor.id,
                    expires_at=expires_at,
                )
                try:
                    async with self.db.begin_nested():
                        self.db.add(invite)
                        await self.db.flush()
                    created.append(invite)
                    break
                except IntegrityError:
                    continue
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to generate unique invite code",
                )

        await self.db.commit()
        for invite in created:
            await self.db.refresh(invite)
        return [_to_invite_response(invite, None, now) for invite in created]

    async def revoke_invite_code(self, invite_id: str) -> None:
        """Revoke an unused invite code."""
        invite = await self.db.get(InviteCode, invite_id)
        if invite is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Invite code not found"
            )
        if invite.is_used:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot revoke an already-used invite code",
            )
        if invite.revoked_at is None:
            invite.revoked_at = datetime.now(UTC)
            await self.db.commit()
