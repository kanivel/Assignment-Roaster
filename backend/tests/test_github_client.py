"""GitHub client: file selection rules, blob decoding and error mapping (all via respx)."""

from __future__ import annotations

import base64
from typing import Any

import httpx
import pytest
import respx

from app.config import settings
from app.exceptions import BadRequestError
from app.services import github_client as gh
from tests.conftest import GITHUB_API, SHA

# ---------------------------------------------------------------------------
# _priority / select_files
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("path", "rank"),
    [
        ("README.md", 0),
        ("readme", 0),
        ("docs/README.rst", 0),
        ("main.py", 1),
        ("src/app.py", 1),
        ("package.json", 1),
        ("pyproject.toml", 1),
        ("src/service.py", 2),
        ("web/Form.tsx", 2),
        ("web/App.tsx", 1),
        ("styles/site.css", 2),
        ("tests/test_x.py", 3),
        ("src/__tests__/a.ts", 3),
        ("test_main.py", 3),
        ("src/thing.spec.ts", 3),
        ("src/thing.test.js", 3),
        ("config.yaml", 4),
        ("docs/guide.md", 4),
        ("settings.json", 4),
        ("node_modules/x/index.js", None),
        ("dist/bundle.js", None),
        (".git/config", None),
        ("package-lock.json", None),
        ("yarn.lock", None),
        ("logo.png", None),
        ("font.woff2", None),
        ("app.exe", None),
        ("app.min.js", None),
        ("db.sqlite3", None),
        ("notes.txt", None),
        ("Makefile", None),
    ],
)
def test_priority_rules(path: str, rank: int | None) -> None:
    assert gh._priority(path) == rank


def test_select_files_orders_by_priority_depth_then_path_and_caps() -> None:
    tree = [
        {"type": "blob", "path": "z/deep/util.py", "size": 10, "sha": "1"},
        {"type": "blob", "path": "b.py", "size": 10, "sha": "2"},
        {"type": "blob", "path": "a.py", "size": 10, "sha": "3"},
        {"type": "blob", "path": "README.md", "size": 10, "sha": "4"},
        {"type": "blob", "path": "main.py", "size": 10, "sha": "5"},
        {"type": "blob", "path": "tests/test_a.py", "size": 10, "sha": "6"},
        {"type": "blob", "path": "config.yml", "size": 10, "sha": "7"},
        {"type": "blob", "path": "empty.py", "size": 0, "sha": "8"},
        {"type": "blob", "path": "huge.py", "size": gh.MAX_FETCH_BYTES + 1, "sha": "9"},
        {"type": "blob", "path": "logo.png", "size": 10, "sha": "10"},
        {"type": "tree", "path": "tests", "sha": "11"},
        {"type": "blob", "path": "nosize.py", "sha": "12"},
    ]
    selected = [entry["path"] for entry in gh.select_files(tree, max_files=100)]
    assert selected == [
        "README.md",
        "main.py",
        "a.py",
        "b.py",
        "z/deep/util.py",
        "tests/test_a.py",
        "config.yml",
    ]
    assert [e["path"] for e in gh.select_files(tree, max_files=2)] == ["README.md", "main.py"]
    assert gh.select_files([], 10) == []


# ---------------------------------------------------------------------------
# _decode_blob
# ---------------------------------------------------------------------------


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode()


def test_decode_blob_truncates_and_adds_marker() -> None:
    raw = b"0123456789" * 10
    text = gh._decode_blob({"encoding": "base64", "content": _b64(raw)}, max_bytes=25)
    assert text is not None
    assert text.startswith("0123456789012345678901234")
    assert text.endswith("\n... [truncated to 25 bytes]")
    assert text.count("[truncated") == 1


def test_decode_blob_without_truncation_has_no_marker() -> None:
    text = gh._decode_blob({"encoding": "base64", "content": _b64(b"hello")}, max_bytes=5)
    assert text == "hello"


def test_decode_blob_handles_non_base64_and_binary() -> None:
    assert gh._decode_blob({"encoding": "utf-8", "content": "plain"}, max_bytes=100) == "plain"
    assert gh._decode_blob({}, max_bytes=100) == ""
    assert (
        gh._decode_blob({"encoding": "base64", "content": _b64(b"ab\x00cd")}, max_bytes=100) is None
    )


def test_decode_blob_replaces_invalid_utf8() -> None:
    text = gh._decode_blob({"encoding": "base64", "content": _b64(b"ok\xff\xfe")}, max_bytes=100)
    assert text is not None and text.startswith("ok") and "�" in text


