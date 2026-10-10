"""Single-use OAuth login code.

After a successful Google callback the API does not put tokens in the redirect URL
(they would land in proxy logs and browser history). Instead it stores the SHA-256
hash of a short-lived opaque code here and redirects with ``?code=...``; the SPA then
POSTs the code to ``/auth/google/exchange`` to receive the token pair.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class OAuthLoginCode(Base):
    __tablename__ = "oauth_login_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped[User] = relationship("User", back_populates="login_codes")

    def __repr__(self) -> str:
        return f"<OAuthLoginCode id={self.id} user_id={self.user_id} used={self.used}>"
