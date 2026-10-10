"""Admin endpoints: users, submissions, review moderation and platform stats."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.review import Review
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.services.admin_service import REVIEW_REMOVED_MESSAGE
from tests.conftest import API, auth_headers, create_review, create_submission, create_user

ADMIN = f"{API}/admin"
T0 = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)

ADMIN_ROUTES: list[tuple[str, str, dict | None]] = [
    ("GET", f"{ADMIN}/users", None),
    ("PUT", f"{ADMIN}/users/1", {"is_active": False}),
    ("GET", f"{ADMIN}/submissions", None),
    ("DELETE", f"{ADMIN}/reviews/1", None),
    ("GET", f"{ADMIN}/stats", None),
]


@pytest.mark.parametrize(("method", "url", "payload"), ADMIN_ROUTES)
def test_every_admin_route_returns_403_for_non_admin(
    client: TestClient, user: User, method: str, url: str, payload: dict | None
) -> None:
    response = client.request(method, url, json=payload, headers=auth_headers(user))
    assert response.status_code == 403
    assert response.json() == {"detail": "Admin privileges required", "code": "FORBIDDEN"}


@pytest.mark.parametrize(("method", "url", "payload"), ADMIN_ROUTES)
def test_every_admin_route_returns_401_without_token(
    client: TestClient, db: Session, method: str, url: str, payload: dict | None
) -> None:
    assert client.request(method, url, json=payload).status_code == 401


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


def test_list_users_newest_first_with_submission_counts(
    client: TestClient, admin: User, db: Session
) -> None:
    ann = create_user(db, "ann@example.com", created_at=T0)
    bob = create_user(db, "bob@example.com", created_at=T0 + timedelta(hours=1))
    for i in range(2):
        create_submission(db, ann, repo=f"r{i}")

    response = client.get(f"{ADMIN}/users", headers=auth_headers(admin))
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3 and body["limit"] == 20 and body["offset"] == 0
    assert [item["id"] for item in body["items"]] == [admin.id, bob.id, ann.id]
    by_id = {item["id"]: item for item in body["items"]}
    assert by_id[ann.id]["submissions_count"] == 2
    assert by_id[bob.id]["submissions_count"] == 0
    assert by_id[admin.id]["is_admin"] is True
    assert "hashed_password" not in by_id[ann.id]
    assert by_id[ann.id]["email"] == "ann@example.com"


def test_list_users_search_is_case_insensitive(
    client: TestClient, admin: User, db: Session
) -> None:
    create_user(db, "Grace.Hopper@navy.mil")
    create_user(db, "linus@kernel.org")

    body = client.get(
        f"{ADMIN}/users", params={"search": "HOPPER"}, headers=auth_headers(admin)
    ).json()
    assert body["total"] == 1
    assert body["items"][0]["email"] == "grace.hopper@navy.mil"

    body = client.get(
        f"{ADMIN}/users", params={"search": "  example.COM "}, headers=auth_headers(admin)
    ).json()
    assert [item["email"] for item in body["items"]] == ["admin@example.com"]

    assert (
        client.get(
            f"{ADMIN}/users", params={"search": "nobody"}, headers=auth_headers(admin)
        ).json()["total"]
        == 0
    )


def test_list_users_pagination(client: TestClient, admin: User, db: Session) -> None:
    for i in range(4):
        create_user(db, f"u{i}@example.com", created_at=T0 + timedelta(minutes=i))
    headers = auth_headers(admin)

    page = client.get(f"{ADMIN}/users", params={"limit": 2, "offset": 0}, headers=headers).json()
    assert page["total"] == 5 and len(page["items"]) == 2 and page["limit"] == 2
    page_two = client.get(
        f"{ADMIN}/users", params={"limit": 2, "offset": 2}, headers=headers
    ).json()
    assert len(page_two["items"]) == 2 and page_two["offset"] == 2
    assert {i["id"] for i in page["items"]}.isdisjoint({i["id"] for i in page_two["items"]})
    last = client.get(f"{ADMIN}/users", params={"limit": 2, "offset": 4}, headers=headers).json()
    assert len(last["items"]) == 1
    assert client.get(f"{ADMIN}/users", params={"limit": 101}, headers=headers).status_code == 422


def test_update_user_flags(client: TestClient, admin: User, user: User, db: Session) -> None:
    create_submission(db, user)
    headers = auth_headers(admin)

    response = client.put(f"{ADMIN}/users/{user.id}", json={"is_active": False}, headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["is_active"] is False and body["is_admin"] is False
    assert body["submissions_count"] == 1

    response = client.put(f"{ADMIN}/users/{user.id}", json={"is_admin": True}, headers=headers)
    assert response.json()["is_admin"] is True
    assert response.json()["is_active"] is False, "omitted fields are untouched"

    db.refresh(user)
    assert user.is_active is False and user.is_admin is True

    # A deactivated user can no longer authenticate.
    assert client.get(f"{API}/auth/me", headers=auth_headers(user)).status_code == 401


def test_update_user_unknown_id_returns_404(client: TestClient, admin: User) -> None:
    response = client.put(
        f"{ADMIN}/users/424242", json={"is_active": False}, headers=auth_headers(admin)
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "User not found"


@pytest.mark.parametrize(
    ("payload", "field"),
    [({"is_admin": False}, "is_admin"), ({"is_active": False}, "is_active")],
)
def test_admin_cannot_change_own_flags(
    client: TestClient, admin: User, db: Session, payload: dict[str, bool], field: str
) -> None:
    response = client.put(f"{ADMIN}/users/{admin.id}", json=payload, headers=auth_headers(admin))
    assert response.status_code == 400
    assert response.json()["detail"] == f"Admins cannot change their own {field}"
    db.refresh(admin)
    assert admin.is_admin is True and admin.is_active is True


def test_admin_same_value_self_update_is_a_noop(client: TestClient, admin: User) -> None:
    response = client.put(
        f"{ADMIN}/users/{admin.id}",
        json={"is_admin": True, "is_active": True},
        headers=auth_headers(admin),
    )
    assert response.status_code == 200
    assert response.json()["is_admin"] is True and response.json()["is_active"] is True
    assert (
        client.put(f"{ADMIN}/users/{admin.id}", json={}, headers=auth_headers(admin)).status_code
        == 200
    )


# ---------------------------------------------------------------------------
# Submissions
# ---------------------------------------------------------------------------


def test_list_submissions_newest_first_with_owner_email(
    client: TestClient, admin: User, user: User, other_user: User, db: Session
) -> None:
    oldest = create_submission(db, user, repo="oldest", created_at=T0)
    create_review(db, oldest, score=7)
    middle = create_submission(
        db,
        other_user,
        repo="middle",
        status=SubmissionStatus.failed,
        error_message="boom",
        created_at=T0 + timedelta(hours=1),
    )
    newest = create_submission(
        db, user, repo="newest", status=SubmissionStatus.pending, created_at=T0 + timedelta(hours=2)
    )

    response = client.get(f"{ADMIN}/submissions", headers=auth_headers(admin))
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    assert [item["id"] for item in body["items"]] == [newest.id, middle.id, oldest.id]
    assert [item["user_email"] for item in body["items"]] == [
        user.email,
        other_user.email,
        user.email,
    ]
    assert body["items"][2]["review"]["score"] == 7
    assert body["items"][1]["error_message"] == "boom"
    assert body["items"][0]["review"] is None


def test_list_submissions_status_filter_and_pagination(
    client: TestClient, admin: User, user: User, db: Session
) -> None:
    for i in range(3):
        create_submission(
            db, user, repo=f"failed{i}", status=SubmissionStatus.failed, error_message="x"
        )
    create_submission(db, user, repo="pending", status=SubmissionStatus.pending)
    headers = auth_headers(admin)

    body = client.get(f"{ADMIN}/submissions", params={"status": "failed"}, headers=headers).json()
    assert body["total"] == 3
    assert all(item["status"] == "failed" for item in body["items"])

    body = client.get(
        f"{ADMIN}/submissions",
        params={"status": "failed", "limit": 2, "offset": 2},
        headers=headers,
    ).json()
    assert (
        body["total"] == 3
        and len(body["items"]) == 1
        and body["limit"] == 2
        and body["offset"] == 2
    )

    body = client.get(f"{ADMIN}/submissions", params={"status": "done"}, headers=headers).json()
    assert body == {"items": [], "total": 0, "limit": 20, "offset": 0}

    assert (
        client.get(f"{ADMIN}/submissions", params={"status": "bogus"}, headers=headers).status_code
        == 422
    )
    assert (
        client.get(f"{ADMIN}/submissions", params={"limit": 0}, headers=headers).status_code == 422
    )


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------


def test_delete_review_marks_submission_failed(
    client: TestClient, admin: User, user: User, db: Session
) -> None:
    submission = create_submission(db, user)
    review = create_review(db, submission, score=9)
    submission_id, review_id = submission.id, review.id
    headers = auth_headers(admin)
    owner_headers = auth_headers(user)

    response = client.delete(f"{ADMIN}/reviews/{review_id}", headers=headers)
    assert response.status_code == 204
    assert response.content == b""

    db.expunge_all()
    assert db.get(Review, review_id) is None
    reloaded = db.get(Submission, submission_id)
    assert reloaded is not None
    assert reloaded.status == SubmissionStatus.failed
    assert reloaded.error_message == REVIEW_REMOVED_MESSAGE == "Review removed by admin"

    assert client.delete(f"{ADMIN}/reviews/{review_id}", headers=headers).status_code == 404
    assert client.get(f"{API}/reviews/{submission_id}", headers=owner_headers).status_code == 404
    mine = client.get(f"{API}/submissions/{submission_id}", headers=owner_headers).json()
    assert mine["status"] == "failed" and mine["error_message"] == "Review removed by admin"


def test_delete_unknown_review_returns_404(client: TestClient, admin: User) -> None:
    response = client.delete(f"{ADMIN}/reviews/424242", headers=auth_headers(admin))
    assert response.status_code == 404
    assert response.json()["detail"] == "Review not found"


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


def test_stats_shape_and_sums(client: TestClient, admin: User, user: User, db: Session) -> None:
    create_user(db, "inactive@example.com", is_active=False)
    done_a = create_submission(db, user, repo="a")
    done_b = create_submission(db, user, repo="b")
    review_a = create_review(db, done_a, score=5)
    review_b = create_review(db, done_b, score=6)
    review_a.input_tokens, review_a.output_tokens = 1000, 200
    review_b.input_tokens, review_b.output_tokens = 500, 50
    db.commit()
    create_submission(db, user, repo="c", status=SubmissionStatus.failed, error_message="x")
    create_submission(db, user, repo="d", status=SubmissionStatus.pending)

    response = client.get(f"{ADMIN}/stats", headers=auth_headers(admin))
    assert response.status_code == 200
    assert response.json() == {
        "total_users": 3,
        "active_users": 2,
        "submissions_by_status": {"pending": 1, "reviewing": 0, "done": 2, "failed": 1},
        "total_reviews": 2,
        "total_input_tokens": 1500,
        "total_output_tokens": 250,
    }


def test_stats_on_empty_platform(client: TestClient, admin: User) -> None:
    body = client.get(f"{ADMIN}/stats", headers=auth_headers(admin)).json()
    assert body["total_users"] == 1 and body["active_users"] == 1
    assert body["submissions_by_status"] == {"pending": 0, "reviewing": 0, "done": 0, "failed": 0}
    assert body["total_reviews"] == 0
    assert body["total_input_tokens"] == 0 and body["total_output_tokens"] == 0
