"""Admin endpoints. Every route requires an admin user (403 otherwise)."""

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.dependencies import get_db, require_admin
from app.models.submission import SubmissionStatus
from app.models.user import User
from app.schemas.admin import (
    AdminStats,
    AdminSubmissionListResponse,
    AdminSubmissionResponse,
    AdminUserListResponse,
    AdminUserResponse,
    AdminUserUpdate,
)
from app.services import admin_service

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    search: str | None = Query(None, max_length=255, description="Substring of email"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> AdminUserListResponse:
    """Paginated users, newest first, optionally filtered by email substring."""
    rows, total = admin_service.list_users(db, search, limit, offset)
    return AdminUserListResponse(
        items=[AdminUserResponse.from_row(user, count) for user, count in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.put("/users/{user_id}", response_model=AdminUserResponse)
async def update_user(
    user_id: int,
    data: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminUserResponse:
    """Update ``is_active`` / ``is_admin``. 400 if an admin changes their own flags."""
    user, count = admin_service.update_user(db, admin, user_id, data)
    return AdminUserResponse.from_row(user, count)


@router.get("/submissions", response_model=AdminSubmissionListResponse)
async def list_submissions(
    status_filter: SubmissionStatus | None = Query(None, alias="status"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> AdminSubmissionListResponse:
    """All submissions, newest first, with owner email and optional status filter."""
    rows, total = admin_service.list_submissions(db, status_filter, limit, offset)
    return AdminSubmissionListResponse(
        items=[AdminSubmissionResponse.from_row(sub, email) for sub, email in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.delete("/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(
    review_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> Response:
    """Remove a review and mark its submission failed with "Review removed by admin"."""
    admin_service.delete_review(db, admin, review_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/stats", response_model=AdminStats)
async def get_stats(db: Session = Depends(get_db)) -> AdminStats:
    """Platform-wide counters: users, submissions by status, reviews and token usage."""
    return admin_service.get_stats(db)
