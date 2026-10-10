"""ORM model constraints and cascades."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Base, RefreshToken, Review, Submission, SubmissionStatus, User
from app.models.base import SoftDeleteMixin, TimestampMixin
from tests.conftest import IS_POSTGRES, create_review, create_submission, create_user


def test_all_tables_are_registered() -> None:
    assert {"users", "refresh_tokens", "submissions", "reviews", "oauth_login_codes"} <= set(
        Base.metadata.tables
    )


def test_submission_status_values() -> None:
    assert [s.value for s in SubmissionStatus] == ["pending", "reviewing", "done", "failed"]
    assert SubmissionStatus("done") is SubmissionStatus.done
    assert str(SubmissionStatus.failed) == "failed"


def test_user_defaults_and_repr(db: Session) -> None:
    user = create_user(db, "Defaults@Example.com")
    assert user.email == "defaults@example.com"
    assert user.hashed_password is None
    assert user.is_active is True
    assert user.is_verified is False
    assert user.is_admin is False
    assert user.oauth_provider is None
    assert user.created_at is not None
    assert repr(user) == f"<User id={user.id} email='defaults@example.com'>"


def test_submission_defaults_and_repr(db: Session, user: User) -> None:
    submission = create_submission(db, user)
    assert submission.status == SubmissionStatus.pending
    assert submission.error_message is None
    assert submission.review is None
    assert submission.created_at is not None
    assert submission.user.id == user.id
    assert repr(submission) == f"<Submission id={submission.id} repo=octo/demo status=pending>"


def test_review_defaults_and_repr(db: Session, user: User) -> None:
    submission = create_submission(db, user)
    review = Review(
        submission_id=submission.id,
        score=5,
        roast_text="r",
        summary="s",
        model_used="m",
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    assert review.strengths == [] and review.improvements == []
    assert review.input_tokens == 0 and review.output_tokens == 0
    assert review.created_at is not None
    assert review.submission.id == submission.id
    assert repr(review) == f"<Review id={review.id} submission_id={submission.id} score=5>"


def test_refresh_token_repr_and_relationship(db: Session, user: User) -> None:
    token = RefreshToken(
        user_id=user.id, token="tok", expires_at=datetime.now(UTC) + timedelta(days=1)
    )
    db.add(token)
    db.commit()
    db.refresh(token)
    assert token.revoked is False
    assert token.user.id == user.id
    assert user.refresh_tokens == [token]
    assert repr(token) == f"<RefreshToken id={token.id} user_id={user.id} revoked=False>"


def test_user_email_is_unique(db: Session, user: User) -> None:
    db.add(User(email=user.email))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_one_review_per_submission(db: Session, user: User) -> None:
    submission = create_submission(db, user)
    create_review(db, submission)
    db.add(
        Review(submission_id=submission.id, score=1, roast_text="r", summary="s", model_used="m")
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


@pytest.mark.skipif(not IS_POSTGRES, reason="CHECK constraint is verified against PostgreSQL only")
@pytest.mark.parametrize("score", [-1, 11])
def test_review_score_check_constraint(db: Session, user: User, score: int) -> None:
    submission = create_submission(db, user)
    db.add(
        Review(
            submission_id=submission.id, score=score, roast_text="r", summary="s", model_used="m"
        )
    )
    with pytest.raises(IntegrityError, match="ck_reviews_score_range"):
        db.commit()
    db.rollback()


def test_review_score_check_constraint_is_declared() -> None:
    names = {c.name for c in Base.metadata.tables["reviews"].constraints}
    assert "ck_reviews_score_range" in names


def test_deleting_submission_cascades_review(db: Session, user: User) -> None:
    submission = create_submission(db, user)
    review = create_review(db, submission)
    db.delete(submission)
    db.commit()
    assert db.get(Review, review.id) is None
    assert db.scalar(select(func.count(Review.id))) == 0


def test_deleting_user_cascades_submissions_reviews_and_tokens(
    db: Session, user: User, other_user: User
) -> None:
    mine = create_submission(db, user)
    create_review(db, mine)
    theirs = create_submission(db, other_user)
    db.add(
        RefreshToken(user_id=user.id, token="t1", expires_at=datetime.now(UTC) + timedelta(days=1))
    )
    db.commit()

    db.delete(user)
    db.commit()

    assert db.scalar(select(func.count(Submission.id))) == 1
    assert db.get(Submission, theirs.id) is not None
    assert db.scalar(select(func.count(Review.id))) == 0
    assert db.scalar(select(func.count(RefreshToken.id))) == 0


def test_timestamp_mixin_updates_updated_at(db: Session, user: User) -> None:
    assert user.updated_at is None
    user.full_name = "Changed"
    db.commit()
    db.refresh(user)
    assert user.updated_at is not None


def test_mixins_declare_expected_columns() -> None:
    assert {"created_at", "updated_at"} <= set(vars(TimestampMixin))
    assert {"is_deleted", "deleted_at"} <= set(vars(SoftDeleteMixin))
