"""Startup maintenance tasks run from the FastAPI lifespan.

Kept in its own module (with its own ``SessionLocal`` reference) so tests can point it
at the test database, and so a maintenance failure never prevents the API from booting.
"""

import logging

from app.database import SessionLocal
from app.services import submission_service

logger = logging.getLogger(__name__)


def reap_stale_reviews() -> int:
    """Fail in-progress submissions that were orphaned by a previous process.

    Returns the number of rows updated, or 0 if the database was not reachable
    (the error is logged; startup continues).
    """
    try:
        with SessionLocal() as db:
            return submission_service.fail_stale_reviews(db)
    except Exception:
        logger.exception("Stale review cleanup failed; continuing startup")
        return 0
