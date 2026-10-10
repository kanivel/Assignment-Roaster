"""Shared pytest fixtures for the Assignment Roaster backend.

Environment variables are set *before* ``app`` is imported because ``app.config.Settings``
is instantiated at import time. The database engine is:

* ``TEST_DATABASE_URL`` (CI provides a PostgreSQL instance), or
* an in-memory SQLite database on a ``StaticPool`` so every session shares one connection.

Every test gets a fresh schema (``create_all`` / ``drop_all``). External services are never
contacted: an ``respx`` router with ``assert_all_mocked=True`` is active for every test and the
OpenAI client factory is replaced by a guard that fails loudly unless ``fake_openai`` is used.
"""

from __future__ import annotations

import base64
import os
from collections.abc import Callable, Generator
from types import SimpleNamespace
from typing import Any

os.environ.setdefault("TEST_DATABASE_URL", "")
TEST_DATABASE_URL = os.environ["TEST_DATABASE_URL"].strip()
os.environ["DATABASE_URL"] = TEST_DATABASE_URL or "sqlite://"
os.environ["SECRET_KEY"] = "test-secret-key-do-not-use"
os.environ["OPENAI_API_KEY"] = "test-key"
os.environ["OPENAI_MODEL"] = "gpt-test-model"
os.environ["GOOGLE_CLIENT_ID"] = ""
os.environ["GOOGLE_CLIENT_SECRET"] = ""
os.environ["GITHUB_TOKEN"] = ""
os.environ["FRONTEND_URL"] = "http://localhost:5173"
os.environ["SUBMISSIONS_PER_HOUR"] = "5"

import httpx  # noqa: E402
import pytest  # noqa: E402
import respx  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from passlib.context import CryptContext  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.engine import Engine  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401  (registers every table on Base.metadata)
from app.auth import jwt as jwt_module  # noqa: E402
from app.auth.jwt import create_access_token, hash_password  # noqa: E402
from app.database import Base, get_db, normalize_database_url  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.main import app  # noqa: E402
from app.models.review import Review  # noqa: E402
from app.models.submission import Submission, SubmissionStatus  # noqa: E402
from app.models.user import User  # noqa: E402
from app.schemas.review import RoastResult  # noqa: E402
from app.services import auth_service, maintenance, roaster  # noqa: E402

API = "/api/v1"
GITHUB_API = "https://api.github.com"
SHA = "a" * 40

# Captured before any fixture patches it, so a test can exercise the real factory.
REAL_GET_OPENAI_CLIENT = roaster.get_openai_client

# ---------------------------------------------------------------------------
# Engine / session
# ---------------------------------------------------------------------------


def _build_engine() -> Engine:
    if TEST_DATABASE_URL:
        return create_engine(normalize_database_url(TEST_DATABASE_URL), pool_pre_ping=True)
    return create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


engine = _build_engine()
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
IS_SQLITE = engine.dialect.name == "sqlite"
IS_POSTGRES = engine.dialect.name == "postgresql"


@pytest.fixture(autouse=True)
def _fast_bcrypt(monkeypatch: pytest.MonkeyPatch) -> None:
    """Use few bcrypt rounds so password tests are fast; hashing semantics are unchanged."""
    fast_context = CryptContext(schemes=["bcrypt"], bcrypt__rounds=4)
    monkeypatch.setattr(jwt_module, "pwd_context", fast_context)
    # The dummy hash used for unknown-email logins is computed at import with full cost.
    monkeypatch.setattr(auth_service, "_DUMMY_HASH", fast_context.hash("dummy-password"))


