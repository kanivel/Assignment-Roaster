# INITIAL.md - Assignment Roaster Product Definition

> Paste a GitHub assignment link, get a rating out of 10 and a roasting, fun review in Tanglish.

---

## PRODUCT

### Name
Assignment Roaster

### Description
Assignment Roaster reviews GitHub assignments submitted by Social Eagle community members. A user pastes a public GitHub repository link, the backend fetches the repo contents, and an OpenAI model reviews the code. The result is a score out of 10 plus review comments written in a roasting, funful Tanglish (Tamil + English) tone. Reviews are saved so users can see their history, and a community leaderboard shows who is topping the charts.

### Target User
Social Eagle community members who submit coding assignments and want fast, honest, and entertaining feedback.

### Type
- [x] SaaS (Software as a Service)

---

## TECH STACK

### Backend
- [x] FastAPI + Python 3.11+

### Frontend
- [x] React + Vite + TypeScript

### Database
- [x] PostgreSQL + SQLAlchemy + Alembic

### Authentication
- [x] Email/Password (JWT) + Google OAuth

### UI Framework
- [x] Chakra UI + Framer Motion

### Payments
- [ ] None (free for the community)

### AI
- [x] OpenAI via the official `openai` Python SDK (Responses API, structured output)
- [x] Model: `gpt-4.1-mini` (configurable via `OPENAI_MODEL`)
- [x] GitHub REST API (public repos, optional `GITHUB_TOKEN` for rate limits)

---

## MODULES

### Module 1: Authentication (Required)

**Description:** User authentication and authorization

**Models:**
- User: id, email, hashed_password (nullable for OAuth users), full_name, avatar_url, is_active, is_verified, is_admin, oauth_provider, created_at, updated_at
- RefreshToken: id, user_id, token, expires_at, revoked, created_at

**API Endpoints:**
- POST /api/v1/auth/register - Create new account
- POST /api/v1/auth/login - Login with email/password
- POST /api/v1/auth/refresh - Refresh access token
- POST /api/v1/auth/logout - Revoke refresh token
- GET /api/v1/auth/me - Get current user profile
- PUT /api/v1/auth/me - Update profile
- GET /api/v1/auth/google - Start Google OAuth flow
- GET /api/v1/auth/google/callback - Google OAuth callback

**Frontend Pages:**
- /login - Login page
- /register - Registration page
- /forgot-password - Forgot password page
- /profile - User profile page (protected)

---

### Module 2: Submissions

**Description:** Users submit a public GitHub repository link for review. The backend validates the URL, fetches repository metadata and source files through the GitHub API, stores the submission, and triggers the AI review as a background task.

**Models:**
```
Submission:
  - id, user_id (FK -> User)
  - github_url: str (validated https://github.com/{owner}/{repo})
  - repo_owner: str
  - repo_name: str
  - default_branch: str
  - commit_sha: str (HEAD at time of submission)
  - status: enum (pending | reviewing | done | failed)
  - error_message: str | None
  - created_at, updated_at
```

**API Endpoints:**
```
POST   /api/v1/submissions          - Submit a GitHub URL (returns 201, status=pending, enqueues review)
GET    /api/v1/submissions          - List current user's submissions (paginated, newest first)
GET    /api/v1/submissions/{id}     - Get one submission with its review (owner only)
DELETE /api/v1/submissions/{id}     - Delete a submission and its review (owner only)
POST   /api/v1/submissions/{id}/retry - Re-run a failed review
```

**Frontend Pages:**
```
/submit               - Paste GitHub URL form with live validation
/submissions          - List of my submissions with status badges and scores
/submissions/{id}     - Detail: repo info, score /10, Tanglish roast, strengths, improvements
```

---

### Module 3: Reviews

**Description:** AI-generated review of a submission. A service fetches the repo file tree and the most relevant files (README, source files, config, tests, size-capped), builds a prompt, and calls OpenAI with structured output to get a score and a Tanglish roast. One review per submission.

**Models:**
```
Review:
  - id, submission_id (FK -> Submission, unique)
  - score: int (0-10)
  - roast_text: str (Tanglish, funny but constructive)
  - strengths: list[str] (JSON)
  - improvements: list[str] (JSON)
  - summary: str (one-line verdict)
  - model_used: str (e.g. gpt-4.1-mini-2025-04-14)
  - input_tokens: int, output_tokens: int
  - created_at
```

**API Endpoints:**
```
GET    /api/v1/reviews/{submission_id} - Get review for a submission (owner or admin)
```

**Service Rules:**
- Roast tone: playful Tanglish, never abusive, no slurs, no personal attacks. Roast the code, not the person.
- Score rubric (guidance in the system prompt): code quality, README/docs, project structure, functionality/completeness, tests.
- Use structured output so score and lists are always valid JSON.
- Cap repo content sent to the model (max files and max bytes per file); skip binaries, lockfiles, node_modules, build output.
- Store token usage for cost tracking.

**Frontend Components:**
- ScoreBadge (0-10 with colour scale)
- RoastCard (Tanglish roast with share/copy button)
- StrengthsImprovementsList

---

### Module 4: Leaderboard

**Description:** Community ranking of users by their best review score, with recent activity.

**Models:**
- No new tables. Computed from Review + Submission + User via a query (best score per user, total submissions, average score).

