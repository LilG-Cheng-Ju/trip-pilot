"""Shared async HTTP client lifecycle, bounded retries, and circuit breakers."""

import asyncio
import time
from collections.abc import Callable
from typing import Any, Literal

import httpx

from app.core.constants import (
    CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    CIRCUIT_BREAKER_RECOVERY_SEC,
    HTTP_POOL_KEEPALIVE_EXPIRY_SEC,
    HTTP_POOL_MAX_CONNECTIONS,
    HTTP_POOL_MAX_KEEPALIVE,
    HTTP_RETRY_BACKOFF_SEC,
    HTTP_RETRY_MAX_ATTEMPTS,
    PLACES_HTTP_TIMEOUT_SEC,
)

_RETRYABLE_STATUS_CODES: frozenset[int] = frozenset({429, 502, 503, 504})

_shared_client: httpx.AsyncClient | None = None
_shared_loop: asyncio.AbstractEventLoop | None = None
_circuit_breakers: dict[str, "CircuitBreaker"] = {}


class UpstreamUnavailableError(RuntimeError):
    """Raised when an upstream circuit breaker is open."""

    def __init__(self, upstream: str) -> None:
        self.upstream = upstream
        super().__init__(f"Upstream '{upstream}' is temporarily unavailable")


class CircuitBreaker:
    """Consecutive-failure circuit breaker using a monotonic clock."""

    def __init__(
        self,
        name: str,
        failure_threshold: int = CIRCUIT_BREAKER_FAILURE_THRESHOLD,
        recovery_sec: float = CIRCUIT_BREAKER_RECOVERY_SEC,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_sec = recovery_sec
        self._clock = clock
        self.state: Literal["closed", "open", "half_open"] = "closed"
        self.failure_count = 0
        self._opened_at: float | None = None
        self._half_open_probe_in_flight = False

    def _now(self) -> float:
        return self._clock() if self._clock is not None else time.monotonic()

    def before_call(self) -> None:
        """Fail fast while open, allowing only a single in-flight half-open probe."""
        if self.state == "half_open":
            if self._half_open_probe_in_flight:
                raise UpstreamUnavailableError(self.name)
            self._half_open_probe_in_flight = True
            return
        if self.state != "open":
            return
        if (
            self._opened_at is not None
            and self._now() - self._opened_at >= self.recovery_sec
        ):
            self.state = "half_open"
            self._half_open_probe_in_flight = True
            return
        raise UpstreamUnavailableError(self.name)

    def record_success(self) -> None:
        """Reset failure tracking and close the circuit after a healthy response."""
        self.failure_count = 0
        self._opened_at = None
        self._half_open_probe_in_flight = False
        self.state = "closed"

    def record_failure(self) -> None:
        """Increment consecutive failures and open the circuit when threshold trips."""
        self._half_open_probe_in_flight = False
        if self.state == "half_open":
            self.state = "open"
            self._opened_at = self._now()
            self.failure_count = self.failure_threshold
            return
        self.failure_count += 1
        if self.failure_count >= self.failure_threshold:
            self.state = "open"
            self._opened_at = self._now()

    def abort_probe(self) -> None:
        """Release the half-open probe slot if a probe is cancelled before settling."""
        self._half_open_probe_in_flight = False


def get_circuit_breaker(name: str) -> CircuitBreaker:
    """Return the process-local circuit breaker for a named upstream."""
    breaker = _circuit_breakers.get(name)
    if breaker is None:
        breaker = CircuitBreaker(name)
        _circuit_breakers[name] = breaker
    return breaker


def reset_circuit_breakers() -> None:
    """Clear all registered circuit breakers during shutdown or test cleanup."""
    _circuit_breakers.clear()


def get_shared_http_client() -> httpx.AsyncClient:
    """Return a lazily initialized httpx AsyncClient bound to the active event loop."""
    global _shared_client, _shared_loop
    current_loop = asyncio.get_running_loop()
    if (
        _shared_client is None
        or _shared_client.is_closed
        or _shared_loop is not current_loop
    ):
        _shared_client = httpx.AsyncClient(
            timeout=PLACES_HTTP_TIMEOUT_SEC,
            trust_env=False,
            limits=httpx.Limits(
                max_connections=HTTP_POOL_MAX_CONNECTIONS,
                max_keepalive_connections=HTTP_POOL_MAX_KEEPALIVE,
                keepalive_expiry=HTTP_POOL_KEEPALIVE_EXPIRY_SEC,
            ),
        )
        _shared_loop = current_loop
    return _shared_client


async def close_shared_http_client() -> None:
    """Close the shared HTTP client gracefully during application shutdown."""
    global _shared_client, _shared_loop
    if _shared_client is not None and not _shared_client.is_closed:
        await _shared_client.aclose()
    _shared_client = None
    _shared_loop = None
    reset_circuit_breakers()


async def request_with_resilience(
    upstream: str,
    method: str,
    url: str,
    *,
    client: httpx.AsyncClient | None = None,
    max_attempts: int = HTTP_RETRY_MAX_ATTEMPTS,
    backoff_sec: float = HTTP_RETRY_BACKOFF_SEC,
    **kwargs: Any,
) -> httpx.Response:
    """Send an HTTP request with bounded transient retries and circuit breaking."""
    breaker = get_circuit_breaker(upstream)
    breaker.before_call()

    active_client = client if client is not None else get_shared_http_client()
    attempts = max(1, max_attempts)
    last_exc: Exception | None = None
    settled = False

    try:
        for attempt in range(attempts):
            try:
                response = await active_client.request(method, url, **kwargs)
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_exc = exc
                if attempt + 1 < attempts:
                    if backoff_sec > 0:
                        await asyncio.sleep(backoff_sec)
                    continue
                breaker.record_failure()
                settled = True
                raise

            if response.status_code in _RETRYABLE_STATUS_CODES:
                if attempt + 1 < attempts:
                    if backoff_sec > 0:
                        await asyncio.sleep(backoff_sec)
                    continue
                breaker.record_failure()
                settled = True
                return response

            if response.status_code < 500 and response.status_code != 429:
                breaker.record_success()
            else:
                breaker.record_failure()
            settled = True
            return response

        breaker.record_failure()
        settled = True
        if last_exc is not None:
            raise last_exc
        raise UpstreamUnavailableError(upstream)
    finally:
        if not settled:
            breaker.abort_probe()
