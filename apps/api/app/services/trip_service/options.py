"""Plan A/B day option management and route recalculation."""

import uuid

from fastapi import HTTPException, status

from app.models import DayOption, ItemType, ItineraryItem, RouteSegment, TripDay
from app.schemas.trip import DayOptionCloneRequest, DayOptionCreate, DayOptionUpdate
from app.services.trip_service.base import TripServiceBase
from app.services.trip_service.helpers import require_found


class DayOptionsMixin(TripServiceBase):
    """CRUD, cloning, activation, and route refresh for DayOptions."""

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
        return require_found(
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
        day = require_found(
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
        return require_found(
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
        return require_found(
            await self.repo.get_option_for_user(option.id, user_id),
            "Day option not found",
        )

    async def delete_day_option(self, option_id: str, user_id: str) -> TripDay:
        option = await self.repo.get_option_for_user(option_id, user_id)
        if option is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Day option not found"
            )
        day = require_found(
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
        return require_found(
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
        return require_found(
            await self.repo.get_day_for_user(
                day_id, user_id, populate_existing=True
            ),
            "Trip day not found",
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
        return require_found(
            await self.repo.get_option_for_user(
                option_id, user_id, populate_existing=True
            ),
            "Day option not found",
        )
