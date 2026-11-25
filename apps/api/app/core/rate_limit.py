"""In-memory sliding-window rate limiter with admin/developer exemptions."""

import math
import time
from collections import deque
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from app.core.auth import AuthContext, require_scope
from app.core.config import Settings, get_settings

_MAX_TRACKED_KEYS = 4096


class SlidingWindowRateLimiter:
    """Per-key sliding-window limiter with bounded memory growth."""

    def __init__(self, max_keys: int = _MAX_TRACKED_KEYS) -> None:
        self.max_keys = max_keys
        self._hits: dict[str, deque[float]] = {}

    def check(self, key: str, limit: int, window_sec: float = 60.0) -> int | None:
        """Record a hit or return Retry-After seconds if the limit is exceeded."""
        if limit <= 0:
            return None
        now = time.monotonic()
        cutoff = now - window_sec
        dq = self._hits.get(key)
        if dq is None:
            if len(self._hits) >= self.max_keys:
                self._evict_stale_or_oldest(cutoff)
            dq = deque()
            self._hits[key] = dq
        else:
            while dq and dq[0] <= cutoff:
                dq.popleft()

        if len(dq) >= limit:
            return max(1, math.ceil(dq[0] + window_sec - now))

        dq.append(now)
        return None

    def _evict_stale_or_oldest(self, cutoff: float) -> None:
        stale_keys = [
            k for k, timestamps in self._hits.items()
            if not timestamps or timestamps[-1] <= cutoff
        ]
        for key in stale_keys:
            self._hits.pop(key, None)
        if len(self._hits) >= self.max_keys and self._hits:
            oldest_key = min(
                self._hits.items(),
                key=lambda kv: kv[1][-1] if kv[1] else 0.0,
            )[0]
            self._hits.pop(oldest_key, None)

    def reset(self) -> None:
        """Clear all tracked rate-limit counters."""
        self._hits.clear()


_limiter = SlidingWindowRateLimiter()


def reset_rate_limiters() -> None:
    """Clear global rate-limit counters (used during test setup/teardown)."""
    _limiter.reset()


def enforce_key_rate_limit(
    key: str,
    limit: int,
    *,
    window_sec: float = 60.0,
) -> None:
    """Enforce a sliding-window limit on an arbitrary key, raising 429 when hit."""
    retry_after = _limiter.check(key, limit, window_sec=window_sec)
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please retry shortly.",
            headers={"Retry-After": str(retry_after)},
        )


def enforce_user_rate_limit(
    auth_ctx: AuthContext,
    settings: Settings,
    *,
    bucket: str = "places",
) -> None:
    """Enforce per-user limits while exempting configured admin/developer emails."""
    if not settings.is_rate_limit_enabled or auth_ctx.is_admin(settings):
        return
    enforce_key_rate_limit(
        f"user:{auth_ctx.user.id}:{bucket}",
        settings.rate_limit_places_per_min,
    )


def require_scope_with_rate_limit(
    scope: str, bucket: str = "places"
) -> Callable[..., AuthContext]:
    """Enforce both a PAT scope and the configurable per-user rate limit."""
    scope_dep = require_scope(scope)

    def _checker(
        auth_ctx: Annotated[AuthContext, Depends(scope_dep)],
        settings: Annotated[Settings, Depends(get_settings)],
    ) -> AuthContext:
        enforce_user_rate_limit(auth_ctx, settings, bucket=bucket)
        return auth_ctx

    return _checker


def limit_public_endpoint(bucket: str) -> Callable[..., None]:
    """Dependency factory rate-limiting unauthenticated public endpoints by IP."""

    def _checker(
        request: Request,
        settings: Annotated[Settings, Depends(get_settings)],
    ) -> None:
        if not settings.is_rate_limit_enabled:
            return
        client_ip = request.client.host if request.client else "unknown"
        enforce_key_rate_limit(
            f"ip:{client_ip}:{bucket}",
            settings.rate_limit_public_per_min,
        )

    return _checker
