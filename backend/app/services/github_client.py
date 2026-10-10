"""Thin async GitHub REST client used to validate repos and pull source files for review.

Public repos only. All calls go through ``httpx.AsyncClient`` with a 15s timeout and
use ``GITHUB_TOKEN`` when configured (raises the API rate limit from 60 to 5000/hour).
"""

from __future__ import annotations

import asyncio
import base64
import logging
import re
from dataclasses import dataclass

import httpx

from app.config import settings
from app.exceptions import BadRequestError

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"
TIMEOUT_SECONDS = 15.0
CONCURRENT_BLOB_FETCHES = 5
# Blobs larger than this are skipped outright instead of fetched and truncated.
MAX_FETCH_BYTES = 1_000_000

README_PATTERN = re.compile(r"^readme(\.[a-z0-9]+)?$", re.IGNORECASE)
ENTRY_POINTS = {
    "main.py",
    "app.py",
    "index.ts",
    "index.js",
    "app.tsx",
    "package.json",
    "requirements.txt",
    "pyproject.toml",
}
SOURCE_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".java", ".go", ".rs", ".rb", ".php",
    ".cs", ".kt", ".swift", ".html", ".css", ".sql",
}
CONFIG_EXTENSIONS = {".json", ".yaml", ".yml", ".toml", ".md"}
SKIP_DIRS = {
    "node_modules", "dist", "build", ".git", "vendor", "__pycache__", ".venv", "coverage",
}
SKIP_FILENAMES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock"}
SKIP_EXTENSIONS = {
    # images
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg", ".webp", ".tiff",
    # fonts
    ".ttf", ".otf", ".woff", ".woff2", ".eot",
    # binaries / archives / media
    ".exe", ".dll", ".so", ".dylib", ".bin", ".o", ".a", ".class", ".jar", ".war",
    ".pyc", ".pyo", ".zip", ".tar", ".gz", ".tgz", ".7z", ".rar", ".pdf", ".mp3",
    ".mp4", ".mov", ".avi", ".wav", ".db", ".sqlite", ".sqlite3", ".lock",
}
TEST_SEGMENTS = {"test", "tests", "spec", "specs", "__tests__"}


@dataclass(frozen=True)
class RepoInfo:
    """Subset of GitHub repository metadata we care about."""

    default_branch: str
    html_url: str
    description: str | None
    language: str | None


@dataclass(frozen=True)
class RepoFile:
    """A text file pulled from the repository, possibly truncated."""

    path: str
    content: str
    size: int


def _headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "assignment-roaster",
    }
    if settings.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"
    return headers


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=GITHUB_API, headers=_headers(), timeout=TIMEOUT_SECONDS, follow_redirects=True
    )


def _raise_for_status(response: httpx.Response, owner: str, repo: str) -> None:
    """Translate GitHub error responses into user-facing BadRequestErrors."""
    status = response.status_code
    if status < 400:
        return
    if status == 404:
        raise BadRequestError("Repository not found or is private")
    if status == 409:  # "Git Repository is empty" on commits/ and git/trees/
        raise BadRequestError("Repository is empty")
    if status in (403, 429):
        remaining = response.headers.get("X-RateLimit-Remaining")
        if remaining == "0" or "rate limit" in response.text.lower():
            logger.warning("GitHub rate limit hit for %s/%s", owner, repo)
            raise BadRequestError("GitHub API rate limit exceeded, please try again later")
        raise BadRequestError("GitHub refused access to this repository")
    logger.error("GitHub API error %s for %s/%s: %s", status, owner, repo, response.text[:300])
    raise BadRequestError(f"GitHub API returned an unexpected error ({status})")


async def _get(client: httpx.AsyncClient, url: str, owner: str, repo: str) -> httpx.Response:
    try:
        response = await client.get(url)
    except httpx.TimeoutException as exc:
        logger.warning("GitHub request timed out: %s", url)
        raise BadRequestError("GitHub did not respond in time, please try again") from exc
    except httpx.RequestError as exc:
        logger.warning("GitHub request failed: %s (%s)", url, exc)
        raise BadRequestError("Could not reach GitHub, please try again") from exc
    _raise_for_status(response, owner, repo)
    return response


async def get_repo(owner: str, repo: str) -> RepoInfo:
    """Fetch repository metadata.

    Raises:
        BadRequestError: when the repo is missing/private (404) or GitHub is unavailable.
    """
    async with _client() as client:
        response = await _get(client, f"/repos/{owner}/{repo}", owner, repo)
    data = response.json()
    return RepoInfo(
        default_branch=data.get("default_branch") or "main",
        html_url=data.get("html_url") or f"https://github.com/{owner}/{repo}",
        description=data.get("description"),
        language=data.get("language"),
    )


