"""Async HTTP client wrapping the Tripilot REST API (/api/v1)."""

from __future__ import annotations

import os
from typing import Any

import httpx

DEFAULT_API_URL = "http://localhost:8000"


class TripilotAPIError(RuntimeError):
    """Raised when the Tripilot API returns an unsuccessful HTTP status."""

    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Tripilot API error ({status_code}): {detail}")


class TripilotClient:
    """Typed async client for Tripilot's authenticated /api/v1 endpoints."""

    def __init__(
        self,
        base_url: str | None = None,
        api_token: str | None = None,
        *,
        timeout: float = 30.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        resolved_url = (
            base_url
            if base_url is not None
            else (
                os.environ.get("TRIPILOT_API_URL")
                or os.environ.get("TRIPPILOT_API_URL")
                or DEFAULT_API_URL
            )
        )
        resolved_token = (
            api_token
            if api_token is not None
            else (
                os.environ.get("TRIPILOT_API_TOKEN")
                or os.environ.get("TRIPPILOT_API_TOKEN")
                or ""
            )
        )

        self._base_url = resolved_url.rstrip("/")
        self._api_token = resolved_token.strip()

        headers: dict[str, str] = {"Accept": "application/json"}
        if self._api_token:
            headers["Authorization"] = f"Bearer {self._api_token}"

        self._client = httpx.AsyncClient(
            base_url=f"{self._base_url}/api/v1",
            headers=headers,
            timeout=timeout,
            transport=transport,
        )

    async def __aenter__(self) -> TripilotClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        """Close the underlying httpx AsyncClient."""
        await self._client.aclose()

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> Any:
        response = await self._client.request(
            method,
            path,
            params=params,
            json=json_body,
        )
        if response.is_error:
            detail = _extract_error_detail(response)
            raise TripilotAPIError(response.status_code, detail)
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    async def list_trips(self, status: str | None = None) -> list[dict[str, Any]]:
        """List trips owned by the authenticated user, optionally filtered by status."""
        params = {"status": status.upper()} if status else None
        return await self._request("GET", "/trips", params=params)

    async def get_trip(self, trip_id: str) -> dict[str, Any]:
        """Fetch full trip details including days, options, items, and route legs."""
        return await self._request("GET", f"/trips/{trip_id}")

    async def create_trip(
        self,
        title: str,
        start_date: str,
        end_date: str,
        country_codes: list[str],
        *,
        default_currency: str = "JPY",
        destination_summary: str | None = None,
        cover_image_url: str | None = None,
        status: str = "PLANNING",
        notes: str | None = None,
    ) -> dict[str, Any]:
        """Create a new trip and auto-generate its TripDays and default Plan A."""
        payload: dict[str, Any] = {
            "title": title,
            "start_date": start_date,
            "end_date": end_date,
            "country_codes": [code.strip().upper() for code in country_codes],
            "default_currency": default_currency.strip().upper(),
            "status": status.upper(),
        }
        if destination_summary is not None:
            payload["destination_summary"] = destination_summary
        if cover_image_url is not None:
            payload["cover_image_url"] = cover_image_url
        if notes is not None:
            payload["notes"] = notes
        return await self._request("POST", "/trips", json_body=payload)

    async def update_trip(
        self,
        trip_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Partially update trip metadata."""
        return await self._request("PATCH", f"/trips/{trip_id}", json_body=payload)

    async def append_day(self, trip_id: str) -> dict[str, Any]:
        """Append a new calendar day (with default Plan A) to an existing trip."""
        return await self._request("POST", f"/trips/{trip_id}/days")

    async def update_day(
        self,
        day_id: str,
        *,
        title: str | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """Update a TripDay's theme title or notes."""
        payload: dict[str, Any] = {}
        if title is not None:
            payload["title"] = title
        if notes is not None:
            payload["notes"] = notes
        return await self._request("PATCH", f"/days/{day_id}", json_body=payload)

    async def add_day_option(
        self,
        day_id: str,
        label: str,
        summary_notes: str | None = None,
    ) -> dict[str, Any]:
        """Create a new empty DayOption (e.g. Plan B) on a TripDay."""
        payload: dict[str, Any] = {"label": label}
        if summary_notes is not None:
            payload["summary_notes"] = summary_notes
        return await self._request(
            "POST", f"/days/{day_id}/options", json_body=payload
        )

    async def clone_day_option(
        self,
        option_id: str,
        label: str,
    ) -> dict[str, Any]:
        """Deep-clone an existing DayOption and all of its items under a new label."""
        return await self._request(
            "POST",
            f"/options/{option_id}/clone",
            json_body={"label": label},
        )

    async def set_active_option(
        self,
        day_id: str,
        day_option_id: str,
    ) -> dict[str, Any]:
        """Switch the active DayOption pointer for a TripDay."""
        return await self._request(
            "PATCH",
            f"/days/{day_id}/active-option",
            json_body={"day_option_id": day_option_id},
        )

    async def add_item(
        self,
        option_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Append an itinerary item to a specific DayOption."""
        return await self._request(
            "POST", f"/options/{option_id}/items", json_body=payload
        )

    async def update_item(
        self,
        item_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Partially update an existing itinerary item."""
        return await self._request("PATCH", f"/items/{item_id}", json_body=payload)

    async def delete_item(self, item_id: str) -> None:
        """Delete an itinerary item by ID."""
        await self._request("DELETE", f"/items/{item_id}")

    async def select_choice_item(self, item_id: str) -> dict[str, Any]:
        """Select an item as the active choice within its slot choice group."""
        return await self._request("PATCH", f"/items/{item_id}/select")

    async def search_places(
        self,
        q: str,
        *,
        lang: str = "zh-TW",
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        """Search venues/landmarks via Google Places API (New) or Photon fallback."""
        return await self._request(
            "GET",
            "/places/search",
            params={"q": q, "lang": lang, "limit": limit},
        )

    async def resolve_place_url(self, url: str) -> dict[str, Any]:
        """Resolve a Google Maps URL (full or maps.app.goo.gl) into coordinates."""
        return await self._request(
            "POST",
            "/places/resolve-url",
            json_body={"url": url},
        )

    async def list_expenses(self, trip_id: str) -> dict[str, Any]:
        """Retrieve all expenses and category totals for a trip."""
        return await self._request("GET", f"/trips/{trip_id}/expenses")

    async def log_expense(
        self,
        trip_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Record an actual expense under a trip."""
        return await self._request(
            "POST", f"/trips/{trip_id}/expenses", json_body=payload
        )

    async def get_stats(self, year: int | None = None) -> dict[str, Any]:
        """Fetch annual (when year is given) or lifetime travel statistics."""
        params = {"year": year} if year is not None else None
        return await self._request("GET", "/stats", params=params)

    async def search_airports(
        self,
        q: str,
        *,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Search commercial airports by IATA code, city, or airport name."""
        return await self._request(
            "GET",
            "/airports/search",
            params={"q": q, "limit": limit},
        )

    async def add_item_by_date(
        self,
        trip_id: str,
        target_date: str,
        payload: dict[str, Any],
        option_label: str | None = None,
    ) -> dict[str, Any]:
        """Resolve a trip date and day option, then append an itinerary item.

        When option_label is provided, matches the DayOption label
        case-insensitively. Otherwise uses the day's active_option_id.
        """
        trip = await self.get_trip(trip_id)
        days: list[dict[str, Any]] = trip.get("days", [])
        matching_day = next(
            (day for day in days if day.get("date") == target_date),
            None,
        )
        if matching_day is None:
            available = [str(day.get("date")) for day in days]
            raise ValueError(
                f"Date '{target_date}' not found in trip '{trip_id}'. "
                f"Available dates: {available}"
            )

        options: list[dict[str, Any]] = matching_day.get("options", [])
        target_option_id: str | None = None

        if option_label is not None:
            needle = option_label.strip().lower()
            matched_option = next(
                (
                    opt
                    for opt in options
                    if str(opt.get("label", "")).strip().lower() == needle
                ),
                None,
            )
            if matched_option is None:
                labels = [str(opt.get("label")) for opt in options]
                raise ValueError(
                    f"Option label '{option_label}' not found on {target_date}. "
                    f"Available options: {labels}"
                )
            target_option_id = str(matched_option["id"])
        else:
            active_id = matching_day.get("active_option_id")
            if not active_id:
                raise ValueError(
                    f"TripDay for '{target_date}' has no active_option_id set."
                )
            target_option_id = str(active_id)

        return await self.add_item(target_option_id, payload)


def _extract_error_detail(response: httpx.Response) -> str:
    try:
        body = response.json()
        if isinstance(body, dict) and "detail" in body:
            return str(body["detail"])
    except ValueError:
        pass
    return response.text or response.reason_phrase
