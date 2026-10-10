"""Dashboard stats for the current user."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.submission import SubmissionStatus
from app.models.user import User
from tests.conftest import API, auth_headers, create_review, create_submission

STATS = f"{API}/dashboard/stats"
T0 = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def test_stats_aggregates_counts_scores_and_latest_submission(
    client: TestClient, user: User, other_user: User, db: Session
) -> None:
    scores = [9, 7, 4]
    for index, score in enumerate(scores):
        done = create_submission(
            db, user, repo=f"done{index}", created_at=T0 + timedelta(minutes=index)
        )
        create_review(db, done, score=score)
    create_submission(
        db,
        user,
        repo="failed",
        status=SubmissionStatus.failed,
        error_message="x",
        created_at=T0 + timedelta(minutes=10),
    )
    create_submission(
        db,
        user,
        repo="pending",
        status=SubmissionStatus.pending,
        created_at=T0 + timedelta(minutes=11),
    )
    latest = create_submission(
        db,
        user,
        repo="reviewing",
        status=SubmissionStatus.reviewing,
        created_at=T0 + timedelta(minutes=12),
    )
    # Another user's perfect score must not leak in.
    theirs = create_submission(db, other_user, repo="theirs", created_at=T0 + timedelta(days=1))
    create_review(db, theirs, score=10)

    response = client.get(STATS, headers=auth_headers(user))
    assert response.status_code == 200
    body = response.json()
    assert body["total_submissions"] == 6
    assert body["done_count"] == 3
    assert body["failed_count"] == 1
    assert body["pending_count"] == 2, "pending includes reviewing"
    assert body["average_score"] == 6.67
    assert body["best_score"] == 9
    assert body["latest_submission"]["id"] == latest.id
    assert body["latest_submission"]["status"] == "reviewing"
    assert body["latest_submission"]["review"] is None


def test_stats_latest_submission_includes_nested_review(
    client: TestClient, user: User, db: Session
) -> None:
    older = create_submission(db, user, repo="older", created_at=T0)
    create_review(db, older, score=3)
    newest = create_submission(db, user, repo="newest", created_at=T0 + timedelta(hours=1))
    review = create_review(db, newest, score=8)

    body = client.get(STATS, headers=auth_headers(user)).json()
    assert body["latest_submission"]["id"] == newest.id
    assert body["latest_submission"]["github_url"] == "https://github.com/octo/newest"
    nested = body["latest_submission"]["review"]
    assert nested["id"] == review.id
    assert nested["score"] == 8
    assert nested["roast_text"] == review.roast_text
    assert nested["strengths"] == ["Runs"]
    assert body["average_score"] == 5.5 and body["best_score"] == 8


def test_stats_scores_only_count_done_submissions(
    client: TestClient, user: User, db: Session
) -> None:
    done = create_submission(db, user, repo="done")
    create_review(db, done, score=6)
    removed = create_submission(db, user, repo="removed")
    create_review(db, removed, score=10)
    removed.status = SubmissionStatus.failed
    db.commit()

    body = client.get(STATS, headers=auth_headers(user)).json()
    assert body["done_count"] == 1 and body["failed_count"] == 1
    assert body["average_score"] == 6.0 and body["best_score"] == 6


def test_stats_for_user_without_submissions(
    client: TestClient, user: User, other_user: User, db: Session
) -> None:
    create_review(db, create_submission(db, other_user), score=9)

    body = client.get(STATS, headers=auth_headers(user)).json()
    assert body == {
        "total_submissions": 0,
        "done_count": 0,
        "failed_count": 0,
        "pending_count": 0,
        "average_score": None,
        "best_score": None,
        "latest_submission": None,
    }


def test_stats_with_only_unreviewed_submissions(
    client: TestClient, user: User, db: Session
) -> None:
    create_submission(db, user, status=SubmissionStatus.pending)
    body = client.get(STATS, headers=auth_headers(user)).json()
    assert body["total_submissions"] == 1 and body["pending_count"] == 1
    assert body["average_score"] is None and body["best_score"] is None
    assert body["latest_submission"]["status"] == "pending"


def test_stats_requires_auth(client: TestClient, db: Session) -> None:
    assert client.get(STATS).status_code == 401
