"""Initial schema: users, refresh_tokens, submissions, reviews

Revision ID: 0001
Revises:
Create Date: 2026-10-10 00:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SUBMISSION_STATUS_VALUES = ("pending", "reviewing", "done", "failed")

# create_type=False: the enum is created explicitly in upgrade() and dropped in
# downgrade() so the column definition never tries to create it a second time.
submission_status = postgresql.ENUM(
    *SUBMISSION_STATUS_VALUES, name="submission_status", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    postgresql.ENUM(*SUBMISSION_STATUS_VALUES, name="submission_status").create(
        bind, checkfirst=True
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=True),
        sa.Column("full_name", sa.String(length=100), nullable=True),
        sa.Column("avatar_url", sa.String(length=500), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("oauth_provider", sa.String(length=50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token", sa.String(length=512), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_refresh_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refresh_tokens")),
        sa.UniqueConstraint("token", name=op.f("uq_refresh_tokens_token")),
    )
    op.create_index(op.f("ix_refresh_tokens_id"), "refresh_tokens", ["id"], unique=False)
    op.create_index(
        op.f("ix_refresh_tokens_user_id"), "refresh_tokens", ["user_id"], unique=False
    )

    op.create_table(
        "submissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("github_url", sa.String(length=500), nullable=False),
        sa.Column("repo_owner", sa.String(length=100), nullable=False),
        sa.Column("repo_name", sa.String(length=100), nullable=False),
        sa.Column("default_branch", sa.String(length=255), nullable=False),
        sa.Column("commit_sha", sa.String(length=40), nullable=False),
        sa.Column(
            "status",
            submission_status,
            nullable=False,
            server_default="pending",
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_submissions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_submissions")),
    )
    op.create_index(op.f("ix_submissions_id"), "submissions", ["id"], unique=False)
    op.create_index(op.f("ix_submissions_user_id"), "submissions", ["user_id"], unique=False)
    op.create_index(op.f("ix_submissions_status"), "submissions", ["status"], unique=False)
    op.create_index(
        "ix_submissions_user_id_created_at",
        "submissions",
        ["user_id", "created_at"],
        unique=False,
    )

    op.create_table(
        "reviews",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("submission_id", sa.Integer(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("roast_text", sa.Text(), nullable=False),
        sa.Column("strengths", sa.JSON(), nullable=False),
        sa.Column("improvements", sa.JSON(), nullable=False),
        sa.Column("summary", sa.String(length=1000), nullable=False),
        sa.Column("model_used", sa.String(length=100), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("score >= 0 AND score <= 10", name="ck_reviews_score_range"),
        sa.ForeignKeyConstraint(
            ["submission_id"],
            ["submissions.id"],
            name=op.f("fk_reviews_submission_id_submissions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reviews")),
        sa.UniqueConstraint("submission_id", name=op.f("uq_reviews_submission_id")),
    )
    op.create_index(op.f("ix_reviews_id"), "reviews", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_reviews_id"), table_name="reviews")
    op.drop_table("reviews")

    op.drop_index("ix_submissions_user_id_created_at", table_name="submissions")
    op.drop_index(op.f("ix_submissions_status"), table_name="submissions")
    op.drop_index(op.f("ix_submissions_user_id"), table_name="submissions")
    op.drop_index(op.f("ix_submissions_id"), table_name="submissions")
    op.drop_table("submissions")

    op.drop_index(op.f("ix_refresh_tokens_user_id"), table_name="refresh_tokens")
    op.drop_index(op.f("ix_refresh_tokens_id"), table_name="refresh_tokens")
    op.drop_table("refresh_tokens")

    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_table("users")

    postgresql.ENUM(name="submission_status").drop(op.get_bind(), checkfirst=True)
