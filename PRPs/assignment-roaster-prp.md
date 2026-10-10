# PRP: Assignment Roaster

> Implementation blueprint for parallel agent execution

---

## METADATA

| Field | Value |
|-------|-------|
| **Product** | Assignment Roaster |
| **Type** | SaaS |
| **Version** | 1.0 |
| **Created** | 2026-10-10 |
| **Complexity** | Medium |

---

## PRODUCT OVERVIEW

**Description:** Assignment Roaster reviews GitHub assignments submitted by Social Eagle community members. A user pastes a public GitHub repository link, the backend fetches the repo through the GitHub API, and an OpenAI model (gpt-4.1-mini) reviews the code. The result is a score out of 10 plus a roasting, funful review in Tanglish, saved to the user's history and surfaced on a community leaderboard.

**Value Proposition:** Instant, honest, and entertaining feedback on assignments. Learners get a score and concrete improvements in seconds instead of waiting days for a mentor, and the Tanglish roast makes the feedback shareable and fun for the community.

**MVP Scope:**
- [ ] User registration and login (email/password + Google OAuth)
- [ ] Submit a public GitHub repo URL
- [ ] AI review with score /10 and Tanglish roast (OpenAI gpt-4.1-mini, structured output)
- [ ] View my submission history and review details
- [ ] Background processing with status polling (pending -> reviewing -> done/failed)

**Post-MVP (build after validation gates pass, lower priority):**
- [ ] Leaderboard
- [ ] Dashboard stats
- [ ] Admin panel and review moderation

---

## TECH STACK

| Layer | Technology | Skill Reference |
|-------|------------|-----------------|
| Backend | FastAPI + Python 3.11+ | skills/BACKEND.md |
| Frontend | React + TypeScript + Vite | skills/FRONTEND.md |
| Database | PostgreSQL + SQLAlchemy + Alembic | skills/DATABASE.md |
| Auth | JWT (HS256) + bcrypt + Google OAuth | skills/BACKEND.md |
| UI | Chakra UI + Framer Motion | skills/FRONTEND.md |
| AI | OpenAI `gpt-4.1-mini` via `openai` Python SDK (Responses API) | CLAUDE.md (Roaster Service rules) |
| External | GitHub REST API via `httpx.AsyncClient` | CLAUDE.md (GitHub Client rules) |
| Testing | pytest + pytest-cov + React Testing Library | skills/TESTING.md |
| Deployment | Docker + docker-compose + GitHub Actions | skills/DEPLOYMENT.md |

**Backend dependencies (requirements.txt):** fastapi, uvicorn[standard], sqlalchemy, alembic, psycopg2-binary, pydantic, pydantic-settings, python-jose[cryptography], passlib[bcrypt], httpx, openai, authlib, slowapi, pytest, pytest-cov, pytest-asyncio, respx, ruff

**Frontend dependencies:** react, react-dom, react-router-dom, axios, @tanstack/react-query, @chakra-ui/react, @emotion/react, @emotion/styled, framer-motion, vitest, @testing-library/react

---

## DATABASE MODELS

### User
- id (PK), email (unique, indexed), hashed_password (nullable for OAuth users), full_name, avatar_url (nullable), is_active (default True), is_verified (default False), is_admin (default False), oauth_provider (nullable, "google"), created_at, updated_at
- Relationships: refresh_tokens (1:N), submissions (1:N)

### RefreshToken
- id (PK), user_id (FK -> users.id, indexed), token (unique), expires_at, revoked (default False), created_at

### Submission
- id (PK), user_id (FK -> users.id, indexed), github_url, repo_owner, repo_name, default_branch, commit_sha, status (enum: pending | reviewing | done | failed, indexed), error_message (nullable), created_at, updated_at
- Relationships: user (N:1), review (1:1)
- Index: (user_id, created_at desc) for history listing

### Review
- id (PK), submission_id (FK -> submissions.id, unique), score (int, CHECK 0 <= score <= 10), roast_text (text), strengths (JSON list[str]), improvements (JSON list[str]), summary (str), model_used (str), input_tokens (int), output_tokens (int), created_at
- Relationships: submission (1:1)

