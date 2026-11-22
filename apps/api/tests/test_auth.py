"""Tests for Auth Strategy Chain, user profile, and Personal API Tokens."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_missing_token_returns_401(api_client: AsyncClient) -> None:
    response = await api_client.get("/api/v1/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_dev_auth_profile_and_update(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    me_resp = await api_client.get("/api/v1/me", headers=dev_headers)
    assert me_resp.status_code == 200
    profile = me_resp.json()
    assert profile["home_country_code"] == "TW"
    assert profile["home_currency"] == "TWD"

    patch_resp = await api_client.patch(
        "/api/v1/me",
        headers=dev_headers,
        json={"display_name": "Clement", "home_country_code": "tw"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["display_name"] == "Clement"
    assert patch_resp.json()["home_country_code"] == "TW"


@pytest.mark.asyncio
async def test_pat_lifecycle_and_restrictions(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    create_resp = await api_client.post(
        "/api/v1/tokens",
        headers=dev_headers,
        json={"name": "Antigravity MCP", "scopes": ["trips:read", "trips:write"]},
    )
    assert create_resp.status_code == 201
    token_data = create_resp.json()
    plaintext = token_data["plaintext_token"]
    assert plaintext.startswith("tp_pat_")

    pat_headers = {"Authorization": f"Bearer {plaintext}"}

    # PAT can authenticate against /me.
    me_resp = await api_client.get("/api/v1/me", headers=pat_headers)
    assert me_resp.status_code == 200

    # PAT cannot mint another PAT.
    mint_resp = await api_client.post(
        "/api/v1/tokens",
        headers=pat_headers,
        json={"name": "Nested Token", "scopes": ["trips:read"]},
    )
    assert mint_resp.status_code == 403

    # Revoking the PAT immediately invalidates it.
    del_resp = await api_client.delete(
        f"/api/v1/tokens/{token_data['id']}", headers=dev_headers
    )
    assert del_resp.status_code == 204

    revoked_resp = await api_client.get("/api/v1/me", headers=pat_headers)
    assert revoked_resp.status_code == 401
