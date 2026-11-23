"""Unit tests for the SSRF-safe cloud link title resolver."""

import pytest
from httpx import AsyncClient

from app.api.v1.links import _extract_html_title


def test_extract_html_title_strips_google_drive_suffix() -> None:
    """Google Drive og:title and <title> tags should cleanly yield the filename."""
    html_doc = (
        '<html><head><meta property="og:title" '
        'content="釜山機票_BR169.pdf - Google Drive"></head></html>'
    )
    assert _extract_html_title(html_doc) == "釜山機票_BR169.pdf"

    fallback_doc = (
        "<html><head><title>Hotel_Voucher.pdf - Google Docs</title></head></html>"
    )
    assert _extract_html_title(fallback_doc) == "Hotel_Voucher.pdf"


@pytest.mark.asyncio
async def test_resolve_link_title_requires_auth_and_rejects_ssrf(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    """Endpoint must require auth and reject non-whitelisted/metadata hosts."""
    unauth = await api_client.post(
        "/api/v1/links/resolve-title",
        json={"url": "https://drive.google.com/file/d/abc/view"},
    )
    assert unauth.status_code == 401

    res = await api_client.post(
        "/api/v1/links/resolve-title",
        headers=dev_headers,
        json={"url": "http://169.254.169.254/latest/meta-data/"},
    )
    assert res.status_code == 400
