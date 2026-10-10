"""Dashboard endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.dashboard import DashboardStats
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DashboardStats:
    """Submission counters, score aggregates and the latest submission for the current user."""
    return dashboard_service.get_stats(db, user)
