"""Exchange rate lookup endpoint for low-friction multi-currency expenses."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.core.auth import AuthContext, get_auth_context
from app.services.fx_service import get_fx_provider

router = APIRouter(tags=["fx"])
CurrentAuth = Annotated[AuthContext, Depends(get_auth_context)]


class FxRateResponse(BaseModel):
    from_currency: str
    to_currency: str
    rate: float
    source: str
    cached: bool


@router.get("/fx/rate", response_model=FxRateResponse)
async def get_fx_rate(
    _auth_ctx: CurrentAuth,
    from_currency: Annotated[str, Query(alias="from", min_length=3, max_length=3)],
    to_currency: Annotated[str, Query(alias="to", min_length=3, max_length=3)],
) -> FxRateResponse:
    """Return the conversion rate for 1 unit of `from` currency into `to` currency."""
    provider = get_fx_provider()
    rate, source, cached = await provider.get_rate(from_currency, to_currency)
    return FxRateResponse(
        from_currency=from_currency.upper(),
        to_currency=to_currency.upper(),
        rate=rate,
        source=source,
        cached=cached,
    )
