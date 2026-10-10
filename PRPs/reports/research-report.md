# RESEARCH-AGENT report: Assignment Roaster

Project root: `/Users/kanivelj/SocialEagleGenAIWorkspace/saas-product/MicroSaaS-Template-Private`
Sources: bundled `claude-api` skill (python README, tool-use.md Structured Outputs, shared/model-migration.md "Migrating to Claude Sonnet 5.5", shared/prompt-caching.md, shared/models.md, shared/tool-use-concepts.md), the installed SDK source (`anthropic 1.13.0`, inspected via `inspect.signature`), installed `starlette 1.7.0`, `sqlalchemy 2.1.4`, `vite 8.3.4` / `rolldown` type declarations. Anything from memory only is marked UNVERIFIED.

Legend: [MUST FIX] breaks or will break at runtime / violates the PRP; [SHOULD] recommended by the docs; [NICE] optional polish.

---

## 1. Anthropic SDK usage (`backend/app/services/roaster.py`, `prompts.py`)

### 1.1 `messages.parse(..., output_format=RoastResult)` and `parsed_output` -- CORRECT (verified)
`AsyncMessages.parse` in 1.13.0 accepts `output_format: Optional[type[ResponseFormatT]]` and returns `ParsedMessage` with `parsed_output`. This matches tool-use.md "JSON Outputs (Pydantic - Recommended)". No deprecation warning is emitted for `output_format=` on `parse` (only when combined with `output_config.format`). Two notes:

- [NICE] `RoastResult.model_validate(parsed.model_dump())` (`roaster.py:70`) is redundant: `parsed_output` is already a validated `RoastResult` instance. The SDK strips unsupported JSON-schema constraints (`ge/le` -> `minimum/maximum`, `min_length` -> `minLength/minItems`) before sending and validates them client-side (tool-use-concepts.md:546-554). That means a constraint violation surfaces as `pydantic.ValidationError` raised *inside* `parse()`, not as `parsed_output is None`. Today that falls through to the bare `except Exception` and the user sees `"ValidationError: 1 validation error for RoastResult ..."`. Catch it explicitly (diff in 1.6).

### 1.2 Refusal handling -- CORRECT, improve logging
`stop_reason == "refusal"` branching is right ("branch on `stop_reason`, never on `stop_details`"). `Message.stop_details: Optional[RefusalStopDetails]` exists in 1.13.0. On Sonnet 5.5 the categories are `cyber`, `bio`, `frontier_llm`, `reasoning_extraction`, `general_harms`; a refusal is HTTP 200 and counts against rate limits.