@pytest.fixture(autouse=True)
def _reset_rate_limiter() -> Generator[None, None, None]:
    """slowapi keeps counters in process memory; clear them between tests."""
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture(autouse=True)
def _guard_openai(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fail loudly if a test reaches the OpenAI client without ``fake_openai``."""

    def _blocked() -> Any:
        raise AssertionError("OpenAI client must be mocked in tests (use fake_openai)")

    monkeypatch.setattr(roaster, "get_openai_client", _blocked)


@pytest.fixture(autouse=True)
def respx_router() -> Generator[respx.MockRouter, None, None]:
    """Every outbound httpx call must be mocked; unmatched calls raise."""
    with respx.mock(assert_all_mocked=True, assert_all_called=False) as router:
        yield router


@pytest.fixture
def db(monkeypatch: pytest.MonkeyPatch) -> Generator[Session, None, None]:
    """Fresh schema + a session for test setup/inspection.

    ``roaster.run_review`` and the startup reaper open their own sessions via
    ``SessionLocal``; point both at the test session factory so background reviews and
    lifespan cleanup write to the same database.
    """
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(roaster, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(maintenance, "SessionLocal", TestingSessionLocal)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db: Session) -> Generator[TestClient, None, None]:
    """TestClient whose ``get_db`` yields a fresh session per request."""

    def _override_get_db() -> Generator[Session, None, None]:
        request_db = TestingSessionLocal()
        try:
            yield request_db
        finally:
            request_db.close()

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Factories
# ---------------------------------------------------------------------------


def create_user(
    db: Session,
    email: str,
    password: str | None = None,
    is_admin: bool = False,
    **extra: Any,
) -> User:
    """Persist a user. ``password=None`` creates an OAuth-style account with no password."""
    user = User(
        email=email.strip().lower(),
        hashed_password=hash_password(password) if password else None,
        is_admin=is_admin,
        **extra,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def auth_headers(user: User) -> dict[str, str]:
    """Bearer header carrying a valid access token for ``user``."""
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def create_submission(
    db: Session,
    user: User,
    status: SubmissionStatus = SubmissionStatus.pending,
    owner: str = "octo",
    repo: str = "demo",
    **extra: Any,
) -> Submission:
    """Persist a submission (default: pending, pointing at the mocked ``octo/demo`` repo)."""
    submission = Submission(
        user_id=user.id,
        github_url=f"https://github.com/{owner}/{repo}",
        repo_owner=owner,
        repo_name=repo,
        default_branch="main",
        commit_sha=SHA,
        status=status,
        **extra,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission


def create_review(db: Session, submission: Submission, score: int = 7) -> Review:
    """Persist a finished review for ``submission`` and mark it done."""
    review = Review(
        submission_id=submission.id,
        score=score,
        roast_text="Da, README-la oru line kooda illa.",
        strengths=["Runs"],
        improvements=["Add tests"],
        summary="A small demo repo.",
        model_used="gpt-test-model",
        input_tokens=100,
        output_tokens=50,
    )
    db.add(review)
    submission.status = SubmissionStatus.done
    db.commit()
    db.refresh(review)
    return review


@pytest.fixture
def user(db: Session) -> User:
    return create_user(db, "ann@example.com", password="password123", full_name="Ann")


@pytest.fixture
def other_user(db: Session) -> User:
    return create_user(db, "bob@example.com", password="password123", full_name="Bob")


@pytest.fixture
def admin(db: Session) -> User:
    return create_user(db, "admin@example.com", password="password123", is_admin=True)


# ---------------------------------------------------------------------------
# GitHub mock
# ---------------------------------------------------------------------------


def _b64(text: bytes) -> str:
    return base64.b64encode(text).decode()


README_CONTENT = b"# Demo\n\nRun with `python main.py`.\n"
MAIN_PY_CONTENT = b"def main():\n    return 'hi'\n"
TEST_PY_CONTENT = b"def test_main():\n    assert True\n"
BINARY_CONTENT = b"\x00\x01\x02binary-blob"

DEMO_TREE: list[dict[str, Any]] = [
    {"type": "blob", "path": "README.md", "size": len(README_CONTENT), "sha": "blob-readme"},
    {"type": "blob", "path": "main.py", "size": len(MAIN_PY_CONTENT), "sha": "blob-main"},
    {
        "type": "blob",
        "path": "tests/test_main.py",
        "size": len(TEST_PY_CONTENT),
        "sha": "blob-test",
    },
    {"type": "blob", "path": "node_modules/x/index.js", "size": 30, "sha": "blob-nm"},
    {"type": "blob", "path": "logo.png", "size": 30, "sha": "blob-png"},
    {"type": "blob", "path": "data.bin", "size": 30, "sha": "blob-bin"},
    {"type": "blob", "path": "weird.py", "size": len(BINARY_CONTENT), "sha": "blob-weird"},
    {"type": "tree", "path": "tests", "size": 0, "sha": "tree-tests"},
]


@pytest.fixture
def mock_github(respx_router: respx.MockRouter) -> respx.MockRouter:
    """Mock the GitHub endpoints the app calls for ``octo/demo`` plus a few error repos."""
    respx_router.get(f"{GITHUB_API}/repos/octo/demo").mock(
        return_value=httpx.Response(
            200,
            json={
                "default_branch": "main",
                "html_url": "https://github.com/octo/demo",
                "description": "demo repo",
                "language": "Python",
            },
        )
    )
    respx_router.get(f"{GITHUB_API}/repos/octo/demo/commits/main").mock(
        return_value=httpx.Response(200, json={"sha": SHA})
    )
    respx_router.get(f"{GITHUB_API}/repos/octo/demo/git/trees/{SHA}").mock(
        return_value=httpx.Response(200, json={"truncated": False, "tree": DEMO_TREE})
    )
    for blob_sha, content in (
        ("blob-readme", README_CONTENT),
        ("blob-main", MAIN_PY_CONTENT),
        ("blob-test", TEST_PY_CONTENT),
        ("blob-weird", BINARY_CONTENT),
    ):
        respx_router.get(f"{GITHUB_API}/repos/octo/demo/git/blobs/{blob_sha}").mock(
            return_value=httpx.Response(200, json={"encoding": "base64", "content": _b64(content)})
        )

    respx_router.get(f"{GITHUB_API}/repos/octo/private").mock(
        return_value=httpx.Response(404, json={"message": "Not Found"})
    )
    respx_router.get(f"{GITHUB_API}/repos/octo/limited").mock(
        return_value=httpx.Response(
            403,
            headers={"X-RateLimit-Remaining": "0"},
            json={"message": "API rate limit exceeded"},
        )
    )
    respx_router.get(f"{GITHUB_API}/repos/octo/forbidden").mock(
        return_value=httpx.Response(403, json={"message": "Forbidden"})
    )
    respx_router.get(f"{GITHUB_API}/repos/octo/broken").mock(
        return_value=httpx.Response(500, text="boom")
    )
    respx_router.get(f"{GITHUB_API}/repos/octo/slow").mock(
        side_effect=httpx.ReadTimeout("timed out")
    )
    respx_router.get(f"{GITHUB_API}/repos/octo/offline").mock(
        side_effect=httpx.ConnectError("no route to host")
    )
    respx_router.get(f"{GITHUB_API}/repos/octo/nosha/commits/main").mock(
        return_value=httpx.Response(200, json={"sha": None})
    )
    return respx_router


# ---------------------------------------------------------------------------
# OpenAI fake
# ---------------------------------------------------------------------------


def sample_roast(**overrides: Any) -> RoastResult:
    data: dict[str, Any] = {
        "score": 7,
        "summary": "A decent demo repo.",
        "roast_text": "Da, README-la oru line dhaan. But logic clean-a irukku.",
        "strengths": ["Runs end to end", "Readable names"],
        "improvements": ["Add tests", "Write a proper README"],
    }
    data.update(overrides)
    return RoastResult(**data)


class FakeOpenAI:
    """Configurable stand-in for ``openai.AsyncOpenAI``.

    ``mode`` is one of ``success``, ``refusal``, ``incomplete_max_tokens``,
    ``incomplete_content_filter``, ``no_parsed``, ``exception``.
    Every ``responses.parse`` call is recorded in ``calls``.
    """

    def __init__(self) -> None:
        self.mode = "success"
        self.result: RoastResult = sample_roast()
        self.exception: Exception = RuntimeError("Model exploded: " + "x" * 2000)
        self.input_tokens = 100
        self.output_tokens = 50
        # The model the API reports as served (may differ from the requested alias).
        self.model = "gpt-test-model-2026-10-01"
        self.refusal_text = "I can't help with reviewing that repository."
        self.calls: list[dict[str, Any]] = []
        self.responses = SimpleNamespace(parse=self._parse)

    async def _parse(self, **kwargs: Any) -> SimpleNamespace:
        self.calls.append(kwargs)
        if self.mode == "exception":
            raise self.exception

        status = "completed"
        incomplete_details = None
        output: list[SimpleNamespace] = []
        parsed: RoastResult | None = None

        if self.mode == "success":
            parsed = self.result
            output = [
                SimpleNamespace(
                    type="message",
                    content=[
                        SimpleNamespace(
                            type="output_text",
                            text=self.result.model_dump_json(),
                            parsed=self.result,
                        )
                    ],
                )
            ]
        elif self.mode == "refusal":
            output = [
                SimpleNamespace(
                    type="message",
                    content=[SimpleNamespace(type="refusal", refusal=self.refusal_text)],
                )
            ]
        elif self.mode == "incomplete_max_tokens":
            status = "incomplete"
            incomplete_details = SimpleNamespace(reason="max_output_tokens")
        elif self.mode == "incomplete_content_filter":
            status = "incomplete"
            incomplete_details = SimpleNamespace(reason="content_filter")
        elif self.mode == "no_parsed":
            output = [SimpleNamespace(type="reasoning", content=[])]
        else:  # pragma: no cover - guard against typos in tests
            raise ValueError(f"unknown FakeOpenAI mode {self.mode!r}")

        return SimpleNamespace(
            model=self.model,
            status=status,
            incomplete_details=incomplete_details,
            output=output,
            output_parsed=parsed,
            usage=SimpleNamespace(input_tokens=self.input_tokens, output_tokens=self.output_tokens),
        )

    @property
    def last_user_message(self) -> str:
        return str(self.calls[-1]["input"])


@pytest.fixture
def fake_openai(monkeypatch: pytest.MonkeyPatch) -> FakeOpenAI:
    fake = FakeOpenAI()
    monkeypatch.setattr(roaster, "get_openai_client", lambda: fake)
    return fake


# Re-exported for ``from tests.conftest import ...`` in test modules.
__all__ = [
    "API",
    "GITHUB_API",
    "IS_POSTGRES",
    "IS_SQLITE",
    "REAL_GET_OPENAI_CLIENT",
    "SHA",
    "FakeOpenAI",
    "TestingSessionLocal",
    "auth_headers",
    "create_review",
    "create_submission",
    "create_user",
    "engine",
    "sample_roast",
]

UserFactory = Callable[..., User]