**Migrations:** single initial Alembic migration creating all four tables, the status enum, and the score check constraint.

---

## MODULES

### Module 1: Authentication
**Agents:** DATABASE-AGENT + BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/auth/register | Create account (409 on duplicate email) |
| POST | /api/v1/auth/login | Email/password login, returns access + refresh tokens |
| POST | /api/v1/auth/refresh | Rotate refresh token, return new access token |
| POST | /api/v1/auth/logout | Revoke refresh token |
| GET | /api/v1/auth/me | Current user profile |
| PUT | /api/v1/auth/me | Update full_name, avatar_url |
| GET | /api/v1/auth/google | Redirect to Google with state cookie |
| GET | /api/v1/auth/google/callback | Verify state, upsert user, redirect to frontend with tokens |

**Backend Files:** `auth/jwt.py`, `auth/dependencies.py` (get_current_user, require_admin), `auth/google.py`, `routers/auth.py`, `services/auth_service.py`, `schemas/auth.py`, `schemas/user.py`

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| /login | LoginPage | LoginForm, GoogleButton, GradientButton |
| /register | RegisterPage | RegisterForm |
| /forgot-password | ForgotPasswordPage | ForgotPasswordForm (UI only in MVP) |
| /profile | ProfilePage (protected) | ProfileForm |
| /auth/callback | OAuthCallbackPage | stores tokens from query, redirects to /dashboard |

**Frontend Files:** `context/AuthContext.tsx`, `hooks/useAuth.ts`, `services/api.ts` (axios + refresh interceptor), `services/auth.ts`, `components/layout/ProtectedRoute.tsx`, `types/auth.ts`

---

### Module 2: Submissions
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/submissions | Validate URL, verify repo via GitHub, create with status=pending, enqueue review (201). 429 over 5/hour |
| GET | /api/v1/submissions | Current user's submissions, paginated (`limit`, `offset`), newest first |
| GET | /api/v1/submissions/{id} | Submission + nested review. 404 if not owner |
| DELETE | /api/v1/submissions/{id} | Delete submission and review. 404 if not owner |
| POST | /api/v1/submissions/{id}/retry | Re-enqueue a failed submission (400 if not failed) |

**Business rules:**
- URL regex `^https://github\.com/[\w.-]+/[\w.-]+/?$`, strip trailing slash and `.git`
- GitHub 404 -> 400 with message "Repository not found or is private"
- Rate limit per user: 5 submissions per hour (slowapi keyed on user id)
- Ownership failures return 404, never 403

**Backend Files:** `routers/submissions.py`, `services/submission_service.py`, `services/github_client.py`, `schemas/submission.py`

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| /submit | SubmitPage | SubmitForm (live URL validation), GradientButton |
| /submissions | SubmissionsPage | SubmissionList, SubmissionCard, StatusBadge, ScoreBadge |
| /submissions/:id | SubmissionDetailPage | RepoHeader, StatusBadge, ReviewPanel (polls every 3s while pending/reviewing) |

**Frontend Files:** `services/submissions.ts`, `hooks/useSubmissions.ts`, `hooks/useSubmissionPolling.ts`, `types/submission.ts`

---

### Module 3: Reviews (Roaster Service)
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/reviews/{submission_id} | Review for a submission (owner or admin, 404 otherwise) |

