"""Health endpoint, exception handlers and database helpers."""

from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db, normalize_database_url
from app.exceptions import (
    AppError,
    BadRequestError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    RateLimitError,
    UnauthorizedError,
    register_exception_handlers,
)
from app.main import app, create_app


def test_health_returns_healthy(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_create_app_mounts_routers_under_prefix() -> None:
    fresh = create_app()
    paths = set(fresh.openapi()["paths"])
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/submissions/" in paths
    assert "/api/v1/reviews/{submission_id}" in paths
    assert "/health" in paths
    assert fresh.state.limiter is app.state.limiter


def test_openapi_schema_is_served(client: TestClient) -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    assert "/api/v1/submissions/" in schema["paths"]
    assert "/api/v1/auth/google/callback" in schema["paths"]


@pytest.mark.parametrize(
    ("exc", "status", "code"),
    [
        (BadRequestError("nope"), 400, "BAD_REQUEST"),
        (UnauthorizedError(), 401, "UNAUTHORIZED"),
        (ForbiddenError(), 403, "FORBIDDEN"),
        (NotFoundError("Widget"), 404, "NOT_FOUND"),
        (ConflictError("dup"), 409, "CONFLICT"),
        (RateLimitError(), 429, "RATE_LIMITED"),
        (AppError(), 500, "INTERNAL_ERROR"),
        (AppError("custom", code="CUSTOM"), 500, "CUSTOM"),
    ],
)
def test_app_error_handler_renders_detail_and_code(exc: AppError, status: int, code: str) -> None:
    mini = FastAPI()
    register_exception_handlers(mini)

    @mini.get("/boom")
    async def boom() -> None:
        raise exc

    response = TestClient(mini).get("/boom")
    assert response.status_code == status
    assert response.json() == {"detail": exc.message, "code": code}
    if status == 401:
        assert response.headers["www-authenticate"] == "Bearer"
    else:
        assert "www-authenticate" not in response.headers


def test_not_found_error_message_includes_resource() -> None:
    assert NotFoundError("Submission").message == "Submission not found"
    assert NotFoundError().message == "Resource not found"


def test_unhandled_exception_returns_generic_500() -> None:
    mini = FastAPI()
    register_exception_handlers(mini)

    @mini.get("/crash")
    async def crash() -> None:
        raise RuntimeError("secret internals")

    response = TestClient(mini, raise_server_exceptions=False).get("/crash")
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error", "code": "INTERNAL_ERROR"}
    assert "secret internals" not in response.text


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("postgresql://u:p@h:5432/db", "postgresql+psycopg2://u:p@h:5432/db"),
        ("postgres://u:p@h/db", "postgresql+psycopg2://u:p@h/db"),
        ("postgresql+psycopg://u:p@h/db", "postgresql+psycopg://u:p@h/db"),
        ("sqlite://", "sqlite://"),
    ],
)
def test_normalize_database_url(raw: str, expected: str) -> None:
    assert normalize_database_url(raw) == expected


def test_get_db_yields_session_and_closes() -> None:
    generator: Generator[Session, None, None] = get_db()
    session = next(generator)
    assert isinstance(session, Session)
    assert isinstance(session, SessionLocal.class_)
    with pytest.raises(StopIteration):
        next(generator)
