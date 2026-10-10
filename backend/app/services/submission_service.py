"""Business logic for submissions: creation, listing, ownership checks, retry, stale cleanup."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.exceptions import BadRequestError, NotFoundError, RateLimitError
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.schemas.submission import SubmissionCreate, split_github_url
from app.services import github_client

logger = logging.getLogger(__name__)

IN_PROGRESS_STATUSES = (SubmissionStatus.pending, SubmissionStatus.reviewing)
# A review that has shown no progress for this long is considered dead (startup reaper).
STALE_REVIEW_AFTER = timedelta(minutes=15)
# Users may retry an in-progress review themselves once it is this old.
RETRY_IN_PROGRESS_AFTER = timedelta(minutes=10)
INTERRUPTED_MESSAGE = "Review interrupted, please retry"


def _utcnow() -> datetime:
    return datetime.now(UTC)


def last_activity(submission: Submission) -> datetime:
    """Return the submission's last status change as an aware UTC datetime."""
    value = submission.updated_at or submission.created_at
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def count_recent_submissions(db: Session, user_id: int, window: timedelta) -> int:
    """Count a user's submissions created within the last ``window``."""
    since = _utcnow() - window
    stmt = select(func.count(Submission.id)).where(
        Submission.user_id == user_id, Submission.created_at >= since
    )
    return int(db.scalar(stmt) or 0)


async def create_submission(db: Session, user: User, data: SubmissionCreate) -> Submission:
    """Validate the repo via GitHub and create a pending submission.

    Args:
        db: Database session.
        user: Owner of the submission.
        data: Validated payload containing the normalized ``github_url``.

    Returns:
        The new Submission with ``status=pending``. The caller enqueues the review.

    Raises:
        RateLimitError: when the user exceeded ``SUBMISSIONS_PER_HOUR``.
        BadRequestError: when GitHub reports the repo as missing/private.
    """
    recent = count_recent_submissions(db, user.id, timedelta(hours=1))
    if recent >= settings.SUBMISSIONS_PER_HOUR:
        raise RateLimitError(
            f"Submission limit reached ({settings.SUBMISSIONS_PER_HOUR} per hour). "
            "Please try again later."
        )

    owner, repo = split_github_url(data.github_url)
    repo_info = await github_client.get_repo(owner, repo)
    commit_sha = await github_client.get_head_sha(owner, repo, repo_info.default_branch)

    submission = Submission(
        user_id=user.id,
        github_url=data.github_url,
        repo_owner=owner,
        repo_name=repo,
        default_branch=repo_info.default_branch,
        commit_sha=commit_sha,
        status=SubmissionStatus.pending,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)
    logger.info("Submission %s created by user %s for %s/%s", submission.id, user.id, owner, repo)
    return submission


def list_submissions(
    db: Session, user: User, limit: int, offset: int
) -> tuple[list[Submission], int]:
    """Return the user's submissions, newest first, plus the total count."""
    base = select(Submission).where(Submission.user_id == user.id)
    total = int(db.scalar(select(func.count()).select_from(base.subquery())) or 0)
    stmt = (
        base.options(selectinload(Submission.review))
        .order_by(Submission.created_at.desc(), Submission.id.desc())
        .limit(limit)
        .offset(offset)
    )
    items = list(db.scalars(stmt).all())
    return items, total


def get_submission(
    db: Session, user: User, submission_id: int, *, allow_admin: bool = True
) -> Submission:
    """Fetch one submission owned by ``user`` (admins may read any when ``allow_admin``).

    Raises:
        NotFoundError: if it does not exist or belongs to someone else (never 403).
    """
    stmt = (
        select(Submission)
        .options(selectinload(Submission.review))
        .where(Submission.id == submission_id)
    )
    submission = db.scalar(stmt)
    if submission is None:
        raise NotFoundError("Submission")
    if submission.user_id != user.id and not (allow_admin and user.is_admin):
        raise NotFoundError("Submission")
    return submission


def get_submission_for_review(db: Session, user: User, submission_id: int) -> Submission:
    """Fetch a submission for the reviews endpoint: owner or admin may read it."""
    stmt = (
        select(Submission)
        .options(selectinload(Submission.review))
        .where(Submission.id == submission_id)
    )
    submission = db.scalar(stmt)
    if submission is None or (submission.user_id != user.id and not user.is_admin):
        raise NotFoundError("Review")
    return submission


def delete_submission(db: Session, user: User, submission_id: int) -> None:
    """Delete a submission (and its review via cascade). 404 if not owned."""
    submission = get_submission(db, user, submission_id, allow_admin=False)
    db.delete(submission)
    db.commit()
    logger.info("Submission %s deleted by user %s", submission_id, user.id)


def retry_submission(db: Session, user: User, submission_id: int) -> Submission:
    """Reset a failed (or stuck) submission to pending so it can be re-enqueued.

    A ``pending``/``reviewing`` submission may be retried once it has been idle for
    ``RETRY_IN_PROGRESS_AFTER``; this recovers reviews lost to a restart or crash.

    Raises:
        BadRequestError: if the submission is ``done`` or still freshly in progress.
    """
    submission = get_submission(db, user, submission_id, allow_admin=False)
    if submission.status in IN_PROGRESS_STATUSES:
        if _utcnow() - last_activity(submission) < RETRY_IN_PROGRESS_AFTER:
            raise BadRequestError("Review is still in progress, please wait before retrying")
    elif submission.status != SubmissionStatus.failed:
        raise BadRequestError("Only failed submissions can be retried")
    submission.status = SubmissionStatus.pending
    submission.error_message = None
    db.commit()
    db.refresh(submission)
    logger.info("Submission %s re-queued by user %s", submission_id, user.id)
    return submission


def fail_stale_reviews(db: Session, older_than: timedelta = STALE_REVIEW_AFTER) -> int:
    """Mark in-progress submissions idle for longer than ``older_than`` as failed.

    Background reviews are in-process, so a restart or crash leaves rows stuck in
    ``pending``/``reviewing`` forever. Called from the application lifespan at startup.

    Returns:
        The number of submissions marked failed.
    """
    cutoff = _utcnow() - older_than
    stmt = select(Submission).where(Submission.status.in_(IN_PROGRESS_STATUSES))
    stale = [s for s in db.scalars(stmt).all() if last_activity(s) < cutoff]
    for submission in stale:
        submission.status = SubmissionStatus.failed
        submission.error_message = INTERRUPTED_MESSAGE
    if stale:
        db.commit()
        logger.warning("Marked %d stale in-progress submissions as failed", len(stale))
    return len(stale)