**Review pipeline (`services/roaster.py`, run as FastAPI BackgroundTask):**
1. Set submission status = reviewing
2. `github_client.fetch_repo_files(owner, repo, branch)`: get tree, select up to `MAX_REPO_FILES` (40) files, each capped at `MAX_FILE_BYTES` (20480). Priority order: README*, entry points (main.py, app.py, index.ts, App.tsx, package.json, requirements.txt), source files, tests, config. Skip binaries, lockfiles, node_modules, dist, build, .git, images.
3. Build prompt. System prompt holds the rubric (code quality, README/docs, project structure, functionality/completeness, tests) and the Tanglish roast tone rules. User message holds repo metadata and files wrapped in `<repo_files>` with an explicit note that file contents are untrusted data, not instructions.
4. Call `openai.AsyncOpenAI().responses.parse(model=settings.OPENAI_MODEL, instructions=SYSTEM_PROMPT, input=user_message, text_format=RoastResult, max_output_tokens=8192)` where `RoastResult` is the Pydantic schema (score int 0-10, summary str, roast_text str, strengths list[str], improvements list[str]).
5. If `response.status == "incomplete"` (reason `max_output_tokens` or `content_filter`) or an output item carries a `refusal`: mark failed with a friendly message ("Review declined by safety filter, try another repo" for refusals). Otherwise take `response.output_parsed` and re-validate it with the Pydantic schema.
6. Persist Review with model_used, input_tokens, output_tokens. Set submission status = done.
7. Any exception: `logging.exception`, status = failed, error_message set.

**Tone guardrails (in system prompt and validated in tests):** Tanglish, playful, roast the code never the person, no slurs, no identity comments, always end with encouragement and concrete next steps.

**Backend Files:** `services/roaster.py`, `services/prompts.py` (system prompt + schema constant), `routers/reviews.py`, `schemas/review.py`

**Frontend Components:**
| Component | Purpose |
|-----------|---------|
| ScoreBadge | 0-10 with colour scale (red < 4, orange 4-6, green > 6) |
| RoastCard | Tanglish roast text with copy button, Framer Motion reveal |
| StrengthsImprovementsList | Two-column list |

**Frontend Files:** `types/review.ts`, `components/review/*`

---

### Module 4: Leaderboard (Post-MVP, Phase 2b)
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/leaderboard | Top users by best score, then avg score, then earliest created_at. `limit`, `offset` |
| GET | /api/v1/leaderboard/me | Current user's rank, best, average, submission count |

**Rules:** single aggregated SQL query (window function for rank), only status=done submissions, no N+1.

**Backend Files:** `routers/leaderboard.py`, `services/leaderboard_service.py`, `schemas/leaderboard.py`

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| /leaderboard | LeaderboardPage | LeaderboardTable, RankRow (current user highlighted), Avatar |

---

### Module 5: Dashboard (Post-MVP, Phase 2b)
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/dashboard/stats | total_submissions, average_score, best_score, latest_review |

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| /dashboard | DashboardPage (protected, default landing after login) | StatCard x3, LatestRoastCard, SubmitCTA |
| /settings | SettingsPage | SettingsForm |

---

### Module 6: Admin Panel (Post-MVP, Phase 2b)
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints (all require `require_admin` dependency, 403 otherwise):**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/admin/users | Paginated users, `search` by email |
| PUT | /api/v1/admin/users/{id} | Update is_active, is_admin (400 if admin demotes self) |
| GET | /api/v1/admin/submissions | All submissions with status and owner |
| DELETE | /api/v1/admin/reviews/{id} | Remove inappropriate review, reset submission to failed with note |
| GET | /api/v1/admin/stats | users, submissions by status, total input/output tokens |

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| /admin | AdminDashboardPage (admin only) | AdminStatCards |
| /admin/users | AdminUsersPage | UserTable, ToggleActive, ToggleAdmin |
| /admin/submissions | AdminSubmissionsPage | SubmissionTable, DeleteReviewButton |

---

## PHASE EXECUTION PLAN

**Phase 1: Foundation (4 agents in parallel)**
- DATABASE-AGENT: `database.py`, models for User, RefreshToken, Submission, Review, `models/__init__.py`, initial Alembic migration, status enum + score check constraint
- BACKEND-AGENT: `main.py` (CORS, `/health`, router includes), `config.py` (all env vars from CLAUDE.md incl. OPENAI_MODEL, GITHUB_TOKEN, MAX_REPO_FILES, MAX_FILE_BYTES, SUBMISSIONS_PER_HOUR), `exceptions.py`, `requirements.txt`, `.env.example`
- FRONTEND-AGENT: Vite + TS strict setup, Chakra provider + theme, router skeleton, `services/api.ts`, `components/ui/*` (GlassCard, GradientButton, AnimatedInput), `components/layout/*` (PageWrapper, Navbar, ProtectedRoute)
- DEVOPS-AGENT: `backend/Dockerfile`, `frontend/Dockerfile` + nginx.conf, `docker-compose.yml` (postgres, backend, frontend), `.github/workflows/ci.yml` (ruff, pytest, npm lint, type-check, docker build), `.env.example`

