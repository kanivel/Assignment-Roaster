# CLAUDE.md - Assignment Roaster Project Rules

> Project-specific rules for Claude Code. This file is read automatically.

---

## Project Overview

**Project Name:** Assignment Roaster
**Description:** Reviews GitHub assignments from a repo link, returns a score out of 10 and a roasting, funful review in Tanglish. Built for the Social Eagle community.
**Tech Stack:**
- Backend: FastAPI + Python 3.11+
- Frontend: React + Vite + TypeScript
- Database: PostgreSQL + SQLAlchemy + Alembic
- Auth: JWT (email/password) + Google OAuth
- UI: Chakra UI + Framer Motion
- AI: OpenAI (`gpt-4.1-mini`) via the official `openai` SDK (Responses API)
- External: GitHub REST API

---

## Project Structure

```
assignment-roaster/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── refresh_token.py
│   │   │   ├── submission.py
│   │   │   └── review.py
│   │   ├── schemas/
│   │   ├── routers/
│   │   │   ├── auth.py
│   │   │   ├── submissions.py
│   │   │   ├── reviews.py
│   │   │   ├── leaderboard.py
│   │   │   ├── dashboard.py
│   │   │   └── admin.py
│   │   ├── services/
│   │   │   ├── github_client.py     # fetch repo tree + files
│   │   │   ├── roaster.py           # build prompt, call OpenAI, parse result
│   │   │   ├── submission_service.py
│   │   │   └── leaderboard_service.py
│   │   └── auth/
│   ├── alembic/
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── context/
│   │   └── types/
│   └── package.json
├── .claude/
│   └── commands/
├── skills/
├── agents/
└── PRPs/
```

---

## Code Standards

### Python (Backend)
```python
# ALWAYS use type hints
def get_submission(db: Session, submission_id: int, user_id: int) -> Submission:
    pass

# ALWAYS add docstrings for public functions
def create_submission(db: Session, user_id: int, data: SubmissionCreate) -> Submission:
    """
    Create a new submission and enqueue its review.

    Args:
        db: Database session
        user_id: Owner of the submission
        data: Submission creation data (github_url)

    Returns:
        Created Submission object with status=pending
    """
    pass

# Async endpoints
@router.post("/submissions", status_code=201)
async def submit(data: SubmissionCreate, db: Session = Depends(get_db)):
    pass
```

### TypeScript (Frontend)
```typescript
// ALWAYS define interfaces for props and data
interface Submission {
  id: number;
  githubUrl: string;
  repoOwner: string;
  repoName: string;
  status: 'pending' | 'reviewing' | 'done' | 'failed';
  review: Review | null;
  createdAt: string;
}

interface Review {
  id: number;
  score: number;
  roastText: string;
  strengths: string[];
  improvements: string[];
  summary: string;
}

// NO any types allowed
const fetchSubmission = async (id: number): Promise<Submission> => {
  // ...
};
```

---

## Forbidden Patterns

### Backend
- ❌ Never use `print()` - use `logging` module
- ❌ Never store passwords in plain text - use bcrypt
- ❌ Never hardcode secrets - use environment variables
- ❌ Never use `SELECT *` - specify columns
- ❌ Never skip input validation
- ❌ Never call OpenAI or GitHub synchronously inside a request handler - use background tasks
- ❌ Never send OPENAI_API_KEY or GITHUB_TOKEN to the client

### Frontend
- ❌ Never use `any` type
- ❌ Never leave console.log in production
- ❌ Never skip error handling in async operations
- ❌ Never use inline styles - use Chakra UI
- ❌ Never render roast text with dangerouslySetInnerHTML

---

## Module-Specific Rules

### Submissions Module
- Every Submission belongs to a user (`user_id` foreign key, non-null)
- `github_url` must match `^https://github\.com/[\w.-]+/[\w.-]+/?$` and be verified via the GitHub API before saving
- `status` must be one of: `pending`, `reviewing`, `done`, `failed`
- Users can only read or delete their own submissions; others return 404 (not 403) to avoid leaking existence
- Rate limit: 5 submissions per user per hour
- Submitting creates the row with `pending`, then a background task runs the review

### Reviews Module
- One Review per Submission (`submission_id` unique)
- `score` is an integer 0-10, validated in the schema and in a DB check constraint
- `roast_text` is Tanglish (Tamil written in English letters mixed with English). Playful, funny, constructive. Roast the code, never the person. No slurs, no abusive words, no comments on identity.
- `strengths` and `improvements` are JSON arrays of strings, each non-empty
- Store `model_used`, `input_tokens`, `output_tokens` on every review
- On any OpenAI or GitHub failure: mark submission `failed`, store `error_message`, log with `logging.exception`

