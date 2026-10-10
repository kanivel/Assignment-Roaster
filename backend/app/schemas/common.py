"""Schemas shared across modules."""

from pydantic import BaseModel, Field


class Paginated[T](BaseModel):
    """Generic paginated list envelope."""

    items: list[T]
    total: int = Field(ge=0, description="Total number of matching rows")
    limit: int = Field(ge=1, description="Page size requested")
    offset: int = Field(ge=0, description="Number of rows skipped")