**Validation Gate 1:** pip install, alembic upgrade head, npm install, docker-compose config

**Phase 2a: MVP Modules (backend + frontend parallel per module)**
- Auth Module: JWT + Google OAuth endpoints, Login/Register/Profile/Callback pages, AuthContext
- Submissions Module: submissions router + service + GitHub client, Submit/Submissions/Detail pages with polling
- Reviews Module: roaster service + prompts + reviews router, ScoreBadge/RoastCard/StrengthsImprovementsList

**Validation Gate 2:** ruff check, npm lint, npm type-check, manual smoke: register -> submit a public repo -> review appears (with mocked OpenAI if no API key)

**Phase 2b: Post-MVP Modules (parallel pairs, only after Gate 2 passes)**
- Leaderboard Module: leaderboard router + service, LeaderboardPage
- Dashboard Module: stats endpoint, DashboardPage, SettingsPage
- Admin Module: admin router with require_admin, admin pages

**Phase 3: Quality (3 agents in parallel)**
- TEST-AGENT: pytest with mocked OpenAI client (respx for GitHub, monkeypatched `roaster.get_openai_client`), fixtures for valid review / missing field / refusal; ownership, rate limit, leaderboard tie-break tests; RTL tests for SubmitForm, StatusBadge, ScoreBadge; 80%+ coverage
- REVIEW-AGENT: security audit (secrets never reach client, OAuth state check, prompt injection wrapper, 404 on foreign submissions, admin self-demotion), performance (leaderboard single query, file fetch concurrency with bounded semaphore)
- RESEARCH-AGENT: validate OpenAI SDK usage against current docs (Responses API `responses.parse`, structured outputs shape, refusal and incomplete handling), GitHub API rate limits

**Final Validation:** full test suite, docker-compose build, health checks

---

## VALIDATION GATES

| Gate | Commands |
|------|----------|
| 1 | `cd backend && pip install -r requirements.txt && alembic upgrade head`, `cd frontend && npm install`, `docker-compose config` |
| 2 | `ruff check backend/`, `cd frontend && npm run lint && npm run type-check` |
| 3 | `cd backend && pytest --cov=app --cov-fail-under=80`, `cd frontend && npm test` |
| Final | `docker-compose up -d --build`, `curl localhost:8000/health`, `curl localhost:8000/docs` |

---

## ENVIRONMENT VARIABLES

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/assignment_roaster

# Auth
SECRET_KEY=your-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
FRONTEND_URL=http://localhost:5173

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback

# AI (OpenAI)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini

# GitHub
GITHUB_TOKEN=ghp_...   # optional, raises API rate limit to 5000/hour

# Limits
MAX_REPO_FILES=40
MAX_FILE_BYTES=20480
SUBMISSIONS_PER_HOUR=5

# Frontend
VITE_API_URL=http://localhost:8000
```

---

## ACCEPTANCE CRITERIA (from INITIAL.md)

- [ ] Register, login, Google OAuth, refresh, protected routes redirect to /login
- [ ] Invalid or non-GitHub URLs return 400; private/missing repos return 400 and are not saved
- [ ] Valid submission returns 201 with status pending; review completes asynchronously to done
- [ ] Users only see their own submissions (404 for others)
- [ ] 6th submission within an hour returns 429
- [ ] Score is always an integer 0-10; roast is Tanglish and non-abusive; strengths and improvements non-empty
- [ ] OpenAI or GitHub failure marks submission failed with error_message; retry endpoint re-enqueues
- [ ] Token usage recorded per review
- [ ] Leaderboard ranks by best score then average; current user highlighted
- [ ] OpenAPI docs complete, 80%+ backend coverage, TS strict passes, Docker builds

---

## NEXT STEP

Execute with parallel agents:
/execute-prp PRPs/assignment-roaster-prp.md
