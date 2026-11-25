"""Domain enumerations shared across ORM models and Pydantic schemas."""

from enum import StrEnum


class TripStatus(StrEnum):
    """Lifecycle status of a trip."""

    PLANNING = "PLANNING"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    ARCHIVED = "ARCHIVED"


class ItemType(StrEnum):
    """Discriminated itinerary item types supporting the split transit model."""

    FLIGHT = "FLIGHT"
    RESERVED_TRANSIT = "RESERVED_TRANSIT"
    LOCAL_TRANSIT = "LOCAL_TRANSIT"
    STAY = "STAY"
    SPOT = "SPOT"
    FOOD = "FOOD"


class RouteProfile(StrEnum):
    """Routing profile used for cached ground distance segments."""

    DRIVING = "driving"
    FOOT = "foot"
    CYCLING = "cycling"
    RAIL_APPROX = "rail_approx"


class ExpenseCategory(StrEnum):
    """Actual trip spending categories."""

    FLIGHT = "FLIGHT"
    LODGING = "LODGING"
    TRANSIT = "TRANSIT"
    FOOD = "FOOD"
    ACTIVITY = "ACTIVITY"
    SHOPPING = "SHOPPING"
    OTHER = "OTHER"


class UserRole(StrEnum):
    """Account access role controlling invite gate and admin console privileges."""

    OWNER = "OWNER"
    ADMIN = "ADMIN"
    FRIEND = "FRIEND"
    USER = "USER"