**API Endpoints:**
```
GET    /api/v1/leaderboard              - Top users by best score (limit, offset)
GET    /api/v1/leaderboard/me           - Current user's rank and stats
```

**Frontend Pages:**
```
/leaderboard          - Ranked table with avatar, name, best score, submissions count, average
```

---

### Module 5: Dashboard

**Description:** Overview and statistics for the logged-in user

**API Endpoints:**
```
GET    /api/v1/dashboard/stats          - Total submissions, average score, best score, latest review
```

**Frontend Pages:**
- /dashboard - Stats cards, latest roast, quick "Submit another" CTA
- /settings - User settings and preferences

---

### Module 6: Admin Panel

**Description:** Admin-only management interface

**API Endpoints:**
- GET /api/v1/admin/users - List all users (paginated, search by email)
- PUT /api/v1/admin/users/{id} - Update user status (is_active, is_admin)
- GET /api/v1/admin/submissions - List all submissions with status
- DELETE /api/v1/admin/reviews/{id} - Remove an inappropriate review
- GET /api/v1/admin/stats - Platform statistics (users, submissions, token spend)

**Frontend Pages:**
- /admin - Admin dashboard (protected, admin only)
- /admin/users - User management
- /admin/submissions - Submission and review moderation

---

## MVP SCOPE

### Must Have (MVP)
- [x] User registration and login (email/password + Google OAuth)
- [x] Submit a public GitHub repo URL
- [x] AI review with score /10 and Tanglish roast (OpenAI gpt-4.1-mini)
- [x] View my submission history and review details
- [x] Background processing with status polling (pending -> reviewing -> done/failed)

### Nice to Have (Post-MVP)
- [ ] Leaderboard
- [ ] Admin panel and review moderation
- [ ] Dashboard stats
- [ ] Share roast as image/link
- [ ] Per-criterion score breakdown
- [ ] Re-roast same repo after fixes with score history
- [ ] Email notification when review is ready
- [ ] Private repo support via GitHub OAuth

---

## ACCEPTANCE CRITERIA

### Authentication
- [ ] User can register with email/password
- [ ] User can login with email/password
- [ ] User can login with Google OAuth
- [ ] JWT tokens work correctly with refresh
- [ ] Protected routes redirect to login

### Submissions
- [ ] Invalid or non-GitHub URLs are rejected with a clear 400 error
- [ ] Non-existent or private repos return a clear error, submission marked failed
- [ ] Submitting a valid repo returns 201 with status pending
- [ ] Users only see their own submissions (404 for others')
- [ ] Rate limit: max 5 submissions per user per hour

### Reviews
- [ ] A review is generated asynchronously and status moves to done
- [ ] Score is always an integer 0-10
- [ ] Roast text is in Tanglish and is non-abusive
- [ ] Strengths and improvements are non-empty lists
- [ ] API failures mark the submission failed and store error_message
- [ ] Token usage is recorded per review

### Leaderboard
- [ ] Ranked by best score, ties broken by average score
- [ ] Current user's rank is highlighted

### Quality
- [ ] All API endpoints documented in OpenAPI
- [ ] Backend test coverage 80%+ (OpenAI and GitHub calls mocked)
- [ ] Frontend TypeScript strict mode passes
- [ ] Docker builds and runs successfully

---

## SPECIAL REQUIREMENTS

### Security
- [x] Rate limiting on auth and submission endpoints
- [x] Input validation on all endpoints (GitHub URL regex + GitHub API verification)
- [x] SQL injection prevention (SQLAlchemy ORM only)
- [x] XSS prevention (roast text rendered as text, never as HTML)
- [x] CSRF protection on OAuth (state parameter verified)
- [x] Never expose OPENAI_API_KEY or GITHUB_TOKEN to the frontend
- [x] Prompt injection guard: repo content is wrapped as untrusted data in the prompt; instructions in README cannot change the rubric

### Integrations
- [x] OpenAI API (review generation)
- [x] GitHub REST API (repo tree and file contents)
- [ ] Email service for notifications (post-MVP)
- [ ] Payments (none)
- [ ] File upload service (none)

### Background Jobs
- [x] FastAPI BackgroundTasks for MVP; upgrade to Celery/RQ + Redis if volume grows
- [x] Frontend polls GET /submissions/{id} every 3s while status is pending/reviewing

---

## AGENTS

> These agents will build your product in parallel:

| Agent | Role | Works On |
|-------|------|----------|
| DATABASE-AGENT | Creates all models and migrations | User, RefreshToken, Submission, Review |
| BACKEND-AGENT | Builds API endpoints and services | Auth, submissions, review service, GitHub + OpenAI clients, leaderboard, admin |
| FRONTEND-AGENT | Creates UI pages and components | Auth pages, submit, submissions, review detail, leaderboard, dashboard, admin |
| DEVOPS-AGENT | Sets up Docker, CI/CD, environments | Infrastructure |
| TEST-AGENT | Writes unit and integration tests | All code (mocked external APIs) |
| REVIEW-AGENT | Security and code quality audit | All code |

---

# READY?

```bash
/generate-prp INITIAL.md
```

Then:

```bash
/execute-prp PRPs/assignment-roaster-prp.md
```
