"""Business logic for Trips, multi-option Days (Plan A/B), Items, and Sharing."""

import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DayOption, ItemType, ItineraryItem, Trip, TripDay, TripShare
from app.repositories.trip_repository import TripRepository
from app.schemas.trip import (
    DayOptionCloneRequest,
    DayOptionCreate,
    DayOptionResponse,
    ItineraryItemCreate,
    ItineraryItemResponse,
    ItineraryItemUpdate,
    PublicTripResponse,
    ShareVisibilityPolicy,
    TripCreate,
    TripDayResponse,
    TripShareCreate,
    TripUpdate,
    sanitize_item_for_share,
)
from app.services.airport_service import compute_flight_distance_km
from app.services.routing import RoutingProvider, recalculate_option_routes


def _enrich_flight_details(item_type: str, details: dict) -> dict:
    """Auto-populate Great-Circle flight distance when origin/dest IATA are given."""
    enriched = dict(details)
    if item_type != ItemType.FLIGHT.value:
        return enriched
    origin = enriched.get("origin_iata")
    dest = enriched.get("dest_iata")
    if isinstance(origin, str) and isinstance(dest, str):
        enriched["origin_iata"] = origin.strip().upper()
        enriched["dest_iata"] = dest.strip().upper()
        if "distance_km" not in enriched or enriched["distance_km"] is None:
            dist = compute_flight_distance_km(
                enriched["origin_iata"], enriched["dest_iata"]
            )
            if dist is not None:
                enriched["distance_km"] = dist
    return enriched


