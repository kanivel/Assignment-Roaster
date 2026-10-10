"""Leaderboard schemas."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import Paginated


class LeaderboardEntry(BaseModel):
    """One ranked row of the leaderboard.

    Only submissions with ``status == done`` that have a review are counted.
    """

    rank: int = Field(ge=1, description="1-based rank; ties share a rank")
    user_id: int
    full_name: str | None = None
    avatar_url: str | None = None
    best_score: int = Field(ge=0, le=10)
    average_score: float = Field(ge=0, le=10, description="Mean score, rounded to 2 decimals")
    submissions_count: int = Field(ge=1, description="Number of reviewed (done) submissions")
    last_submission_at: datetime


LeaderboardResponse = Paginated[LeaderboardEntry]


class MyRankResponse(BaseModel):
    """The current user's standing. Fields are ``None`` when the user is not ranked yet."""

    rank: int | None = None
    best_score: int | None = None
    average_score: float | None = None
    submissions_count: int = Field(
        ge=0, description="Number of reviewed (done) submissions; 0 when unranked"
    )
