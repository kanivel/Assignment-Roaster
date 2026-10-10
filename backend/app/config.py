"""Application settings loaded from environment variables / .env file."""

import json
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration. Every value can be overridden via the environment."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    APP_NAME: str = "Assignment Roaster"

    # Database
    DATABASE_URL: str

    # Auth
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    FRONTEND_URL: str = "http://localhost:5173"
    # ``NoDecode`` stops pydantic-settings from json-decoding the env value so the
    # documented comma-separated format (``http://a,http://b``) can be split below.
    ALLOWED_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/google/callback"

    # AI (OpenAI)
    OPENAI_API_KEY: str = ""
    # gpt-4.1 gives higher quality; the gpt-5 family spends part of max_output_tokens on
    # reasoning, so raise MAX_OUTPUT_TOKENS in roaster.py before switching to it.
    OPENAI_MODEL: str = "gpt-4.1-mini"

    # GitHub
    GITHUB_TOKEN: str = ""

    # Limits
    MAX_REPO_FILES: int = 40
    MAX_FILE_BYTES: int = 20480
    SUBMISSIONS_PER_HOUR: int = 5

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        """Accept a comma-separated string, a JSON array string, or a real list."""
        if isinstance(value, str):
            text = value.strip()
            if text.startswith("["):
                return json.loads(text)
            return [origin.strip() for origin in text.split(",") if origin.strip()]
        return value


settings = Settings()
