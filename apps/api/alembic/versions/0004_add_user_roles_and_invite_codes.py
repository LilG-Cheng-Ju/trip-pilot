"""add_user_roles_and_invite_codes

Revision ID: 0004_add_user_roles_and_invite_codes
Revises: 0003_drop_unused_airports_table
Create Date: 2026-11-25 17:15:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_add_user_roles_and_invite_codes"
down_revision: str | None = "0003_drop_unused_airports_table"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    user_cols = {col["name"] for col in inspector.get_columns("users")}
    user_indexes = {ix["name"] for ix in inspector.get_indexes("users")}

    with op.batch_alter_table("users", schema=None) as batch_op:
        if "role" not in user_cols:
            batch_op.add_column(
                sa.Column(
                    "role",
                    sa.String(length=16),
                    nullable=False,
                    server_default="USER",
                )
            )
        if "is_active" not in user_cols:
            batch_op.add_column(
                sa.Column(
                    "is_active",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.true(),
                )
            )
        if "last_login_at" not in user_cols:
            batch_op.add_column(
                sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True)
            )
        if op.f("ix_users_role") not in user_indexes:
            batch_op.create_index(op.f("ix_users_role"), ["role"], unique=False)

    if not inspector.has_table("invite_codes"):
        op.create_table(
            "invite_codes",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("code", sa.String(length=32), nullable=False),
            sa.Column("note", sa.String(length=160), nullable=True),
            sa.Column("created_by_user_id", sa.String(length=36), nullable=True),
            sa.Column(
                "is_used",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
            sa.Column("used_by_user_id", sa.String(length=36), nullable=True),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["created_by_user_id"],
                ["users.id"],
                name=op.f("fk_invite_codes_created_by_user_id_users"),
                ondelete="SET NULL",
            ),
            sa.ForeignKeyConstraint(
                ["used_by_user_id"],
                ["users.id"],
                name=op.f("fk_invite_codes_used_by_user_id_users"),
                ondelete="SET NULL",
            ),
            sa.PrimaryKeyConstraint("id", name=op.f("pk_invite_codes")),
        )
        with op.batch_alter_table("invite_codes", schema=None) as batch_op:
            batch_op.create_index(
                batch_op.f("ix_invite_codes_code"), ["code"], unique=True
            )
            batch_op.create_index(
                batch_op.f("ix_invite_codes_created_by_user_id"),
                ["created_by_user_id"],
                unique=False,
            )
            batch_op.create_index(
                batch_op.f("ix_invite_codes_used_by_user_id"),
                ["used_by_user_id"],
                unique=False,
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("invite_codes"):
        ix_names = {ix["name"] for ix in inspector.get_indexes("invite_codes")}
        with op.batch_alter_table("invite_codes", schema=None) as batch_op:
            for ix_name in (
                op.f("ix_invite_codes_used_by_user_id"),
                op.f("ix_invite_codes_created_by_user_id"),
                op.f("ix_invite_codes_code"),
            ):
                if ix_name in ix_names:
                    batch_op.drop_index(ix_name)
        op.drop_table("invite_codes")

    user_cols = {col["name"] for col in inspector.get_columns("users")}
    user_indexes = {ix["name"] for ix in inspector.get_indexes("users")}
    with op.batch_alter_table("users", schema=None) as batch_op:
        if op.f("ix_users_role") in user_indexes:
            batch_op.drop_index(op.f("ix_users_role"))
        for col_name in ("last_login_at", "is_active", "role"):
            if col_name in user_cols:
                batch_op.drop_column(col_name)
