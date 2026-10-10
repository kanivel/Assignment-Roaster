"""Database engine, session factory and declarative base."""

import logging
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

logger = logging.getLogger(__name__)


def normalize_database_url(url: str) -> str:
    """Pin a driverless ``postgresql://`` URL to psycopg2.

    SQLAlchemy 2.1 made psycopg (v3) the default PostgreSQL driver, but this
    project ships ``psycopg2-binary``. Making the driver explicit keeps the
    documented ``postgresql://user:pass@host/db`` format working on both 2.0 and 2.1.
    """
    if url.startswith("postgresql://"):
        return "postgresql+psycopg2://" + url[len("postgresql://") :]
    if url.startswith("postgres://"):
        return "postgresql+psycopg2://" + url[len("postgres://") :]
    return url


DATABASE_URL = normalize_database_url(settings.DATABASE_URL)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Declarative base shared by all ORM models."""


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a database session and closes it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
