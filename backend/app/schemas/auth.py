"""Authentication request/response schemas."""

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    """Email/password sign-up payload."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    full_name: str | None = Field(default=None, max_length=100)


class LoginRequest(BaseModel):
    """Email/password login payload."""

    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class TokenResponse(BaseModel):
    """Access + refresh token pair."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    """Payload for rotating a refresh token."""

    refresh_token: str = Field(min_length=1)


class LogoutRequest(BaseModel):
    """Payload for revoking a refresh token."""

    refresh_token: str = Field(min_length=1)


class LoginCodeExchangeRequest(BaseModel):
    """Payload for exchanging the single-use code issued after Google OAuth."""

    code: str = Field(min_length=1, max_length=128)