class TripService:
    """Orchestrates trip mutations and enforces domain invariants."""

    def __init__(
        self, db: AsyncSession, routing_provider: RoutingProvider | None = None
    ) -> None:
        self.db = db
        self.repo = TripRepository(db)
        self.routing_provider = routing_provider

    async def list_trips(
        self, user_id: str, status_filter: str | None = None
    ) -> list[Trip]:
        return await self.repo.list_by_user(user_id, status_filter)

    async def create_trip(self, user_id: str, payload: TripCreate) -> Trip:
        trip = Trip(
            user_id=user_id,
            title=payload.title,
            destination_summary=payload.destination_summary,
            country_codes=payload.country_codes,
            start_date=payload.start_date,
            end_date=payload.end_date,
            default_currency=payload.default_currency,
            cover_image_url=payload.cover_image_url,
            status=payload.status.value,
            notes=payload.notes,
        )
        self.db.add(trip)
        await self.db.flush()

        # Auto-scaffold TripDay + default "Plan A" DayOption for each calendar day.
        num_days = (payload.end_date - payload.start_date).days + 1
        for offset in range(num_days):
            trip_day = TripDay(
                trip_id=trip.id,
                day_index=offset + 1,
                date=payload.start_date + timedelta(days=offset),
            )
            self.db.add(trip_day)
            await self.db.flush()

            plan_a = DayOption(
                trip_day_id=trip_day.id,
                label="Plan A",
                sort_order=0,
            )
            self.db.add(plan_a)
            await self.db.flush()
            trip_day.active_option_id = plan_a.id

        await self.db.commit()
        created = await self.repo.get_detail(trip.id, user_id)
        assert created is not None
        return created

    async def get_trip_detail(self, trip_id: str, user_id: str) -> Trip:
        trip = await self.repo.get_detail(trip_id, user_id)
        if trip is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
            )
        return trip

    async def update_trip(
        self, trip_id: str, user_id: str, payload: TripUpdate
    ) -> Trip:
        trip = await self.get_trip_detail(trip_id, user_id)
        updates = payload.model_dump(exclude_unset=True)
        if "status" in updates and updates["status"] is not None:
            updates["status"] = updates["status"].value
        for field, value in updates.items():
            setattr(trip, field, value)
        await self.db.commit()
        return await self.get_trip_detail(trip_id, user_id)

    async def delete_trip(self, trip_id: str, user_id: str) -> None:
        trip = await self.get_trip_detail(trip_id, user_id)
        await self.db.delete(trip)
        await self.db.commit()

    async def add_day_option(
        self, day_id: str, user_id: str, payload: DayOptionCreate
    ) -> DayOption:
        day = await self.repo.get_day_for_user(day_id, user_id)
        if day is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Trip day not found"
            )
        next_order = len(day.options)
        option = DayOption(
            trip_day_id=day.id,
            label=payload.label,
            sort_order=next_order,
            summary_notes=payload.summary_notes,
        )
        self.db.add(option)
        await self.db.commit()
        loaded = await self.repo.get_option_for_user(option.id, user_id)
        assert loaded is not None
        return loaded

    async def clone_day_option(
        self, option_id: str, user_id: str, payload: DayOptionCloneRequest
    ) -> DayOption:
        source = await self.repo.get_option_for_user(option_id, user_id)
        if source is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Day option not found"
            )
        day = await self.repo.get_day_for_user(source.trip_day_id, user_id)
        assert day is not None

        cloned = DayOption(
            trip_day_id=day.id,
            label=payload.label,
            sort_order=len(day.options),
            summary_notes=source.summary_notes,
            cached_ground_distance_km=source.cached_ground_distance_km,
            cached_distance_is_approx=source.cached_distance_is_approx,
        )
        self.db.add(cloned)
        await self.db.flush()

        for item in source.items:
            self.db.add(
                ItineraryItem(
                    day_option_id=cloned.id,
                    type=item.type,
                    sort_order=item.sort_order,
                    title=item.title,
                    start_time=item.start_time,
                    end_time=item.end_time,
                    timezone=item.timezone,
                    address=item.address,
                    latitude=item.latitude,
                    longitude=item.longitude,
                    google_maps_url=item.google_maps_url,
                    notes=item.notes,
                    details=dict(item.details),
                )
            )
        await self.db.commit()
        loaded = await self.repo.get_option_for_user(cloned.id, user_id)
        assert loaded is not None
        return loaded

    async def set_active_option(
        self, day_id: str, user_id: str, option_id: str
    ) -> TripDay:
        day = await self.repo.get_day_for_user(day_id, user_id)
        if day is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Trip day not found"
            )
        if not any(opt.id == option_id for opt in day.options):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Day option does not belong to this day",
            )
        day.active_option_id = option_id
        await self.db.commit()
        loaded = await self.repo.get_day_for_user(day_id, user_id)
        assert loaded is not None
        return loaded

    async def add_item(
        self, option_id: str, user_id: str, payload: ItineraryItemCreate
    ) -> ItineraryItem:
        option = await self.repo.get_option_for_user(option_id, user_id)
        if option is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Day option not found"
            )
        sort_order = (
            payload.sort_order if payload.sort_order is not None else len(option.items)
        )
        item = ItineraryItem(
            day_option_id=option.id,
            type=payload.type.value,
            sort_order=sort_order,
            title=payload.title,
            start_time=payload.start_time,
            end_time=payload.end_time,
            timezone=payload.timezone,
            address=payload.address,
            latitude=payload.latitude,
            longitude=payload.longitude,
            google_maps_url=payload.google_maps_url,
            notes=payload.notes,
            details=_enrich_flight_details(payload.type.value, payload.details),
        )
        self.db.add(item)
        await self.db.flush()
        if item.latitude is not None and item.longitude is not None:
            await recalculate_option_routes(
                self.db, option, [*option.items, item], self.routing_provider
            )
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def recalculate_option_route(
        self, option_id: str, user_id: str
    ) -> DayOption:
        option = await self.repo.get_option_for_user(option_id, user_id)
        if option is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Day option not found"
            )
        await recalculate_option_routes(
            self.db, option, option.items, self.routing_provider
        )
        await self.db.commit()
        self.db.expire(option, ["route_segments"])
        loaded = await self.repo.get_option_for_user(option_id, user_id)
        assert loaded is not None
        return loaded

    async def update_item(
        self, item_id: str, user_id: str, payload: ItineraryItemUpdate
    ) -> ItineraryItem:
        item = await self.repo.get_item_for_user(item_id, user_id)
        if item is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Itinerary item not found"
            )
        updates = payload.model_dump(exclude_unset=True)
        if "type" in updates and updates["type"] is not None:
            updates["type"] = updates["type"].value
        for field, value in updates.items():
            setattr(item, field, value)
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def delete_item(self, item_id: str, user_id: str) -> None:
        item = await self.repo.get_item_for_user(item_id, user_id)
        if item is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Itinerary item not found"
            )
        await self.db.delete(item)
        await self.db.commit()

    async def reorder_items(
        self, option_id: str, user_id: str, item_ids: list[str]
    ) -> DayOption:
        option = await self.repo.get_option_for_user(option_id, user_id)
        if option is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Day option not found"
            )
        items_by_id = {item.id: item for item in option.items}
        if set(item_ids) != set(items_by_id.keys()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="item_ids must match all items in the day option",
            )
        for index, item_id in enumerate(item_ids):
            items_by_id[item_id].sort_order = index
        await self.db.commit()
        # Expire cached relationship order so SQLAlchemy reloads by updated sort_order.
        self.db.expire(option, ["items"])
        loaded = await self.repo.get_option_for_user(option_id, user_id)
        assert loaded is not None
        return loaded

    async def create_share(
        self, trip_id: str, user_id: str, payload: TripShareCreate
    ) -> TripShare:
        await self.get_trip_detail(trip_id, user_id)
        share = TripShare(
            trip_id=trip_id,
            token=secrets.token_urlsafe(24),
            label=payload.label,
            visibility_policy=payload.visibility_policy.model_dump(),
            expires_at=payload.expires_at,
        )
        self.db.add(share)
        await self.db.commit()
        await self.db.refresh(share)
        return share

    async def list_shares(self, trip_id: str, user_id: str) -> list[TripShare]:
        await self.get_trip_detail(trip_id, user_id)
        return await self.repo.list_shares(trip_id, user_id)

    async def revoke_share(self, trip_id: str, share_id: str, user_id: str) -> None:
        shares = await self.list_shares(trip_id, user_id)
        target = next((s for s in shares if s.id == share_id), None)
        if target is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found"
            )
        target.revoked_at = datetime.now(UTC)
        await self.db.commit()

    async def get_public_trip(self, share_token: str) -> PublicTripResponse:
        share = await self.repo.get_share_by_token(share_token)
        now = datetime.now(UTC)
        if share is None or share.revoked_at is not None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Share link not found or revoked",
            )
        if share.expires_at is not None:
            expires = (
                share.expires_at
                if share.expires_at.tzinfo is not None
                else share.expires_at.replace(tzinfo=UTC)
            )
            if expires <= now:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Share link has expired",
                )

        policy = ShareVisibilityPolicy.model_validate(share.visibility_policy)
        trip = share.trip

        sanitized_days: list[TripDayResponse] = []
        for day in trip.days:
            visible_options = (
                day.options
                if policy.include_backup_options
                else [opt for opt in day.options if opt.id == day.active_option_id]
            )
            sanitized_options = [
                DayOptionResponse(
                    id=opt.id,
                    trip_day_id=opt.trip_day_id,
                    label=opt.label,
                    sort_order=opt.sort_order,
                    summary_notes=opt.summary_notes if policy.include_notes else None,
                    cached_ground_distance_km=opt.cached_ground_distance_km,
                    cached_distance_is_approx=opt.cached_distance_is_approx,
                    items=[
                        sanitize_item_for_share(
                            ItineraryItemResponse.model_validate(item), policy
                        )
                        for item in opt.items
                    ],
                    route_segments=[],
                )
                for opt in visible_options
            ]
            sanitized_days.append(
                TripDayResponse(
                    id=day.id,
                    trip_id=day.trip_id,
                    day_index=day.day_index,
                    date=day.date,
                    title=day.title,
                    active_option_id=day.active_option_id,
                    notes=day.notes if policy.include_notes else None,
                    options=sanitized_options,
                )
            )

        return PublicTripResponse(
            title=trip.title,
            destination_summary=trip.destination_summary,
            country_codes=trip.country_codes,
            start_date=trip.start_date,
            end_date=trip.end_date,
            default_currency=trip.default_currency,
            cover_image_url=trip.cover_image_url,
            notes=trip.notes if policy.include_notes else None,
            visibility_policy=policy,
            days=sanitized_days,
        )
