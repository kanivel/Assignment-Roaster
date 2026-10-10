"""Auth module: registration, login, tokens, profile, admin guard and Google OAuth."""

from __future__ import annotations

import time
from collections.abc import Generator
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import google
from app.auth.dependencies import require_admin
from app.auth.google import GoogleUserInfo
from app.auth.jwt import (
    decode_access_token,
    hash_password,
    refresh_token_is_valid,
    verify_password,
)
from app.config import settings
from app.database import get_db
from app.exceptions import ForbiddenError, UnauthorizedError, register_exception_handlers
from app.models.oauth_login_code import OAuthLoginCode
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.services import auth_service
from tests.conftest import API, TestingSessionLocal, auth_headers, create_user

AUTH = f"{API}/auth"


def _register(client: TestClient, email: str = "new@example.com", **extra: Any) -> Any:
    payload: dict[str, Any] = {"email": email, "password": "password123", **extra}
    return client.post(f"{AUTH}/register", json=payload)


def _login(client: TestClient, email: str, password: str) -> Any:
    return client.post(f"{AUTH}/login", json={"email": email, "password": password})


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------


def test_register_returns_201_with_token_pair(client: TestClient, db: Session) -> None:
    response = _register(client, "New@Example.com", full_name="Newbie")
    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"access_token", "refresh_token", "token_type"}
    assert body["token_type"] == "bearer"

    user = db.scalar(select(User).where(User.email == "new@example.com"))
    assert user is not None, "email is normalised to lower case"
    assert user.full_name == "Newbie"
    assert user.hashed_password != "password123"
    assert verify_password("password123", user.hashed_password or "")


def test_register_duplicate_email_returns_409(client: TestClient, user: User) -> None:
    response = _register(client, user.email.upper())
    assert response.status_code == 409
    assert response.json() == {"detail": "Email already registered", "code": "CONFLICT"}


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "weak@example.com", "password": "short"},
        {"email": "not-an-email", "password": "password123"},
        {"email": "weak@example.com"},
        {"email": "weak@example.com", "password": "x" * 73},
    ],
)
def test_register_rejects_invalid_payload_with_422(
    client: TestClient, db: Session, payload: dict[str, str]
) -> None:
    response = client.post(f"{AUTH}/register", json=payload)
    assert response.status_code == 422
    assert db.scalar(select(User)) is None


def test_validation_errors_use_detail_code_envelope(client: TestClient, db: Session) -> None:
    response = client.post(f"{AUTH}/register", json={"email": "x@example.com", "password": "short"})
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert isinstance(body["detail"], str)
    assert body["detail"].startswith("password: ")
    assert "at least 8 characters" in body["detail"]
    assert body["errors"] == [
        {"field": "password", "message": body["detail"].removeprefix("password: "), "type": ANY_STR}
    ]

    # Several problems: detail names the first, errors lists all of them.
    response = client.post(f"{AUTH}/register", json={"email": "nope", "password": "short"})
    fields = [error["field"] for error in response.json()["errors"]]
    assert fields == ["email", "password"]
    assert response.json()["detail"].startswith("email: ")

    # Query parameters report their own name too.
    response = client.get(f"{API}/leaderboard", params={"limit": 0})
    assert response.status_code == 422
    assert response.json()["detail"].startswith("limit: ")


class _AnyStr:
    def __eq__(self, other: object) -> bool:
        return isinstance(other, str) and bool(other)


ANY_STR = _AnyStr()


