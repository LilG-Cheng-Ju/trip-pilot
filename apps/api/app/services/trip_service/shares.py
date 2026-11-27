"""Read-only trip sharing links and privacy-filtered public trip projection."""

import secrets
from datetime import UTC, datetime

from fastapi import HTTPException, status

from app.models import TripShare
from app.schemas.trip import (
    DayOptionResponse,
    ItineraryItemResponse,
    PublicTripResponse,
    ShareVisibilityPolicy,
    TripDayResponse,
    TripShareCreate,
    sanitize_item_for_share,
)
from app.services.trip_service.days import TripDaysMixin


class TripSharesMixin(TripDaysMixin):
    """Share-link lifecycle and sanitized public itinerary projection."""

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
