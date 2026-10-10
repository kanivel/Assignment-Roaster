"""Review endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.exceptions import NotFoundError
from app.models.user import User
from app.schemas.review import ReviewResponse
from app.services import submission_service

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.get("/{submission_id}", response_model=ReviewResponse)
async def get_review(
    submission_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReviewResponse:
    """Return the review for a submission. Owner or admin only; 404 otherwise."""
    submission = submission_service.get_submission_for_review(db, user, submission_id)
    if submission.review is None:
        raise NotFoundError("Review")
    return ReviewResponse.model_validate(submission.review)
