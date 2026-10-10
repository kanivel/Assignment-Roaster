"""FastAPI dependencies that resolve the current user from a bearer token."""

import logging
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.jwt import decode_access_token
from app.database import get_db
from app.exceptions import ForbiddenError, UnauthorizedError
from app.models.user import User

logger = logging.getLogger(__name__)

# auto_error=False so a missing header raises our UnauthorizedError (consistent JSON shape)
bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    """Return the active user identified by the ``Authorization: Bearer`` access token.

    Raises:
        UnauthorizedError: if the header is missing, the token is invalid, or the
            user does not exist or is inactive.
    """
    if credentials is None or not credentials.credentials:
        raise UnauthorizedError("Not authenticated")

    user_id = decode_access_token(credentials.credentials)
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        logger.debug("Token for unknown or inactive user id=%s", user_id)
        raise UnauthorizedError("User not found or inactive")
    return user


async def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    """Return the current user if they are an admin, else raise 403."""
    if not user.is_admin:
        raise ForbiddenError("Admin privileges required")
    return user


__all__ = ["bearer_scheme", "get_current_user", "get_db", "require_admin"]
