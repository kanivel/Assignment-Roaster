"""User schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserResponse(BaseModel):
    """Public representation of a user."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str | None = None
    avatar_url: str | None = None
    is_active: bool
    is_verified: bool
    is_admin: bool
    oauth_provider: str | None = None
    created_at: datetime


class UserUpdate(BaseModel):
    """Fields a user may change on their own profile. Omitted fields are left untouched."""

    full_name: str | None = Field(default=None, max_length=100)
    avatar_url: str | None = Field(default=None, max_length=500)
