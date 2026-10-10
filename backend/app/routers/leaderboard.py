"""Leaderboard endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.leaderboard import LeaderboardResponse, MyRankResponse
from app.services import leaderboard_service

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


@router.get("/", response_model=LeaderboardResponse)
async def get_leaderboard(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> LeaderboardResponse:
    """Public ranking of users by best score, then average score, then earliest submission."""
    items, total = leaderboard_service.get_leaderboard(db, limit, offset)
    return LeaderboardResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/me", response_model=MyRankResponse)
async def get_my_rank(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MyRankResponse:
    """The current user's rank, best score, average score and reviewed submission count."""
    return leaderboard_service.get_my_rank(db, user.id)
