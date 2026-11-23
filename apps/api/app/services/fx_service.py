"""Pluggable FX exchange rate provider with in-memory TTL cache."""

import time
from typing import Protocol

import httpx

OPEN_ER_API_URL = "https://open.er-api.com/v6/latest/{base}"
DEFAULT_TTL_SECONDS = 6 * 3600  # 6 hours

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


class OpenErApiProvider:
    """Free, key-less FX provider backed by open.er-api.com with TTL caching."""

    def __init__(
        self, ttl_seconds: int = DEFAULT_TTL_SECONDS, timeout_sec: float = 4.0
    ) -> None:
        self.ttl_seconds = ttl_seconds
        self.timeout_sec = timeout_sec
        self._cache: dict[str, tuple[float, dict[str, float]]] = {}

    async def get_rate(
        self, from_currency: str, to_currency: str
    ) -> tuple[float, str, bool]:
        """Return (rate, source, cached) for 1 from_currency -> to_currency."""
        src = from_currency.strip().upper()
        dst = to_currency.strip().upper()
        if src == dst:
            return 1.0, "identity", True

        now = time.monotonic()
        cached_entry = self._cache.get(src)
        if cached_entry and now - cached_entry[0] < self.ttl_seconds:
            rate = cached_entry[1].get(dst)
            if rate is not None:
                return round(rate, 6), "open_er_api", True

        try:
            async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
                response = await client.get(OPEN_ER_API_URL.format(base=src))
            if response.status_code == 200:
                data = response.json()
                rates = data.get("rates")
                if isinstance(rates, dict) and dst in rates:
                    numeric_rates = {
                        str(k).upper(): float(v)
                        for k, v in rates.items()
                        if isinstance(v, (int, float))
                    }
                    self._cache[src] = (now, numeric_rates)
                    return round(numeric_rates[dst], 6), "open_er_api", False
        except Exception:
            pass

        # Fallback via USD cross-rate so offline expense logging never breaks.
        if src in _FALLBACK_USD_RATES and dst in _FALLBACK_USD_RATES:
            cross = _FALLBACK_USD_RATES[dst] / _FALLBACK_USD_RATES[src]
            return round(cross, 6), "fallback", False

        return 1.0, "fallback", False


_fx_provider = OpenErApiProvider()


def get_fx_provider() -> ExchangeRateProvider:
    """Return the singleton FX rate provider."""
    return _fx_provider
