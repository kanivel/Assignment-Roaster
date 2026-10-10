"""Leaderboard: public ranking (best desc, avg desc, earliest created_at asc) and /me."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.submission import SubmissionStatus
from app.models.user import User
from app.services import leaderboard_service
from tests.conftest import API, auth_headers, create_review, create_submission, create_user

LEADERBOARD = f"{API}/leaderboard/"
T0 = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _seed_scores(db: Session, user: User, scores: list[int], start: datetime = T0) -> None:
    """Create one done+reviewed submission per score, spaced one minute apart from ``start``."""
    for index, score in enumerate(scores):
        submission = create_submission(
            db, user, repo=f"repo{index}", created_at=start + timedelta(minutes=index)
        )
        create_review(db, submission, score=score)


def test_leaderboard_is_public_and_ranks_best_then_average(client: TestClient, db: Session) -> None:
    a = create_user(db, "a@example.com", full_name="Ann", avatar_url="https://pic/a")
    b = create_user(db, "b@example.com", full_name="Bob")
    c = create_user(db, "c@example.com")
    _seed_scores(db, a, [9, 7])
    _seed_scores(db, b, [9, 9])
    _seed_scores(db, c, [4])

    response = client.get(LEADERBOARD)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3 and body["limit"] == 20 and body["offset"] == 0
    assert [item["user_id"] for item in body["items"]] == [b.id, a.id, c.id]
    assert [item["rank"] for item in body["items"]] == [1, 2, 3]

    first = body["items"][0]
    assert first["best_score"] == 9 and first["average_score"] == 9.0
    assert first["submissions_count"] == 2 and first["full_name"] == "Bob"
    second = body["items"][1]
    assert second["best_score"] == 9 and second["average_score"] == 8.0
    assert second["avatar_url"] == "https://pic/a"
    assert second["last_submission_at"]
    assert body["items"][2]["best_score"] == 4 and body["items"][2]["submissions_count"] == 1


def test_leaderboard_tie_break_prefers_earliest_submission(client: TestClient, db: Session) -> None:
    late = create_user(db, "late@example.com")
    early = create_user(db, "early@example.com")
    _seed_scores(db, late, [8, 8], start=T0 + timedelta(days=1))
    _seed_scores(db, early, [8, 8], start=T0)

    items = client.get(LEADERBOARD).json()["items"]
    assert [item["user_id"] for item in items] == [early.id, late.id]
    assert [item["rank"] for item in items] == [1, 2]


def test_leaderboard_full_ties_share_rank_and_order_by_user_id(
    client: TestClient, db: Session
) -> None:
    one = create_user(db, "one@example.com")
    two = create_user(db, "two@example.com")
    _seed_scores(db, two, [6])
    _seed_scores(db, one, [6])

    items = client.get(LEADERBOARD).json()["items"]
    assert [item["user_id"] for item in items] == [one.id, two.id]
    assert [item["rank"] for item in items] == [1, 1]


def test_leaderboard_counts_only_done_submissions(client: TestClient, db: Session) -> None:
    user = create_user(db, "u@example.com")
    _seed_scores(db, user, [5])
    removed = create_submission(db, user, repo="removed", created_at=T0 + timedelta(hours=1))
    create_review(db, removed, score=10)
    removed.status = SubmissionStatus.failed  # a review that is no longer "done" must not count
    create_submission(db, user, repo="pending", status=SubmissionStatus.pending)
    create_submission(db, user, repo="reviewing", status=SubmissionStatus.reviewing)
    db.commit()

    items = client.get(LEADERBOARD).json()["items"]
    assert len(items) == 1
    assert items[0]["best_score"] == 5
    assert items[0]["average_score"] == 5.0
    assert items[0]["submissions_count"] == 1


def test_leaderboard_excludes_users_without_a_done_review(client: TestClient, db: Session) -> None:
    create_user(db, "nothing@example.com")
    pending_only = create_user(db, "pending@example.com")
    create_submission(db, pending_only, status=SubmissionStatus.pending)
    failed_only = create_user(db, "failed@example.com")
    create_submission(db, failed_only, status=SubmissionStatus.failed, error_message="x")
    ranked = create_user(db, "ranked@example.com")
    _seed_scores(db, ranked, [3])

    body = client.get(LEADERBOARD).json()
    assert body["total"] == 1
    assert [item["user_id"] for item in body["items"]] == [ranked.id]


def test_leaderboard_empty(client: TestClient, db: Session) -> None:
    assert client.get(LEADERBOARD).json() == {"items": [], "total": 0, "limit": 20, "offset": 0}


def test_leaderboard_pagination_and_validation(client: TestClient, db: Session) -> None:
    users = [create_user(db, f"u{i}@example.com") for i in range(5)]
    for index, user in enumerate(users):
        _seed_scores(db, user, [10 - index])

    page = client.get(LEADERBOARD, params={"limit": 2, "offset": 0}).json()
    assert page["total"] == 5 and page["limit"] == 2 and page["offset"] == 0
    assert [item["rank"] for item in page["items"]] == [1, 2]
    assert [item["user_id"] for item in page["items"]] == [users[0].id, users[1].id]

    page = client.get(LEADERBOARD, params={"limit": 2, "offset": 4}).json()
    assert [item["rank"] for item in page["items"]] == [5]
    assert page["total"] == 5

    assert client.get(LEADERBOARD, params={"limit": 101}).status_code == 422
    assert client.get(LEADERBOARD, params={"limit": 0}).status_code == 422
    assert client.get(LEADERBOARD, params={"offset": -1}).status_code == 422


def test_my_rank_for_ranked_user(client: TestClient, db: Session) -> None:
    top = create_user(db, "top@example.com")
    me = create_user(db, "me@example.com")
    _seed_scores(db, top, [10])
    _seed_scores(db, me, [9, 7, 4])

    response = client.get(f"{LEADERBOARD}me", headers=auth_headers(me))
    assert response.status_code == 200
    assert response.json() == {
        "rank": 2,
        "best_score": 9,
        "average_score": 6.67,
        "submissions_count": 3,
    }


def test_my_rank_for_unranked_user(client: TestClient, user: User, db: Session) -> None:
    create_submission(db, user, status=SubmissionStatus.pending)
    response = client.get(f"{LEADERBOARD}me", headers=auth_headers(user))
    assert response.status_code == 200
    assert response.json() == {
        "rank": None,
        "best_score": None,
        "average_score": None,
        "submissions_count": 0,
    }


def test_my_rank_requires_auth(client: TestClient, db: Session) -> None:
    assert client.get(f"{LEADERBOARD}me").status_code == 401


def test_round_average_normalises_decimal_and_float() -> None:
    from decimal import Decimal

    assert leaderboard_service._round_average(Decimal("6.666666")) == 6.67
    assert leaderboard_service._round_average(8) == 8.0
