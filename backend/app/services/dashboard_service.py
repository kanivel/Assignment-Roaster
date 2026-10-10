"""Per-user dashboard statistics."""

from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.review import Review
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.schemas.dashboard import DashboardStats
from app.schemas.submission import SubmissionResponse

logger = logging.getLogger(__name__)


def get_stats(db: Session, user: User) -> DashboardStats:
    """Aggregate the current user's submissions into dashboard counters.

    Three statements: counts grouped by status, score aggregates over done
    submissions' reviews, and the latest submission with its review.
    """
    status_rows = db.execute(
        select(Submission.status, func.count(Submission.id))
        .where(Submission.user_id == user.id)
        .group_by(Submission.status)
    ).all()
    by_status: dict[SubmissionStatus, int] = {
        SubmissionStatus(status): int(count) for status, count in status_rows
    }
    total = sum(by_status.values())
    done = by_status.get(SubmissionStatus.done, 0)
    failed = by_status.get(SubmissionStatus.failed, 0)
    pending = by_status.get(SubmissionStatus.pending, 0) + by_status.get(
        SubmissionStatus.reviewing, 0
    )

    score_row = db.execute(
        select(func.avg(Review.score), func.max(Review.score))
        .select_from(Review)
        .join(Submission, Submission.id == Review.submission_id)
        .where(Submission.user_id == user.id, Submission.status == SubmissionStatus.done)
    ).one()
    avg_score, best_score = score_row
    average_score = round(float(avg_score), 2) if avg_score is not None else None

    latest = db.scalar(
        select(Submission)
        .options(selectinload(Submission.review))
        .where(Submission.user_id == user.id)
        .order_by(Submission.created_at.desc(), Submission.id.desc())
        .limit(1)
    )

    logger.debug("Dashboard stats for user %s: total=%s done=%s", user.id, total, done)
    return DashboardStats(
        total_submissions=total,
        done_count=done,
        failed_count=failed,
        pending_count=pending,
        average_score=average_score,
        best_score=int(best_score) if best_score is not None else None,
        latest_submission=SubmissionResponse.model_validate(latest) if latest else None,
    )
