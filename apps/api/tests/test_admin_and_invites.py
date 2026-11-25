"""Integration tests for invite-only RBAC, invite redemption, and Admin Console API."""

from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import Settings, get_settings
from app.core.database import Base, configure_sqlite_foreign_keys, get_db
from app.core.rate_limit import reset_rate_limiters
from app.main import create_app
from app.models import InviteCode, UserRole


def _token_map(raw_token: str) -> dict[str, str]:
    emails = {
        "owner-tok": "billlcj104@gmail.com",
        "admin-tok": "co-admin@example.test",
        "friend-tok": "friend@example.test",
        "stranger1-tok": "stranger1@example.test",
        "stranger2-tok": "stranger2@example.test",
    }
    if raw_token not in emails:
        raise ValueError("Unknown token")
    return {"uid": f"uid-{raw_token}", "email": emails[raw_token]}


@pytest.fixture
async def prod_ctx() -> AsyncGenerator[
    tuple[AsyncClient, async_sessionmaker[AsyncSession]], None
]:
    reset_rate_limiters()
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    configure_sqlite_foreign_keys(engine)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def _override_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            yield session

    prod_settings = Settings(
        app_env="PROD",
        admin_emails="billlcj104@gmail.com",
        allowed_emails="friend@example.test",
        rate_limit_enabled=True,
    )
    app = create_app(prod_settings)
    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_settings] = lambda: prod_settings

    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    with (
        patch("app.core.auth._ensure_firebase_initialized"),
        patch(
            "app.core.auth.firebase_auth.verify_id_token",
            side_effect=_token_map,
        ),
    ):
        async with client:
            yield client, session_factory

    reset_rate_limiters()
    await engine.dispose()


