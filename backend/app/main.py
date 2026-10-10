"""FastAPI application entrypoint for Assignment Roaster."""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.exceptions import register_exception_handlers
from app.limiter import limiter
from app.services import maintenance

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Startup: fail reviews orphaned by a previous process so users can retry them."""
    reaped = await asyncio.to_thread(maintenance.reap_stale_reviews)
    if reaped:
        logger.info("Startup cleanup marked %d stale reviews as failed", reaped)
    yield


async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Return a JSON 429 when a slowapi limit is exceeded."""
    return JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded: {exc.detail}", "code": "RATE_LIMITED"},
    )


def include_routers(app: FastAPI) -> None:
    """Mount API routers under API_PREFIX."""
    from app.routers import admin, auth, dashboard, leaderboard, reviews, submissions

    app.include_router(auth.router, prefix=API_PREFIX)
    app.include_router(submissions.router, prefix=API_PREFIX)
    app.include_router(reviews.router, prefix=API_PREFIX)
    app.include_router(leaderboard.router, prefix=API_PREFIX)
    app.include_router(dashboard.router, prefix=API_PREFIX)
    app.include_router(admin.router, prefix=API_PREFIX)


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    app = FastAPI(title=settings.APP_NAME, version="1.0.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_handler)  # type: ignore[arg-type]
    register_exception_handlers(app)
    include_routers(app)

    @app.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        return {"status": "healthy"}

    logger.info("%s v%s initialised", app.title, app.version)
    return app


app = create_app()
