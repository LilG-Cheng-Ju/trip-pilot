"""Tests for Google Places / Maps URL parsing, append-day, and slot choice groups."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.services.places import PlaceCandidate, parse_google_maps_url
from app.services.routing import RouteLegResult


def test_parse_google_maps_url_extracts_coords_and_name() -> None:
    url = (
        "https://www.google.com/maps/place/Senso-ji/"
        "@35.7147651,139.7944667,17z/data=!3m1!4b1!4m6!3m5!1s0x0!8m2!3d35.7147651!4d139.7966553"
    )
    parsed = parse_google_maps_url(url)
    assert parsed is not None
    assert parsed.name == "Senso-ji"
    assert abs(parsed.latitude - 35.7147651) < 1e-5
    assert abs(parsed.longitude - 139.7966553) < 1e-5


@pytest.mark.asyncio
async def test_places_search_and_resolve_url_endpoints(
    api_client: AsyncClient,
) -> None:
    fake_candidate = PlaceCandidate(
        name="Asakusa Imahan",
        address="Tokyo, Taito City",
        latitude=35.713,
        longitude=139.792,
        google_maps_url="https://maps.google.com/?cid=123",
        provider="google_places",
    )

    class _FakeProvider:
        async def search(
            self, query: str, language: str = "zh-TW", limit: int = 5
        ) -> list[PlaceCandidate]:
            del query, language, limit
            return [fake_candidate]

    with patch(
        "app.api.v1.places.get_place_search_provider", return_value=_FakeProvider()
    ):
        resp = await api_client.get("/api/v1/places/search?q=Imahan")
    assert resp.status_code == 200
    assert resp.json()[0]["name"] == "Asakusa Imahan"

    resolve_resp = await api_client.post(
        "/api/v1/places/resolve-url",
        json={
            "url": "https://www.google.com/maps/place/Tokyo+Tower/@35.65858,139.74543,17z"
        },
    )
    assert resolve_resp.status_code == 200
    assert resolve_resp.json()["name"] == "Tokyo Tower"


@pytest.mark.asyncio
async def test_append_day_and_slot_level_choice_groups(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    trip = (
        await api_client.post(
            "/api/v1/trips",
            headers=dev_headers,
            json={
                "title": "Tainan Weekend",
                "country_codes": ["TW"],
                "start_date": "2026-12-05",
                "end_date": "2026-12-05",
                "default_currency": "TWD",
            },
        )
    ).json()
    assert len(trip["days"]) == 1

    # Append Day 2 dynamically (for open-ended trips).
    day2_resp = await api_client.post(
        f"/api/v1/trips/{trip['id']}/days", headers=dev_headers
    )
    assert day2_resp.status_code == 201
    assert day2_resp.json()["day_index"] == 2
    assert day2_resp.json()["date"] == "2026-12-06"

    plan_a_id = trip["days"][0]["active_option_id"]

    # Add Lunch option 1, then add Lunch option 2 as a slot alternative.
    mock_leg = RouteLegResult(
        distance_km=2.5, duration_min=8, geometry_polyline=None, is_approx=False
    )
    with patch(
        "app.services.routing.OsrmRoutingProvider.compute_leg",
        new=AsyncMock(return_value=mock_leg),
    ):
        lunch1 = (
            await api_client.post(
                f"/api/v1/options/{plan_a_id}/items",
                headers=dev_headers,
                json={"type": "FOOD", "title": "Beef Soup A", "start_time": "12:00"},
            )
        ).json()
        lunch2 = (
            await api_client.post(
                f"/api/v1/options/{plan_a_id}/items",
                headers=dev_headers,
                json={
                    "type": "FOOD",
                    "title": "Noodles B",
                    "start_time": "12:00",
                    "alternative_for_item_id": lunch1["id"],
                },
            )
        ).json()
        assert lunch2["choice_group_id"] is not None
        assert lunch2["is_selected"] is False

        # Switch selected lunch to Noodles B.
        switched = (
            await api_client.patch(
                f"/api/v1/items/{lunch2['id']}/select", headers=dev_headers
            )
        ).json()
        items_by_id = {i["id"]: i for i in switched["items"]}
        assert items_by_id[lunch1["id"]]["is_selected"] is False
        assert items_by_id[lunch2["id"]]["is_selected"] is True
