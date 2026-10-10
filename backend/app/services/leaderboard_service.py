"""Leaderboard: a single aggregated, window-ranked query over users' reviewed submissions.

Ranking rule (CLAUDE.md): best score desc, then average score desc, then earliest
submission ``created_at`` asc. Only submissions with ``status == done`` count, and a
user appears only once they have at least one reviewed submission.

The ranking is expressed as one CTE so both the paginated listing and the
"my rank" lookup share the exact same SQL. Only portable constructs are used so
the statement runs on PostgreSQL and SQLite (>= 3.25 for window functions).
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import CTE, Row, func, select
from sqlalchemy.orm import Session

from app.models.review import Review
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.schemas.leaderboard import LeaderboardEntry, MyRankResponse

logger = logging.getLogger(__name__)


def ranked_users_cte() -> CTE:
    """Build the CTE that aggregates reviews per user and assigns a rank.

    Columns: user_id, full_name, avatar_url, best_score, average_score,
    submissions_count, first_submission_at, last_submission_at, rank.
    """
    best_score = func.max(Review.score)
    average_score = func.avg(Review.score)
    first_submission_at = func.min(Submission.created_at)

    return (
        select(
            User.id.label("user_id"),
            User.full_name.label("full_name"),
            User.avatar_url.label("avatar_url"),
            best_score.label("best_score"),
            average_score.label("average_score"),
            func.count(Review.id).label("submissions_count"),
            first_submission_at.label("first_submission_at"),
            func.max(Submission.created_at).label("last_submission_at"),
            func.rank()
            .over(
                order_by=(
                    best_score.desc(),
                    average_score.desc(),
                    first_submission_at.asc(),
                )
            )
            .label("rank"),
        )
        .select_from(User)
        .join(Submission, Submission.user_id == User.id)
        .join(Review, Review.submission_id == Submission.id)
        .where(Submission.status == SubmissionStatus.done)
        .group_by(User.id, User.full_name, User.avatar_url)
        .cte("ranked_users")
    )


def _round_average(value: Any) -> float:
    """Normalise avg() output (float on SQLite, Decimal on PostgreSQL) to a 2dp float."""
    return round(float(value), 2)


def _row_to_entry(row: Row[Any]) -> LeaderboardEntry:
    """Map a CTE row to a LeaderboardEntry (Core rows, so no from_attributes)."""
    return LeaderboardEntry(
        rank=int(row.rank),
        user_id=int(row.user_id),
        full_name=row.full_name,
        avatar_url=row.avatar_url,
        best_score=int(row.best_score),
        average_score=_round_average(row.average_score),
        submissions_count=int(row.submissions_count),
        last_submission_at=row.last_submission_at,
    )


def get_leaderboard(db: Session, limit: int, offset: int) -> tuple[list[LeaderboardEntry], int]:
    """Return one page of ranked users plus the total number of ranked users.

    Args:
        db: Database session.
        limit: Page size (the router bounds it to 1..100).
        offset: Rows to skip.

    Returns:
        ``(entries, total)`` where ``entries`` is ordered by rank; ties are broken
        by ``user_id`` so pagination is deterministic.
    """
    ranked = ranked_users_cte()
    total = int(db.scalar(select(func.count()).select_from(ranked)) or 0)
    stmt = (
        select(ranked)
        .order_by(ranked.c.rank.asc(), ranked.c.user_id.asc())
        .limit(limit)
        .offset(offset)
    )
    rows = db.execute(stmt).all()
    logger.debug(
        "Leaderboard page limit=%s offset=%s -> %s/%s rows", limit, offset, len(rows), total
    )
    return [_row_to_entry(row) for row in rows], total


def get_my_rank(db: Session, user_id: int) -> MyRankResponse:
    """Return the ranking row for ``user_id``, or an unranked response if none exists."""
    ranked = ranked_users_cte()
    row = db.execute(select(ranked).where(ranked.c.user_id == user_id)).one_or_none()
    if row is None:
        logger.debug("User %s is not on the leaderboard yet", user_id)
        return MyRankResponse(rank=None, best_score=None, average_score=None, submissions_count=0)
    return MyRankResponse(
        rank=int(row.rank),
        best_score=int(row.best_score),
        average_score=_round_average(row.average_score),
        submissions_count=int(row.submissions_count),
    )
