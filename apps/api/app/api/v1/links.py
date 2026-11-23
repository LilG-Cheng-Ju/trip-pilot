"""SSRF-safe cloud attachment link title resolver."""

import html
import re
from typing import Annotated
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.auth import AuthContext, get_auth_context
from app.core.constants import (
    LINK_MAX_REDIRECTS,
    LINK_RESOLVE_TIMEOUT_SEC,
    LINK_TITLE_MAX_LENGTH,
)

router = APIRouter(prefix="/links", tags=["links"])

_ALLOWED_HOSTS: frozenset[str] = frozenset(
    {
        "drive.google.com",
        "docs.google.com",
        "dropbox.com",
        "www.dropbox.com",
        "onedrive.live.com",
        "1drv.ms",
        "icloud.com",
        "www.icloud.com",
        "notion.so",
        "www.notion.so",
    }
)

_PROVIDER_SUFFIXES = (
    " - Google Drive",
    " - Google Docs",
    " - Google Sheets",
    " - Google Slides",
    " - Google Forms",
    " - Dropbox",
    " - OneDrive",
    " | Notion",
)

_OG_TITLE_RE = re.compile(
    r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']',
    re.IGNORECASE,
)
_OG_TITLE_REV_RE = re.compile(
    r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:title["\']',
    re.IGNORECASE,
)
_TITLE_TAG_RE = re.compile(r"<title[^>]*>([^<]+)</title>", re.IGNORECASE)


class ResolveLinkTitleRequest(BaseModel):
    """Request body for resolving a cloud attachment URL's filename/title."""

    url: str = Field(min_length=8, max_length=2048)


class ResolveLinkTitleResponse(BaseModel):
    """Resolved display title for a cloud link, or null when private/unavailable."""

    title: str | None = None


def _is_allowed_host(hostname: str | None) -> bool:
    if not hostname:
        return False
    host = hostname.lower().rstrip(".")
    return host in _ALLOWED_HOSTS or host.endswith(".notion.site")


def _clean_title(raw: str) -> str | None:
    cleaned = html.unescape(raw).strip()
    for suffix in _PROVIDER_SUFFIXES:
        if cleaned.endswith(suffix):
            cleaned = cleaned[: -len(suffix)].strip()
    generic = {"google drive", "google docs", "dropbox", "onedrive", "sign in"}
    if not cleaned or cleaned.lower() in generic:
        return None
    return cleaned[:LINK_TITLE_MAX_LENGTH]


def _extract_html_title(body: str) -> str | None:
    for pattern in (_OG_TITLE_RE, _OG_TITLE_REV_RE, _TITLE_TAG_RE):
        match = pattern.search(body)
        if match:
            cleaned = _clean_title(match.group(1))
            if cleaned:
                return cleaned
    return None


async def fetch_cloud_link_title(url: str) -> str | None:
    """Fetch a whitelisted cloud link's HTML title safely."""
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"} or not _is_allowed_host(parsed.hostname):
        raise ValueError("Unsupported or non-whitelisted link host")

    current_url = url.strip()
    headers = {
        "User-Agent": "TripilotBot/0.1 (+https://tripilot.app)",
        "Accept": "text/html,application/xhtml+xml",
    }
    try:
        async with httpx.AsyncClient(
            timeout=LINK_RESOLVE_TIMEOUT_SEC, follow_redirects=False
        ) as client:
            for _ in range(LINK_MAX_REDIRECTS):
                resp = await client.get(current_url, headers=headers)
                if resp.status_code in {301, 302, 303, 307, 308}:
                    location = resp.headers.get("location")
                    if not location:
                        return None
                    next_url = urljoin(current_url, location)
                    next_parsed = urlparse(next_url)
                    if (
                        next_parsed.scheme not in {"http", "https"}
                        or not _is_allowed_host(next_parsed.hostname)
                    ):
                        # Redirected to login or non-whitelisted host.
                        return None
                    current_url = next_url
                    continue
                if resp.status_code != 200:
                    return None
                content_type = resp.headers.get("content-type", "").lower()
                if "html" not in content_type:
                    return None
                return _extract_html_title(resp.text[:32768])
    except Exception:
        return None
    return None


@router.post("/resolve-title", response_model=ResolveLinkTitleResponse)
async def resolve_link_title(
    payload: ResolveLinkTitleRequest,
    _: Annotated[AuthContext, Depends(get_auth_context)],
) -> ResolveLinkTitleResponse:
    """Resolve a human-readable filename/title from a whitelisted cloud share link."""
    try:
        title = await fetch_cloud_link_title(payload.url)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    return ResolveLinkTitleResponse(title=title)