# ---------------------------------------------------------------------------
# headers
# ---------------------------------------------------------------------------


def test_headers_add_token_only_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "GITHUB_TOKEN", "")
    assert "Authorization" not in gh._headers()
    assert gh._headers()["Accept"] == "application/vnd.github+json"
    monkeypatch.setattr(settings, "GITHUB_TOKEN", "ghp_x")
    assert gh._headers()["Authorization"] == "Bearer ghp_x"


# ---------------------------------------------------------------------------
# get_repo / get_head_sha error mapping
# ---------------------------------------------------------------------------


async def test_get_repo_success(mock_github: respx.MockRouter) -> None:
    info = await gh.get_repo("octo", "demo")
    assert info == gh.RepoInfo(
        default_branch="main",
        html_url="https://github.com/octo/demo",
        description="demo repo",
        language="Python",
    )


async def test_get_repo_defaults_when_fields_missing(respx_router: respx.MockRouter) -> None:
    respx_router.get(f"{GITHUB_API}/repos/octo/bare").mock(
        return_value=httpx.Response(200, json={})
    )
    info = await gh.get_repo("octo", "bare")
    assert info.default_branch == "main"
    assert info.html_url == "https://github.com/octo/bare"
    assert info.description is None and info.language is None


async def test_get_repo_404_raises_bad_request(mock_github: respx.MockRouter) -> None:
    with pytest.raises(BadRequestError, match="Repository not found or is private"):
        await gh.get_repo("octo", "private")


async def test_get_repo_403_rate_limit_header(mock_github: respx.MockRouter) -> None:
    with pytest.raises(BadRequestError, match="rate limit exceeded, please try again later"):
        await gh.get_repo("octo", "limited")


async def test_get_repo_429_rate_limit_text(respx_router: respx.MockRouter) -> None:
    respx_router.get(f"{GITHUB_API}/repos/octo/busy").mock(
        return_value=httpx.Response(
            429, json={"message": "You have exceeded a secondary rate limit"}
        )
    )
    with pytest.raises(BadRequestError, match="rate limit exceeded"):
        await gh.get_repo("octo", "busy")


async def test_get_repo_403_without_rate_limit_is_refused(mock_github: respx.MockRouter) -> None:
    with pytest.raises(BadRequestError, match="GitHub refused access to this repository"):
        await gh.get_repo("octo", "forbidden")


async def test_get_repo_500_is_unexpected_error(mock_github: respx.MockRouter) -> None:
    with pytest.raises(BadRequestError, match=r"unexpected error \(500\)"):
        await gh.get_repo("octo", "broken")


async def test_get_repo_timeout_raises_bad_request(mock_github: respx.MockRouter) -> None:
    with pytest.raises(BadRequestError, match="GitHub did not respond in time") as info:
        await gh.get_repo("octo", "slow")
    assert isinstance(info.value.__cause__, httpx.TimeoutException)


async def test_get_repo_connection_error_raises_bad_request(mock_github: respx.MockRouter) -> None:
    with pytest.raises(BadRequestError, match="Could not reach GitHub"):
        await gh.get_repo("octo", "offline")


async def test_get_head_sha(mock_github: respx.MockRouter) -> None:
    assert await gh.get_head_sha("octo", "demo", "main") == SHA
    with pytest.raises(BadRequestError, match="Could not resolve the repository's default branch"):
        await gh.get_head_sha("octo", "nosha", "main")


async def test_get_repo_sends_github_headers(mock_github: respx.MockRouter) -> None:
    await gh.get_repo("octo", "demo")
    request = mock_github.calls.last.request
    assert request.headers["Accept"] == "application/vnd.github+json"
    assert request.headers["X-GitHub-Api-Version"] == "2022-11-28"
    assert request.headers["User-Agent"] == "assignment-roaster"
    assert "Authorization" not in request.headers


# ---------------------------------------------------------------------------
# fetch_repo_files
# ---------------------------------------------------------------------------


async def test_fetch_repo_files_selects_and_decodes(mock_github: respx.MockRouter) -> None:
    files = await gh.fetch_repo_files("octo", "demo", SHA)
    assert [f.path for f in files] == ["README.md", "main.py", "tests/test_main.py"]
    assert files[0].content.startswith("# Demo")
    assert files[0].size == len(b"# Demo\n\nRun with `python main.py`.\n")
    blob_calls = [c for c in mock_github.calls if "/git/blobs/" in str(c.request.url)]
    assert len(blob_calls) == 4, (
        "binary-looking blob is fetched then skipped; png/node_modules never fetched"
    )


