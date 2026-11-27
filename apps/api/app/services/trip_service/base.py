"""Shared repository/DB base utilities and post-commit route recalculation."""

from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    DayOption,
    Expense,
    ItemType,
    ItineraryItem,
    RouteSegment,
    TripDay,
    User,
)
from app.repositories.trip_repository import TripRepository
from app.services.routing import (
    OptionRoutePlan,
    RoutingProvider,
    apply_option_route_plan,
    build_option_route_plan,
    compute_missing_route_legs,
)


class TripServiceBase:
    """Shared session, repository, and post-commit route synchronization logic."""

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
