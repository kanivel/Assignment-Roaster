"""Application exceptions and FastAPI exception handlers."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base application error carrying an HTTP status code and machine-readable code."""

    status_code: int = 500
    code: str = "INTERNAL_ERROR"

    def __init__(self, message: str = "Internal server error", code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code


class BadRequestError(AppError):
    status_code = 400
    code = "BAD_REQUEST"

    def __init__(self, message: str = "Bad request") -> None:
        super().__init__(message)


class UnauthorizedError(AppError):
    status_code = 401
    code = "UNAUTHORIZED"

    def __init__(self, message: str = "Not authenticated") -> None:
        super().__init__(message)


class ForbiddenError(AppError):
    status_code = 403
    code = "FORBIDDEN"

    def __init__(self, message: str = "Forbidden") -> None:
        super().__init__(message)


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"

    def __init__(self, resource: str = "Resource") -> None:
        super().__init__(f"{resource} not found")


class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"

    def __init__(self, message: str = "Conflict") -> None:
        super().__init__(message)


class RateLimitError(AppError):
    status_code = 429
    code = "RATE_LIMITED"

    def __init__(self, message: str = "Too many requests") -> None:
        super().__init__(message)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Render any AppError as {"detail": message, "code": code}."""
    headers: dict[str, str] = {}
    if exc.status_code == 401:
        headers["WWW-Authenticate"] = "Bearer"
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message, "code": exc.code},
        headers=headers,
    )


def _flatten_validation_errors(exc: RequestValidationError) -> list[dict[str, str]]:
    """Reduce pydantic's error list to JSON-safe ``{field, message, type}`` dicts."""
    flattened: list[dict[str, str]] = []
    for error in exc.errors():
        loc: tuple[Any, ...] = tuple(error.get("loc") or ())
        # Drop the leading "body"/"query"/"path" marker; keep nested keys and indices.
        parts = [str(part) for part in (loc[1:] if len(loc) > 1 else loc)]
        flattened.append(
            {
                "field": ".".join(parts) or "request",
                "message": str(error.get("msg", "Invalid value")),
                "type": str(error.get("type", "value_error")),
            }
        )
    return flattened


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Render 422s in the same ``{detail, code}`` envelope, plus the full error list.

    ``detail`` is a human-readable string naming the first offending field so the UI can
    show it directly; ``errors`` carries every problem for form-level highlighting.
    """
    errors = _flatten_validation_errors(exc)
    first = errors[0] if errors else {"field": "request", "message": "Invalid request"}
    return JSONResponse(
        status_code=422,
        content={
            "detail": f"{first['field']}: {first['message']}",
            "code": "VALIDATION_ERROR",
            "errors": errors,
        },
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all so unexpected errors never leak stack traces to clients."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "code": "INTERNAL_ERROR"},
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Attach the application exception handlers to a FastAPI app."""
    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_error_handler)
