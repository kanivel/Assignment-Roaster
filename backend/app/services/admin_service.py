"""Admin operations: user management, submission oversight, review moderation, stats."""

from __future__ import annotations

import logging

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, selectinload

from app.exceptions import BadRequestError, NotFoundError
from app.models.review import Review
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.schemas.admin import AdminStats, AdminUserUpdate

logger = logging.getLogger(__name__)

REVIEW_REMOVED_MESSAGE = "Review removed by admin"


def list_users(
    db: Session, search: str | None, limit: int, offset: int
) -> tuple[list[tuple[User, int]], int]:
    """List users (newest first) with their submission counts.

    Args:
        db: Database session.
        search: Optional case-insensitive substring matched against ``email``.
        limit: Page size.
        offset: Rows to skip.

    Returns:
        ``([(user, submissions_count), ...], total)``.
    """
    counts = (
        select(Submission.user_id, func.count(Submission.id).label("submissions_count"))
        .group_by(Submission.user_id)
        .subquery("submission_counts")
    )
    base = select(User).select_from(User)
    if search:
        base = base.where(User.email.ilike(f"%{search.strip()}%"))

    total = int(db.scalar(select(func.count()).select_from(base.subquery())) or 0)
    stmt = (
        base.add_columns(func.coalesce(counts.c.submissions_count, 0).label("submissions_count"))
        .outerjoin(counts, counts.c.user_id == User.id)
        .order_by(User.created_at.desc(), User.id.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = [(user, int(count)) for user, count in db.execute(stmt).all()]
    return rows, total


def update_user(db: Session, admin: User, user_id: int, data: AdminUserUpdate) -> tuple[User, int]:
    """Change a user's ``is_active`` / ``is_admin`` flags.

    Raises:
        NotFoundError: if the user does not exist.
        BadRequestError: if the admin tries to change their own flags.

    Returns:
        ``(user, submissions_count)``.
    """
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User")

    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    if user.id == admin.id:
        for field, value in changes.items():
            if getattr(user, field) != value:
                raise BadRequestError(f"Admins cannot change their own {field}")

    for field, value in changes.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)

    count = int(
        db.scalar(select(func.count(Submission.id)).where(Submission.user_id == user.id)) or 0
    )
    logger.info("Admin %s updated user %s: %s", admin.id, user.id, changes)
    return user, count


def list_submissions(
    db: Session, status: SubmissionStatus | None, limit: int, offset: int
) -> tuple[list[tuple[Submission, str]], int]:
    """List every submission (newest first) with the owner's email.

    Args:
        db: Database session.
        status: Optional status filter.
        limit: Page size.
        offset: Rows to skip.

    Returns:
        ``([(submission, user_email), ...], total)``.
    """
    base = select(Submission)
    if status is not None:
        base = base.where(Submission.status == status)

    total = int(db.scalar(select(func.count()).select_from(base.subquery())) or 0)
    stmt = (
        base.add_columns(User.email)
        .join(User, User.id == Submission.user_id)
        .options(selectinload(Submission.review))
        .order_by(Submission.created_at.desc(), Submission.id.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = [(submission, str(email)) for submission, email in db.execute(stmt).all()]
    return rows, total


def delete_review(db: Session, admin: User, review_id: int) -> None:
    """Remove a review and mark its submission as failed with an explanatory note.

    Raises:
        NotFoundError: if the review does not exist.
    """
    review = db.get(Review, review_id)
    if review is None:
        raise NotFoundError("Review")

    submission = review.submission
    submission.status = SubmissionStatus.failed
    submission.error_message = REVIEW_REMOVED_MESSAGE
    db.delete(review)
    db.commit()
    logger.info(
        "Admin %s deleted review %s; submission %s marked failed",
        admin.id,
        review_id,
        submission.id,
    )


def get_stats(db: Session) -> AdminStats:
    """Platform-wide counters for the admin dashboard."""
    total_users, active_users = db.execute(
        select(
            func.count(User.id),
            func.coalesce(func.sum(case((User.is_active.is_(True), 1), else_=0)), 0),
        )
    ).one()

    status_rows = db.execute(
        select(Submission.status, func.count(Submission.id)).group_by(Submission.status)
    ).all()
    by_status: dict[SubmissionStatus, int] = {status: 0 for status in SubmissionStatus}
    for status, count in status_rows:
        by_status[SubmissionStatus(status)] = int(count)

    total_reviews, input_tokens, output_tokens = db.execute(
        select(
            func.count(Review.id),
            func.coalesce(func.sum(Review.input_tokens), 0),
            func.coalesce(func.sum(Review.output_tokens), 0),
        )
    ).one()

    return AdminStats(
        total_users=int(total_users or 0),
        active_users=int(active_users or 0),
        submissions_by_status=by_status,
        total_reviews=int(total_reviews or 0),
        total_input_tokens=int(input_tokens or 0),
        total_output_tokens=int(output_tokens or 0),
    )
