"""Authentication endpoints: email/password, token lifecycle, profile and Google OAuth.

Endpoints that hash passwords or touch the database are plain ``def`` functions so
FastAPI runs them in its threadpool instead of blocking the event loop with bcrypt
and synchronous SQLAlchemy calls.
"""

import logging
from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Query, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.auth import google
from app.auth.dependencies import get_current_user
from app.config import settings
from app.database import get_db
from app.exceptions import UnauthorizedError
from app.limiter import limiter
from app.models.user import User
from app.schemas.auth import (
    LoginCodeExchangeRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)
from app.schemas.user import UserResponse, UserUpdate
from app.services import auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

AUTH_RATE_LIMIT = "10/minute"
TOKEN_RATE_LIMIT = "30/minute"

DbDep = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(AUTH_RATE_LIMIT)
def register(request: Request, payload: RegisterRequest, db: DbDep) -> TokenResponse:
    """Create an email/password account and return a token pair (409 on duplicate email)."""
    user = auth_service.register(db, payload.email, payload.password, payload.full_name)
    return auth_service.issue_tokens(db, user)


@router.post("/login", response_model=TokenResponse)
@limiter.limit(AUTH_RATE_LIMIT)
def login(request: Request, payload: LoginRequest, db: DbDep) -> TokenResponse:
    """Authenticate with email/password and return a token pair."""
    user = auth_service.authenticate(db, payload.email, payload.password)
    return auth_service.issue_tokens(db, user)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit(TOKEN_RATE_LIMIT)
def refresh(request: Request, payload: RefreshRequest, db: DbDep) -> TokenResponse:
    """Rotate a refresh token: the old one is revoked and a new pair is returned."""
    return auth_service.rotate_refresh_token(db, payload.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(TOKEN_RATE_LIMIT)
def logout(request: Request, payload: LogoutRequest, db: DbDep) -> Response:
    """Revoke a refresh token. Always 204, even if the token is already unknown."""
    auth_service.revoke_refresh_token(db, payload.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserResponse)
def me(user: CurrentUser) -> User:
    """Return the current user's profile."""
    return user


@router.put("/me", response_model=UserResponse)
def update_me(payload: UserUpdate, user: CurrentUser, db: DbDep) -> User:
    """Update the current user's full_name and/or avatar_url."""
    return auth_service.update_profile(db, user, payload)


def _secure_cookies() -> bool:
    return settings.FRONTEND_URL.startswith("https://")


@router.get("/google", status_code=status.HTTP_302_FOUND)
async def google_login(request: Request) -> RedirectResponse:
    """Redirect to Google's consent screen, storing a signed CSRF state cookie."""
    state = google.generate_state()
    response = RedirectResponse(
        url=google.build_authorization_url(state), status_code=status.HTTP_302_FOUND
    )
    response.set_cookie(
        key=google.STATE_COOKIE_NAME,
        value=google.sign_state(state),
        max_age=google.STATE_TTL_SECONDS,
        httponly=True,
        secure=_secure_cookies(),
        samesite="lax",
        path=request.url.path,  # covers /auth/google and /auth/google/callback
    )
    return response


@router.get("/google/callback", status_code=status.HTTP_302_FOUND)
async def google_callback(
    request: Request,
    db: DbDep,
    code: Annotated[str | None, Query()] = None,
    state: Annotated[str | None, Query()] = None,
    error: Annotated[str | None, Query()] = None,
) -> RedirectResponse:
    """Verify the CSRF state, exchange the code, upsert the user and redirect to the frontend.

    The redirect carries a single-use login code (never the tokens themselves); the SPA
    exchanges it via ``POST /auth/google/exchange``.
    """
    frontend_callback = f"{settings.FRONTEND_URL.rstrip('/')}/auth/callback"
    cookie_path = request.url.path.removesuffix("/callback")

    if error:
        logger.info("Google OAuth denied: %s", error)
        response = RedirectResponse(
            url=f"{frontend_callback}?{urlencode({'error': error})}",
            status_code=status.HTTP_302_FOUND,
        )
        response.delete_cookie(google.STATE_COOKIE_NAME, path=cookie_path)
        return response

    if not google.verify_state(request.cookies.get(google.STATE_COOKIE_NAME), state):
        raise UnauthorizedError("Invalid OAuth state")
    if not code:
        raise UnauthorizedError("Missing authorization code")

    info = await google.fetch_google_user(code)
    user = await run_in_threadpool(
        auth_service.get_or_create_google_user, db, info.email, info.name, info.picture
    )
    login_code = await run_in_threadpool(auth_service.create_login_code, db, user)

    response = RedirectResponse(
        url=f"{frontend_callback}?{urlencode({'code': login_code})}",
        status_code=status.HTTP_302_FOUND,
    )
    response.delete_cookie(google.STATE_COOKIE_NAME, path=cookie_path)
    return response


@router.post("/google/exchange", response_model=TokenResponse)
@limiter.limit(AUTH_RATE_LIMIT)
def google_exchange(
    request: Request, payload: LoginCodeExchangeRequest, db: DbDep
) -> TokenResponse:
    """Exchange the single-use login code from the OAuth redirect for a token pair."""
    return auth_service.exchange_login_code(db, payload.code)
