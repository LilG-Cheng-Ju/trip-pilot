"""drop_unused_airports_table

Revision ID: 0003_drop_unused_airports_table
Revises: 0002_add_fk_indexes
Create Date: 2026-11-24 20:40:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_drop_unused_airports_table"
down_revision: str | None = "0002_add_fk_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("airports"):
        index_names = {ix["name"] for ix in inspector.get_indexes("airports")}
        ix_name = op.f("ix_airports_country_code")
        if ix_name in index_names:
            op.drop_index(ix_name, table_name="airports")
        op.drop_table("airports")


def downgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table("airports"):
        op.create_table(
            "airports",
            sa.Column("iata", sa.String(length=3), nullable=False),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("city", sa.String(length=120), nullable=False),
            sa.Column("country_code", sa.String(length=2), nullable=False),
            sa.Column("latitude", sa.Float(), nullable=False),
            sa.Column("longitude", sa.Float(), nullable=False),
            sa.Column("timezone", sa.String(length=64), nullable=False),
            sa.PrimaryKeyConstraint("iata", name=op.f("pk_airports")),
        )
        with op.batch_alter_table("airports", schema=None) as batch_op:
            batch_op.create_index(
                batch_op.f("ix_airports_country_code"),
                ["country_code"],
                unique=False,
            )
