"""Submission request / response schemas."""

import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.submission import SubmissionStatus
from app.schemas.common import Paginated
from app.schemas.review import ReviewResponse

GITHUB_URL_PATTERN = re.compile(r"^https://github\.com/[\w.-]+/[\w.-]+/?$")
_NORMALIZED_PATTERN = re.compile(r"^https://github\.com/([\w.-]+)/([\w.-]+)$")


def normalize_github_url(url: str) -> str:
    """Trim whitespace, a trailing slash and a ``.git`` suffix from a GitHub repo URL.

    Raises:
        ValueError: if the URL does not look like ``https://github.com/owner/repo``.
    """
    value = url.strip()
    if not GITHUB_URL_PATTERN.match(value):
        raise ValueError("github_url must look like https://github.com/owner/repo")
    value = value.rstrip("/")
    if value.endswith(".git"):
        value = value[: -len(".git")]
    if not _NORMALIZED_PATTERN.match(value):
        raise ValueError("github_url must look like https://github.com/owner/repo")
    return value


def split_github_url(url: str) -> tuple[str, str]:
    """Return ``(owner, repo)`` from an already-normalized GitHub URL."""
    match = _NORMALIZED_PATTERN.match(url)
    if match is None:
        raise ValueError("github_url must look like https://github.com/owner/repo")
    return match.group(1), match.group(2)


class SubmissionCreate(BaseModel):
    """Payload for POST /submissions."""

    github_url: str = Field(
        max_length=500,
        description="Public GitHub repository URL, e.g. https://github.com/owner/repo",
        examples=["https://github.com/octocat/Hello-World"],
    )

    @field_validator("github_url")
    @classmethod
    def _validate_github_url(cls, value: str) -> str:
        return normalize_github_url(value)


class SubmissionResponse(BaseModel):
    """Submission with its nested review (if the review is finished)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    github_url: str
    repo_owner: str
    repo_name: str
    default_branch: str
    commit_sha: str
    status: SubmissionStatus
    error_message: str | None = None
    review: ReviewResponse | None = None
    created_at: datetime
    updated_at: datetime | None = None


SubmissionListResponse = Paginated[SubmissionResponse]
