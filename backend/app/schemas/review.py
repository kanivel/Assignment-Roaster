"""Review schemas: API response shape and the structured output expected from the model."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RoastResult(BaseModel):
    """Structured output the roaster asks the review model to produce.

    Used as ``text_format`` for ``client.responses.parse`` so the response is
    guaranteed to match this schema.
    """

    score: int = Field(ge=0, le=10, description="Overall score out of 10")
    summary: str = Field(min_length=1, description="One or two sentence plain-English summary")
    roast_text: str = Field(min_length=1, description="The Tanglish roast, 150-300 words")
    strengths: list[str] = Field(min_length=1, description="What the repo does well")
    improvements: list[str] = Field(min_length=1, description="Concrete next steps")


class ReviewResponse(BaseModel):
    """Review as returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    submission_id: int
    score: int = Field(ge=0, le=10)
    summary: str
    roast_text: str
    strengths: list[str]
    improvements: list[str]
    model_used: str
    input_tokens: int
    output_tokens: int
    created_at: datetime
