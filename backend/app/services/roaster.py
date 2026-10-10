"""Roaster: the background review pipeline (GitHub -> prompt -> OpenAI -> Review row).

``run_review`` runs as a FastAPI ``BackgroundTask`` on the event loop. The GitHub and
OpenAI calls are async; every database phase is a small synchronous helper executed
through ``_run_db`` (``asyncio.to_thread``) so synchronous SQLAlchemy never blocks the
loop. Each helper opens its own short-lived session via ``SessionLocal``.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import Any

import openai
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.exceptions import AppError
from app.models.review import Review
from app.models.submission import Submission, SubmissionStatus
from app.schemas.review import RoastResult
from app.services import github_client
from app.services.github_client import RepoFile, RepoInfo
from app.services.prompts import SYSTEM_PROMPT, build_user_message

logger = logging.getLogger(__name__)

# Reasoning models (gpt-5 family) spend part of this budget on reasoning tokens before
# the structured reply, so keep it generous; gpt-4.1 models use it for the reply only.
MAX_OUTPUT_TOKENS = 8192
OPENAI_TIMEOUT_SECONDS = 180.0
OPENAI_MAX_RETRIES = 3
ERROR_MESSAGE_MAX_LEN = 500

# User-facing failure messages. Never include exception class names or request details.
REFUSAL_MESSAGE = "Review declined by safety filter, try another repo"
CONTENT_FILTER_MESSAGE = "Review declined by content filter, try another repo"
MISSING_KEY_MESSAGE = "OPENAI_API_KEY not configured"
CUT_OFF_MESSAGE = "Review output was cut off, please retry"
INCOMPLETE_MESSAGE = "Review did not complete, please retry"
NO_OUTPUT_MESSAGE = "Model returned no structured result, please retry"
INVALID_OUTPUT_MESSAGE = "Reviewer produced an invalid review, please retry"
RATE_LIMITED_MESSAGE = "The reviewer is busy right now, please retry in a minute"
MISCONFIGURED_MESSAGE = "Reviewer is misconfigured, contact an admin"
UNREACHABLE_MESSAGE = "Could not reach the reviewer, please retry"
UNEXPECTED_MESSAGE = "Unexpected error during review, please retry"

_INCOMPLETE_MESSAGES = {
    "max_output_tokens": CUT_OFF_MESSAGE,
    "content_filter": CONTENT_FILTER_MESSAGE,
}


class ReviewFailed(Exception):
    """Raised inside the pipeline for expected, user-facing failures."""


def get_openai_client() -> openai.AsyncOpenAI:
    """Create the OpenAI client. Module-level so tests can monkeypatch it."""
    return openai.AsyncOpenAI(
        api_key=settings.OPENAI_API_KEY,
        timeout=OPENAI_TIMEOUT_SECONDS,
        max_retries=OPENAI_MAX_RETRIES,
    )


async def _run_db[**P, T](fn: Callable[P, T], *args: P.args, **kwargs: P.kwargs) -> T:
    """Run a synchronous DB helper off the event loop. Tests may patch this to run inline."""
    return await asyncio.to_thread(fn, *args, **kwargs)


# ---------------------------------------------------------------------------
# Synchronous DB phases (each opens and closes its own session)
# ---------------------------------------------------------------------------


def _mark_failed(db: Session, submission: Submission, message: str) -> None:
    submission.status = SubmissionStatus.failed
    submission.error_message = message[:ERROR_MESSAGE_MAX_LEN]
    db.commit()


def _begin(submission_id: int) -> Submission | None:
    """Mark the submission as reviewing and return a detached copy (or None if missing)."""
    with SessionLocal() as db:
        submission = db.get(Submission, submission_id)
        if submission is None:
            return None
        submission.status = SubmissionStatus.reviewing
        submission.error_message = None
        db.commit()
        db.refresh(submission)
        db.expunge(submission)
        return submission


def _fail(submission_id: int, message: str) -> None:
    with SessionLocal() as db:
        submission = db.get(Submission, submission_id)
        if submission is not None:
            _mark_failed(db, submission, message)


def _persist(
    submission_id: int,
    result: RoastResult,
    model_used: str,
    input_tokens: int,
    output_tokens: int,
) -> None:
    """Replace any previous review with the new one and mark the submission done."""
    with SessionLocal() as db:
        submission = db.get(Submission, submission_id)
        if submission is None:
            logger.warning("run_review: submission %s vanished before persist", submission_id)
            return
        if submission.review is not None:
            db.delete(submission.review)
            db.flush()
        db.add(
            Review(
                submission_id=submission.id,
                score=result.score,
                summary=result.summary[:1000],
                roast_text=result.roast_text,
                strengths=result.strengths,
                improvements=result.improvements,
                model_used=model_used[:100],
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
        )
        submission.status = SubmissionStatus.done
        submission.error_message = None
        db.commit()


# ---------------------------------------------------------------------------
# Async phase: GitHub + OpenAI
# ---------------------------------------------------------------------------


def _find_refusal(response: Any) -> str | None:
    """Return the refusal text if any message output item carries a refusal part."""
    for item in getattr(response, "output", None) or []:
        if getattr(item, "type", None) != "message":
            continue
        for part in getattr(item, "content", None) or []:
            if getattr(part, "type", None) == "refusal":
                return str(getattr(part, "refusal", "") or "")
    return None


async def generate_roast(
    submission: Submission, repo_info: RepoInfo, files: list[RepoFile]
) -> tuple[RoastResult, str, int, int]:
    """Build the prompt, call the model and return ``(result, model, input_tokens, output_tokens)``.

    Raises:
        ReviewFailed: with a user-safe message for every expected failure mode.
    """
    user_message = build_user_message(submission, repo_info, files)

    client = get_openai_client()
    try:
        response = await client.responses.parse(
            model=settings.OPENAI_MODEL,
            instructions=SYSTEM_PROMPT,
            input=user_message,
            text_format=RoastResult,
            max_output_tokens=MAX_OUTPUT_TOKENS,
        )
    except openai.RateLimitError as exc:
        logger.warning("OpenAI rate limited (request %s)", exc.request_id)
        raise ReviewFailed(RATE_LIMITED_MESSAGE) from exc
    except openai.AuthenticationError as exc:
        logger.error("OpenAI authentication failed: %s", exc.message)
        raise ReviewFailed(MISCONFIGURED_MESSAGE) from exc
    except openai.APIStatusError as exc:  # other 4xx/5xx
        logger.error(
            "OpenAI API error %s (request %s): %s", exc.status_code, exc.request_id, exc.message
        )
        raise ReviewFailed(f"Reviewer returned an error ({exc.status_code}), please retry") from exc
    except openai.APIConnectionError as exc:  # includes APITimeoutError
        logger.warning("OpenAI connection error: %s", exc)
        raise ReviewFailed(UNREACHABLE_MESSAGE) from exc
    except ValidationError as exc:  # SDK validates the schema client-side
        logger.warning("Model output failed schema validation: %s", exc)
        raise ReviewFailed(INVALID_OUTPUT_MESSAGE) from exc

    if getattr(response, "status", None) == "incomplete":
        details = getattr(response, "incomplete_details", None)
        reason = getattr(details, "reason", None)
        logger.warning(
            "OpenAI response incomplete for submission %s (reason=%s)", submission.id, reason
        )
        raise ReviewFailed(_INCOMPLETE_MESSAGES.get(str(reason), INCOMPLETE_MESSAGE))

    refusal = _find_refusal(response)
    if refusal is not None:
        logger.warning(
            "Model refused review for submission %s: %s", submission.id, refusal[:200]
        )
        raise ReviewFailed(REFUSAL_MESSAGE)

    parsed = getattr(response, "output_parsed", None)
    if parsed is None:
        raise ReviewFailed(NO_OUTPUT_MESSAGE)
    try:
        result = RoastResult.model_validate(parsed.model_dump())
    except ValidationError as exc:
        logger.warning("Parsed review failed validation: %s", exc)
        raise ReviewFailed(INVALID_OUTPUT_MESSAGE) from exc

    # The served model can differ from the requested alias; persist what actually ran.
    model_used = getattr(response, "model", None) or settings.OPENAI_MODEL
    usage = getattr(response, "usage", None)
    input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
    output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
    return result, str(model_used), input_tokens, output_tokens


async def _generate_roast(submission: Submission) -> tuple[RoastResult, str, int, int]:
    """Fetch repo files from GitHub, then delegate to :func:`generate_roast`."""
    owner, repo = submission.repo_owner, submission.repo_name
    repo_info = await github_client.get_repo(owner, repo)
    files = await github_client.fetch_repo_files(owner, repo, submission.commit_sha)
    return await generate_roast(submission, repo_info, files)


async def run_review(submission_id: int) -> None:
    """Run the full review pipeline for one submission.

    Steps: mark reviewing -> fetch files -> build prompt -> call the model -> handle
    refusal/incomplete -> validate -> persist Review -> mark done. Any failure marks the
    submission failed with a user-safe ``error_message``; unexpected ones are logged with
    a stack trace.
    """
    try:
        submission = await _run_db(_begin, submission_id)
        if submission is None:
            logger.warning("run_review: submission %s no longer exists", submission_id)
            return

        if not settings.OPENAI_API_KEY:
            logger.error("run_review: %s", MISSING_KEY_MESSAGE)
            await _run_db(_fail, submission_id, MISSING_KEY_MESSAGE)
            return

        try:
            result, model_used, input_tokens, output_tokens = await _generate_roast(submission)
        except ReviewFailed as exc:
            await _run_db(_fail, submission_id, str(exc))
            return
        except AppError as exc:  # GitHub client errors are already user-facing
            logger.warning("Review for submission %s failed: %s", submission_id, exc.message)
            await _run_db(_fail, submission_id, exc.message)
            return

        await _run_db(_persist, submission_id, result, model_used, input_tokens, output_tokens)
        logger.info(
            "Review done for submission %s: score=%s model=%s tokens=%s/%s",
            submission_id, result.score, model_used, input_tokens, output_tokens,
        )
    except Exception:
        logger.exception("Review failed for submission %s", submission_id)
        try:
            await _run_db(_fail, submission_id, UNEXPECTED_MESSAGE)
        except Exception:
            logger.exception("Could not mark submission %s as failed", submission_id)