@pytest.mark.asyncio
async def test_invite_only_gate_redemption_and_reuse_protection(
    prod_ctx: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    client, _ = prod_ctx
    owner_hdrs = {"Authorization": "Bearer owner-tok"}
    stranger1_hdrs = {"Authorization": "Bearer stranger1-tok"}
    stranger2_hdrs = {"Authorization": "Bearer stranger2-tok"}

    owner_me = await client.get("/api/v1/me", headers=owner_hdrs)
    assert owner_me.status_code == 200
    assert owner_me.json()["role"] == "OWNER"

    # Uninvited USER gets /me (for UI routing) but is blocked from trips, tokens, MCP.
    s1_me = await client.get("/api/v1/me", headers=stranger1_hdrs)
    assert s1_me.status_code == 200
    assert s1_me.json()["role"] == "USER"
    trips_blocked = await client.get("/api/v1/trips", headers=stranger1_hdrs)
    assert trips_blocked.status_code == 403
    tokens_blocked = await client.get("/api/v1/tokens", headers=stranger1_hdrs)
    assert tokens_blocked.status_code == 403
    assert (
        await client.post(
            "/mcp",
            headers=stranger1_hdrs,
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
        )
    ).status_code == 403
    admin_blocked = await client.get("/api/v1/admin/users", headers=stranger1_hdrs)
    assert admin_blocked.status_code == 403

    # Owner generates 1 invite code and creates a trip later checks don't fail.
    gen_resp = await client.post(
        "/api/v1/admin/invites",
        headers=owner_hdrs,
        json={"count": 1, "note": "College buddy", "expires_in_days": 7},
    )
    assert gen_resp.status_code == 201
    invite = gen_resp.json()[0]
    assert invite["code"].startswith("TP-")
    assert invite["status"] == "available"

    # Redeem in lowercase with whitespace should succeed cleanly and unlock trips.
    redeem_resp = await client.post(
        "/api/v1/invites/redeem",
        headers=stranger1_hdrs,
        json={"code": f"  {invite['code'].lower()}  "},
    )
    assert redeem_resp.status_code == 200
    assert redeem_resp.json()["role"] == "FRIEND"
    trips_ok = await client.get("/api/v1/trips", headers=stranger1_hdrs)
    assert trips_ok.status_code == 200

    # Reusing an already redeemed code fails cleanly.
    reused = await client.post(
        "/api/v1/invites/redeem",
        headers=stranger2_hdrs,
        json={"code": invite["code"]},
    )
    assert reused.status_code == 400

    # Admin sees invite marked used with redeemer email.
    invites = (await client.get("/api/v1/admin/invites", headers=owner_hdrs)).json()
    assert invites[0]["status"] == "used"
    assert invites[0]["used_by_email"] == "stranger1@example.test"


@pytest.mark.asyncio
async def test_expired_revoked_and_rate_limited_invite_redemption(
    prod_ctx: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    client, session_factory = prod_ctx
    owner_hdrs = {"Authorization": "Bearer owner-tok"}
    stranger_hdrs = {"Authorization": "Bearer stranger1-tok"}

    codes = (
        await client.post(
            "/api/v1/admin/invites",
            headers=owner_hdrs,
            json={"count": 2, "expires_in_days": 1},
        )
    ).json()
    expired_code = codes[0]
    revoked_code = codes[1]

    # Revoke second code via admin endpoint.
    del_resp = await client.delete(
        f"/api/v1/admin/invites/{revoked_code['id']}", headers=owner_hdrs
    )
    assert del_resp.status_code == 204
    assert (
        await client.post(
            "/api/v1/invites/redeem",
            headers=stranger_hdrs,
            json={"code": revoked_code["code"]},
        )
    ).status_code == 400

    # Backdate expiration of first code directly in DB.
    async with session_factory() as session:
        await session.execute(
            update(InviteCode)
            .where(InviteCode.id == expired_code["id"])
            .values(expires_at=datetime.now(UTC) - timedelta(hours=1))
        )
        await session.commit()

    assert (
        await client.post(
            "/api/v1/invites/redeem",
            headers=stranger_hdrs,
            json={"code": expired_code["code"]},
        )
    ).status_code == 400

    # Exceeding 10 redemption guesses/min returns 429.
    for _ in range(8):
        resp = await client.post(
            "/api/v1/invites/redeem",
            headers=stranger_hdrs,
            json={"code": "TP-ZZZZ-ZZZZ"},
        )
        assert resp.status_code == 404
    blocked = await client.post(
        "/api/v1/invites/redeem",
        headers=stranger_hdrs,
        json={"code": "TP-ZZZZ-ZZZZ"},
    )
    assert blocked.status_code == 429


@pytest.mark.asyncio
async def test_rbac_hierarchy_suspension_pat_revocation_and_owner_delete(
    prod_ctx: tuple[AsyncClient, async_sessionmaker[AsyncSession]],
) -> None:
    client, _ = prod_ctx
    owner_hdrs = {"Authorization": "Bearer owner-tok"}
    admin_hdrs = {"Authorization": "Bearer admin-tok"}
    friend_hdrs = {"Authorization": "Bearer friend-tok"}
    stranger_hdrs = {"Authorization": "Bearer stranger1-tok"}

    # Touch all 4 accounts so they exist.
    owner_me = (await client.get("/api/v1/me", headers=owner_hdrs)).json()
    admin_me = (await client.get("/api/v1/me", headers=admin_hdrs)).json()
    friend_me = (await client.get("/api/v1/me", headers=friend_hdrs)).json()
    stranger_me = (await client.get("/api/v1/me", headers=stranger_hdrs)).json()

    assert owner_me["role"] == UserRole.OWNER.value
    assert friend_me["role"] == UserRole.FRIEND.value
    assert stranger_me["role"] == UserRole.USER.value

    # PAT tokens are always rejected on /api/v1/admin/* and /invites/redeem.
    owner_pat = (
        await client.post(
            "/api/v1/tokens",
            headers=owner_hdrs,
            json={"name": "Owner MCP", "scopes": ["trips:read"]},
        )
    ).json()["plaintext_token"]
    assert (
        await client.get(
            "/api/v1/admin/users", headers={"Authorization": f"Bearer {owner_pat}"}
        )
    ).status_code == 403

    # Owner promotes co-admin to ADMIN.
    promoted = await client.patch(
        f"/api/v1/admin/users/{admin_me['id']}",
        headers=owner_hdrs,
        json={"role": "ADMIN"},
    )
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "ADMIN"

    # ADMIN cannot promote to ADMIN/OWNER, alter OWNER, or delete users.
    assert (
        await client.patch(
            f"/api/v1/admin/users/{stranger_me['id']}",
            headers=admin_hdrs,
            json={"role": "ADMIN"},
        )
    ).status_code == 403
    assert (
        await client.patch(
            f"/api/v1/admin/users/{owner_me['id']}",
            headers=admin_hdrs,
            json={"is_active": False},
        )
    ).status_code == 403
    assert (
        await client.delete(
            f"/api/v1/admin/users/{stranger_me['id']}", headers=admin_hdrs
        )
    ).status_code == 403

    # ADMIN CAN approve stranger to FRIEND.
    approved = await client.patch(
        f"/api/v1/admin/users/{stranger_me['id']}",
        headers=admin_hdrs,
        json={"role": "FRIEND"},
    )
    assert approved.status_code == 200
    assert approved.json()["role"] == "FRIEND"

    # Friend creates a trip + PAT token; suspension blocks both Firebase and PAT.
    trip_resp = await client.post(
        "/api/v1/trips",
        headers=friend_hdrs,
        json={
            "title": "Friend Osaka Trip",
            "country_codes": ["JP"],
            "start_date": "2026-10-01",
            "end_date": "2026-10-02",
        },
    )
    assert trip_resp.status_code == 201
    friend_pat = (
        await client.post(
            "/api/v1/tokens",
            headers=friend_hdrs,
            json={"name": "Friend CLI", "scopes": ["trips:read"]},
        )
    ).json()["plaintext_token"]
    friend_pat_hdrs = {"Authorization": f"Bearer {friend_pat}"}

    # Verify list_users aggregates trip_count & active_token_count accurately.
    users_list = (
        await client.get("/api/v1/admin/users?q=friend", headers=owner_hdrs)
    ).json()
    assert users_list["total"] == 1
    assert users_list["items"][0]["trip_count"] == 1
    assert users_list["items"][0]["active_token_count"] == 1

    # Suspending friend blocks both Firebase session and existing PAT immediately.
    susp = await client.patch(
        f"/api/v1/admin/users/{friend_me['id']}",
        headers=admin_hdrs,
        json={"is_active": False},
    )
    assert susp.status_code == 200
    assert (await client.get("/api/v1/me", headers=friend_hdrs)).status_code == 403
    pat_susp = await client.get("/api/v1/trips", headers=friend_pat_hdrs)
    assert pat_susp.status_code == 403

    # Re-activating restores access until owner revokes all PATs explicitly.
    await client.patch(
        f"/api/v1/admin/users/{friend_me['id']}",
        headers=admin_hdrs,
        json={"is_active": True},
    )
    pat_restored = await client.get("/api/v1/trips", headers=friend_pat_hdrs)
    assert pat_restored.status_code == 200
    rev = await client.post(
        f"/api/v1/admin/users/{friend_me['id']}/revoke-tokens", headers=owner_hdrs
    )
    assert rev.status_code == 200
    assert rev.json()["revoked_count"] == 1
    pat_revoked = await client.get("/api/v1/trips", headers=friend_pat_hdrs)
    assert pat_revoked.status_code == 401

    # OWNER can delete a user who owns trips/days/options under FK enforcement.
    deleted = await client.delete(
        f"/api/v1/admin/users/{friend_me['id']}", headers=owner_hdrs
    )
    assert deleted.status_code == 204
    after = (
        await client.get(
            "/api/v1/admin/users?q=friend@example.test", headers=owner_hdrs
        )
    ).json()
    assert after["total"] == 0
