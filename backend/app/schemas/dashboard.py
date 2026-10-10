"""Dashboard schemas."""

from pydantic import BaseModel, Field

from app.schemas.submission import SubmissionResponse


class DashboardStats(BaseModel):
    """Aggregate statistics for the current user's submissions."""

    total_submissions: int = Field(ge=0)
    done_count: int = Field(ge=0, description="Submissions with a finished review")
    failed_count: int = Field(ge=0)
    pending_count: int = Field(ge=0, description="Submissions still pending or reviewing")
    average_score: float | None = Field(
        default=None, description="Mean score across done submissions, 2 decimals"
    )
    best_score: int | None = Field(default=None, ge=0, le=10)
    latest_submission: SubmissionResponse | None = Field(
        default=None, description="Most recent submission with its review, if any"
    )
