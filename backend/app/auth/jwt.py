"""Password hashing and token primitives (JWT access tokens + opaque refresh tokens)."""

import logging
import secrets
from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.exceptions import UnauthorizedError
from app.models.refresh_token import RefreshToken

logger = logging.getLogger(__name__)

# passlib 1.7.4 logs a harmless "(trapped) error reading bcrypt version" traceback
# with bcrypt >= 4.1 because bcrypt dropped ``__about__``. Hashing still works.
logging.getLogger("passlib.handlers.bcrypt").setLevel(logging.ERROR)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_BYTES = 48


def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Check a plaintext password against a bcrypt hash. Never raises on malformed hashes."""
    try:
        return pwd_context.verify(plain, hashed)
    except ValueError:
        logger.warning("Malformed password hash encountered during verification")
        return False


def create_access_token(user_id: int) -> str:
    """Create a signed HS256 access token whose ``sub`` is the user id."""
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "type": ACCESS_TOKEN_TYPE,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> int:
    """Validate an access token and return the user id it carries.

    Raises:
        UnauthorizedError: if the token is malformed, expired, has the wrong type,
            or carries a non-integer subject.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError as exc:
        logger.debug("Access token rejected: %s", exc)
        raise UnauthorizedError("Invalid or expired token") from exc

    if payload.get("type") != ACCESS_TOKEN_TYPE:
        raise UnauthorizedError("Invalid token type")

    sub = payload.get("sub")
    try:
        return int(sub)
    except (TypeError, ValueError) as exc:
        raise UnauthorizedError("Invalid token subject") from exc


def create_refresh_token(db: Session, user_id: int) -> RefreshToken:
    """Generate an opaque refresh token, persist it and return the ORM row.

    The row is added to the session and flushed; the caller commits.
    """
    token = RefreshToken(
        user_id=user_id,
        token=secrets.token_urlsafe(REFRESH_TOKEN_BYTES),
        expires_at=datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        revoked=False,
    )
    db.add(token)
    db.flush()
    return token


def refresh_token_is_valid(token: RefreshToken, now: datetime | None = None) -> bool:
    """Return True if the refresh token is neither revoked nor expired."""
    if token.revoked:
        return False
    expires_at = token.expires_at
    if expires_at.tzinfo is None:  # SQLite returns naive datetimes
        expires_at = expires_at.replace(tzinfo=UTC)
    return expires_at > (now or datetime.now(UTC))
