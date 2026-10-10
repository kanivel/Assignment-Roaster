"""Submissions API: validation, ownership, pagination, rate limit, delete, retry."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.main import app
from app.models.review import Review
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.schemas.submission import normalize_github_url, split_github_url
from app.services import submission_service
from tests.conftest import (
    API,
    SHA,
    FakeOpenAI,
    auth_headers,
    create_review,
    create_submission,
)

SUBMISSIONS = f"{API}/submissions/"


def _post(client: TestClient, user: User, url: str) -> Any:
    return client.post(SUBMISSIONS, json={"github_url": url}, headers=auth_headers(user))


# ---------------------------------------------------------------------------
# URL validation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("https://github.com/octo/demo", "https://github.com/octo/demo"),
        ("https://github.com/octo/demo/", "https://github.com/octo/demo"),
        ("https://github.com/octo/demo.git", "https://github.com/octo/demo"),
        ("https://github.com/octo/demo.git/", "https://github.com/octo/demo"),
        ("  https://github.com/octo-1/demo.js  ", "https://github.com/octo-1/demo.js"),
    ],
)
def test_normalize_github_url(raw: str, expected: str) -> None:
    assert normalize_github_url(raw) == expected
    assert split_github_url(expected) == tuple(expected.rsplit("/", 2)[1:])


@pytest.mark.parametrize(
    "raw",
    [
        "https://gitlab.com/octo/demo",
        "http://github.com/octo/demo",
        "github.com/octo/demo",
        "https://github.com/octo",
        "https://github.com/octo/demo/tree/main",
        "https://github.com/octo/demo?x=1",
        "not a url",
        "",
    ],
)
def test_normalize_github_url_rejects_invalid(raw: str) -> None:
    with pytest.raises(ValueError, match="github_url must look like"):
        normalize_github_url(raw)


def test_split_github_url_rejects_unnormalized() -> None:
    with pytest.raises(ValueError):
        split_github_url("https://github.com/octo/demo/")


@pytest.mark.parametrize(
    "url",
    [
        "https://gitlab.com/octo/demo",
        "https://github.com/octo",
        "nonsense",
        "https://github.com/a/b/c",
    ],
)
def test_create_rejects_invalid_url_with_422(
    client: TestClient, user: User, db: Session, mock_github: Any, url: str
) -> None:
    response = _post(client, user, url)
    assert response.status_code == 422
    assert db.scalar(select(func.count(Submission.id))) == 0
    assert not mock_github.calls.called, "GitHub must not be contacted for invalid URLs"


def test_create_requires_auth(client: TestClient, db: Session) -> None:
    assert (
        client.post(SUBMISSIONS, json={"github_url": "https://github.com/octo/demo"}).status_code
        == 401
    )
    assert client.get(SUBMISSIONS).status_code == 401


def test_create_private_or_missing_repo_returns_400_and_is_not_saved(
    client: TestClient, user: User, db: Session, mock_github: Any
) -> None:
    response = _post(client, user, "https://github.com/octo/private")
    assert response.status_code == 400
    assert response.json() == {
        "detail": "Repository not found or is private",
        "code": "BAD_REQUEST",
    }
    assert db.scalar(select(func.count(Submission.id))) == 0


@pytest.mark.parametrize(
    ("repo", "fragment"),
    [
        ("limited", "rate limit exceeded"),
        ("forbidden", "refused access"),
        ("broken", "unexpected error (500)"),
        ("slow", "did not respond in time"),
        ("offline", "Could not reach GitHub"),
    ],
)
def test_create_maps_github_failures_to_400(
    client: TestClient, user: User, db: Session, mock_github: Any, repo: str, fragment: str
) -> None:
    response = _post(client, user, f"https://github.com/octo/{repo}")
    assert response.status_code == 400
    assert fragment.lower() in response.json()["detail"].lower()
    assert db.scalar(select(func.count(Submission.id))) == 0


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_create_returns_201_pending_and_background_review_completes(
    client: TestClient, user: User, db: Session, mock_github: Any, fake_openai: FakeOpenAI
) -> None:
    response = _post(client, user, "https://github.com/octo/demo.git/")
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending", "the response is built before the background task runs"
    assert body["github_url"] == "https://github.com/octo/demo"
    assert body["repo_owner"] == "octo" and body["repo_name"] == "demo"
    assert body["default_branch"] == "main" and body["commit_sha"] == SHA
    assert body["user_id"] == user.id
    assert body["review"] is None and body["error_message"] is None
    assert body["created_at"]

    # TestClient runs BackgroundTasks before returning, so the review is already done.
    detail = client.get(f"{SUBMISSIONS}{body['id']}", headers=auth_headers(user))
    assert detail.status_code == 200
    data = detail.json()
    assert data["status"] == "done"
    assert data["error_message"] is None
    review = data["review"]
    assert review["score"] == 7
    assert review["model_used"] == fake_openai.model
    assert review["input_tokens"] == 100 and review["output_tokens"] == 50
    assert review["strengths"] and review["improvements"]
    assert review["submission_id"] == body["id"]
    assert len(fake_openai.calls) == 1


def test_get_submission_404_for_unknown_id(client: TestClient, user: User) -> None:
    response = client.get(f"{SUBMISSIONS}999", headers=auth_headers(user))
    assert response.status_code == 404
    assert response.json() == {"detail": "Submission not found", "code": "NOT_FOUND"}


# ---------------------------------------------------------------------------
# Listing
# ---------------------------------------------------------------------------


def test_list_is_paginated_newest_first_and_scoped_to_user(
    client: TestClient, user: User, other_user: User, db: Session
) -> None:
    mine = [create_submission(db, user, repo=f"repo{i}") for i in range(3)]
    create_review(db, mine[0], score=9)
    create_submission(db, other_user, repo="theirs")

    response = client.get(SUBMISSIONS, params={"limit": 2, "offset": 0}, headers=auth_headers(user))
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    assert body["limit"] == 2 and body["offset"] == 0
    assert [item["id"] for item in body["items"]] == [mine[2].id, mine[1].id]
    assert all(item["user_id"] == user.id for item in body["items"])

    page_two = client.get(
        SUBMISSIONS, params={"limit": 2, "offset": 2}, headers=auth_headers(user)
    ).json()
    assert [item["id"] for item in page_two["items"]] == [mine[0].id]
    assert page_two["items"][0]["review"]["score"] == 9
    assert page_two["items"][0]["status"] == "done"

    empty = client.get(SUBMISSIONS, params={"offset": 10}, headers=auth_headers(user)).json()
    assert empty["items"] == [] and empty["total"] == 3


def test_list_defaults_and_validation(client: TestClient, user: User, db: Session) -> None:
    body = client.get(SUBMISSIONS, headers=auth_headers(user)).json()
    assert body == {"items": [], "total": 0, "limit": 20, "offset": 0}
    assert (
        client.get(SUBMISSIONS, params={"limit": 101}, headers=auth_headers(user)).status_code
        == 422
    )
    assert (
        client.get(SUBMISSIONS, params={"limit": 0}, headers=auth_headers(user)).status_code == 422
    )
    assert (
        client.get(SUBMISSIONS, params={"offset": -1}, headers=auth_headers(user)).status_code
        == 422
    )


# ---------------------------------------------------------------------------
# Ownership
# ---------------------------------------------------------------------------


def test_other_users_submission_is_404_for_get_delete_and_retry(
    client: TestClient, user: User, other_user: User, db: Session
) -> None:
    theirs = create_submission(db, other_user, status=SubmissionStatus.failed)
    headers = auth_headers(user)
    assert client.get(f"{SUBMISSIONS}{theirs.id}", headers=headers).status_code == 404
    assert client.delete(f"{SUBMISSIONS}{theirs.id}", headers=headers).status_code == 404
    assert client.post(f"{SUBMISSIONS}{theirs.id}/retry", headers=headers).status_code == 404
    db.expire_all()
    assert db.get(Submission, theirs.id) is not None


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


def test_delete_returns_204_and_cascades_review(
    client: TestClient, user: User, db: Session
) -> None:
    submission = create_submission(db, user)
    review = create_review(db, submission)
    headers = auth_headers(user)

    response = client.delete(f"{SUBMISSIONS}{submission.id}", headers=headers)
    assert response.status_code == 204
    assert response.content == b""

    db.expunge_all()  # clear the identity map so get() re-queries the deleted rows
    assert db.get(Submission, submission.id) is None
    assert db.get(Review, review.id) is None
    assert client.get(f"{SUBMISSIONS}{submission.id}", headers=headers).status_code == 404
    assert client.get(f"{API}/reviews/{submission.id}", headers=headers).status_code == 404
    assert client.delete(f"{SUBMISSIONS}{submission.id}", headers=headers).status_code == 404


# ---------------------------------------------------------------------------
# Retry
# ---------------------------------------------------------------------------


def test_retry_done_submission_returns_400(client: TestClient, user: User, db: Session) -> None:
    submission = create_submission(db, user, status=SubmissionStatus.done)
    response = client.post(f"{SUBMISSIONS}{submission.id}/retry", headers=auth_headers(user))
    assert response.status_code == 400
    assert response.json()["detail"] == "Only failed submissions can be retried"


@pytest.mark.parametrize("status", [SubmissionStatus.pending, SubmissionStatus.reviewing])
def test_retry_fresh_in_progress_submission_returns_400(
    client: TestClient, user: User, db: Session, status: SubmissionStatus
) -> None:
    submission = create_submission(db, user, status=status)
    response = client.post(f"{SUBMISSIONS}{submission.id}/retry", headers=auth_headers(user))
    assert response.status_code == 400
    assert response.json()["detail"] == "Review is still in progress, please wait before retrying"
    db.refresh(submission)
    assert submission.status == status


def _age(db: Session, submission: Submission, minutes: int) -> None:
    """Backdate a submission so it looks idle for ``minutes``."""
    then = datetime.now(UTC) - timedelta(minutes=minutes)
    db.execute(
        Submission.__table__.update()
        .where(Submission.id == submission.id)
        .values(created_at=then, updated_at=then)
    )
    db.commit()


@pytest.mark.parametrize("status", [SubmissionStatus.pending, SubmissionStatus.reviewing])
def test_retry_stale_in_progress_submission_is_requeued(
    client: TestClient,
    user: User,
    db: Session,
    mock_github: Any,
    fake_openai: FakeOpenAI,
    status: SubmissionStatus,
) -> None:
    """A review stuck for >10 minutes (lost to a restart) can be retried by its owner."""
    submission = create_submission(db, user, status=status)
    _age(db, submission, minutes=11)
    headers = auth_headers(user)

    response = client.post(f"{SUBMISSIONS}{submission.id}/retry", headers=headers)
    assert response.status_code == 202
    assert response.json()["status"] == "pending"
    detail = client.get(f"{SUBMISSIONS}{submission.id}", headers=headers).json()
    assert detail["status"] == "done"
    assert len(fake_openai.calls) == 1


def test_retry_in_progress_just_under_threshold_is_rejected(
    client: TestClient, user: User, db: Session
) -> None:
    submission = create_submission(db, user, status=SubmissionStatus.reviewing)
    _age(db, submission, minutes=9)
    response = client.post(f"{SUBMISSIONS}{submission.id}/retry", headers=auth_headers(user))
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Stale review reaper (startup lifespan)
# ---------------------------------------------------------------------------


def test_fail_stale_reviews_marks_only_old_in_progress_rows(db: Session, user: User) -> None:
    old_pending = create_submission(db, user, repo="a", status=SubmissionStatus.pending)
    old_reviewing = create_submission(db, user, repo="b", status=SubmissionStatus.reviewing)
    old_done = create_submission(db, user, repo="c", status=SubmissionStatus.done)
    old_failed = create_submission(
        db, user, repo="d", status=SubmissionStatus.failed, error_message="boom"
    )
    fresh_reviewing = create_submission(db, user, repo="e", status=SubmissionStatus.reviewing)
    for stale in (old_pending, old_reviewing, old_done, old_failed):
        _age(db, stale, minutes=16)
    _age(db, fresh_reviewing, minutes=14)

    assert submission_service.fail_stale_reviews(db) == 2
    db.expire_all()
    assert old_pending.status == SubmissionStatus.failed
    assert old_pending.error_message == submission_service.INTERRUPTED_MESSAGE
    assert old_reviewing.status == SubmissionStatus.failed
    assert old_reviewing.error_message == "Review interrupted, please retry"
    assert old_done.status == SubmissionStatus.done
    assert old_failed.status == SubmissionStatus.failed and old_failed.error_message == "boom"
    assert fresh_reviewing.status == SubmissionStatus.reviewing
    assert submission_service.fail_stale_reviews(db) == 0, "idempotent"


def test_lifespan_startup_reaps_stale_reviews(db: Session, user: User) -> None:
    stuck = create_submission(db, user, status=SubmissionStatus.reviewing)
    _age(db, stuck, minutes=20)
    fresh = create_submission(db, user, repo="fresh", status=SubmissionStatus.pending)

    with TestClient(app) as client:
        assert client.get("/health").status_code == 200

    db.expire_all()
    assert stuck.status == SubmissionStatus.failed
    assert stuck.error_message == "Review interrupted, please retry"
    assert fresh.status == SubmissionStatus.pending


def test_lifespan_survives_unavailable_database(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    from app.services import maintenance

    def _broken() -> Session:
        raise RuntimeError("db down")

    monkeypatch.setattr(maintenance, "SessionLocal", _broken)
    with caplog.at_level("ERROR", logger="app.services.maintenance"):
        assert maintenance.reap_stale_reviews() == 0
        with TestClient(app) as client:
            assert client.get("/health").status_code == 200
    assert "Stale review cleanup failed" in caplog.text


# ---------------------------------------------------------------------------
# Admin read access
# ---------------------------------------------------------------------------


def test_admin_can_read_but_not_delete_or_retry_others_submissions(
    client: TestClient, user: User, admin: User, db: Session
) -> None:
    theirs = create_submission(db, user, status=SubmissionStatus.failed, error_message="x")
    create_review(db, theirs, score=4)
    headers = auth_headers(admin)

    response = client.get(f"{SUBMISSIONS}{theirs.id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["user_id"] == user.id
    assert response.json()["review"]["score"] == 4

    assert client.delete(f"{SUBMISSIONS}{theirs.id}", headers=headers).status_code == 404
    assert client.post(f"{SUBMISSIONS}{theirs.id}/retry", headers=headers).status_code == 404
    assert client.get(f"{SUBMISSIONS}424242", headers=headers).status_code == 404


def test_retry_failed_submission_returns_202_and_reruns_review(
    client: TestClient, user: User, db: Session, mock_github: Any, fake_openai: FakeOpenAI
) -> None:
    submission = create_submission(db, user, status=SubmissionStatus.failed, error_message="boom")
    headers = auth_headers(user)

    response = client.post(f"{SUBMISSIONS}{submission.id}/retry", headers=headers)
    assert response.status_code == 202
    assert response.json()["status"] == "pending"
    assert response.json()["error_message"] is None

    detail = client.get(f"{SUBMISSIONS}{submission.id}", headers=headers).json()
    assert detail["status"] == "done"
    assert detail["review"]["score"] == 7
    assert len(fake_openai.calls) == 1


def test_retry_after_model_failure_recovers(
    client: TestClient, user: User, db: Session, mock_github: Any, fake_openai: FakeOpenAI
) -> None:
    fake_openai.mode = "refusal"
    created = _post(client, user, "https://github.com/octo/demo").json()
    headers = auth_headers(user)
    failed = client.get(f"{SUBMISSIONS}{created['id']}", headers=headers).json()
    assert failed["status"] == "failed"
    assert failed["error_message"] == "Review declined by safety filter, try another repo"
    assert failed["review"] is None

    fake_openai.mode = "success"
    assert client.post(f"{SUBMISSIONS}{created['id']}/retry", headers=headers).status_code == 202
    done = client.get(f"{SUBMISSIONS}{created['id']}", headers=headers).json()
    assert done["status"] == "done" and done["error_message"] is None
    assert done["review"]["score"] == 7


# ---------------------------------------------------------------------------
# Rate limit (5 per hour per user)
# ---------------------------------------------------------------------------


def test_sixth_submission_within_an_hour_returns_429(
    client: TestClient, user: User, db: Session, mock_github: Any, fake_openai: FakeOpenAI
) -> None:
    for i in range(4):
        create_submission(db, user, repo=f"old{i}")

    fifth = _post(client, user, "https://github.com/octo/demo")
    assert fifth.status_code == 201

    sixth = _post(client, user, "https://github.com/octo/demo")
    assert sixth.status_code == 429
    assert sixth.json()["code"] == "RATE_LIMITED"
    assert "5 per hour" in sixth.json()["detail"]
    assert db.scalar(select(func.count(Submission.id)).where(Submission.user_id == user.id)) == 5


def test_rate_limit_ignores_old_submissions_and_other_users(
    client: TestClient,
    user: User,
    other_user: User,
    db: Session,
    mock_github: Any,
    fake_openai: FakeOpenAI,
) -> None:
    two_hours_ago = datetime.now(UTC) - timedelta(hours=2)
    for i in range(5):
        create_submission(db, user, repo=f"old{i}", created_at=two_hours_ago)
    for i in range(5):
        create_submission(db, other_user, repo=f"theirs{i}")

    assert _post(client, user, "https://github.com/octo/demo").status_code == 201
    assert _post(client, other_user, "https://github.com/octo/demo").status_code == 429
