"""Shared slowapi rate limiter.

Lives in its own module so routers can import it without importing ``app.main``
(which would be circular). ``app.main`` must assign this instance to
``app.state.limiter``.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

__all__ = ["limiter"]
