"""Reviews endpoint: owner or admin may read, everyone else gets 404."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.submission import SubmissionStatus
from app.models.user import User
from tests.conftest import API, auth_headers, create_review, create_submission

REVIEWS = f"{API}/reviews"


def test_owner_can_read_review(client: TestClient, user: User, db: Session) -> None:
    submission = create_submission(db, user)
    review = create_review(db, submission, score=8)

    response = client.get(f"{REVIEWS}/{submission.id}", headers=auth_headers(user))
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == review.id
    assert body["submission_id"] == submission.id
    assert body["score"] == 8
    assert body["roast_text"] == review.roast_text
    assert body["summary"] == review.summary
    assert body["strengths"] == ["Runs"]
    assert body["improvements"] == ["Add tests"]
    assert body["model_used"] == "gpt-test-model"
    assert body["input_tokens"] == 100 and body["output_tokens"] == 50
    assert body["created_at"]


def test_other_user_gets_404(client: TestClient, user: User, other_user: User, db: Session) -> None:
    submission = create_submission(db, user)
    create_review(db, submission)
    response = client.get(f"{REVIEWS}/{submission.id}", headers=auth_headers(other_user))
    assert response.status_code == 404
    assert response.json() == {"detail": "Review not found", "code": "NOT_FOUND"}


def test_admin_can_read_any_review(
    client: TestClient, user: User, admin: User, db: Session
) -> None:
    submission = create_submission(db, user)
    create_review(db, submission, score=3)
    response = client.get(f"{REVIEWS}/{submission.id}", headers=auth_headers(admin))
    assert response.status_code == 200
    assert response.json()["score"] == 3


def test_submission_without_review_returns_404(client: TestClient, user: User, db: Session) -> None:
    pending = create_submission(db, user, status=SubmissionStatus.pending)
    failed = create_submission(db, user, status=SubmissionStatus.failed, error_message="x")
    headers = auth_headers(user)
    assert client.get(f"{REVIEWS}/{pending.id}", headers=headers).status_code == 404
    assert client.get(f"{REVIEWS}/{failed.id}", headers=headers).status_code == 404


def test_unknown_submission_returns_404(client: TestClient, user: User) -> None:
    assert client.get(f"{REVIEWS}/424242", headers=auth_headers(user)).status_code == 404


def test_review_requires_auth(client: TestClient, user: User, db: Session) -> None:
    submission = create_submission(db, user)
    create_review(db, submission)
    assert client.get(f"{REVIEWS}/{submission.id}").status_code == 401
