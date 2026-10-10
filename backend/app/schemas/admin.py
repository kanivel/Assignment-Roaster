"""Admin panel schemas."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field

from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.schemas.common import Paginated
from app.schemas.submission import SubmissionResponse
from app.schemas.user import UserResponse


class AdminUserUpdate(BaseModel):
    """Flags an admin may change on another user. Omitted fields are left untouched."""

    is_active: bool | None = None
    is_admin: bool | None = None


class AdminUserResponse(UserResponse):
    """User as seen by an admin, with their submission count."""

    submissions_count: int = Field(ge=0)

    @classmethod
    def from_row(cls, user: User, submissions_count: int) -> AdminUserResponse:
        """Build from an ORM user plus the aggregated submission count."""
        return cls(
            **UserResponse.model_validate(user).model_dump(), submissions_count=submissions_count
        )


AdminUserListResponse = Paginated[AdminUserResponse]


class AdminSubmissionResponse(SubmissionResponse):
    """Submission with its owner's email, for the admin submissions table."""

    user_email: EmailStr

    @classmethod
    def from_row(cls, submission: Submission, user_email: str) -> AdminSubmissionResponse:
        """Build from an ORM submission plus the owner's email."""
        return cls(
            **SubmissionResponse.model_validate(submission).model_dump(), user_email=user_email
        )


AdminSubmissionListResponse = Paginated[AdminSubmissionResponse]


class AdminStats(BaseModel):
    """Platform-wide counters for the admin dashboard."""

    total_users: int = Field(ge=0)
    active_users: int = Field(ge=0)
    submissions_by_status: dict[SubmissionStatus, int] = Field(
        description="Submission count per status; every status is present (0 when none)"
    )
    total_reviews: int = Field(ge=0)
    total_input_tokens: int = Field(ge=0)
    total_output_tokens: int = Field(ge=0)
