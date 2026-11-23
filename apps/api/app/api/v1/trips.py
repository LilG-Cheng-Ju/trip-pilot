"""Authenticated REST routes for Trips, DayOptions, Items, and Share Links."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import AuthContext, require_scope
from app.core.database import get_db
from app.models.enums import TripStatus
from app.schemas.trip import (
    ActiveOptionUpdate,
    DayOptionCloneRequest,
    DayOptionCreate,
    DayOptionResponse,
    DayOptionUpdate,
    ItineraryItemCreate,
    ItineraryItemReorderRequest,
    ItineraryItemResponse,
    ItineraryItemUpdate,
    TripCreate,
    TripDayResponse,
    TripDayUpdate,
    TripDetailResponse,
    TripShareCreate,
    TripShareResponse,
    TripSummaryResponse,
    TripUpdate,
)
from app.services.trip_service import TripService

router = APIRouter(tags=["trips"])

ReadTripsAuth = Annotated[AuthContext, Depends(require_scope("trips:read"))]
WriteTripsAuth = Annotated[AuthContext, Depends(require_scope("trips:write"))]
DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("/trips", response_model=list[TripSummaryResponse])
async def list_trips(
    auth_ctx: ReadTripsAuth,
    db: DbSession,
    trip_status: Annotated[TripStatus | None, Query(alias="status")] = None,
) -> list[TripSummaryResponse]:
    trips = await TripService(db).list_trips(
        auth_ctx.user.id, trip_status.value if trip_status else None
    )
    return [TripSummaryResponse.model_validate(t) for t in trips]


@router.post(
    "/trips",
    response_model=TripDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_trip(
    payload: TripCreate,
    auth_ctx: WriteTripsAuth,
    db: DbSession,
) -> TripDetailResponse:
    trip = await TripService(db).create_trip(auth_ctx.user.id, payload)
    return TripDetailResponse.model_validate(trip)


@router.get("/trips/{trip_id}", response_model=TripDetailResponse)
async def get_trip(
    trip_id: str,
    auth_ctx: ReadTripsAuth,
    db: DbSession,
) -> TripDetailResponse:
    trip = await TripService(db).get_trip_detail(trip_id, auth_ctx.user.id)
    return TripDetailResponse.model_validate(trip)


@router.patch("/trips/{trip_id}", response_model=TripDetailResponse)
async def update_trip(
    trip_id: str,
    payload: TripUpdate,
    auth_ctx: WriteTripsAuth,
    db: DbSession,
) -> TripDetailResponse:
    trip = await TripService(db).update_trip(trip_id, auth_ctx.user.id, payload)
    return TripDetailResponse.model_validate(trip)


@router.delete("/trips/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trip(
    trip_id: str,
    auth_ctx: WriteTripsAuth,
    db: DbSession,
) -> None:
    await TripService(db).delete_trip(trip_id, auth_ctx.user.id)


@router.post(
    "/trips/{trip_id}/days",
    response_model=TripDayResponse,
    status_code=status.HTTP_201_CREATED,
)
async def append_day(
    trip_id: str,
    auth_ctx: WriteTripsAuth,
    db: DbSession,
) -> TripDayResponse:
    day = await TripService(db).append_day(trip_id, auth_ctx.user.id)
    return TripDayResponse.model_validate(day)


@router.post(
    "/days/{day_id}/options",
    response_model=DayOptionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_day_option(
    day_id: str,
    payload: DayOptionCreate,
    auth_ctx: WriteTripsAuth,
    db: DbSession,
) -> DayOptionResponse:
    option = await TripService(db).add_day_option(day_id, auth_ctx.user.id, payload)
    return DayOptionResponse.model_validate(option)


@router.post(
    "/options/{option_id}/clone",
    response_model=DayOptionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def clone_day_option(
    option_id: str,
    payload: DayOptionCloneRequest,
    auth_ctx: WriteTripsAuth,
    db: DbSession,
) -> DayOptionResponse:
    option = await TripService(db).clone_day_option(
        option_id, auth_ctx.user.id, payload
    )
    return DayOptionResponse.model_validate(option)


@router.patch("/options/{option_id}", response_model=DayOptionResponse)
async def update_day_option(
    option_id: str,
    payload: DayOptionUpdate,
    auth_ctx: WriteTripsAuth,
    db: DbSession,
) -> DayOptionResponse:
    option = await TripService(db).update_day_option(
        option_id, auth_ctx.user.id, payload
    )
    return DayOptionResponse.model_validate(option)


@router.delete("/options/{option_id}", response_model=TripDayResponse)
async def delete_day_option(
    option_id: str,
    auth_ctx: WriteTripsAuth,
    db: DbSession,
) -> TripDayResponse:
    day = await TripService(db).delete_day_option(option_id, auth_ctx.user.id)
    return TripDayResponse.model_validate(day)


@router.patch("/days/{day_id}", response_model=TripDayResponse)
async def update_day(
    day_id: str,
    payload: TripDayUpdate,
    auth_ctx: WriteTripsAuth,
    db: DbSession,
) -> TripDayResponse:
    day = await TripService(db).update_day(day_id, auth_ctx.user.id, payload)
    return TripDayResponse.model_validate(day)


@router.patch("/days/{day_id}/active-option", response_model=TripDayResponse)
async def set_active_option(
    day_id: str,
    payload: ActiveOptionUpdate,
    auth_ctx: WriteTripsAuth,
    db: DbSession,
) -> TripDayResponse:
    day = await TripService(db).set_active_option(
        day_id, auth_ctx.user.id, payload.day_option_id
    )
    return TripDayResponse.model_validate(day)


@router.post(
    "/options/{option_id}/items",
    response_model=ItineraryItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_item(
    option_id: str,
    payload: ItineraryItemCreate,
    auth_ctx: WriteTripsAuth,
    db: DbSession,
) -> ItineraryItemResponse:
    item = await TripService(db).add_item(option_id, auth_ctx.user.id, payload)
    return ItineraryItemResponse.model_validate(item)


@router.patch("/items/{item_id}", response_model=ItineraryItemResponse)
async def update_item(
    item_id: str,
    payload: ItineraryItemUpdate,
    auth_ctx: WriteTripsAuth,
    db: DbSession,
) -> ItineraryItemResponse:
    item = await TripService(db).update_item(item_id, auth_ctx.user.id, payload)
    return ItineraryItemResponse.model_validate(item)


@router.patch("/items/{item_id}/select", response_model=DayOptionResponse)
async def select_choice_item(
    item_id: str,
    auth_ctx: WriteTripsAuth,
    db: DbSession,
) -> DayOptionResponse:
    option = await TripService(db).select_choice_item(item_id, auth_ctx.user.id)
    return DayOptionResponse.model_validate(option)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: str,
    auth_ctx: WriteTripsAuth,
    db: DbSession,
) -> None:
    await TripService(db).delete_item(item_id, auth_ctx.user.id)


@router.post("/options/{option_id}/items/reorder", response_model=DayOptionResponse)
async def reorder_items(
    option_id: str,
    payload: ItineraryItemReorderRequest,
    auth_ctx: WriteTripsAuth,
    db: DbSession,
) -> DayOptionResponse:
    option = await TripService(db).reorder_items(
        option_id, auth_ctx.user.id, payload.item_ids
    )
    return DayOptionResponse.model_validate(option)


@router.post(
    "/options/{option_id}/recalculate-route", response_model=DayOptionResponse
)
async def recalculate_route(
    option_id: str,
    auth_ctx: WriteTripsAuth,
    db: DbSession,
) -> DayOptionResponse:
    option = await TripService(db).recalculate_option_route(
        option_id, auth_ctx.user.id
    )
    return DayOptionResponse.model_validate(option)


@router.get("/trips/{trip_id}/shares", response_model=list[TripShareResponse])
async def list_shares(
    trip_id: str,
    auth_ctx: ReadTripsAuth,
    db: DbSession,
) -> list[TripShareResponse]:
    shares = await TripService(db).list_shares(trip_id, auth_ctx.user.id)
    return [TripShareResponse.model_validate(s) for s in shares]


@router.post(
    "/trips/{trip_id}/shares",
    response_model=TripShareResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_share(
    trip_id: str,
    payload: TripShareCreate,
    auth_ctx: WriteTripsAuth,
    db: DbSession,
) -> TripShareResponse:
    share = await TripService(db).create_share(trip_id, auth_ctx.user.id, payload)
    return TripShareResponse.model_validate(share)


@router.delete(
    "/trips/{trip_id}/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def revoke_share(
    trip_id: str,
    share_id: str,
    auth_ctx: WriteTripsAuth,
    db: DbSession,
) -> None:
    await TripService(db).revoke_share(trip_id, share_id, auth_ctx.user.id)
