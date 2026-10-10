"""Google OAuth 2.0 (OpenID Connect) via authlib, with an HMAC-signed state cookie for CSRF.

No session middleware is required: the ``state`` value is stored in a signed,
short-lived cookie on the browser and compared with the ``state`` query
parameter Google echoes back on the callback.
"""

import hashlib
import hmac
import logging
import secrets
import time
from dataclasses import dataclass

from authlib.integrations.httpx_client import AsyncOAuth2Client

from app.config import settings
from app.exceptions import AppError, UnauthorizedError

logger = logging.getLogger(__name__)

GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_SCOPE = "openid email profile"

STATE_COOKIE_NAME = "oauth_state"
STATE_TTL_SECONDS = 600


class OAuthNotConfiguredError(AppError):
    """Raised when Google OAuth credentials are missing from the environment."""

    status_code = 503
    code = "OAUTH_NOT_CONFIGURED"

    def __init__(self) -> None:
        super().__init__("Google OAuth is not configured")


@dataclass(frozen=True)
class GoogleUserInfo:
    """Subset of the OpenID userinfo response we care about."""

    sub: str
    email: str
    email_verified: bool
    name: str | None
    picture: str | None


def _ensure_configured() -> None:
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise OAuthNotConfiguredError()


def _sign(message: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), message.encode(), hashlib.sha256).hexdigest()


def generate_state() -> str:
    """Return a fresh random state value."""
    return secrets.token_urlsafe(32)


def sign_state(state: str, issued_at: int | None = None) -> str:
    """Build the signed cookie value ``state.timestamp.signature``."""
    ts = str(issued_at if issued_at is not None else int(time.time()))
    message = f"{state}.{ts}"
    return f"{message}.{_sign(message)}"


def verify_state(cookie_value: str | None, state: str | None) -> bool:
    """Check the callback ``state`` against the signed cookie (signature, match and TTL)."""
    if not cookie_value or not state:
        return False
    parts = cookie_value.rsplit(".", 2)
    if len(parts) != 3:
        return False
    cookie_state, ts, signature = parts
    if not hmac.compare_digest(_sign(f"{cookie_state}.{ts}"), signature):
        return False
    if not hmac.compare_digest(cookie_state, state):
        return False
    try:
        issued_at = int(ts)
    except ValueError:
        return False
    return 0 <= time.time() - issued_at <= STATE_TTL_SECONDS


def _oauth_session() -> AsyncOAuth2Client:
    return AsyncOAuth2Client(
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scope=GOOGLE_SCOPE,
        redirect_uri=settings.GOOGLE_REDIRECT_URI,
    )


def build_authorization_url(state: str) -> str:
    """Return the Google consent-screen URL bound to the given state."""
    _ensure_configured()
    client = _oauth_session()
    url, _ = client.create_authorization_url(
        GOOGLE_AUTHORIZE_URL, state=state, prompt="select_account"
    )
    return url


async def fetch_google_user(code: str) -> GoogleUserInfo:
    """Exchange the authorization code for tokens and fetch the user's profile.

    Raises:
        UnauthorizedError: if the exchange fails or Google reports an unverified email.
    """
    _ensure_configured()
    async with _oauth_session() as client:
        try:
            await client.fetch_token(GOOGLE_TOKEN_URL, code=code, grant_type="authorization_code")
            response = await client.get(GOOGLE_USERINFO_URL)
            response.raise_for_status()
        except Exception as exc:  # authlib / httpx raise a variety of error types
            logger.warning("Google OAuth code exchange failed: %s", exc)
            raise UnauthorizedError("Google authentication failed") from exc

    data = response.json()
    email = data.get("email")
    if not email:
        raise UnauthorizedError("Google account has no email address")
    verified = bool(data.get("email_verified", False))
    if not verified:
        raise UnauthorizedError("Google email address is not verified")

    return GoogleUserInfo(
        sub=str(data.get("sub", "")),
        email=email,
        email_verified=verified,
        name=data.get("name"),
        picture=data.get("picture"),
    )
