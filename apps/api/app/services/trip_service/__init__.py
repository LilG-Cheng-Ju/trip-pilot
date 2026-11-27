"""Business logic for Trips, multi-option Days (Plan A/B), Items, and Sharing."""

from app.services.trip_service.items import ItineraryItemsMixin
from app.services.trip_service.options import DayOptionsMixin
from app.services.trip_service.shares import TripSharesMixin


class TripService(TripSharesMixin, ItineraryItemsMixin, DayOptionsMixin):
    """Orchestrates trip mutations and enforces domain invariants."""


__all__ = ["TripService"]