[SHOULD] log the category so you can tell a classifier false-positive (e.g. a student's port-scanner assignment -> `cyber`) from a model-level decline:

```diff
     if response.stop_reason == "refusal":
-        logger.warning("Claude refused review for submission %s", submission.id)
+        category = response.stop_details.category if response.stop_details else None
+        logger.warning(
+            "Claude refused review for submission %s (category=%s)", submission.id, category
+        )
         raise ReviewFailed(REFUSAL_MESSAGE)
```

### 1.3 `fallbacks: "default"` + `server-side-fallback-2026-07-01` -- [SHOULD]
The migration guide for Sonnet 5.5 ("Safeguards and fallback") says server-side fallback with `fallbacks: "default"` under beta `server-side-fallback-2026-07-01` retries `cyber` and `frontier_llm` declines on Claude Sonnet 5; it does **not** retry `bio`, `reasoning_extraction` or `general_harms`. The checklist item is `[BLOCKS]`: "Handle `stop_reason: "refusal"` ... and configure fallback". For a code-review product the realistic false positive is `cyber` (security-tooling assignments), which *is* covered, so it is worth opting in.

How to add it with `parse`: the non-beta `client.messages.parse` has **no** `fallbacks`/`betas` kwargs (verified signature). `client.beta.messages.parse` has both (`fallbacks: Optional[BetaFallbacksParam]` where `BetaFallbacksParam = Union[Iterable[BetaFallbackParam], Literal["default"]]`, and `betas: List[AnthropicBetaParam]`), and returns `ParsedBetaMessage` with the same `parsed_output` attribute. So switch to the beta namespace. Because the served model may differ from the requested one, persist `response.model` instead of `settings.ANTHROPIC_MODEL`.

```diff
--- a/backend/app/services/roaster.py
+++ b/backend/app/services/roaster.py
@@
-MAX_OUTPUT_TOKENS = 4096
+MAX_OUTPUT_TOKENS = 8192  # adaptive thinking is ON by default on Sonnet 5.5; budget covers thinking + reply
+EFFORT = "medium"  # Sonnet 5.5 defaults to "high"; the guide says set it explicitly (see 1.5)
+FALLBACK_BETA = "server-side-fallback-2026-07-01"
@@
-async def _generate_roast(submission: Submission) -> tuple[RoastResult, int, int]:
-    """Fetch repo files, call Claude and return ``(result, input_tokens, output_tokens)``."""
+async def _generate_roast(submission: Submission) -> tuple[RoastResult, str, int, int]:
+    """Fetch repo files, call Claude and return ``(result, model, input_tokens, output_tokens)``."""
@@
     client = get_anthropic_client()
-    response = await client.messages.parse(
+    response = await client.beta.messages.parse(
         model=settings.ANTHROPIC_MODEL,
         max_tokens=MAX_OUTPUT_TOKENS,
-        system=SYSTEM_PROMPT,
+        system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
         messages=[{"role": "user", "content": user_message}],
         output_format=RoastResult,
+        output_config={"effort": EFFORT},
+        betas=[FALLBACK_BETA],
+        fallbacks="default",
     )
@@
-    usage = response.usage
-    return result, int(usage.input_tokens), int(usage.output_tokens)
+    usage = response.usage
+    # cache_read/creation tokens are NOT included in input_tokens; add them so the stored
+    # number reflects the full prompt size.
+    input_tokens = (
+        int(usage.input_tokens)
+        + int(usage.cache_read_input_tokens or 0)
+        + int(usage.cache_creation_input_tokens or 0)
+    )
+    return parsed, response.model, input_tokens, int(usage.output_tokens)
@@ async def run_review
-            result, input_tokens, output_tokens = await _generate_roast(submission)
+            result, model_used, input_tokens, output_tokens = await _generate_roast(submission)
@@
-            model_used=settings.ANTHROPIC_MODEL,
+            model_used=model_used,
```

(`output_config={"effort": ...}` together with `output_format=` is fine: `_merge_output_configs` in the SDK merges `format` into the given `output_config`; only `output_config.format` + `output_format` together raises.)

Test fixture impact (`backend/tests/conftest.py:362`): `FakeAnthropic` exposes `self.messages = SimpleNamespace(parse=self._parse)`; add `self.beta = SimpleNamespace(messages=SimpleNamespace(parse=self._parse))` and return `model=...` plus `cache_read_input_tokens=0, cache_creation_input_tokens=0` in the fake `usage`. `tests/test_roaster.py:57-61` asserts `call["system"] == SYSTEM_PROMPT` and `"thinking" not in call`; update the system assertion to `call["system"][0]["text"] == SYSTEM_PROMPT` if you adopt the cache block.

If you prefer to stay on the GA `client.messages.parse`, the equivalent is `extra_headers={"anthropic-beta": FALLBACK_BETA}, extra_body={"fallbacks": "default"}` -- works but untyped. UNVERIFIED whether `fallbacks` is accepted by the GA endpoint without the beta namespace; the beta namespace is the documented path.

### 1.4 No prefill, no `budget_tokens`, no sampling params -- CORRECT
Verified by `tests/test_roaster.py:61` (`"temperature" not in call and "thinking" not in call`). Nothing to change. Do **not** add `thinking={"type": "disabled"}` -- it returns a 400 on Sonnet 5.5 (`between_tools` is the lowest setting).

### 1.5 `max_tokens` and effort -- [SHOULD]
- Sonnet 5.5: adaptive thinking is on by default and thinking tokens count toward `max_tokens` and are billed as output. The checklist says "size `max_tokens` for thinking plus the reply". A 150-300 word Tanglish roast + summary + bullets is ~600-900 output tokens; at default effort `high` the model "thinks briefly before almost every reply", so 4096 is usually enough but `stop_reason == "max_tokens"` becomes a real failure mode on big repos. Raise to 8192 (still under the ~16K no-streaming ceiling; nothing else changes).
- Effort default is `high` on the Claude API. Guide: "`low` for chat, content generation, classification, extraction" and "`medium` for agentic coding"; "set `output_config.effort` explicitly"; "to get less thinking, lower the effort level" (prompting for less thinking has almost no effect). This workload is a single-shot evaluation + content generation over up to ~200K input tokens (40 files x 20 KB). Recommendation: start at **`medium`** (scoring consistency benefits from some reasoning; the rubric asks for file-specific evidence), A/B against `low` on a handful of repos, and keep it as a setting:

```diff
--- a/backend/app/config.py
+++ b/backend/app/config.py
@@
     ANTHROPIC_MODEL: str = "claude-sonnet-5-5"
+    ANTHROPIC_EFFORT: str = "medium"  # low | medium | high
```
and use `output_config={"effort": settings.ANTHROPIC_EFFORT}`.

- Cost note: Sonnet 5.5 is $2 / $10 per MTok, 1M context, same tokenizer as Sonnet 5 (~30% more tokens than 4.x). Worst case 40 x 20 KB = ~800 KB = roughly 200-260K input tokens = ~$0.50 per review. `MAX_FILE_BYTES=20480` x `MAX_REPO_FILES=40` is generous; consider 12 KB x 30 for assignment-sized repos. UNVERIFIED whether a >200K-token long-context premium applies to Sonnet 5.5 (models.md only states "no long-context premium" explicitly for Opus 4.8).

### 1.6 Prompt caching -- [NICE] (worth it, cheap to add)
- Minimum cacheable prefix on Sonnet 5.5 is **512 tokens** (prompt-caching.md:135, migration guide "What carries over": "512, down from 1,024 on Sonnet 5 -- check the docs before quoting"). `SYSTEM_PROMPT` is 3,355 chars = ~960 tokens (chars/3.5), ~1,250 with the newer tokenizer, so it is comfortably above the minimum.
- The prompt is fully static (no timestamps, no user IDs interpolated -- verified), which is the "frozen system prompt" pattern.
- Economics: 5-min TTL; cache write costs 1.25x, reads 0.1x. Savings are ~90% of ~1.2K tokens = ~$0.002 per hit. Only pays off when community traffic produces more than one review per 5 minutes. Harmless when it doesn't (cold-write penalty on ~1K tokens is negligible). The diff is in 1.3 (`system=[{..., "cache_control": {"type": "ephemeral"}}]`). Do not place a breakpoint on the user message -- repo content varies per request.
- If you add it, log `usage.cache_read_input_tokens` so you can see hits (prompt-caching.md:196 "verify after every change").

### 1.7 Error classes -- [SHOULD]
Current code: `ReviewFailed` for expected failures, then a bare `except Exception` that writes `f"{type(exc).__name__}: {exc}"` to `error_message` (shown to the user). For SDK errors that leaks request details and gives unhelpful text. Hierarchy in 1.13.0 (verified via `dir(anthropic)`): `AnthropicError` > `APIError` > {`APIConnectionError` > `APITimeoutError`; `APIStatusError` > `BadRequestError`, `AuthenticationError`, `PermissionDeniedError`, `NotFoundError`, `ConflictError`, `UnprocessableEntityError`, `RateLimitError`, `InternalServerError`, `OverloadedError`, ...}. The SDK already retries 429/5xx/overloaded/connection errors twice with backoff.

```diff
--- a/backend/app/services/roaster.py
+++ b/backend/app/services/roaster.py
@@
 import anthropic
+from pydantic import ValidationError
@@
+ANTHROPIC_TIMEOUT_SECONDS = 180.0
+ANTHROPIC_MAX_RETRIES = 3
+
 def get_anthropic_client() -> anthropic.AsyncAnthropic:
     """Create the Anthropic client. Module-level so tests can monkeypatch it."""
-    return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
+    return anthropic.AsyncAnthropic(
+        api_key=settings.ANTHROPIC_API_KEY,
+        timeout=ANTHROPIC_TIMEOUT_SECONDS,
+        max_retries=ANTHROPIC_MAX_RETRIES,
+    )
@@ async def _generate_roast
     client = get_anthropic_client()
-    response = await client.beta.messages.parse(
-        ...
-    )
+    try:
+        response = await client.beta.messages.parse(
+            ...
+        )
+    except anthropic.RateLimitError as exc:
+        logger.warning("Anthropic rate limited (request %s)", exc.request_id)
+        raise ReviewFailed("The reviewer is busy right now, please retry in a minute") from exc
+    except anthropic.AuthenticationError as exc:
+        logger.error("Anthropic auth failed: %s", exc.message)
+        raise ReviewFailed("Reviewer is misconfigured, contact an admin") from exc
+    except anthropic.APIStatusError as exc:  # 4xx/5xx incl. Overloaded (529)
+        logger.error("Anthropic API %s (request %s): %s", exc.status_code, exc.request_id, exc.message)
+        raise ReviewFailed(f"Reviewer returned an error ({exc.status_code}), please retry") from exc
+    except anthropic.APIConnectionError as exc:  # includes APITimeoutError
+        logger.warning("Anthropic connection error: %s", exc)
+        raise ReviewFailed("Could not reach the reviewer, please retry") from exc
+    except ValidationError as exc:
+        logger.warning("Claude output failed schema validation: %s", exc)
+        raise ReviewFailed("Reviewer produced an invalid review, please retry") from exc
```
Keep the outer `except Exception` in `run_review` as the last resort but stop echoing `str(exc)` to users: `_mark_failed(db, submission, "Unexpected error during review, please retry")` (the stack trace is already logged via `logger.exception`).

### 1.8 `prompts.py` -- fine
Untrusted-data framing, tag escaping, and the "never reveal the system prompt" line are consistent with the guide. One behavioral note from the Sonnet 5.5 section: the model "holds a system-prompt role more reliably when a user pastes in a competing persona", so the current security section is sufficient; no "CRITICAL/MUST" shouting is present (good -- it overtriggers).

---

## 2. GitHub API usage (`backend/app/services/github_client.py`)

The claude-api skill has no GitHub REST live-source; items below are from knowledge of the GitHub REST docs and are marked accordingly.

| Item | Status |
|---|---|
| `GET /repos/{owner}/{repo}` | Correct. 404 for missing **and** private-without-auth repos -> mapped to "Repository not found or is private". OK. |
| `GET /repos/{owner}/{repo}/commits/{ref}` | Correct endpoint for resolving a branch to a SHA. UNVERIFIED: a default branch containing `/` (e.g. `release/1.0`) in the path -- GitHub generally resolves it, but `heads/<name>` via `git/ref/heads/...` is the unambiguous form. Rare for default branches; low priority. |
| `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1` | Correct. Limit: 100,000 entries / 7 MB; beyond that `truncated: true`. |
| `GET /repos/{owner}/{repo}/git/blobs/{sha}` | Correct. The Git Blobs API returns base64 content for blobs **up to 100 MB** (the 1 MB limit belongs to the *Contents* API, which this code does not use). So `MAX_FETCH_BYTES = 1_000_000` is a sensible self-imposed cap, not an API constraint -- update the comment. `base64.b64decode` ignores the embedded newlines by default (validate=False). OK. |
| `X-GitHub-Api-Version: 2022-11-28` | Recommended by GitHub and already sent. Keep. `Accept: application/vnd.github+json` and `User-Agent` are also required/recommended. OK. |
| Auth header `Bearer <token>` | Correct for classic and fine-grained PATs. OK. |
| Rate limits | Unauthenticated: 60 req/hour **per IP** (shared by every user behind the server's egress IP -- effectively unusable in production). Authenticated PAT: 5,000/hour. Secondary limits: avoid >100 concurrent requests and bursts; `CONCURRENT_BLOB_FETCHES = 5` is fine. Per review: 1 (repo) + 1 (commit) + 1 (tree) + up to 40 blobs = ~43 requests, so unauthenticated supports ~1 review/hour. |
| 403/429 handling | Primary limit returns 403 with `X-RateLimit-Remaining: 0`; secondary returns 403 or 429 with `Retry-After`. Both are caught. [NICE] surface `Retry-After` in the log line. |
| `truncated: true` | Only logged (`github_client.py:229`). Partial tree is still ranked by priority, so the review degrades gracefully, but README/entry points may be missing if they fall outside the returned slice. [NICE] fallback: when truncated, also fetch the non-recursive root tree (`/git/trees/{sha}`) and merge it so top-level README/entry points are always considered. |
| 301 redirects (renamed repos) | `follow_redirects=True` handles it. OK. |

[SHOULD] Empty repository: `commits/{branch}` and `git/trees` return **409 Conflict** ("Git Repository is empty"). Today that yields `"GitHub API returned an unexpected error (409)"` plus an error-level log. Map it:

```diff
--- a/backend/app/services/github_client.py
+++ b/backend/app/services/github_client.py
@@ def _raise_for_status
     if status == 404:
         raise BadRequestError("Repository not found or is private")
+    if status == 409:
+        raise BadRequestError("Repository is empty, push some code first")
     if status in (403, 429):
```

[MUST FIX] (ops, not code) Document that `GITHUB_TOKEN` is effectively required in production; `.env.example` says "optional". With the per-IP 60/hour budget the 6th user in an hour will get "rate limit exceeded".

[NICE] `_client()` builds a new `httpx.AsyncClient` per call (3 per review). Reuse one module-level client (or one per `fetch_repo_files` call, which it already does for blobs) to keep connections warm. Note: the project's `httpx 0.28` is separate from the SDK's `httpx2`; `respx` mocks `httpx`, so tests are unaffected by the SDK.

---

## 3. FastAPI BackgroundTasks + SQLAlchemy

### 3.1 `async def run_review` blocks the event loop -- [MUST FIX]
Verified in installed `starlette 1.7.0` `background.py`:
```python
async def __call__(self) -> None:
    if self.is_async:
        await self.func(*self.args, **self.kwargs)      # async def -> runs ON the event loop
    else:
        await run_in_threadpool(self.func, ...)        # sync def -> threadpool
```
`run_review` is `async def`, so every sync SQLAlchemy call in it (`db.get`, `db.commit`, `db.delete`, `db.flush`, `db.rollback`) blocks the single uvicorn event loop for the duration of the Postgres round-trip. The GitHub and Anthropic calls are properly async and do not block. In practice the blocking is a few ms per commit, but `pool_pre_ping=True` adds a round-trip per checkout and a slow/remote DB or pool exhaustion wait stalls **all** requests.

Minimal fix that keeps `run_review` async (the tests call `await roaster.run_review(...)`): move the DB-touching phases into small sync helpers and run them with `asyncio.to_thread`. A `Session` must not be used concurrently from two threads, but sequential use from different threads is fine; simplest is to open a short-lived session inside each helper.

```diff
--- a/backend/app/services/roaster.py
+++ b/backend/app/services/roaster.py
@@
+import asyncio
 import logging
@@
+def _begin(submission_id: int) -> Submission | None:
+    """Mark the submission as reviewing and return a detached copy (sync, run in a thread)."""
+    with SessionLocal() as db:
+        submission = db.get(Submission, submission_id)
+        if submission is None:
+            return None
+        submission.status = SubmissionStatus.reviewing
+        submission.error_message = None
+        db.commit()
+        db.refresh(submission)
+        db.expunge(submission)
+        return submission
+
+
+def _fail(submission_id: int, message: str) -> None:
+    with SessionLocal() as db:
+        submission = db.get(Submission, submission_id)
+        if submission is not None:
+            _mark_failed(db, submission, message)
+
+
+def _persist(submission_id: int, result: RoastResult, model_used: str, input_tokens: int, output_tokens: int) -> None:
+    with SessionLocal() as db:
+        submission = db.get(Submission, submission_id)
+        if submission is None:
+            return
+        if submission.review is not None:
+            db.delete(submission.review)
+            db.flush()
+        db.add(Review(submission_id=submission.id, score=result.score, summary=result.summary[:1000],
+                      roast_text=result.roast_text, strengths=result.strengths,
+                      improvements=result.improvements, model_used=model_used,
+                      input_tokens=input_tokens, output_tokens=output_tokens))
+        submission.status = SubmissionStatus.done
+        submission.error_message = None
+        db.commit()
+
+
 async def run_review(submission_id: int) -> None:
-    db = SessionLocal()
     try:
-        submission = db.get(Submission, submission_id)
+        submission = await asyncio.to_thread(_begin, submission_id)
         if submission is None:
             logger.warning("run_review: submission %s no longer exists", submission_id)
             return
-
-        submission.status = SubmissionStatus.reviewing
-        submission.error_message = None
-        db.commit()
-
         if not settings.ANTHROPIC_API_KEY:
             logger.error("run_review: %s", MISSING_KEY_MESSAGE)
-            _mark_failed(db, submission, MISSING_KEY_MESSAGE)
+            await asyncio.to_thread(_fail, submission_id, MISSING_KEY_MESSAGE)
             return
-
         try:
-            result, input_tokens, output_tokens = await _generate_roast(submission)
+            result, model_used, input_tokens, output_tokens = await _generate_roast(submission)
         except ReviewFailed as exc:
-            _mark_failed(db, submission, str(exc))
+            await asyncio.to_thread(_fail, submission_id, str(exc))
             return
-
-        if submission.review is not None:
-            ...
-        db.commit()
+        await asyncio.to_thread(_persist, submission_id, result, model_used, input_tokens, output_tokens)
         logger.info(...)
     except Exception:
         logger.exception("Review failed for submission %s", submission_id)
-        db.rollback()
-        submission = db.get(Submission, submission_id)
-        if submission is not None:
-            _mark_failed(db, submission, f"{type(exc).__name__}: {exc}")
-    finally:
-        db.close()
+        await asyncio.to_thread(_fail, submission_id, "Unexpected error during review, please retry")
```
`_generate_roast` only reads plain attributes (`repo_owner`, `repo_name`, `commit_sha`, `github_url`, `default_branch`, `id`) from the detached object, so `expunge` is safe. `build_user_message` also reads only those columns.

Alternative with less code: make `run_review` a plain `def` that does the DB work inline and runs the async part with `asyncio.run(_generate_roast(submission))` -- Starlette will then run the whole task in its threadpool. Downside: a new event loop per review and tests need `roaster.run_review(id)` without `await`. The `to_thread` version is the smaller behavioural change.

Also note (design, already accepted by the PRP): `BackgroundTasks` are in-process; a restart loses in-flight reviews and they stay `reviewing` forever. [NICE] On startup, reset rows stuck in `reviewing` older than N minutes to `failed` ("Server restarted during review, please retry").

### 3.2 SQLAlchemy 2.1 default Postgres driver -- CONFIRMED, [SHOULD] switch to psycopg 3
Installed `sqlalchemy 2.1.4`: `dialects/postgresql/__init__.py:99` is `base.dialect = dialect = psycopg.dialect`, i.e. a bare `postgresql://` URL now resolves to **psycopg (v3)**, and `psycopg2` must be requested explicitly. `normalize_database_url` correctly pins `postgresql+psycopg2://`, so nothing is broken today.

Recommendation: follow the new default and drop the shim.
- `psycopg[binary]` bundles libpq, so `backend/Dockerfile` no longer needs `gcc libpq-dev` in the build stage or `libpq5` in the runtime stage (smaller image, faster CI).
- psycopg 3 is the actively developed driver; psycopg2 is maintenance-only.
- No code changes needed for the sync `Session` usage; Alembic `env.py` reads the same URL.

```diff
--- a/backend/requirements.txt
+++ b/backend/requirements.txt
-psycopg2-binary>=2.9.9,<3.0
+psycopg[binary]>=3.2,<4.0
--- a/backend/app/database.py
+++ b/backend/app/database.py
 def normalize_database_url(url: str) -> str:
-    """Pin a driverless ``postgresql://`` URL to psycopg2. ..."""
+    """Pin a driverless ``postgresql://`` URL to psycopg (v3), SQLAlchemy 2.1's default.
+
+    Also accepts Heroku-style ``postgres://`` which SQLAlchemy rejects.
+    """
     if url.startswith("postgresql://"):
-        return "postgresql+psycopg2://" + url[len("postgresql://") :]
+        return "postgresql+psycopg://" + url[len("postgresql://") :]
     if url.startswith("postgres://"):
-        return "postgresql+psycopg2://" + url[len("postgres://") :]
+        return "postgresql+psycopg://" + url[len("postgres://") :]
     return url
```
Update `backend/Dockerfile` lines 15 and 33-35 accordingly, and any test asserting the `+psycopg2` prefix. If you keep psycopg2, the current shim is correct; just keep the `<3.0` pin.

---

## 4. Frontend (React 19.2, react-query 5.104, react-router 7.18, Chakra 3.37, Vite 8.3.4, oxlint 1.87)

- `refetchInterval` function form (`hooks/useSubmissionPolling.ts`): `(query) => isActive(query.state.data?.status) ? 3000 : false` is the correct v5 signature (v5 passes the `Query` object, data lives at `query.state.data`). `refetchIntervalInBackground: false` and `staleTime: 0` are right for polling. CORRECT.
- `useInfiniteQuery` offset paging (`hooks/useSubmissions.ts`): `initialPageParam: 0` (required in v5) + `getNextPageParam` returning `undefined` at the end, and the result typed `InfiniteData<Paginated<Submission>, number>`. CORRECT. [NICE] add `maxPages` if lists grow large.
- Chakra v3 provider (`src/main.tsx`): `<ChakraProvider value={system}>` with `createSystem(defaultConfig, config)` is the v3 pattern; `<html class="dark">` is set in `index.html`. CORRECT. (Framer-motion 14 is only imported in 2 files -- `App.tsx` `AnimatePresence` and one other -- fine.)
- Router: `BrowserRouter` + `Routes`/`Route` is the v7 "declarative" mode; fine for this app. `AnimatePresence mode="wait"` keyed on `location.pathname` is the standard pattern.

### 4.1 800 kB bundle warning -- [SHOULD]
`dist/assets/index-Cm6sMjeN.js` is 824 KB (one chunk). Vite 8 is Rolldown-based: `build.rollupOptions` is **deprecated** in favour of `build.rolldownOptions`, and `output.manualChunks` is deprecated in favour of `output.codeSplitting` (verified in `node_modules/vite/dist/node/index.d.ts:948-965` and `rolldown/.../define-config.d.mts:870-877`: "If `advancedChunks` and `codeSplitting` are both specified, `advancedChunks` is ignored"). The most robust fix is route-level `React.lazy`, which needs no bundler-specific config:

```diff
--- a/frontend/src/App.tsx
+++ b/frontend/src/App.tsx
 import { AnimatePresence } from 'framer-motion'
+import { Suspense, lazy } from 'react'
 import { Route, Routes, useLocation } from 'react-router-dom'

 import { Navbar } from './components/layout/Navbar'
 import { ProtectedRoute } from './components/layout/ProtectedRoute'
-import {
-  AdminPage,
-  ...
-  SubmitPage,
-} from './pages'
+// Eager: tiny public pages on the critical path.
+import { HomePage } from './pages/HomePage'
+import { LoginPage } from './pages/LoginPage'
+import { NotFoundPage } from './pages/NotFoundPage'
+
+// Lazy: everything behind auth or rarely visited becomes its own chunk.
+const RegisterPage = lazy(() => import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })))
+const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })))
+const OAuthCallbackPage = lazy(() => import('./pages/OAuthCallbackPage').then((m) => ({ default: m.OAuthCallbackPage })))
+const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage').then((m) => ({ default: m.LeaderboardPage })))
+const SubmitPage = lazy(() => import('./pages/SubmitPage').then((m) => ({ default: m.SubmitPage })))
+const SubmissionsPage = lazy(() => import('./pages/SubmissionsPage').then((m) => ({ default: m.SubmissionsPage })))
+const SubmissionDetailPage = lazy(() => import('./pages/SubmissionDetailPage').then((m) => ({ default: m.SubmissionDetailPage })))
+const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
+const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
+const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
+const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })))
+const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })))
+const AdminSubmissionsPage = lazy(() => import('./pages/AdminSubmissionsPage').then((m) => ({ default: m.AdminSubmissionsPage })))
@@
       <Navbar />
-      <AnimatePresence mode="wait">
-        <Routes location={location} key={location.pathname}>
+      <Suspense fallback={null /* or a Chakra <Spinner /> centred in PageWrapper */}>
+        <AnimatePresence mode="wait">
+          <Routes location={location} key={location.pathname}>
           ...
-        </Routes>
-      </AnimatePresence>
+          </Routes>
+        </AnimatePresence>
+      </Suspense>
```
(The `.then(m => ({default: m.X}))` shim is needed because `pages/*.tsx` use named exports. Alternatively add `export default` to each page.) The barrel `src/pages/index.ts` must no longer be imported from `App.tsx`, otherwise every page stays in the entry chunk. Put the `Suspense` *inside* `ProtectedRoute` if you want the Navbar/redirect to render before the chunk loads.

Optional vendor split (Vite 8 / Rolldown syntax; the `test` field on a `CodeSplittingGroup` is per Rolldown docs -- UNVERIFIED against this exact version, so prefer the lazy() change above):

```ts
// vite.config.ts
build: {
  rolldownOptions: {
    output: {
      codeSplitting: {
        groups: [
          { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|@tanstack)[\\/]/ },
          { name: 'chakra', test: /node_modules[\\/](@chakra-ui|@emotion|framer-motion)[\\/]/ },
        ],
      },
    },
  },
},
```
Do **not** add `build.rollupOptions.output.manualChunks` -- it is the deprecated alias on Vite 8.

### 4.2 oxlint vs eslint -- [NICE]
`npm run lint` = `oxlint` with `react`, `typescript`, `oxc` plugins and `react/rules-of-hooks` enabled. `exhaustive-deps` exists in the installed oxlint schema (`configuration_schema.json` contains it) but is not enabled in `.oxlintrc.json`; add `"react/exhaustive-deps": "warn"` since you rely on `useEffect` in AuthContext/polling pages. oxlint does not type-check (fine -- `tsc --noEmit` is a separate CI step) and has no `jsx-a11y` parity with eslint-plugin-jsx-a11y unless you enable the `jsx-a11y` plugin: `"plugins": ["react", "typescript", "oxc", "jsx-a11y"]`. No ESLint config exists, so CI is consistent.

---

## 5. Dependency advisories

- `npm audit --omit=dev --json`: **0 vulnerabilities** (188 prod deps). Clean.
- Backend (venv has no `pip`; versions read from `site-packages/*.dist-info`): anthropic 1.13.0, fastapi 0.143.0, starlette 1.7.0, sqlalchemy 2.1.4, psycopg2-binary 2.9.13, pydantic 2.14.0, python-jose 3.5.0, ecdsa 0.19.2, passlib 1.7.4, bcrypt 4.3.0, authlib 1.8.0, cryptography 50.0.2, httpx 0.28.1, slowapi 0.1.10, uvicorn 0.54.0, alembic 1.20.0.
  - `python-jose 3.5.0`: the 2024 advisories (CVE-2024-33663 algorithm confusion, CVE-2024-33664 JWT bomb DoS) were fixed in 3.4.0. OK.
  - `ecdsa 0.19.2` (pulled in by python-jose): CVE-2024-23342 (Minerva timing side-channel) is **won't-fix** upstream. Only exploitable with EC keys; this project uses HS256, so not reachable. [NICE] python-jose is lightly maintained; `joserfc 1.7.5` is already installed (Authlib dependency) and is a modern replacement if you ever touch JWT code.
  - `passlib 1.7.4` + `bcrypt 4.3.0`: passlib is unmaintained and logs `(trapped) error reading bcrypt version` because bcrypt >= 4.1 removed `__about__`. Harmless. The `bcrypt<5.0` pin is important: bcrypt 5.0 raises on passwords > 72 bytes instead of truncating, which breaks passlib's wrapping. [NICE] replace passlib with direct `bcrypt.hashpw/checkpw` (and truncate/validate 72 bytes yourself).
  - `authlib 1.8.0`: past the 1.6.4/1.6.5 fixes (JWS `crit` header bypass, JWS DoS). OK.
  - No other packages with advisories I am confident about. `requirements.txt` has `anthropic` unpinned -- [SHOULD] pin `anthropic>=1.13,<2.0` (1.x switched to `httpx2`; a future 2.x could change the `parse`/fallback surface).

---

## 6. Gaps vs `PRPs/assignment-roaster-prp.md` acceptance criteria

| # | Gap | Severity |
|---|---|---|
| 1 | **Forgot password is UI-only.** `frontend/src/components/auth/ForgotPasswordForm.tsx` shows a "Coming soon" alert; no `/auth/forgot-password` or `/auth/reset-password` endpoints, no `reset_token` model, no mailer (grep for smtp/sendgrid/send_email/reset_token across `backend/app` and `frontend/src` returned nothing). The PRP explicitly scopes this as "UI only in MVP", so it is a known gap -- but the route is publicly linked from `/login`, so users will hit a dead end. | [SHOULD] either hide the link until implemented, or implement token + email. |
| 2 | **No email notifications at all** (no verification email; `is_verified` is never set true for password users). PRP does not require them; noting for completeness. | [NICE] |
| 3 | **Private repos**: not supported by design ("Public repos only"). A user-supplied token or GitHub App install would be needed. Error text "Repository not found or is private" is correct. | documented limitation |
| 4 | **Re-roasting the same repo**: no uniqueness on `(user_id, github_url)` or `(user_id, commit_sha)` (`alembic/versions/0001_initial.py` has only non-unique indexes). Re-submitting the same commit spends a full Claude call and counts toward the 5/hour limit. The retry endpoint only re-runs `failed` submissions. | [SHOULD] in `submission_service.create_submission`, if an existing `done` submission for the same `(user_id, repo_owner, repo_name, commit_sha)` exists, return 409 with "Already reviewed at this commit; push new changes or delete the old submission". Or allow it but short-circuit by copying the existing review. |
| 5 | **Rate limiting implementation differs from PRP**: PRP says "slowapi keyed on user id"; implementation counts rows in the DB (`count_recent_submissions`) and `app/limiter.py` uses `get_remote_address` (IP). The DB count is actually the more correct behaviour for a per-user quota (survives restarts, multi-worker safe) and the acceptance criterion "6th submission within an hour returns 429" is satisfied. Note that *deleted* submissions no longer count, so a user can delete and resubmit to bypass the quota. | [NICE] count by a soft timestamp table or keep deleted rows; low risk. |
| 6 | **Background job durability**: reviews stuck in `reviewing` after a process restart are never recovered (see 3.1). Acceptance "Claude or GitHub failure marks submission failed" holds only for in-process failures. | [SHOULD] startup sweep or a `reviewing` timeout. |
| 7 | **Tree truncation / huge repos**: handled by logging only (section 2). | [NICE] |
| 8 | **Fallback not configured**: the Sonnet 5.5 checklist marks "configure fallback" as `[BLOCKS]`; the refusal path is handled but every `cyber` false positive currently becomes a failed submission. | [SHOULD] (section 1.3) |
| 9 | **`error_message` exposes raw exception text** (`f"{type(exc).__name__}: {exc}"`) to the submitting user, e.g. SDK messages containing request IDs or SQL text. | [SHOULD] (section 1.7) |
| 10 | Endpoints in PRP: auth (8), submissions (5), reviews (1), leaderboard (2), dashboard (1), admin (5) -- all present in `app/routers/*`. Alembic initial migration present. CI runs `pytest --cov=app --cov-fail-under=80`. Coverage number itself not executed by me. | OK |
| 11 | Frontend "RoastCard copy button", "ScoreBadge colour scale", "current user highlighted" -- not re-verified by me (REVIEW-AGENT scope). | UNVERIFIED |

---

## Priority summary

**[MUST FIX]**
1. `run_review` is `async def` and does sync DB I/O on the event loop -- move DB phases to `asyncio.to_thread` (3.1).
2. Treat `GITHUB_TOKEN` as required in production; 60 req/hour per IP cannot serve more than ~1 review/hour (2).

**[SHOULD]**
3. Opt in to server-side fallback (`client.beta.messages.parse(..., betas=["server-side-fallback-2026-07-01"], fallbacks="default")`) and persist `response.model` (1.3).
4. Set `output_config={"effort": "medium"}` explicitly (default is `high`) and raise `max_tokens` to 8192 to cover adaptive thinking (1.5).
5. Catch `RateLimitError` / `APIStatusError` / `APIConnectionError` / `pydantic.ValidationError` with user-safe messages; stop echoing raw exceptions into `error_message` (1.7, 6.9).
6. Switch to `psycopg[binary]` and `postgresql+psycopg://` to match SQLAlchemy 2.1's default and drop `gcc/libpq-dev` from the Docker build (3.2).
7. Route-level `React.lazy()` in `App.tsx` to fix the 824 KB chunk; use `rolldownOptions.output.codeSplitting`, not `manualChunks`, if you also want vendor chunks (4.1).
8. Map GitHub 409 (empty repo) to a friendly 400 (2).
9. Dedupe re-submission of the same commit; hide or implement forgot-password; recover `reviewing` rows on restart (6).
10. Pin `anthropic>=1.13,<2.0` in `requirements.txt` (5).

**[NICE]**
11. `cache_control` on the (static, ~1.2K-token, >512 minimum) system prompt and log `cache_read_input_tokens` (1.6).
12. Log `stop_details.category` on refusals (1.2); drop the redundant `model_validate(model_dump())` (1.1).
13. Reuse one `httpx.AsyncClient`; merge root tree when `truncated` (2).
14. Enable `react/exhaustive-deps` and `jsx-a11y` in `.oxlintrc.json` (4.2).
15. Replace passlib with direct `bcrypt`; consider `joserfc` over python-jose (5).
