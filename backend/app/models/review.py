"""Review model."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.submission import Submission


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    submission_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("submissions.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    roast_text: Mapped[str] = mapped_column(Text, nullable=False)
    strengths: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    improvements: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    summary: Mapped[str] = mapped_column(String(1000), nullable=False)
    model_used: Mapped[str] = mapped_column(String(100), nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    submission: Mapped[Submission] = relationship("Submission", back_populates="review")

    __table_args__ = (
        CheckConstraint("score >= 0 AND score <= 10", name="ck_reviews_score_range"),
    )

    def __repr__(self) -> str:
        return f"<Review id={self.id} submission_id={self.submission_id} score={self.score}>"
