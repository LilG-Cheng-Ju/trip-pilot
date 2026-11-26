"""Business logic for Trips, multi-option Days (Plan A/B), Items, and Sharing."""

import json
import re
import secrets
import uuid
from datetime import UTC, datetime, time, timedelta

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import delete, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import MAX_TRIP_DATE_SPAN_DAYS
from app.models import (
    DayOption,
    Expense,
    ItemType,
    ItineraryItem,
    RouteSegment,
    Trip,
    TripDay,
    TripShare,
    User,
)
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
    validate_item_details_for_type,
)
from app.services.airport_service import compute_flight_distance_km, get_airport
from app.services.routing import (
    OptionRoutePlan,
    RoutingProvider,
    apply_option_route_plan,
    build_option_route_plan,
    compute_missing_route_legs,
)


def _require_found[T](entity: T | None, detail: str) -> T:
    """Return a loaded entity or raise an explicit HTTP 404 instead of asserting."""
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return entity


def _norm_iata(value: object) -> str | None:
    return value.strip().upper() if isinstance(value, str) and value.strip() else None


_START_TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?$")


def _parse_start_time(value: str | None) -> time | None:
    """Parse an HH:MM (or H:MM / HH:MM:SS) string into a comparable time."""
    if not value:
        return None
    match = _START_TIME_RE.fullmatch(value.strip())
    if match is None:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2))
    second = int(match.group(3)) if match.group(3) is not None else 0
    if not (0 <= hour <= 23 and 0 <= minute <= 59 and 0 <= second <= 59):
        return None
    return time(hour, minute, second)


def _group_existing_slots(items: list[ItineraryItem]) -> list[list[ItineraryItem]]:
    """Group ordered items by choice_group_id so slot alternatives move together."""
    slots: list[list[ItineraryItem]] = []
    slots_by_group: dict[str, list[ItineraryItem]] = {}
    for item in items:
        if not item.choice_group_id:
            slots.append([item])
            continue
        group_slot = slots_by_group.get(item.choice_group_id)
        if group_slot is None:
            group_slot = []
            slots_by_group[item.choice_group_id] = group_slot
            slots.append(group_slot)
        group_slot.append(item)
    return slots


def _compute_chronological_insert_index(
    slots: list[list[ItineraryItem]], new_start_time: time
) -> int:
    """Compute the deterministic chronological insertion index across slots."""
    last_timed_idx: int | None = None
    for idx, slot in enumerate(slots):
        primary = next((member for member in slot if member.is_selected), slot[0])
        existing_time = _parse_start_time(primary.start_time)
        if existing_time is None:
            continue
        if existing_time > new_start_time:
            return idx
        last_timed_idx = idx
    return last_timed_idx + 1 if last_timed_idx is not None else len(slots)


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


def _enrich_flight_details(
    item_type: str, details: dict, *, recompute_distance: bool = False
) -> dict:
    """Auto-populate Great-Circle flight distance when origin/dest IATA are given."""
    enriched = dict(details)
    if item_type != ItemType.FLIGHT.value:
        return enriched
    origin = enriched.get("origin_iata")
    dest = enriched.get("dest_iata")
    if isinstance(origin, str) and isinstance(dest, str):
        enriched["origin_iata"] = origin.strip().upper()
        enriched["dest_iata"] = dest.strip().upper()
        if (
            recompute_distance
            or "distance_km" not in enriched
            or enriched["distance_km"] is None
        ):
            dist = compute_flight_distance_km(
                enriched["origin_iata"], enriched["dest_iata"]
            )
            if dist is not None:
                enriched["distance_km"] = dist
            elif recompute_distance:
                enriched.pop("distance_km", None)
    elif recompute_distance:
        enriched.pop("distance_km", None)
    return enriched


