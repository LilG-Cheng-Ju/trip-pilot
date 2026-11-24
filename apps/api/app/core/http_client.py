"""Shared async HTTP client lifecycle for outbound API requests."""

import asyncio

import httpx

from app.core.constants import PLACES_HTTP_TIMEOUT_SEC

_shared_client: httpx.AsyncClient | None = None
_shared_loop: asyncio.AbstractEventLoop | None = None


def get_shared_http_client() -> httpx.AsyncClient:
    """Return a lazily initialized httpx AsyncClient bound to the active event loop."""
    global _shared_client, _shared_loop
    current_loop = asyncio.get_running_loop()
    if (
        _shared_client is None
        or _shared_client.is_closed
        or _shared_loop is not current_loop
    ):
        _shared_client = httpx.AsyncClient(timeout=PLACES_HTTP_TIMEOUT_SEC)
        _shared_loop = current_loop
    return _shared_client


async def close_shared_http_client() -> None:
    """Close the shared HTTP client gracefully during application shutdown."""
    global _shared_client, _shared_loop
    if _shared_client is not None and not _shared_client.is_closed:
        await _shared_client.aclose()
    _shared_client = None
    _shared_loop = None
