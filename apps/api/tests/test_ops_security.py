"""Tests for structured logging, request IDs, rate limiting, and hardening."""

import socket
from collections.abc import AsyncGenerator
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import Settings, get_settings
from app.core.database import Base, configure_sqlite_foreign_keys, get_db
from app.core.net_safety import ensure_public_url_target
from app.core.rate_limit import reset_rate_limiters
from app.main import create_app
from app.services.places import PlaceCandidate


async def _build_prod_test_client(
    settings: Settings,
) -> tuple[AsyncClient, object, AsyncSession]:
    """Create a standalone AsyncClient configured with custom PROD settings."""
    reset_rate_limiters()
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    configure_sqlite_foreign_keys(engine)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def _override_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            yield session

    app = create_app(settings_override=settings)
    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_settings] = lambda: settings

    # Attach an unhandled error route solely to verify global exception masking.
    @app.get("/_test/boom")
    async def _boom() -> None:
        raise RuntimeError("sensitive internal database detail")

    client = AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    )
    return client, engine, session_factory()


@pytest.mark.asyncio
async def test_request_id_and_prod_exception_masking() -> None:
    prod_settings = Settings(
        app_env="PROD",
        rate_limit_enabled=False,
    )
    client, engine, session = await _build_prod_test_client(prod_settings)
    await session.close()
    try:
        async with client:
            health = await client.get(
                "/healthz", headers={"X-Request-ID": "req-abc_123"}
            )
            assert health.status_code == 200
            assert health.headers["X-Request-ID"] == "req-abc_123"
            assert "env" not in health.json()

            # Unsafe or oversized request IDs are replaced with generated hex IDs.
            bad_id = await client.get(
                "/healthz", headers={"X-Request-ID": "bad id!@#"}
            )
            assert bad_id.status_code == 200
            assert bad_id.headers["X-Request-ID"] != "bad id!@#"

            # OpenAPI/Swagger UI must be disabled in PROD.
            assert (await client.get("/api/v1/docs")).status_code == 404
            assert (await client.get("/api/v1/openapi.json")).status_code == 404

            boom = await client.get(
                "/_test/boom", headers={"X-Request-ID": "trace-500"}
            )
            assert boom.status_code == 500
            body = boom.json()
            assert body == {
                "detail": "Internal server error",
                "request_id": "trace-500",
            }
            assert "sensitive" not in str(body)
    finally:
        reset_rate_limiters()
        await engine.dispose()  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_rate_limit_and_admin_exemption_across_firebase_and_pat() -> None:
    prod_settings = Settings(
        app_env="PROD",
        admin_emails="billlcj104@gmail.com",
        allowed_emails="friend@example.test",
        rate_limit_enabled=True,
        rate_limit_places_per_min=2,
        rate_limit_public_per_min=2,
    )
    client, engine, session = await _build_prod_test_client(prod_settings)
    await session.close()
    try:
        fake_candidate = PlaceCandidate(
            name="Spot",
            address="Tokyo",
            latitude=35.68,
            longitude=139.76,
            google_maps_url="https://maps.google.com/?q=35.68,139.76",
            provider="photon_osm",
        )

        class _FakeProvider:
            async def search(
                self, query: str, language: str = "zh-TW", limit: int = 5
            ) -> list[PlaceCandidate]:
                del query, language, limit
                return [fake_candidate]

        def _verify_token(token: str) -> dict[str, str]:
            if token == "admin-tok":
                return {"uid": "uid-admin", "email": "billlcj104@gmail.com"}
            if token == "friend-tok":
                return {"uid": "uid-friend", "email": "friend@example.test"}
            return {"uid": "uid-stranger", "email": "stranger@example.test"}

        async with client:
            with (
                patch("app.core.auth._ensure_firebase_initialized"),
                patch(
                    "app.core.auth.firebase_auth.verify_id_token",
                    side_effect=_verify_token,
                ),
                patch(
                    "app.api.v1.places.get_place_search_provider",
                    return_value=_FakeProvider(),
                ),
            ):
                # Unlisted stranger is blocked with 403 invite-only check.
                stranger = await client.get(
                    "/api/v1/me",
                    headers={"Authorization": "Bearer stranger-tok"},
                )
                assert stranger.status_code == 403

                # Listed friend succeeds up to 2 places calls/min, 3rd returns 429.
                friend_hdrs = {"Authorization": "Bearer friend-tok"}
                assert (
                    await client.get(
                        "/api/v1/places/search?q=Tokyo", headers=friend_hdrs
                    )
                ).status_code == 200
                assert (
                    await client.get(
                        "/api/v1/places/search?q=Kyoto", headers=friend_hdrs
                    )
                ).status_code == 200
                blocked = await client.get(
                    "/api/v1/places/search?q=Osaka", headers=friend_hdrs
                )
                assert blocked.status_code == 429
                assert int(blocked.headers["Retry-After"]) >= 1

                # Admin email is exempt on both Firebase session AND Personal API Token.
                admin_hdrs = {"Authorization": "Bearer admin-tok"}
                pat_resp = await client.post(
                    "/api/v1/tokens",
                    headers=admin_hdrs,
                    json={"name": "Admin MCP", "scopes": ["trips:read"]},
                )
                assert pat_resp.status_code == 201
                admin_pat_hdrs = {
                    "Authorization": f"Bearer {pat_resp.json()['plaintext_token']}"
                }
                for _ in range(5):
                    assert (
                        await client.get(
                            "/api/v1/places/search?q=Sapporo", headers=admin_hdrs
                        )
                    ).status_code == 200
                    assert (
                        await client.get(
                            "/api/v1/places/search?q=Naha", headers=admin_pat_hdrs
                        )
                    ).status_code == 200

            # Public endpoints respect rate_limit_public_per_min=2.
            tpe_resp = await client.get("/api/v1/airports/search?q=TPE")
            hnd_resp = await client.get("/api/v1/airports/search?q=HND")
            assert tpe_resp.status_code == 200
            assert hnd_resp.status_code == 200
            pub_blocked = await client.get("/api/v1/airports/search?q=NRT")
            assert pub_blocked.status_code == 429
    finally:
        reset_rate_limiters()
        await engine.dispose()  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_item_time_and_details_validation(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    trip = (
        await api_client.post(
            "/api/v1/trips",
            headers=dev_headers,
            json={
                "title": "Validation Trip",
                "country_codes": ["JP"],
                "start_date": "2026-11-24",
                "end_date": "2026-11-24",
            },
        )
    ).json()
    opt_id = trip["days"][0]["active_option_id"]

    # Reject malformed or out-of-range times.
    for bad_time in ("25:00", "12:60", "noon", "12:00:00"):
        resp = await api_client.post(
            f"/api/v1/options/{opt_id}/items",
            headers=dev_headers,
            json={"type": "SPOT", "title": "Bad Time", "start_time": bad_time},
        )
        assert resp.status_code == 422

    # Valid H:MM normalizes to zero-padded HH:MM.
    good = await api_client.post(
        f"/api/v1/options/{opt_id}/items",
        headers=dev_headers,
        json={"type": "SPOT", "title": "Morning Spot", "start_time": "8:05"},
    )
    assert good.status_code == 201
    assert good.json()["start_time"] == "08:05"

    # Malformed attachments or oversized details payload must return 422.
    bad_att_type = await api_client.post(
        f"/api/v1/options/{opt_id}/items",
        headers=dev_headers,
        json={
            "type": "SPOT",
            "title": "Bad Attachments",
            "details": {"attachments": "not-a-list"},
        },
    )
    assert bad_att_type.status_code == 422

    bad_att_entry = await api_client.post(
        f"/api/v1/options/{opt_id}/items",
        headers=dev_headers,
        json={
            "type": "SPOT",
            "title": "Missing URL",
            "details": {"attachments": [{"name": "ticket.pdf"}]},
        },
    )
    assert bad_att_entry.status_code == 422

    oversized = await api_client.post(
        f"/api/v1/options/{opt_id}/items",
        headers=dev_headers,
        json={
            "type": "SPOT",
            "title": "Oversized Details",
            "details": {"blob": "x" * 20_000},
        },
    )
    assert oversized.status_code == 422


@pytest.mark.asyncio
async def test_ensure_public_url_target_blocks_private_addresses() -> None:
    await ensure_public_url_target("8.8.8.8")

    for private_ip in ("127.0.0.1", "169.254.169.254", "10.0.0.1", "::1"):
        with pytest.raises(ValueError):
            await ensure_public_url_target(private_ip)

    async def _fake_getaddrinfo(
        *_args: object, **_kwargs: object
    ) -> list[tuple[object, ...]]:
        return [
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                6,
                "",
                ("192.168.1.10", 0),
            )
        ]

    with (
        patch("asyncio.AbstractEventLoop.getaddrinfo", side_effect=_fake_getaddrinfo),
        pytest.raises(ValueError),
    ):
        await ensure_public_url_target("rebind.example.test")


def test_blank_rate_limit_enabled_env_defaults_cleanly(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "")
    assert Settings().rate_limit_enabled is None

