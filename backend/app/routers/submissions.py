"""Submission endpoints."""

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.submission import SubmissionCreate, SubmissionListResponse, SubmissionResponse
from app.services import submission_service
from app.services.roaster import run_review

router = APIRouter(prefix="/submissions", tags=["submissions"])


@router.post("/", response_model=SubmissionResponse, status_code=status.HTTP_201_CREATED)
async def create_submission(
    data: SubmissionCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SubmissionResponse:
    """Validate the GitHub repo, create a pending submission and enqueue its review."""
    submission = await submission_service.create_submission(db, user, data)
    background_tasks.add_task(run_review, submission.id)
    return SubmissionResponse.model_validate(submission)


@router.get("/", response_model=SubmissionListResponse)
async def list_submissions(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SubmissionListResponse:
    """List the current user's submissions, newest first."""
    items, total = submission_service.list_submissions(db, user, limit, offset)
    return SubmissionListResponse(
        items=[SubmissionResponse.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{submission_id}", response_model=SubmissionResponse)
async def get_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SubmissionResponse:
    """Get one of the current user's submissions with its nested review."""
    submission = submission_service.get_submission(db, user, submission_id)
    return SubmissionResponse.model_validate(submission)


@router.delete("/{submission_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Delete one of the current user's submissions and its review."""
    submission_service.delete_submission(db, user, submission_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{submission_id}/retry",
    response_model=SubmissionResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def retry_submission(
    submission_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SubmissionResponse:
    """Re-enqueue a failed submission for review."""
    submission = submission_service.retry_submission(db, user, submission_id)
    background_tasks.add_task(run_review, submission.id)
    return SubmissionResponse.model_validate(submission)