async def get_head_sha(owner: str, repo: str, branch: str) -> str:
    """Return the commit SHA at the head of ``branch``."""
    async with _client() as client:
        response = await _get(client, f"/repos/{owner}/{repo}/commits/{branch}", owner, repo)
    sha = response.json().get("sha")
    if not isinstance(sha, str) or not sha:
        raise BadRequestError("Could not resolve the repository's default branch")
    return sha


def _priority(path: str) -> int | None:
    """Rank a tree path for inclusion. Lower is better; ``None`` means skip."""
    parts = path.split("/")
    filename = parts[-1]
    lower_name = filename.lower()
    ext = ("." + lower_name.rsplit(".", 1)[1]) if "." in lower_name else ""

    if any(part in SKIP_DIRS for part in parts[:-1]):
        return None
    if lower_name in SKIP_FILENAMES or ext in SKIP_EXTENSIONS:
        return None
    if ".min." in lower_name:
        return None

    if README_PATTERN.match(lower_name):
        return 0
    if lower_name in ENTRY_POINTS:
        return 1
    is_test = any(part.lower() in TEST_SEGMENTS for part in parts[:-1]) or (
        lower_name.startswith("test_") or ".test." in lower_name or ".spec." in lower_name
    )
    if ext in SOURCE_EXTENSIONS:
        return 3 if is_test else 2
    if ext in CONFIG_EXTENSIONS:
        return 4
    return None


def select_files(tree: list[dict], max_files: int) -> list[dict]:
    """Pick up to ``max_files`` blob entries from a recursive git tree, by priority."""
    ranked: list[tuple[int, int, str, dict]] = []
    for entry in tree:
        if entry.get("type") != "blob":
            continue
        path = entry.get("path", "")
        size = int(entry.get("size") or 0)
        if size == 0 or size > MAX_FETCH_BYTES:
            continue
        rank = _priority(path)
        if rank is None:
            continue
        ranked.append((rank, path.count("/"), path, entry))
    ranked.sort(key=lambda item: (item[0], item[1], item[2]))
    return [entry for _, _, _, entry in ranked[:max_files]]


def _decode_blob(data: dict, max_bytes: int) -> str | None:
    """Decode a blob API response to text, truncated to ``max_bytes``. ``None`` if binary."""
    if data.get("encoding") == "base64":
        raw = base64.b64decode(data.get("content", ""))
    else:
        raw = str(data.get("content", "")).encode("utf-8", errors="replace")
    sample = raw[:8000]
    if b"\x00" in sample:
        return None
    truncated = len(raw) > max_bytes
    text = raw[:max_bytes].decode("utf-8", errors="replace")
    if truncated:
        text += f"\n... [truncated to {max_bytes} bytes]"
    return text


async def fetch_repo_files(owner: str, repo: str, sha: str) -> list[RepoFile]:
    """Fetch the most relevant text files of a repo at ``sha``.

    Uses the recursive git trees API to list files, selects up to
    ``settings.MAX_REPO_FILES`` by priority, then downloads the blobs concurrently
    (at most 5 in flight), each truncated to ``settings.MAX_FILE_BYTES``.
    """
    async with _client() as client:
        response = await _get(
            client, f"/repos/{owner}/{repo}/git/trees/{sha}?recursive=1", owner, repo
        )
        payload = response.json()
        tree = payload.get("tree") or []
        if payload.get("truncated"):
            logger.info("GitHub tree for %s/%s@%s was truncated", owner, repo, sha)

        selected = select_files(tree, settings.MAX_REPO_FILES)
        semaphore = asyncio.Semaphore(CONCURRENT_BLOB_FETCHES)
        failures: list[str] = []

        async def fetch_one(entry: dict) -> RepoFile | None:
            path = entry["path"]
            try:
                async with semaphore:
                    blob = await _get(
                        client, f"/repos/{owner}/{repo}/git/blobs/{entry['sha']}", owner, repo
                    )
                data = blob.json()
            except (BadRequestError, httpx.HTTPError, ValueError) as exc:
                # One bad blob (transient 5xx, secondary rate limit, odd payload) must not
                # sink the whole review; skip it and review what we could fetch.
                logger.warning("Skipping %s/%s:%s after fetch error: %s", owner, repo, path, exc)
                failures.append(path)
                return None
            text = _decode_blob(data, settings.MAX_FILE_BYTES)
            if text is None:
                logger.debug("Skipping binary file %s", path)
                return None
            return RepoFile(path=path, content=text, size=int(entry.get("size") or 0))

        results = await asyncio.gather(*(fetch_one(entry) for entry in selected))

    files = [item for item in results if item is not None]
    if not files and failures:
        logger.error(
            "Could not fetch any of %d selected files from %s/%s@%s",
            len(failures), owner, repo, sha[:7],
        )
        raise BadRequestError("Could not download any files from the repository, please retry")
    logger.info(
        "Fetched %d/%d files from %s/%s@%s (%d failed)",
        len(files), len(tree), owner, repo, sha[:7], len(failures),
    )
    return files
