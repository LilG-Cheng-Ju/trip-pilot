"""add_fk_indexes

Revision ID: 0002_add_fk_indexes
Revises: 0001_initial
Create Date: 2026-11-24 15:25:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002_add_fk_indexes"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        op.f("ix_trip_days_active_option_id"),
        "trip_days",
        ["active_option_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_route_segments_from_item_id"),
        "route_segments",
        ["from_item_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_route_segments_to_item_id"),
        "route_segments",
        ["to_item_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_expenses_trip_day_id"),
        "expenses",
        ["trip_day_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_expenses_itinerary_item_id"),
        "expenses",
        ["itinerary_item_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_expenses_itinerary_item_id"), table_name="expenses")
    op.drop_index(op.f("ix_expenses_trip_day_id"), table_name="expenses")
    op.drop_index(op.f("ix_route_segments_to_item_id"), table_name="route_segments")
    op.drop_index(op.f("ix_route_segments_from_item_id"), table_name="route_segments")
    op.drop_index(op.f("ix_trip_days_active_option_id"), table_name="trip_days")