async def test_fetch_repo_files_truncates_to_max_file_bytes(
    mock_github: respx.MockRouter, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "MAX_FILE_BYTES", 6)
    files = await gh.fetch_repo_files("octo", "demo", SHA)
    readme = next(f for f in files if f.path == "README.md")
    assert readme.content == "# Demo\n... [truncated to 6 bytes]"


async def test_fetch_repo_files_respects_max_repo_files(
    mock_github: respx.MockRouter, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "MAX_REPO_FILES", 1)
    files = await gh.fetch_repo_files("octo", "demo", SHA)
    assert [f.path for f in files] == ["README.md"]


async def test_fetch_repo_files_handles_truncated_or_empty_tree(
    respx_router: respx.MockRouter,
) -> None:
    respx_router.get(f"{GITHUB_API}/repos/octo/empty/git/trees/{SHA}").mock(
        return_value=httpx.Response(200, json={"truncated": True, "tree": []})
    )
    assert await gh.fetch_repo_files("octo", "empty", SHA) == []
    respx_router.get(f"{GITHUB_API}/repos/octo/notree/git/trees/{SHA}").mock(
        return_value=httpx.Response(200, json={})
    )
    assert await gh.fetch_repo_files("octo", "notree", SHA) == []


async def test_fetch_repo_files_skips_individual_blob_failures(
    mock_github: respx.MockRouter, caplog: pytest.LogCaptureFixture
) -> None:
    """One bad blob (5xx, 404, network error) is logged and skipped, not fatal."""
    mock_github.get(f"{GITHUB_API}/repos/octo/demo/git/blobs/blob-main").mock(
        return_value=httpx.Response(502, text="bad gateway")
    )
    mock_github.get(f"{GITHUB_API}/repos/octo/demo/git/blobs/blob-test").mock(
        side_effect=httpx.ConnectError("reset")
    )
    with caplog.at_level("WARNING", logger="app.services.github_client"):
        files = await gh.fetch_repo_files("octo", "demo", SHA)
    assert [f.path for f in files] == ["README.md"]
    assert "Skipping octo/demo:main.py" in caplog.text
    assert "Skipping octo/demo:tests/test_main.py" in caplog.text


async def test_fetch_repo_files_fails_only_when_nothing_could_be_fetched(
    mock_github: respx.MockRouter,
) -> None:
    for blob in ("blob-readme", "blob-main", "blob-test", "blob-weird"):
        mock_github.get(f"{GITHUB_API}/repos/octo/demo/git/blobs/{blob}").mock(
            return_value=httpx.Response(500, text="boom")
        )
    with pytest.raises(BadRequestError, match="Could not download any files"):
        await gh.fetch_repo_files("octo", "demo", SHA)


async def test_fetch_repo_files_all_binary_is_empty_not_an_error(
    respx_router: respx.MockRouter,
) -> None:
    respx_router.get(f"{GITHUB_API}/repos/octo/bin/git/trees/{SHA}").mock(
        return_value=httpx.Response(
            200,
            json={"tree": [{"type": "blob", "path": "x.py", "size": 5, "sha": "b1"}]},
        )
    )
    respx_router.get(f"{GITHUB_API}/repos/octo/bin/git/blobs/b1").mock(
        return_value=httpx.Response(200, json={"encoding": "base64", "content": _b64(b"\x00\x01")})
    )
    assert await gh.fetch_repo_files("octo", "bin", SHA) == []


async def test_empty_repository_409_maps_to_bad_request(respx_router: respx.MockRouter) -> None:
    respx_router.get(f"{GITHUB_API}/repos/octo/empty/commits/main").mock(
        return_value=httpx.Response(409, json={"message": "Git Repository is empty."})
    )
    with pytest.raises(BadRequestError, match="^Repository is empty$"):
        await gh.get_head_sha("octo", "empty", "main")


def test_unmocked_github_calls_are_blocked(respx_router: respx.MockRouter) -> None:
    """Safety net: the autouse respx router refuses any request that is not explicitly mocked."""

    async def _call() -> Any:
        return await gh.get_repo("octo", "never-mocked")

    import asyncio

    with pytest.raises(Exception, match="(?i)mock"):
        asyncio.run(_call())
