"""Shared FastAPI dependencies.

Other modules import ``from app.dependencies import get_db, get_current_user, require_admin``.
The implementations live in app.database (DATABASE-AGENT) and app.auth.dependencies
(BACKEND-AGENT / auth module).
"""

from app.auth.dependencies import get_current_user, require_admin
from app.database import get_db

__all__ = ["get_db", "get_current_user", "require_admin"]
