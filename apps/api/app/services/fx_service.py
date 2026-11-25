"""Pluggable FX exchange rate provider with in-memory TTL cache."""

import asyncio
import logging
import time
from typing import Protocol

from app.core.constants import FX_CACHE_TTL_SECONDS, FX_HTTP_TIMEOUT_SEC
from app.core.http_client import request_with_resilience

OPEN_ER_API_URL = "https://open.er-api.com/v6/latest/{base}"
DEFAULT_TTL_SECONDS = FX_CACHE_TTL_SECONDS
MAX_FX_CACHE_CURRENCIES = 64
logger = logging.getLogger(__name__)

# Conservative offline fallback rates relative to USD when network is unavailable.
_FALLBACK_USD_RATES: dict[str, float] = {
    "USD": 1.0,
    "TWD": 32.5,
    "JPY": 154.0,
    "KRW": 1390.0,
    "EUR": 0.94,
    "CNY": 7.24,
}


class ExchangeRateProvider(Protocol):
    """Protocol for currency exchange rate lookups."""

    async def get_rate(
        self, from_currency: str, to_currency: str
    ) -> tuple[float, str, bool]: ...


def _round_rate(rate: float) -> float:
    """Round FX rates to 4 decimals while preserving precision for micro-currencies."""
    if rate >= 0.01:
        return round(rate, 4)
    return float(f"{rate:.4g}") if rate > 0 else rate


class OpenErApiProvider:
    """Free, key-less FX provider backed by open.er-api.com with TTL caching."""

    def __init__(
        self,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
        timeout_sec: float = FX_HTTP_TIMEOUT_SEC,
        max_cache_entries: int = MAX_FX_CACHE_CURRENCIES,
    ) -> None:
        self.ttl_seconds = ttl_seconds
        self.timeout_sec = timeout_sec
        self.max_cache_entries = max_cache_entries
        self._cache: dict[str, tuple[float, dict[str, float]]] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._locks_loop: asyncio.AbstractEventLoop | None = None

    def _get_lock(self, base_currency: str) -> asyncio.Lock:
        # Re-bind singleflight locks when pytest spins up a fresh event loop.
        loop = asyncio.get_running_loop()
        if self._locks_loop is not loop:
            self._locks.clear()
            self._locks_loop = loop
        lock = self._locks.get(base_currency)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[base_currency] = lock
        return lock

    def _read_cached_rate(
        self, src: str, dst: str, now: float
    ) -> float | None:
        entry = self._cache.get(src)
        if entry is None:
            return None
        if now - entry[0] >= self.ttl_seconds:
            self._cache.pop(src, None)
            return None
        return entry[1].get(dst)

    def _store_cache(
        self, src: str, now: float, numeric_rates: dict[str, float]
    ) -> None:
        expired = [
            key
            for key, (ts, _) in self._cache.items()
            if now - ts >= self.ttl_seconds
        ]
        for key in expired:
            self._cache.pop(key, None)
        if src not in self._cache and len(self._cache) >= self.max_cache_entries:
            oldest_key = min(self._cache.items(), key=lambda kv: kv[1][0])[0]
            self._cache.pop(oldest_key, None)
        self._cache[src] = (now, numeric_rates)

    async def get_rate(
        self, from_currency: str, to_currency: str
    ) -> tuple[float, str, bool]:
        """Return (rate, source, cached) for 1 from_currency -> to_currency."""
        src = from_currency.strip().upper()
        dst = to_currency.strip().upper()
        if src == dst:
            return 1.0, "identity", True

        now = time.monotonic()
        cached_rate = self._read_cached_rate(src, dst, now)
        if cached_rate is not None:
            return _round_rate(cached_rate), "open_er_api", True

        async with self._get_lock(src):
            now = time.monotonic()
            cached_rate = self._read_cached_rate(src, dst, now)
            if cached_rate is not None:
                return _round_rate(cached_rate), "open_er_api", True

            try:
                response = await request_with_resilience(
                    "open_er_api",
                    "GET",
                    OPEN_ER_API_URL.format(base=src),
                    timeout=self.timeout_sec,
                )
                if response.status_code == 200:
                    data = response.json()
                    rates = data.get("rates")
                    if isinstance(rates, dict) and dst in rates:
                        numeric_rates = {
                            str(k).upper(): float(v)
                            for k, v in rates.items()
                            if isinstance(v, (int, float))
                        }
                        self._store_cache(src, time.monotonic(), numeric_rates)
                        return _round_rate(numeric_rates[dst]), "open_er_api", False
            except Exception as exc:
                logger.warning(
                    "FX upstream lookup failed for %s->%s: %s",
                    src,
                    dst,
                    type(exc).__name__,
                )

        # Fallback via USD cross-rate so offline expense logging never breaks.
        if src in _FALLBACK_USD_RATES and dst in _FALLBACK_USD_RATES:
            cross = _FALLBACK_USD_RATES[dst] / _FALLBACK_USD_RATES[src]
            return _round_rate(cross), "fallback", False

        return 1.0, "fallback", False


_fx_provider = OpenErApiProvider()


def get_fx_provider() -> ExchangeRateProvider:
    """Return the singleton FX rate provider."""
    return _fx_provider
