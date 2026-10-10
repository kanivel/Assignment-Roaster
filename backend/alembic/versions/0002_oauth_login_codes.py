"""Add oauth_login_codes (single-use codes exchanged for tokens after Google OAuth)

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-10 12:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "oauth_login_codes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_oauth_login_codes_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_oauth_login_codes")),
        sa.UniqueConstraint("code_hash", name=op.f("uq_oauth_login_codes_code_hash")),
    )
    op.create_index(op.f("ix_oauth_login_codes_id"), "oauth_login_codes", ["id"], unique=False)
    op.create_index(
        op.f("ix_oauth_login_codes_user_id"), "oauth_login_codes", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_oauth_login_codes_user_id"), table_name="oauth_login_codes")
    op.drop_index(op.f("ix_oauth_login_codes_id"), table_name="oauth_login_codes")
    op.drop_table("oauth_login_codes")