def test_register_duplicate_race_returns_409_not_500(
    client: TestClient, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If the pre-check misses (concurrent insert), the unique index still yields a 409."""
    monkeypatch.setattr(auth_service, "get_user_by_email", lambda db, email: None)
    response = _register(client, user.email)
    assert response.status_code == 409
    assert response.json() == {"detail": "Email already registered", "code": "CONFLICT"}


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------


def test_login_returns_200_with_tokens(client: TestClient, user: User) -> None:
    response = _login(client, "ANN@example.com", "password123")
    assert response.status_code == 200
    body = response.json()
    assert decode_access_token(body["access_token"]) == user.id
    assert body["refresh_token"]


def test_login_wrong_password_returns_401(client: TestClient, user: User) -> None:
    response = _login(client, user.email, "wrong-password")
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"
    assert response.headers["www-authenticate"] == "Bearer"


def test_login_unknown_email_returns_401(client: TestClient, db: Session) -> None:
    response = _login(client, "ghost@example.com", "password123")
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_login_oauth_only_user_returns_401(client: TestClient, db: Session) -> None:
    create_user(db, "g@example.com", password=None, oauth_provider="google")
    response = _login(client, "g@example.com", "password123")
    assert response.status_code == 401


def test_login_inactive_user_returns_401(client: TestClient, db: Session) -> None:
    create_user(db, "gone@example.com", password="password123", is_active=False)
    response = _login(client, "gone@example.com", "password123")
    assert response.status_code == 401
    assert response.json()["detail"] == "Account is inactive"


def test_login_is_rate_limited_after_ten_attempts(client: TestClient, db: Session) -> None:
    codes = [_login(client, "zz@example.com", "password123").status_code for _ in range(11)]
    assert codes[:10] == [401] * 10
    assert codes[10] == 429
    body = client.post(
        f"{AUTH}/login", json={"email": "zz@example.com", "password": "password123"}
    ).json()
    assert body["code"] == "RATE_LIMITED"
    assert body["detail"].startswith("Rate limit exceeded")


# ---------------------------------------------------------------------------
# /me
# ---------------------------------------------------------------------------


def test_me_returns_profile_without_password(client: TestClient, user: User) -> None:
    response = client.get(f"{AUTH}/me", headers=auth_headers(user))
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == user.email
    assert body["full_name"] == "Ann"
    assert body["is_admin"] is False
    assert body["is_active"] is True
    assert "hashed_password" not in body
    assert "password" not in body


def test_me_without_token_returns_401(client: TestClient, db: Session) -> None:
    response = client.get(f"{AUTH}/me")
    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated", "code": "UNAUTHORIZED"}


def test_me_with_garbage_token_returns_401(client: TestClient, db: Session) -> None:
    response = client.get(f"{AUTH}/me", headers={"Authorization": "Bearer garbage"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired token"


def test_me_with_expired_access_token_returns_401(client: TestClient, user: User) -> None:
    past = datetime.now(UTC) - timedelta(minutes=5)
    token = jwt.encode(
        {"sub": str(user.id), "type": "access", "iat": past, "exp": past},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    response = client.get(f"{AUTH}/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_me_with_wrong_token_type_returns_401(client: TestClient, user: User) -> None:
    exp = datetime.now(UTC) + timedelta(minutes=5)
    token = jwt.encode(
        {"sub": str(user.id), "type": "refresh", "exp": exp},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    response = client.get(f"{AUTH}/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid token type"


def test_me_with_non_integer_subject_returns_401(client: TestClient, db: Session) -> None:
    exp = datetime.now(UTC) + timedelta(minutes=5)
    token = jwt.encode(
        {"sub": "not-a-number", "type": "access", "exp": exp},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    response = client.get(f"{AUTH}/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid token subject"


def test_me_for_deleted_or_inactive_user_returns_401(
    client: TestClient, user: User, db: Session
) -> None:
    headers = auth_headers(user)
    user.is_active = False
    db.commit()
    assert client.get(f"{AUTH}/me", headers=headers).status_code == 401

    db.delete(user)
    db.commit()
    assert client.get(f"{AUTH}/me", headers=headers).status_code == 401


def test_update_me_changes_only_provided_fields(client: TestClient, user: User) -> None:
    headers = auth_headers(user)
    response = client.put(f"{AUTH}/me", headers=headers, json={"full_name": "Ann Updated"})
    assert response.status_code == 200
    assert response.json()["full_name"] == "Ann Updated"

    response = client.put(
        f"{AUTH}/me", headers=headers, json={"avatar_url": "https://img.example.com/a.png"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["full_name"] == "Ann Updated"
    assert body["avatar_url"] == "https://img.example.com/a.png"

    response = client.put(f"{AUTH}/me", headers=headers, json={"avatar_url": None})
    assert response.json()["avatar_url"] is None
    assert response.json()["full_name"] == "Ann Updated"


def test_update_me_rejects_overlong_name(client: TestClient, user: User) -> None:
    response = client.put(f"{AUTH}/me", headers=auth_headers(user), json={"full_name": "x" * 101})
    assert response.status_code == 422


def test_update_me_requires_auth(client: TestClient, db: Session) -> None:
    assert client.put(f"{AUTH}/me", json={"full_name": "x"}).status_code == 401


# ---------------------------------------------------------------------------
# Refresh / logout
# ---------------------------------------------------------------------------


def test_refresh_rotates_token_and_rejects_reuse(
    client: TestClient, user: User, db: Session
) -> None:
    first = _login(client, user.email, "password123").json()

    rotated = client.post(f"{AUTH}/refresh", json={"refresh_token": first["refresh_token"]})
    assert rotated.status_code == 200
    second = rotated.json()
    assert second["refresh_token"] != first["refresh_token"]
    assert decode_access_token(second["access_token"]) == user.id

    reused = client.post(f"{AUTH}/refresh", json={"refresh_token": first["refresh_token"]})
    assert reused.status_code == 401
    assert reused.json()["detail"] == "Invalid or expired refresh token"

    stored = db.scalar(select(RefreshToken).where(RefreshToken.token == first["refresh_token"]))
    assert stored is not None and stored.revoked is True

    assert (
        client.get(
            f"{AUTH}/me", headers={"Authorization": f"Bearer {second['access_token']}"}
        ).status_code
        == 200
    )


def test_refresh_unknown_token_returns_401(client: TestClient, db: Session) -> None:
    assert client.post(f"{AUTH}/refresh", json={"refresh_token": "nope"}).status_code == 401
    assert client.post(f"{AUTH}/refresh", json={"refresh_token": ""}).status_code == 422


def test_refresh_and_logout_are_rate_limited_at_thirty_per_minute(
    client: TestClient, db: Session
) -> None:
    codes = [
        client.post(f"{AUTH}/refresh", json={"refresh_token": "nope"}).status_code
        for _ in range(31)
    ]
    assert codes[:30] == [401] * 30 and codes[30] == 429

    codes = [
        client.post(f"{AUTH}/logout", json={"refresh_token": "nope"}).status_code
        for _ in range(31)
    ]
    assert codes[:30] == [204] * 30 and codes[30] == 429


def test_refresh_expired_token_returns_401(client: TestClient, user: User, db: Session) -> None:
    tokens = _login(client, user.email, "password123").json()
    stored = db.scalar(select(RefreshToken).where(RefreshToken.token == tokens["refresh_token"]))
    assert stored is not None
    stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()

    response = client.post(f"{AUTH}/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert response.status_code == 401


def test_refresh_for_inactive_user_returns_401(client: TestClient, user: User, db: Session) -> None:
    tokens = _login(client, user.email, "password123").json()
    user.is_active = False
    db.commit()
    response = client.post(f"{AUTH}/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert response.status_code == 401
    assert response.json()["detail"] == "Account is inactive"


def test_logout_revokes_refresh_token_and_is_idempotent(client: TestClient, user: User) -> None:
    tokens = _login(client, user.email, "password123").json()

    response = client.post(f"{AUTH}/logout", json={"refresh_token": tokens["refresh_token"]})
    assert response.status_code == 204
    assert response.content == b""

    assert (
        client.post(f"{AUTH}/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code
        == 401
    )
    assert (
        client.post(f"{AUTH}/logout", json={"refresh_token": tokens["refresh_token"]}).status_code
        == 204
    )
    assert client.post(f"{AUTH}/logout", json={"refresh_token": "unknown"}).status_code == 204


def test_refresh_token_is_valid_handles_naive_and_aware_datetimes() -> None:
    aware = RefreshToken(token="a", expires_at=datetime.now(UTC) + timedelta(days=1), revoked=False)
    naive = RefreshToken(
        token="b",
        expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1),
        revoked=False,
    )
    revoked = RefreshToken(
        token="c", expires_at=datetime.now(UTC) + timedelta(days=1), revoked=True
    )
    expired = RefreshToken(
        token="d", expires_at=datetime.now(UTC) - timedelta(days=1), revoked=False
    )
    assert refresh_token_is_valid(aware) is True
    assert refresh_token_is_valid(naive) is True
    assert refresh_token_is_valid(revoked) is False
    assert refresh_token_is_valid(expired) is False


def test_verify_password_tolerates_malformed_hash() -> None:
    assert verify_password("x", "not-a-bcrypt-hash") is False
    assert verify_password("x", hash_password("x")) is True


# ---------------------------------------------------------------------------
# require_admin
# ---------------------------------------------------------------------------


@pytest.fixture
def admin_client(db: Session) -> Generator[TestClient, None, None]:
    """A throwaway app exposing one ``require_admin`` protected route."""
    mini = FastAPI()
    register_exception_handlers(mini)

    def _override_get_db() -> Generator[Session, None, None]:
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    mini.dependency_overrides[get_db] = _override_get_db

    @mini.get("/admin-only")
    async def admin_only(current: User = Depends(require_admin)) -> dict[str, str]:
        return {"email": current.email}

    yield TestClient(mini)


def test_require_admin_rejects_regular_user_with_403(admin_client: TestClient, user: User) -> None:
    response = admin_client.get("/admin-only", headers=auth_headers(user))
    assert response.status_code == 403
    assert response.json() == {"detail": "Admin privileges required", "code": "FORBIDDEN"}


def test_require_admin_allows_admin(admin_client: TestClient, admin: User) -> None:
    response = admin_client.get("/admin-only", headers=auth_headers(admin))
    assert response.status_code == 200
    assert response.json()["email"] == admin.email


def test_require_admin_requires_authentication(admin_client: TestClient, db: Session) -> None:
    assert admin_client.get("/admin-only").status_code == 401


async def test_require_admin_dependency_directly() -> None:
    with pytest.raises(ForbiddenError):
        await require_admin(User(email="x@example.com", is_admin=False))
    admin_user = User(email="a@example.com", is_admin=True)
    assert await require_admin(admin_user) is admin_user


# ---------------------------------------------------------------------------
# Google OAuth
# ---------------------------------------------------------------------------


@pytest.fixture
def google_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "client-id")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "client-secret")


def test_google_login_returns_503_when_not_configured(client: TestClient, db: Session) -> None:
    response = client.get(f"{AUTH}/google", follow_redirects=False)
    assert response.status_code == 503
    assert response.json()["code"] == "OAUTH_NOT_CONFIGURED"


def test_google_login_redirects_and_sets_state_cookie(
    client: TestClient, db: Session, google_configured: None
) -> None:
    response = client.get(f"{AUTH}/google", follow_redirects=False)
    assert response.status_code == 302
    location = response.headers["location"]
    assert location.startswith(google.GOOGLE_AUTHORIZE_URL)
    query = parse_qs(urlparse(location).query)
    assert query["client_id"] == ["client-id"]
    assert query["scope"] == [google.GOOGLE_SCOPE]
    assert query["redirect_uri"] == [settings.GOOGLE_REDIRECT_URI]
    assert query["prompt"] == ["select_account"]
    state = query["state"][0]

    cookie = response.cookies.get(google.STATE_COOKIE_NAME)
    assert cookie is not None and cookie.startswith(f"{state}.")
    assert google.verify_state(cookie, state) is True
    set_cookie = response.headers["set-cookie"]
    assert "HttpOnly" in set_cookie
    assert "SameSite=lax" in set_cookie
    assert "Path=/api/v1/auth/google" in set_cookie
    assert "Secure" not in set_cookie, "FRONTEND_URL is http:// in tests"


def _start_google_flow(client: TestClient) -> str:
    """Hit /google so the client holds a valid state cookie; return the state value."""
    response = client.get(f"{AUTH}/google", follow_redirects=False)
    return parse_qs(urlparse(response.headers["location"]).query)["state"][0]


def test_google_callback_with_bad_state_returns_401(
    client: TestClient, db: Session, google_configured: None
) -> None:
    _start_google_flow(client)
    response = client.get(
        f"{AUTH}/google/callback", params={"code": "c", "state": "wrong"}, follow_redirects=False
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid OAuth state"


def test_google_callback_without_cookie_returns_401(
    client: TestClient, db: Session, google_configured: None
) -> None:
    response = client.get(
        f"{AUTH}/google/callback", params={"code": "c", "state": "s"}, follow_redirects=False
    )
    assert response.status_code == 401


def test_google_callback_without_code_returns_401(
    client: TestClient, db: Session, google_configured: None
) -> None:
    state = _start_google_flow(client)
    response = client.get(
        f"{AUTH}/google/callback", params={"state": state}, follow_redirects=False
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Missing authorization code"


def test_google_callback_error_param_redirects_to_frontend(client: TestClient, db: Session) -> None:
    response = client.get(
        f"{AUTH}/google/callback", params={"error": "access_denied"}, follow_redirects=False
    )
    assert response.status_code == 302
    assert response.headers["location"] == "http://localhost:5173/auth/callback?error=access_denied"


@pytest.fixture
def fake_google_user(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Replace the code exchange with a stub returning a verified Google profile."""
    codes: list[str] = []

    async def _fetch(code: str) -> GoogleUserInfo:
        codes.append(code)
        return GoogleUserInfo(
            sub="123",
            email="G@gmail.com",
            email_verified=True,
            name="Goo Gle",
            picture="https://pic",
        )

    monkeypatch.setattr(google, "fetch_google_user", _fetch)
    return codes


def test_google_callback_success_creates_oauth_user_and_redirects(
    client: TestClient, db: Session, google_configured: None, fake_google_user: list[str]
) -> None:
    state = _start_google_flow(client)
    response = client.get(
        f"{AUTH}/google/callback",
        params={"code": "goodcode", "state": state},
        follow_redirects=False,
    )
    assert response.status_code == 302
    assert fake_google_user == ["goodcode"]

    location = response.headers["location"]
    assert location.startswith("http://localhost:5173/auth/callback?")
    query = parse_qs(urlparse(location).query)
    assert set(query) == {"code"}, "only an opaque single-use code travels in the URL"
    assert "access_token" not in location and "refresh_token" not in location
    login_code = query["code"][0]
    assert len(login_code) >= 32
    set_cookie = response.headers.get("set-cookie", "")
    assert 'oauth_state=""' in set_cookie or "Max-Age=0" in set_cookie

    user = db.scalar(select(User).where(User.email == "g@gmail.com"))
    assert user is not None
    assert user.hashed_password is None
    assert user.oauth_provider == "google"
    assert user.is_verified is True
    assert user.full_name == "Goo Gle"
    assert user.avatar_url == "https://pic"

    stored = db.scalar(select(OAuthLoginCode).where(OAuthLoginCode.user_id == user.id))
    assert stored is not None
    assert stored.code_hash != login_code and len(stored.code_hash) == 64, "only the hash is stored"
    assert stored.used is False

    exchanged = client.post(f"{AUTH}/google/exchange", json={"code": login_code})
    assert exchanged.status_code == 200
    body = exchanged.json()
    assert set(body) == {"access_token", "refresh_token", "token_type"}
    assert decode_access_token(body["access_token"]) == user.id
    db.refresh(stored)
    assert stored.used is True

    me = client.get(f"{AUTH}/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200 and me.json()["email"] == "g@gmail.com"

    # Single use: the same code is rejected afterwards.
    replay = client.post(f"{AUTH}/google/exchange", json={"code": login_code})
    assert replay.status_code == 401
    assert replay.json() == {"detail": "Invalid or expired login code", "code": "UNAUTHORIZED"}

    # Second sign-in: same account, no duplicate row.
    state = _start_google_flow(client)
    again = client.get(
        f"{AUTH}/google/callback",
        params={"code": "goodcode", "state": state},
        follow_redirects=False,
    )
    assert again.status_code == 302
    assert len(db.scalars(select(User).where(User.email == "g@gmail.com")).all()) == 1


def test_google_exchange_rejects_unknown_expired_and_inactive(
    client: TestClient, db: Session, user: User
) -> None:
    assert client.post(f"{AUTH}/google/exchange", json={"code": "unknown"}).status_code == 401
    assert client.post(f"{AUTH}/google/exchange", json={"code": ""}).status_code == 422

    expired = auth_service.create_login_code(db, user)
    stored = db.scalar(select(OAuthLoginCode).where(OAuthLoginCode.user_id == user.id))
    assert stored is not None
    stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()
    response = client.post(f"{AUTH}/google/exchange", json={"code": expired})
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired login code"

    # Expired rows are pruned when the next code is created.
    fresh = auth_service.create_login_code(db, user)
    db.expire_all()
    remaining = db.scalars(select(OAuthLoginCode).where(OAuthLoginCode.user_id == user.id)).all()
    assert len(remaining) == 1 and remaining[0].used is False

    user.is_active = False
    db.commit()
    response = client.post(f"{AUTH}/google/exchange", json={"code": fresh})
    assert response.status_code == 401
    assert response.json()["detail"] == "Account is inactive"
    db.expire_all()
    assert remaining[0].used is True, "the code is burned even when the account is inactive"


def test_google_exchange_concurrent_claim_loses(
    db: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If another request claims the code between the read and the UPDATE, we get 401."""
    code = auth_service.create_login_code(db, user)
    real_execute = db.execute

    def _racing_execute(statement: Any, *args: Any, **kwargs: Any) -> Any:
        if getattr(statement, "is_update", False):
            real_execute(statement, *args, **kwargs)  # the "other" request wins first
        return real_execute(statement, *args, **kwargs)

    monkeypatch.setattr(db, "execute", _racing_execute)
    with pytest.raises(UnauthorizedError, match="Invalid or expired login code"):
        auth_service.exchange_login_code(db, code)


def test_google_exchange_is_rate_limited(client: TestClient, db: Session) -> None:
    codes = [
        client.post(f"{AUTH}/google/exchange", json={"code": "guess"}).status_code
        for _ in range(11)
    ]
    assert codes[:10] == [401] * 10 and codes[10] == 429


def test_login_code_ttl_is_sixty_seconds(db: Session, user: User) -> None:
    before = datetime.now(UTC)
    auth_service.create_login_code(db, user)
    stored = db.scalar(select(OAuthLoginCode).where(OAuthLoginCode.user_id == user.id))
    assert stored is not None
    expires_at = stored.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    assert auth_service.LOGIN_CODE_TTL_SECONDS == 60
    assert timedelta(seconds=59) <= expires_at - before <= timedelta(seconds=61)


def test_google_callback_links_existing_password_account(
    client: TestClient, db: Session, google_configured: None, fake_google_user: list[str]
) -> None:
    existing = create_user(db, "g@gmail.com", password="password123")
    state = _start_google_flow(client)
    response = client.get(
        f"{AUTH}/google/callback",
        params={"code": "goodcode", "state": state},
        follow_redirects=False,
    )
    assert response.status_code == 302
    db.refresh(existing)
    assert existing.oauth_provider == "google"
    assert existing.is_verified is True
    assert existing.full_name == "Goo Gle"
    assert existing.hashed_password is not None, "linking keeps the password"
    assert _login(client, "g@gmail.com", "password123").status_code == 200


def test_google_callback_inactive_linked_account_returns_401(
    client: TestClient, db: Session, google_configured: None, fake_google_user: list[str]
) -> None:
    create_user(db, "g@gmail.com", password="password123", is_active=False)
    state = _start_google_flow(client)
    response = client.get(
        f"{AUTH}/google/callback",
        params={"code": "goodcode", "state": state},
        follow_redirects=False,
    )
    assert response.status_code == 401


def test_get_or_create_google_user_fills_missing_profile_fields(db: Session) -> None:
    existing = create_user(
        db, "g@gmail.com", password="password123", full_name="Kept", oauth_provider=None
    )
    user = auth_service.get_or_create_google_user(db, "G@gmail.com", "Ignored", "https://pic")
    assert user.id == existing.id
    assert user.full_name == "Kept"
    assert user.avatar_url == "https://pic"
    assert user.oauth_provider == "google"


def test_verify_state_rejects_tampered_stale_and_malformed_values() -> None:
    state = google.generate_state()
    cookie = google.sign_state(state)
    assert google.verify_state(cookie, state) is True

    tampered = cookie[:-1] + ("0" if cookie[-1] != "0" else "1")
    assert google.verify_state(tampered, state) is False
    assert google.verify_state(cookie, "other-state") is False
    assert google.verify_state(None, state) is False
    assert google.verify_state(cookie, None) is False
    assert google.verify_state("no-dots", state) is False

    stale = google.sign_state(state, issued_at=int(time.time()) - google.STATE_TTL_SECONDS - 1)
    assert google.verify_state(stale, state) is False
    future = google.sign_state(state, issued_at=int(time.time()) + 60)
    assert google.verify_state(future, state) is False

    # Valid signature over a non-numeric timestamp
    bad_ts = f"{state}.notanumber"
    forged = f"{bad_ts}.{google._sign(bad_ts)}"
    assert google.verify_state(forged, state) is False


class _FakeOAuthSession:
    """Minimal async-context stand-in for authlib's AsyncOAuth2Client."""

    def __init__(self, userinfo: dict[str, Any] | None, fail: Exception | None = None) -> None:
        self.userinfo = userinfo
        self.fail = fail
        self.token_calls: list[dict[str, Any]] = []

    async def __aenter__(self) -> _FakeOAuthSession:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def fetch_token(self, url: str, **kwargs: Any) -> dict[str, str]:
        if self.fail is not None:
            raise self.fail
        self.token_calls.append({"url": url, **kwargs})
        return {"access_token": "ya29"}

    async def get(self, url: str) -> SimpleNamespace:
        assert url == google.GOOGLE_USERINFO_URL
        return SimpleNamespace(json=lambda: self.userinfo, raise_for_status=lambda: None)


async def test_fetch_google_user_success(
    monkeypatch: pytest.MonkeyPatch, google_configured: None
) -> None:
    session = _FakeOAuthSession(
        {"sub": 42, "email": "u@gmail.com", "email_verified": True, "name": "U", "picture": "p"}
    )
    monkeypatch.setattr(google, "_oauth_session", lambda: session)
    info = await google.fetch_google_user("the-code")
    assert info == GoogleUserInfo(
        sub="42", email="u@gmail.com", email_verified=True, name="U", picture="p"
    )
    assert session.token_calls == [
        {"url": google.GOOGLE_TOKEN_URL, "code": "the-code", "grant_type": "authorization_code"}
    ]


async def test_fetch_google_user_exchange_failure_raises_401(
    monkeypatch: pytest.MonkeyPatch, google_configured: None
) -> None:
    monkeypatch.setattr(
        google, "_oauth_session", lambda: _FakeOAuthSession(None, fail=RuntimeError("bad code"))
    )
    with pytest.raises(UnauthorizedError, match="Google authentication failed"):
        await google.fetch_google_user("x")


@pytest.mark.parametrize(
    ("userinfo", "message"),
    [
        ({"sub": "1", "email_verified": True}, "no email address"),
        ({"sub": "1", "email": "u@gmail.com", "email_verified": False}, "not verified"),
    ],
)
async def test_fetch_google_user_rejects_bad_profiles(
    monkeypatch: pytest.MonkeyPatch, google_configured: None, userinfo: dict[str, Any], message: str
) -> None:
    monkeypatch.setattr(google, "_oauth_session", lambda: _FakeOAuthSession(userinfo))
    with pytest.raises(UnauthorizedError, match=message):
        await google.fetch_google_user("x")


async def test_fetch_google_user_requires_configuration() -> None:
    with pytest.raises(google.OAuthNotConfiguredError):
        await google.fetch_google_user("x")
