"""Settings parsing: ALLOWED_ORIGINS accepts the documented comma-separated env format."""

from __future__ import annotations

import pytest

from app.config import Settings

BASE = {"DATABASE_URL": "postgresql://u:p@localhost/db", "SECRET_KEY": "x"}


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("http://localhost:5173,http://localhost:3000", ["http://localhost:5173", "http://localhost:3000"]),
        (" http://a , http://b ,", ["http://a", "http://b"]),
        ("http://only", ["http://only"]),
        ('["http://a", "http://b"]', ["http://a", "http://b"]),
        ("", []),
    ],
)
def test_allowed_origins_env_formats(
    monkeypatch: pytest.MonkeyPatch, raw: str, expected: list[str]
) -> None:
    monkeypatch.setenv("ALLOWED_ORIGINS", raw)
    settings = Settings(_env_file=None, **BASE)  # type: ignore[call-arg]
    assert settings.ALLOWED_ORIGINS == expected


def test_allowed_origins_accepts_a_real_list_and_has_defaults(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    assert Settings(_env_file=None, **BASE).ALLOWED_ORIGINS == [  # type: ignore[call-arg]
        "http://localhost:5173",
        "http://localhost:3000",
    ]
    settings = Settings(_env_file=None, ALLOWED_ORIGINS=["http://x"], **BASE)  # type: ignore[call-arg]
    assert settings.ALLOWED_ORIGINS == ["http://x"]


def test_openai_model_defaults_and_is_overridable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    assert Settings(_env_file=None, **BASE).OPENAI_MODEL == "gpt-4.1-mini"  # type: ignore[call-arg]
    monkeypatch.setenv("OPENAI_MODEL", "gpt-4.1")
    assert Settings(_env_file=None, **BASE).OPENAI_MODEL == "gpt-4.1"  # type: ignore[call-arg]
