"""Business logic for Trips, multi-option Days (Plan A/B), Items, and Sharing."""

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DayOption, ItemType, ItineraryItem, Trip, TripDay, TripShare
from app.repositories.trip_repository import TripRepository
from app.schemas.trip import (
    DayOptionCloneRequest,
    DayOptionCreate,
    DayOptionResponse,
    DayOptionUpdate,
    ItineraryItemCreate,
    ItineraryItemResponse,
    ItineraryItemUpdate,
    PublicTripResponse,
    ShareVisibilityPolicy,
    TripCreate,
    TripDayResponse,
    TripDayUpdate,
    TripShareCreate,
    TripUpdate,
    sanitize_item_for_share,
)
from app.services.airport_service import compute_flight_distance_km, get_airport
from app.services.routing import RoutingProvider, recalculate_option_routes


def _resolve_flight_airport_coords(
    details: dict, home_country: str = "TW"
) -> tuple[float | None, float | None]:
    """Pick destination/foreign airport coords so flights appear on trip maps."""
    origin_code = details.get("origin_iata")
    dest_code = details.get("dest_iata")
    origin = get_airport(origin_code) if isinstance(origin_code, str) else None
    dest = get_airport(dest_code) if isinstance(dest_code, str) else None

    # Prefer the airport outside home_country (e.g. PUS for TPE->PUS and PUS->TPE).
    if dest and dest.country_code != home_country:
        return dest.latitude, dest.longitude
    if origin and origin.country_code != home_country:
        return origin.latitude, origin.longitude
    chosen = dest or origin
    return (chosen.latitude, chosen.longitude) if chosen else (None, None)


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

    async def append_day(self, trip_id: str, user_id: str) -> TripDay:
        trip = await self.get_trip_detail(trip_id, user_id)
        next_index = len(trip.days) + 1
        next_date = (
            trip.days[-1].date + timedelta(days=1) if trip.days else trip.start_date
        )
        new_day = TripDay(
            trip_id=trip.id,
            day_index=next_index,
            date=next_date,
        )
        self.db.add(new_day)
        await self.db.flush()

        plan_a = DayOption(trip_day_id=new_day.id, label="Plan A", sort_order=0)
        self.db.add(plan_a)
        await self.db.flush()
        new_day.active_option_id = plan_a.id

        if next_date > trip.end_date:
            trip.end_date = next_date

        await self.db.commit()
        loaded = await self.repo.get_day_for_user(new_day.id, user_id)
        assert loaded is not None
        return loaded

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

        # Remap choice_group_id per group so Plan B alternatives stay independent.
        group_remap: dict[str, str] = {}
        for item in source.items:
            cloned_group_id: str | None = None
            if item.choice_group_id:
                cloned_group_id = group_remap.setdefault(
                    item.choice_group_id, str(uuid.uuid4())
                )
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
                    choice_group_id=cloned_group_id,
                    is_selected=item.is_selected,
                )
            )
        await self.db.commit()
        loaded = await self.repo.get_option_for_user(cloned.id, user_id)
        assert loaded is not None
        return loaded

    async def update_day_option(
        self, option_id: str, user_id: str, payload: DayOptionUpdate
    ) -> DayOption:
        option = await self.repo.get_option_for_user(option_id, user_id)
        if option is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Day option not found"
            )
        updates = payload.model_dump(exclude_unset=True)
        if "label" in updates and updates["label"] is not None:
            option.label = updates["label"].strip()
        if "summary_notes" in updates:
            option.summary_notes = updates["summary_notes"]
        await self.db.commit()
        loaded = await self.repo.get_option_for_user(option.id, user_id)
        assert loaded is not None
        return loaded

    async def delete_day_option(self, option_id: str, user_id: str) -> TripDay:
        option = await self.repo.get_option_for_user(option_id, user_id)
        if option is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Day option not found"
            )
        day = await self.repo.get_day_for_user(option.trip_day_id, user_id)
        assert day is not None
        if len(day.options) <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last remaining day option",
            )
        remaining = [opt for opt in day.options if opt.id != option.id]
        if day.active_option_id == option.id:
            day.active_option_id = remaining[0].id
            await self.db.flush()
        await self.db.delete(option)
        for idx, opt in enumerate(remaining):
            opt.sort_order = idx
        await self.db.commit()
        self.db.expire(day, ["options"])
        loaded = await self.repo.get_day_for_user(day.id, user_id)
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

    async def update_day(
        self, day_id: str, user_id: str, payload: TripDayUpdate
    ) -> TripDay:
        day = await self.repo.get_day_for_user(day_id, user_id)
        if day is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Trip day not found"
            )
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(day, field, value)
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
        choice_group_id = payload.choice_group_id
        is_selected = payload.is_selected
        sort_order = (
            payload.sort_order if payload.sort_order is not None else len(option.items)
        )

        # Attach to an existing item's slot-level choice group (creating one if needed).
        if payload.alternative_for_item_id:
            anchor = next(
                (i for i in option.items if i.id == payload.alternative_for_item_id),
                None,
            )
            if anchor is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Target item for alternative not found in this day option",
                )
            if not anchor.choice_group_id:
                anchor.choice_group_id = str(uuid.uuid4())
            choice_group_id = anchor.choice_group_id
            sort_order = anchor.sort_order
            is_selected = False

        enriched_details = _enrich_flight_details(payload.type.value, payload.details)
        lat = payload.latitude
        lng = payload.longitude
        if payload.type.value == ItemType.FLIGHT.value and (lat is None or lng is None):
            lat, lng = _resolve_flight_airport_coords(enriched_details)

        item = ItineraryItem(
            day_option_id=option.id,
            type=payload.type.value,
            sort_order=sort_order,
            title=payload.title,
            start_time=payload.start_time,
            end_time=payload.end_time,
            timezone=payload.timezone,
            address=payload.address,
            latitude=lat,
            longitude=lng,
            google_maps_url=payload.google_maps_url,
            notes=payload.notes,
            details=enriched_details,
            choice_group_id=choice_group_id,
            is_selected=is_selected,
        )
        self.db.add(item)
        await self.db.flush()
        if (
            item.is_selected
            and item.type != ItemType.FLIGHT.value
            and item.latitude is not None
            and item.longitude is not None
        ):
            await recalculate_option_routes(
                self.db, option, [*option.items, item], self.routing_provider
            )
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def select_choice_item(self, item_id: str, user_id: str) -> DayOption:
        item = await self.repo.get_item_for_user(item_id, user_id)
        if item is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Itinerary item not found"
            )
        option = await self.repo.get_option_for_user(item.day_option_id, user_id)
        assert option is not None

        if item.choice_group_id:
            for sibling in option.items:
                if sibling.choice_group_id == item.choice_group_id:
                    sibling.is_selected = sibling.id == item.id
        else:
            item.is_selected = True

        await recalculate_option_routes(
            self.db, option, option.items, self.routing_provider
        )
        await self.db.commit()
        self.db.expire(option, ["items", "route_segments"])
        loaded = await self.repo.get_option_for_user(option.id, user_id)
        assert loaded is not None
        return loaded

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
        next_type = updates.get("type", item.type)
        if "details" in updates and updates["details"] is not None:
            updates["details"] = _enrich_flight_details(next_type, updates["details"])

        coords_changed = "latitude" in updates or "longitude" in updates
        for field, value in updates.items():
            setattr(item, field, value)

        await self.db.flush()
        if coords_changed:
            option = await self.repo.get_option_for_user(item.day_option_id, user_id)
            if option is not None:
                await recalculate_option_routes(
                    self.db, option, option.items, self.routing_provider
                )

        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def delete_item(self, item_id: str, user_id: str) -> None:
        item = await self.repo.get_item_for_user(item_id, user_id)
        if item is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Itinerary item not found"
            )
        option_id = item.day_option_id
        deleted_group_id = item.choice_group_id
        was_selected = item.is_selected
        had_coords = item.latitude is not None and item.longitude is not None

        await self.db.delete(item)
        await self.db.flush()

        option = await self.repo.get_option_for_user(option_id, user_id)
        if option is not None:
            remaining = [i for i in option.items if i.id != item_id]
            promoted_has_coords = False
            # Promote a sibling when the active choice in a slot is deleted.
            if deleted_group_id and was_selected:
                siblings = [
                    i for i in remaining if i.choice_group_id == deleted_group_id
                ]
                if siblings and not any(s.is_selected for s in siblings):
                    siblings[0].is_selected = True
                    promoted_has_coords = (
                        siblings[0].latitude is not None
                        and siblings[0].longitude is not None
                    )
            if had_coords or promoted_has_coords:
                await recalculate_option_routes(
                    self.db, option, remaining, self.routing_provider
                )
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
        await self.db.flush()
        await recalculate_option_routes(
            self.db, option, option.items, self.routing_provider
        )
        await self.db.commit()
        # Expire cached relationship order so SQLAlchemy reloads by updated sort_order.
        self.db.expire(option, ["items", "route_segments"])
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
                        if policy.include_backup_options or item.is_selected
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
