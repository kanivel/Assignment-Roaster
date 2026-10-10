"""Submission model and status enum."""

from __future__ import annotations

import enum
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.review import Review
    from app.models.user import User


class SubmissionStatus(enum.StrEnum):
    pending = "pending"
    reviewing = "reviewing"
    done = "done"
    failed = "failed"


class Submission(Base, TimestampMixin):
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    github_url: Mapped[str] = mapped_column(String(500), nullable=False)
    repo_owner: Mapped[str] = mapped_column(String(100), nullable=False)
    repo_name: Mapped[str] = mapped_column(String(100), nullable=False)
    default_branch: Mapped[str] = mapped_column(String(255), nullable=False)
    commit_sha: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[SubmissionStatus] = mapped_column(
        Enum(SubmissionStatus, name="submission_status"),
        default=SubmissionStatus.pending,
        nullable=False,
        index=True,
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship("User", back_populates="submissions")
    review: Mapped[Review | None] = relationship(
        "Review", back_populates="submission", uselist=False, cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_submissions_user_id_created_at", "user_id", "created_at"),)

    def __repr__(self) -> str:
        repo = f"{self.repo_owner}/{self.repo_name}"
        return f"<Submission id={self.id} repo={repo} status={self.status}>"
