"""Authentication business logic: registration, login, token lifecycle, profile, Google upsert."""

import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.jwt import (
    create_access_token,
    create_refresh_token,
    hash_password,
    refresh_token_is_valid,
    verify_password,
)
from app.exceptions import ConflictError, UnauthorizedError
from app.models.oauth_login_code import OAuthLoginCode
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import TokenResponse
from app.schemas.user import UserUpdate

logger = logging.getLogger(__name__)

GOOGLE_PROVIDER = "google"
LOGIN_CODE_TTL_SECONDS = 60
LOGIN_CODE_BYTES = 32

# Computed once at import so an unknown email costs exactly one bcrypt verify, the same
# as a known email with a wrong password (no timing oracle, no double CPU cost).
_DUMMY_HASH = hash_password("dummy-password")


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _as_aware(value: datetime) -> datetime:
    """SQLite returns naive datetimes; treat them as UTC."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def get_user_by_email(db: Session, email: str) -> User | None:
    """Look a user up by (case-insensitive) email."""
    return db.scalar(select(User).where(User.email == _normalize_email(email)))


def get_user_by_id(db: Session, user_id: int) -> User | None:
    """Look a user up by primary key."""
    return db.get(User, user_id)


def register(db: Session, email: str, password: str, full_name: str | None = None) -> User:
    """Create an email/password account.

    Raises:
        ConflictError: if the email is already registered (checked up front and again
            via the unique index so concurrent registrations cannot produce a 500).
    """
    email = _normalize_email(email)
    if get_user_by_email(db, email) is not None:
        raise ConflictError("Email already registered")

    user = User(email=email, hashed_password=hash_password(password), full_name=full_name)
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        logger.info("Duplicate registration race for %s", email)
        raise ConflictError("Email already registered") from exc
    db.refresh(user)
    logger.info("Registered user id=%s", user.id)
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    """Verify email/password credentials and return the user.

    Raises:
        UnauthorizedError: on unknown email, wrong password, OAuth-only account
            (no password set) or inactive user. The message is deliberately generic.
    """
    user = get_user_by_email(db, email)
    if user is None or user.hashed_password is None:
        # One dummy verify so timing does not reveal whether the email exists.
        verify_password(password, _DUMMY_HASH)
        raise UnauthorizedError("Invalid email or password")
    if not verify_password(password, user.hashed_password):
        raise UnauthorizedError("Invalid email or password")
    if not user.is_active:
        raise UnauthorizedError("Account is inactive")
    return user


def issue_tokens(db: Session, user: User) -> TokenResponse:
    """Create a new access token and a persisted refresh token for the user."""
    refresh = create_refresh_token(db, user.id)
    db.commit()
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=refresh.token,
    )


def _get_refresh_token(db: Session, token: str) -> RefreshToken | None:
    return db.scalar(select(RefreshToken).where(RefreshToken.token == token))


def rotate_refresh_token(db: Session, token: str) -> TokenResponse:
    """Revoke the given refresh token and issue a fresh token pair.

    Raises:
        UnauthorizedError: if the token is unknown, revoked, expired, or the user is inactive.
    """
    stored = _get_refresh_token(db, token)
    if stored is None or not refresh_token_is_valid(stored):
        logger.debug("Refresh rejected: token unknown, revoked or expired")
        raise UnauthorizedError("Invalid or expired refresh token")

    user = stored.user
    if user is None or not user.is_active:
        raise UnauthorizedError("Account is inactive")

    stored.revoked = True
    db.flush()
    return issue_tokens(db, user)


def revoke_refresh_token(db: Session, token: str) -> None:
    """Mark a refresh token as revoked. Unknown tokens are ignored (idempotent)."""
    stored = _get_refresh_token(db, token)
    if stored is None:
        return
    if not stored.revoked:
        stored.revoked = True
        db.commit()


def update_profile(db: Session, user: User, data: UserUpdate) -> User:
    """Apply the provided (explicitly set) profile fields and persist."""
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


def get_or_create_google_user(
    db: Session, email: str, name: str | None, picture: str | None
) -> User:
    """Upsert a user from a verified Google profile.

    New users are created with ``hashed_password=None``, ``oauth_provider="google"``
    and ``is_verified=True``. Existing users (matched by email) are linked to Google
    and have missing profile fields filled in; an existing password is kept.

    Raises:
        UnauthorizedError: if the matched account is inactive.
    """
    email = _normalize_email(email)
    user = get_user_by_email(db, email)

    if user is None:
        user = User(
            email=email,
            hashed_password=None,
            full_name=name,
            avatar_url=picture,
            oauth_provider=GOOGLE_PROVIDER,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info("Created Google user id=%s", user.id)
        return user

    if not user.is_active:
        raise UnauthorizedError("Account is inactive")

    if user.oauth_provider is None:
        user.oauth_provider = GOOGLE_PROVIDER
    if not user.full_name and name:
        user.full_name = name
    if not user.avatar_url and picture:
        user.avatar_url = picture
    user.is_verified = True
    db.commit()
    db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# Single-use OAuth login codes
# ---------------------------------------------------------------------------


def _hash_login_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def create_login_code(db: Session, user: User) -> str:
    """Persist a single-use login code for ``user`` and return the raw code.

    Only the SHA-256 hash is stored. Expired rows are pruned opportunistically so the
    table does not grow with every sign-in.
    """
    now = _utcnow()
    db.execute(
        delete(OAuthLoginCode).where(OAuthLoginCode.expires_at < now),
        execution_options={"synchronize_session": "fetch"},
    )
    code = secrets.token_urlsafe(LOGIN_CODE_BYTES)
    db.add(
        OAuthLoginCode(
            code_hash=_hash_login_code(code),
            user_id=user.id,
            expires_at=now + timedelta(seconds=LOGIN_CODE_TTL_SECONDS),
            used=False,
        )
    )
    db.commit()
    return code


def exchange_login_code(db: Session, code: str) -> TokenResponse:
    """Redeem a login code for a token pair. The code is marked used atomically.

    Raises:
        UnauthorizedError: if the code is unknown, expired, already used, or the
            user is inactive. The message is the same in every case.
    """
    stored = db.scalar(
        select(OAuthLoginCode).where(OAuthLoginCode.code_hash == _hash_login_code(code))
    )
    if stored is None or stored.used or _as_aware(stored.expires_at) <= _utcnow():
        logger.debug("Login code rejected: unknown, used or expired")
        raise UnauthorizedError("Invalid or expired login code")

    # Claim the code with a conditional UPDATE so two concurrent exchanges cannot both win.
    claimed = db.execute(
        update(OAuthLoginCode)
        .where(OAuthLoginCode.id == stored.id, OAuthLoginCode.used.is_(False))
        .values(used=True)
    )
    if claimed.rowcount != 1:
        db.rollback()
        logger.debug("Login code already claimed concurrently")
        raise UnauthorizedError("Invalid or expired login code")

    user = db.get(User, stored.user_id)
    if user is None or not user.is_active:
        db.commit()  # keep the code burned
        raise UnauthorizedError("Account is inactive")

    tokens = issue_tokens(db, user)
    logger.info("Login code exchanged for user id=%s", user.id)
    return tokens
