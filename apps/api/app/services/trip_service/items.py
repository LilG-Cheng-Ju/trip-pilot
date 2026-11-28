"""Itinerary item CRUD, slot choice switching, and chronological ordering."""

import json
import uuid
from datetime import time

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select, update

from app.models import DayOption, Expense, ItemType, ItineraryItem, TripDay
from app.schemas.trip import (
    ItineraryItemCreate,
    ItineraryItemMoveRequest,
    ItineraryItemUpdate,
    validate_item_details_for_type,
)
from app.services.trip_service.base import TripServiceBase
from app.services.trip_service.helpers import (
    compute_chronological_insert_index,
    enrich_flight_details,
    group_existing_slots,
    norm_iata,
    parse_start_time,
    require_found,
    resolve_flight_airport_coords,
)


class ItineraryItemsMixin(TripServiceBase):
    """Mutations on ItineraryItems including choice groups and reordering."""

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
        slots = group_existing_slots(existing_items)
        insert_idx = compute_chronological_insert_index(slots, new_start_time)
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
        elif (parsed_start := parse_start_time(payload.start_time)) is not None:
            sort_order = await self._resolve_chronological_sort_order(
                option.id, parsed_start
            )
        else:
            sort_order = max((i.sort_order for i in option.items), default=-1) + 1

        enriched_details = enrich_flight_details(payload.type.value, payload.details)
        lat = payload.latitude
        lng = payload.longitude
        if payload.type.value == ItemType.FLIGHT.value and (lat is None or lng is None):
            home_country = await self._user_home_country(user_id)
            lat, lng = resolve_flight_airport_coords(
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
        option = require_found(
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
        return require_found(
            await self.repo.get_option_for_user(
                option.id, user_id, populate_existing=True
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
                or norm_iata(new_details.get("origin_iata"))
                != norm_iata(item.details.get("origin_iata"))
                or norm_iata(new_details.get("dest_iata"))
                != norm_iata(item.details.get("dest_iata"))
            )
            updates["details"] = enrich_flight_details(
                next_type, new_details, recompute_distance=iata_changed
            )
            if (
                iata_changed
                and "latitude" not in updates
                and "longitude" not in updates
            ):
                home_country = await self._user_home_country(user_id)
                lat, lng = resolve_flight_airport_coords(
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
        return require_found(
            await self.repo.get_option_for_user(
                option_id, user_id, populate_existing=True
            ),
            "Day option not found",
        )

    async def move_item(
        self, item_id: str, user_id: str, payload: ItineraryItemMoveRequest
    ) -> ItineraryItem:
        """Move an item to another day option, syncing expenses and routes."""
        item = await self.repo.get_item_for_user(item_id, user_id)
        if item is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Itinerary item not found"
            )
        target_option = await self.repo.get_option_for_user(
            payload.target_option_id, user_id
        )
        if target_option is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Day option not found"
            )

        source_row = (
            await self.db.execute(
                select(TripDay.trip_id, TripDay.day_index, TripDay.id)
                .join(DayOption, DayOption.trip_day_id == TripDay.id)
                .where(DayOption.id == item.day_option_id)
            )
        ).first()
        target_row = (
            await self.db.execute(
                select(TripDay.trip_id, TripDay.day_index, TripDay.id)
                .join(DayOption, DayOption.trip_day_id == TripDay.id)
                .where(DayOption.id == target_option.id)
            )
        ).first()
        if source_row is None or target_row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Trip day not found"
            )

        source_trip_id, source_day_index, source_day_id = (
            str(source_row[0]),
            int(source_row[1]),
            str(source_row[2]),
        )
        target_trip_id, target_day_index, target_day_id = (
            str(target_row[0]),
            int(target_row[1]),
            str(target_row[2]),
        )
        if source_trip_id != target_trip_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot move item across different trips",
            )

        source_option_id = item.day_option_id
        has_coords = item.latitude is not None and item.longitude is not None
        is_stay = item.type == ItemType.STAY.value

        if source_option_id == target_option.id:
            if payload.sort_order is None or payload.sort_order == item.sort_order:
                return item
            item.sort_order = payload.sort_order
            await self.db.commit()
            if item.is_selected and has_coords:
                await self._sync_routes_after_commit(
                    source_trip_id,
                    user_id,
                    [target_option.id],
                    cascade_after_day_index=target_day_index if is_stay else None,
                    invalidate_item_ids={item.id},
                )
            await self.db.refresh(item)
            return item

        was_group_id = item.choice_group_id
        was_selected = item.is_selected
        promoted_is_stay = False
        promoted_has_coords = False

        if was_group_id and was_selected:
            source_option = await self.repo.get_option_for_user(
                source_option_id, user_id
            )
            if source_option is not None:
                siblings = [
                    i
                    for i in source_option.items
                    if i.id != item.id and i.choice_group_id == was_group_id
                ]
                if siblings and not any(s.is_selected for s in siblings):
                    siblings[0].is_selected = True
                    promoted_is_stay = siblings[0].type == ItemType.STAY.value
                    promoted_has_coords = (
                        siblings[0].latitude is not None
                        and siblings[0].longitude is not None
                    )

        if payload.sort_order is not None:
            target_sort_order = payload.sort_order
        elif (parsed_start := parse_start_time(item.start_time)) is not None:
            target_sort_order = await self._resolve_chronological_sort_order(
                target_option.id, parsed_start
            )
        else:
            target_sort_order = (
                max((i.sort_order for i in target_option.items), default=-1) + 1
            )

        await self._delete_item_route_segments([item.id])
        item.day_option_id = target_option.id
        item.sort_order = target_sort_order
        item.choice_group_id = None
        item.is_selected = True

        if source_day_id != target_day_id:
            await self.db.execute(
                update(Expense)
                .where(Expense.itinerary_item_id == item.id)
                .values(trip_day_id=target_day_id)
            )

        await self.db.commit()

        options_to_sync: list[str] = []
        if (has_coords and was_selected) or promoted_has_coords:
            options_to_sync.append(source_option_id)
        if has_coords:
            options_to_sync.append(target_option.id)

        cascade_after: int | None = None
        if is_stay:
            cascade_after = min(source_day_index, target_day_index)
        elif promoted_is_stay:
            cascade_after = source_day_index

        if options_to_sync or cascade_after is not None:
            await self._sync_routes_after_commit(
                source_trip_id,
                user_id,
                options_to_sync,
                cascade_after_day_index=cascade_after,
                invalidate_item_ids={item.id},
            )
        await self.db.refresh(item)
        return item