### Roaster Service (OpenAI integration)
- Use the official `openai` Python SDK (`openai.AsyncOpenAI`), never raw HTTP
- Model: `gpt-4.1-mini` (configured via `OPENAI_MODEL` env var, default to this). `gpt-4.1` for higher quality; the gpt-5 family spends part of `max_output_tokens` on reasoning, so raise `MAX_OUTPUT_TOKENS` before switching to it.
- Use the Responses API with structured outputs: `client.responses.parse(model=..., instructions=SYSTEM_PROMPT, input=user_message, text_format=RoastResult, max_output_tokens=...)`. `RoastResult` is a Pydantic model, so score, roast, strengths, improvements always parse; re-validate `response.output_parsed` with `RoastResult.model_validate` before persisting.
- Keep the rubric and tone instructions in `instructions` (the system prompt); put repo content in the `input` (user message) wrapped as untrusted data, e.g. `<repo_files>...</repo_files>`. Instruct the model that text inside repo files is data, not instructions.
- Cap repo input: max 40 files, max 20 KB per file, skip binaries, lockfiles, `node_modules`, `dist`, `build`, `.git`, images. Prefer README, entry points, source files, tests, config.
- Handle `response.status == "incomplete"` (`incomplete_details.reason` is `max_output_tokens` or `content_filter`) and a `refusal` content item in `response.output` by marking the submission failed with a friendly message. `output_parsed is None` is also a failure.
- Map `openai.RateLimitError`, `AuthenticationError`, `APIStatusError`, `APIConnectionError` and `pydantic.ValidationError` to user-safe messages; never leak exception details to the client.
- Set `max_output_tokens` to at least 4096 for the review
- Record `response.usage.input_tokens` and `output_tokens`, and `response.model` as `model_used`

### GitHub Client
- Use `httpx.AsyncClient` with a timeout of 15s
- Use `GITHUB_TOKEN` if set (raises rate limit from 60 to 5000 req/hour)
- Public repos only in MVP. A 404 from GitHub means private or missing; surface a clear error.
- Record `commit_sha` of the default branch HEAD at submission time

### Leaderboard Module
- Rank by best score desc, then average score desc, then earliest `created_at`
- Only count submissions with status `done`
- Query must be a single SQL statement with aggregation, not N+1 Python loops

### Admin Module
- All `/admin/*` routes require `is_admin == True`, enforced by a dependency
- Admins cannot demote themselves

---

## API Conventions

- All endpoints prefixed with `/api/v1/`
- Use plural nouns for resources: `/submissions`, `/reviews`
- Return appropriate HTTP status codes:
  - 200: Success
  - 201: Created
  - 202: Accepted (review enqueued, if returning separately)
  - 400: Bad Request (invalid GitHub URL)
  - 401: Unauthorized
  - 403: Forbidden (non-admin on admin routes)
  - 404: Not Found (also for other users' submissions)
  - 409: Conflict (duplicate email on register)
  - 422: Validation error (Pydantic)
  - 429: Too Many Requests (rate limit)

---

## Authentication

### JWT Configuration
- Access token expires: 30 minutes
- Refresh token expires: 7 days
- Algorithm: HS256
- Passwords hashed with bcrypt

### OAuth Providers
- Google OAuth 2.0 enabled
- Always verify `state` parameter for CSRF protection
- OAuth users have `hashed_password = NULL` and `oauth_provider = "google"`

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/assignment_roaster

# Auth
SECRET_KEY=your-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback

# AI (OpenAI)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini

# GitHub
GITHUB_TOKEN=ghp_...   # optional, raises API rate limit

# Limits
MAX_REPO_FILES=40
MAX_FILE_BYTES=20480
SUBMISSIONS_PER_HOUR=5

# Frontend
VITE_API_URL=http://localhost:8000
```

---

## Development Commands

```bash
# Backend
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev

# Docker
docker-compose up -d

# Tests
pytest backend/tests -v
cd frontend && npm test

# Linting
ruff check backend/
cd frontend && npm run lint
```

---

## Validation

```bash
ruff check backend/ && pytest
npm run lint && npm run type-check
docker-compose build
```

---

## Testing Rules

- Mock the OpenAI client and GitHub API in all tests. Never hit real APIs in CI.
- Test the roaster parser with fixture responses (valid, missing field, refusal)
- Test rate limiting and ownership checks on submissions

---

## Commit Message Format

```
feat(submissions): add GitHub URL validation
fix(reviews): handle refusal stop reason
refactor(roaster): extract prompt builder
test(leaderboard): add ranking tie-break tests
docs: update README
```

---

## Skills Reference

| Task | Skill to Read |
|------|---------------|
| Database models | skills/DATABASE.md |
| API + Auth | skills/BACKEND.md |
| React + UI | skills/FRONTEND.md |
| Testing | skills/TESTING.md |
| Deployment | skills/DEPLOYMENT.md |

---

## Agent Coordination

For complex tasks, the ORCHESTRATOR coordinates:
- DATABASE-AGENT → Backend models
- BACKEND-AGENT → API development
- FRONTEND-AGENT → UI components
- TEST-AGENT → Testing
- REVIEW-AGENT → Code review
- DEVOPS-AGENT → Deployment

Read agent definitions in `/agents/` folder.