class TripService:
    """Orchestrates trip mutations and enforces domain invariants."""

    def __init__(
        self, db: AsyncSession, routing_provider: RoutingProvider | None = None
    ) -> None:
        self.db = db
        self.repo = TripRepository(db)
        self.routing_provider = routing_provider

    async def _user_home_country(self, user_id: str) -> str:
        user = await self.db.get(User, user_id)
        if user and user.home_country_code:
            return user.home_country_code.upper()
        return "TW"

    async def _get_day_location_for_option(
        self, option_id: str
    ) -> tuple[str, int] | None:
        row = (
            await self.db.execute(
                select(TripDay.trip_id, TripDay.day_index)
                .join(DayOption, DayOption.trip_day_id == TripDay.id)
                .where(DayOption.id == option_id)
            )
        ).first()
        if row is None:
            return None
        return str(row[0]), int(row[1])

    async def _unlink_item_expenses(self, item_ids: list[str]) -> None:
        """Clear nullable Expense links before deleting itinerary items."""
        if not item_ids:
            return
        await self.db.execute(
            update(Expense)
            .where(Expense.itinerary_item_id.in_(item_ids))
            .values(itinerary_item_id=None)
        )

    async def _delete_item_route_segments(self, item_ids: list[str]) -> None:
        """Delete any route segments referencing removed items after ORM flush."""
        if not item_ids:
            return
        await self.db.execute(
            delete(RouteSegment).where(
                or_(
                    RouteSegment.from_item_id.in_(item_ids),
                    RouteSegment.to_item_id.in_(item_ids),
                )
            )
        )

    async def _sync_routes_after_commit(
        self,
        trip_id: str,
        user_id: str,
        target_option_ids: list[str],
        *,
        cascade_after_day_index: int | None = None,
        invalidate_item_ids: set[str] | None = None,
        force_refresh: bool = False,
    ) -> None:
        """Recalculate option routes with no DB write lock held during OSRM I/O."""
        explicit_ids = set(target_option_ids)
        if not explicit_ids and cascade_after_day_index is None:
            return

        trip = await self.repo.get_detail(trip_id, user_id, populate_existing=True)
        if trip is None:
            await self.db.commit()
            return

        plans: list[OptionRoutePlan] = []
        running_departure_stay: ItineraryItem | None = None
        for day in sorted(trip.days, key=lambda d: d.day_index):
            include_day_options = (
                cascade_after_day_index is not None
                and day.day_index > cascade_after_day_index
            )
            for opt in day.options:
                if include_day_options or opt.id in explicit_ids:
                    plans.append(
                        build_option_route_plan(
                            opt,
                            list(opt.items),
                            departure_stay=running_departure_stay,
                            invalidate_item_ids=invalidate_item_ids,
                            force_refresh=(
                                force_refresh and opt.id in explicit_ids
                            ),
                        )
                    )

            active_opt = next(
                (o for o in day.options if o.id == day.active_option_id),
                day.options[0] if day.options else None,
            )
            if active_opt is not None:
                for item in active_opt.items:
                    if (
                        item.is_selected
                        and item.type == ItemType.STAY.value
                        and item.latitude is not None
                        and item.longitude is not None
                    ):
                        running_departure_stay = item

        # Close the read-only snapshot transaction so OSRM calls never pin a DB lock.
        await self.db.commit()
        if not plans:
            return

        computed_legs = await compute_missing_route_legs(plans, self.routing_provider)

        option_ids = [plan.option_id for plan in plans]
        options_by_id = {
            opt.id: opt
            for opt in (
                await self.db.scalars(
                    select(DayOption).where(DayOption.id.in_(option_ids))
                )
            ).all()
        }
        referenced_item_ids = {
            item_id
            for plan in plans
            for spec in plan.leg_specs
            for item_id in (spec.from_item_id, spec.to_item_id)
        }
        existing_item_ids: set[str] = (
            set(
                (
                    await self.db.scalars(
                        select(ItineraryItem.id).where(
                            ItineraryItem.id.in_(referenced_item_ids)
                        )
                    )
                ).all()
            )
            if referenced_item_ids
            else set()
        )

        for plan in plans:
            target_opt = options_by_id.get(plan.option_id)
            if target_opt is not None:
                await apply_option_route_plan(
                    self.db,
                    target_opt,
                    plan,
                    computed_legs,
                    existing_item_ids=existing_item_ids,
                )
        await self.db.commit()

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
        return _require_found(
            await self.repo.get_detail(trip.id, user_id), "Trip not found"
        )

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
        new_start_date = updates.pop("start_date", None)
        if "status" in updates and updates["status"] is not None:
            updates["status"] = updates["status"].value
        for field, value in updates.items():
            setattr(trip, field, value)

        if new_start_date is not None and new_start_date != trip.start_date:
            delta = new_start_date - trip.start_date
            trip.start_date = new_start_date
            for day in trip.days:
                day.date = new_start_date + timedelta(days=day.day_index - 1)
            if trip.end_date is not None:
                if trip.days:
                    max_day_index = max(day.day_index for day in trip.days)
                    trip.end_date = new_start_date + timedelta(
                        days=max_day_index - 1
                    )
                else:
                    trip.end_date = trip.end_date + delta

        await self.db.commit()
        return await self.get_trip_detail(trip_id, user_id)

    async def delete_trip(self, trip_id: str, user_id: str) -> None:
        trip = await self.get_trip_detail(trip_id, user_id)
        # Break circular TripDay.active_option_id <-> DayOption.trip_day_id FKs first.
        for day in trip.days:
            day.active_option_id = None
        await self.db.flush()
        await self.db.delete(trip)
        await self.db.commit()

    async def append_day(self, trip_id: str, user_id: str) -> TripDay:
        trip = await self.get_trip_detail(trip_id, user_id)
        next_index = max((d.day_index for d in trip.days), default=0) + 1
        next_date = (
            trip.days[-1].date + timedelta(days=1) if trip.days else trip.start_date
        )
        if (
            len(trip.days) > MAX_TRIP_DATE_SPAN_DAYS
            or (next_date - trip.start_date).days > MAX_TRIP_DATE_SPAN_DAYS
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Trip duration cannot exceed {MAX_TRIP_DATE_SPAN_DAYS + 1} days"
                ),
            )
        new_day = TripDay(
            trip_id=trip.id,
            day_index=next_index,
            date=next_date,
        )
        self.db.add(new_day)
        try:
            await self.db.flush()

            plan_a = DayOption(trip_day_id=new_day.id, label="Plan A", sort_order=0)
            self.db.add(plan_a)
            await self.db.flush()
            new_day.active_option_id = plan_a.id

            if next_date > trip.end_date:
                trip.end_date = next_date

            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Concurrent day update detected, please retry",
            ) from exc
        return _require_found(
            await self.repo.get_day_for_user(new_day.id, user_id),
            "Trip day not found",
        )

    async def delete_day(self, day_id: str, user_id: str) -> None:
        day = await self.repo.get_day_for_user(day_id, user_id)
        if day is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Trip day not found"
            )
        trip = _require_found(
            await self.db.scalar(
                select(Trip).where(Trip.id == day.trip_id, Trip.user_id == user_id)
            ),
            "Trip not found",
        )
        days = list(
            (
                await self.db.scalars(
                    select(TripDay)
                    .where(TripDay.trip_id == trip.id)
                    .order_by(TripDay.day_index)
                )
            ).all()
        )
        if len(days) <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last remaining day",
            )

        deleted_day_index = day.day_index
        had_stay = any(
            item.type == ItemType.STAY.value
            for opt in day.options
            for item in opt.items
        )

        # Unlink expenses explicitly before deleting so SQLite and Postgres
        # preserve spending records without FK errors.
        await self.db.execute(
            update(Expense)
            .where(Expense.trip_day_id == day.id)
            .values(trip_day_id=None)
        )
        day_item_ids = [item.id for opt in day.options for item in opt.items]
        await self._unlink_item_expenses(day_item_ids)

        # Clear active_option_id first to break the circular TripDay <-> DayOption FK.
        day.active_option_id = None
        await self.db.flush()
        await self.db.delete(day)
        await self.db.flush()
        await self._delete_item_route_segments(day_item_ids)

        remaining = [d for d in days if d.id != day.id]
        # Shift into a disjoint temporary range so sequential re-indexing never
        # trips the unique (trip_id, day_index) constraint mid-update.
        for rem_day in remaining:
            rem_day.day_index += 1000
        await self.db.flush()

        for idx, rem_day in enumerate(remaining, start=1):
            rem_day.day_index = idx
            if trip.start_date is not None:
                rem_day.date = trip.start_date + timedelta(days=idx - 1)

        if trip.end_date is not None and trip.start_date is not None:
            trip.end_date = trip.start_date + timedelta(days=len(remaining) - 1)

        self.db.expire(trip, ["days"])
        await self.db.commit()

        if had_stay:
            await self._sync_routes_after_commit(
                trip.id,
                user_id,
                [],
                cascade_after_day_index=deleted_day_index - 1,
                invalidate_item_ids=set(day_item_ids),
            )

    async def add_day_option(
        self, day_id: str, user_id: str, payload: DayOptionCreate
    ) -> DayOption:
        day = await self.repo.get_day_for_user(day_id, user_id)
        if day is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Trip day not found"
            )
        next_order = max((opt.sort_order for opt in day.options), default=-1) + 1
        option = DayOption(
            trip_day_id=day.id,
            label=payload.label,
            sort_order=next_order,
            summary_notes=payload.summary_notes,
        )
        self.db.add(option)
        await self.db.commit()
        return _require_found(
            await self.repo.get_option_for_user(option.id, user_id),
            "Day option not found",
        )

    async def clone_day_option(
        self, option_id: str, user_id: str, payload: DayOptionCloneRequest
    ) -> DayOption:
        source = await self.repo.get_option_for_user(option_id, user_id)
        if source is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Day option not found"
            )
        day = _require_found(
            await self.repo.get_day_for_user(source.trip_day_id, user_id),
            "Trip day not found",
        )

        cloned = DayOption(
            trip_day_id=day.id,
            label=payload.label,
            sort_order=max((opt.sort_order for opt in day.options), default=-1) + 1,
            summary_notes=source.summary_notes,
            cached_ground_distance_km=source.cached_ground_distance_km,
            cached_distance_is_approx=source.cached_distance_is_approx,
        )
        self.db.add(cloned)
        await self.db.flush()

        # Remap choice_group_id and item IDs so cloned plans stay independent.
        group_remap: dict[str, str] = {}
        item_id_remap: dict[str, str] = {}
        for item in source.items:
            cloned_group_id: str | None = None
            if item.choice_group_id:
                cloned_group_id = group_remap.setdefault(
                    item.choice_group_id, str(uuid.uuid4())
                )
            new_item_id = str(uuid.uuid4())
            item_id_remap[item.id] = new_item_id
            self.db.add(
                ItineraryItem(
                    id=new_item_id,
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
        await self.db.flush()
        for seg in source.route_segments:
            # Remap same-day items while preserving prior-day inherited stay IDs.
            new_from_id = item_id_remap.get(seg.from_item_id, seg.from_item_id)
            new_to_id = item_id_remap.get(seg.to_item_id, seg.to_item_id)
            self.db.add(
                RouteSegment(
                    day_option_id=cloned.id,
                    from_item_id=new_from_id,
                    to_item_id=new_to_id,
                    profile=seg.profile,
                    distance_km=seg.distance_km,
                    duration_min=seg.duration_min,
                    geometry_polyline=seg.geometry_polyline,
                    is_approx=seg.is_approx,
                )
            )
        await self.db.commit()
        return _require_found(
            await self.repo.get_option_for_user(cloned.id, user_id),
            "Day option not found",
        )

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
        return _require_found(
            await self.repo.get_option_for_user(option.id, user_id),
            "Day option not found",
        )

    async def delete_day_option(self, option_id: str, user_id: str) -> TripDay:
        option = await self.repo.get_option_for_user(option_id, user_id)
        if option is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Day option not found"
            )
        day = _require_found(
            await self.repo.get_day_for_user(option.trip_day_id, user_id),
            "Trip day not found",
        )
        if len(day.options) <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last remaining day option",
            )
        was_active = day.active_option_id == option.id
        opt_item_ids = [item.id for item in option.items]
        had_stay = any(item.type == ItemType.STAY.value for item in option.items)
        remaining = [opt for opt in day.options if opt.id != option.id]
        if was_active:
            day.active_option_id = remaining[0].id
            await self.db.flush()
        await self._unlink_item_expenses(opt_item_ids)
        await self.db.delete(option)
        await self.db.flush()
        await self._delete_item_route_segments(opt_item_ids)
        for idx, opt in enumerate(remaining):
            opt.sort_order = idx
        await self.db.commit()
        if was_active and had_stay:
            await self._sync_routes_after_commit(
                day.trip_id,
                user_id,
                [],
                cascade_after_day_index=day.day_index,
                invalidate_item_ids=set(opt_item_ids),
            )
        return _require_found(
            await self.repo.get_day_for_user(
                day.id, user_id, populate_existing=True
            ),
            "Trip day not found",
        )

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
        changed = day.active_option_id != option_id
        any_stay = any(
            item.type == ItemType.STAY.value
            for opt in day.options
            for item in opt.items
        )
        day.active_option_id = option_id
        await self.db.commit()
        if changed and any_stay:
            await self._sync_routes_after_commit(
                day.trip_id,
                user_id,
                [],
                cascade_after_day_index=day.day_index,
            )
        return _require_found(
            await self.repo.get_day_for_user(
                day_id, user_id, populate_existing=True
            ),
            "Trip day not found",
        )

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
        return _require_found(
            await self.repo.get_day_for_user(
                day_id, user_id, populate_existing=True
            ),
            "Trip day not found",
        )

    async def _resolve_chronological_sort_order(
        self, option_id: str, new_start_time: time
    ) -> int:
        existing_items = list(
            (
                await self.db.scalars(
                    select(ItineraryItem)
                    .where(ItineraryItem.day_option_id == option_id)
                    .order_by(
                        ItineraryItem.sort_order,
                        ItineraryItem.created_at,
                        ItineraryItem.id,
                    )
                )
            ).all()
        )
        slots = _group_existing_slots(existing_items)
        insert_idx = _compute_chronological_insert_index(slots, new_start_time)
        # Re-normalize slots to 0..N so shifting never leaves gaps or splits choices.
        for idx, slot in enumerate(slots):
            target_order = idx if idx < insert_idx else idx + 1
            for slot_item in slot:
                slot_item.sort_order = target_order
        return insert_idx

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
        elif payload.sort_order is not None:
            sort_order = payload.sort_order
        elif (parsed_start := _parse_start_time(payload.start_time)) is not None:
            sort_order = await self._resolve_chronological_sort_order(
                option.id, parsed_start
            )
        else:
            sort_order = max((i.sort_order for i in option.items), default=-1) + 1

        enriched_details = _enrich_flight_details(payload.type.value, payload.details)
        lat = payload.latitude
        lng = payload.longitude
        if payload.type.value == ItemType.FLIGHT.value and (lat is None or lng is None):
            home_country = await self._user_home_country(user_id)
            lat, lng = _resolve_flight_airport_coords(
                enriched_details, home_country=home_country
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
            latitude=lat,
            longitude=lng,
            google_maps_url=payload.google_maps_url,
            notes=payload.notes,
            details=enriched_details,
            choice_group_id=choice_group_id,
            is_selected=is_selected,
        )
        self.db.add(item)
        needs_route_recalc = (
            item.is_selected
            and item.latitude is not None
            and item.longitude is not None
        )
        cascade_downstream = needs_route_recalc and item.type == ItemType.STAY.value
        day_loc = await self._get_day_location_for_option(option.id)
        await self.db.commit()

        if needs_route_recalc and day_loc is not None:
            trip_id, day_index = day_loc
            await self._sync_routes_after_commit(
                trip_id,
                user_id,
                [option.id],
                cascade_after_day_index=day_index if cascade_downstream else None,
            )
        await self.db.refresh(item)
        return item

    async def select_choice_item(self, item_id: str, user_id: str) -> DayOption:
        item = await self.repo.get_item_for_user(item_id, user_id)
        if item is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Itinerary item not found"
            )
        option = _require_found(
            await self.repo.get_option_for_user(item.day_option_id, user_id),
            "Day option not found",
        )

        affects_stay = item.type == ItemType.STAY.value
        if item.choice_group_id:
            for sibling in option.items:
                if sibling.choice_group_id == item.choice_group_id:
                    sibling.is_selected = sibling.id == item.id
                    if sibling.type == ItemType.STAY.value:
                        affects_stay = True
        else:
            item.is_selected = True

        day_loc = await self._get_day_location_for_option(option.id)
        await self.db.commit()
        if day_loc is not None:
            trip_id, day_index = day_loc
            await self._sync_routes_after_commit(
                trip_id,
                user_id,
                [option.id],
                cascade_after_day_index=day_index if affects_stay else None,
            )
        return _require_found(
            await self.repo.get_option_for_user(
                option.id, user_id, populate_existing=True
            ),
            "Day option not found",
        )

    async def recalculate_option_route(
        self, option_id: str, user_id: str
    ) -> DayOption:
        option = await self.repo.get_option_for_user(option_id, user_id)
        if option is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Day option not found"
            )
        day_loc = await self._get_day_location_for_option(option.id)
        await self.db.commit()
        if day_loc is not None:
            trip_id, _ = day_loc
            await self._sync_routes_after_commit(
                trip_id,
                user_id,
                [option_id],
                force_refresh=True,
            )
        return _require_found(
            await self.repo.get_option_for_user(
                option_id, user_id, populate_existing=True
            ),
            "Day option not found",
        )

    async def update_item(
        self, item_id: str, user_id: str, payload: ItineraryItemUpdate
    ) -> ItineraryItem:
        item = await self.repo.get_item_for_user(item_id, user_id)
        if item is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Itinerary item not found"
            )
        was_stay = item.type == ItemType.STAY.value
        updates = payload.model_dump(exclude_unset=True)
        if "type" in updates and updates["type"] is not None:
            updates["type"] = updates["type"].value
        next_type = updates.get("type", item.type)
        iata_changed = False
        if "details" in updates and updates["details"] is not None:
            try:
                new_details = validate_item_details_for_type(
                    ItemType(next_type), updates["details"]
                )
            except ValidationError as exc:
                raise HTTPException(
                    status_code=422,
                    detail=json.loads(exc.json()),
                ) from exc
            iata_changed = next_type == ItemType.FLIGHT.value and (
                next_type != item.type
                or _norm_iata(new_details.get("origin_iata"))
                != _norm_iata(item.details.get("origin_iata"))
                or _norm_iata(new_details.get("dest_iata"))
                != _norm_iata(item.details.get("dest_iata"))
            )
            updates["details"] = _enrich_flight_details(
                next_type, new_details, recompute_distance=iata_changed
            )
            if (
                iata_changed
                and "latitude" not in updates
                and "longitude" not in updates
            ):
                home_country = await self._user_home_country(user_id)
                lat, lng = _resolve_flight_airport_coords(
                    updates["details"], home_country=home_country
                )
                updates["latitude"] = lat
                updates["longitude"] = lng

        needs_route_recalc = iata_changed or any(
            field in updates
            for field in ("latitude", "longitude", "type", "sort_order", "is_selected")
        )
        for field, value in updates.items():
            setattr(item, field, value)

        is_stay = item.type == ItemType.STAY.value
        day_loc = (
            await self._get_day_location_for_option(item.day_option_id)
            if needs_route_recalc
            else None
        )
        await self.db.commit()

        if needs_route_recalc and day_loc is not None:
            trip_id, day_index = day_loc
            await self._sync_routes_after_commit(
                trip_id,
                user_id,
                [item.day_option_id],
                cascade_after_day_index=(
                    day_index if (was_stay or is_stay) else None
                ),
                invalidate_item_ids={item.id},
            )
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
        was_stay = item.type == ItemType.STAY.value
        had_coords = item.latitude is not None and item.longitude is not None

        day_loc = await self._get_day_location_for_option(option_id)
        await self._unlink_item_expenses([item_id])
        await self.db.delete(item)
        await self.db.flush()
        await self._delete_item_route_segments([item_id])

        option = await self.repo.get_option_for_user(option_id, user_id)
        promoted_has_coords = False
        promoted_is_stay = False
        if option is not None:
            remaining = [i for i in option.items if i.id != item_id]
            # Promote a sibling when the active choice in a slot is deleted.
            if deleted_group_id and was_selected:
                siblings = [
                    i for i in remaining if i.choice_group_id == deleted_group_id
                ]
                if siblings and not any(s.is_selected for s in siblings):
                    siblings[0].is_selected = True
                    promoted_is_stay = siblings[0].type == ItemType.STAY.value
                    promoted_has_coords = (
                        siblings[0].latitude is not None
                        and siblings[0].longitude is not None
                    )
        await self.db.commit()

        if (had_coords or promoted_has_coords) and day_loc is not None:
            trip_id, day_index = day_loc
            await self._sync_routes_after_commit(
                trip_id,
                user_id,
                [option_id],
                cascade_after_day_index=(
                    day_index if (was_stay or promoted_is_stay) else None
                ),
                invalidate_item_ids={item_id},
            )

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
        has_stay = any(item.type == ItemType.STAY.value for item in option.items)
        day_loc = await self._get_day_location_for_option(option.id)
        await self.db.commit()

        if day_loc is not None:
            trip_id, day_index = day_loc
            await self._sync_routes_after_commit(
                trip_id,
                user_id,
                [option.id],
                cascade_after_day_index=day_index if has_stay else None,
            )
        return _require_found(
            await self.repo.get_option_for_user(
                option_id, user_id, populate_existing=True
            ),
            "Day option not found",
        )

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
            sanitized_options: list[DayOptionResponse] = []
            for opt in visible_options:
                visible_items = [
                    sanitize_item_for_share(
                        ItineraryItemResponse.model_validate(item), policy
                    )
                    for item in opt.items
                    if policy.include_backup_options or item.is_selected
                ]
                sanitized_options.append(
                    DayOptionResponse(
                        id=opt.id,
                        trip_day_id=opt.trip_day_id,
                        label=opt.label,
                        sort_order=opt.sort_order,
                        summary_notes=(
                            opt.summary_notes if policy.include_notes else None
                        ),
                        cached_ground_distance_km=opt.cached_ground_distance_km,
                        cached_distance_is_approx=opt.cached_distance_is_approx,
                        items=visible_items,
                        # Omit OSRM polylines; public share maps render
                        # editorial curves client-side.
                        route_segments=[],
                    )
                )
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
