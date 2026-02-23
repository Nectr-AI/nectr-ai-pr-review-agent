# DevCopilot

An AI-powered developer productivity platform that automatically reviews pull requests using Claude AI. When a PR is opened on GitHub, DevCopilot fetches the code diff, analyzes it with Claude, and posts a detailed review comment directly on the PR.

## What It Does

DevCopilot listens for GitHub webhook events. When a pull request is opened or updated, it:

1. Receives the webhook event and stores it in the database
2. Fetches the actual code diff and changed files from GitHub's API
3. Sends the diff to Claude AI (Sonnet 4.5) for analysis
4. Posts a structured review comment on the PR with:
   - Summary of what the PR does
   - Key changes identified
   - Potential issues (bugs, security concerns, code smells)
   - Improvement suggestions
   - Review verdict (APPROVE / REQUEST_CHANGES / NEEDS_DISCUSSION)
5. Logs the entire workflow execution in the database for tracking

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Backend Framework | FastAPI | 0.129.0 |
| ASGI Server | Uvicorn | 0.41.0 |
| Database ORM | SQLAlchemy (async) | 2.0.46 |
| Database | SQLite (via aiosqlite) | 0.22.1 |
| AI Model | Anthropic Claude Sonnet 4.5 | 0.83.0 |
| HTTP Client | httpx | 0.28.1 |
| Data Validation | Pydantic | 2.12.5 |
| Config Management | pydantic-settings | 2.13.0 |
| Environment | python-dotenv | 1.2.1 |
| Python | 3.14 | - |

## Project Structure

```
Devkit/
├── app/
│   ├── main.py                          # FastAPI app entry point, lifespan events
│   ├── core/
│   │   ├── config.py                    # Settings loaded from .env via Pydantic
│   │   └── database.py                  # Async SQLAlchemy engine + session management
│   ├── models/
│   │   ├── event.py                     # Event table — stores incoming webhook events
│   │   └── workflow.py                  # WorkflowRun table — tracks workflow executions
│   ├── schemas/
│   │   └── webhook.py                   # Pydantic schemas for request/response validation
│   ├── api/
│   │   └── v1/
│   │       └── webhooks.py              # GitHub webhook endpoint
│   ├── services/
│   │   ├── ai_service.py               # Claude AI integration for code analysis
│   │   └── pr_review_service.py        # PR review workflow orchestrator
│   └── integrations/
│       └── github/
│           └── client.py               # GitHub REST API client
├── .env                                 # Environment variables (not committed)
├── .gitignore                           # Git ignore rules
├── requirements.txt                     # Python dependencies
└── devcopilot.db                        # SQLite database (auto-created)
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check — returns service name, status, environment |
| POST | `/api/v1/webhooks/github` | Receives GitHub webhook events, triggers PR review pipeline |

Interactive API docs available at `http://localhost:8000/docs` when the server is running.

## Database Schema

### `events` table
Stores every incoming webhook event.

| Column | Type | Description |
|--------|------|-------------|
| id | Integer (PK) | Auto-incremented ID |
| event_type | String | e.g., `opened_pull_request`, `push` |
| source | String | e.g., `github` |
| payload | Text | Raw JSON webhook payload + AI analysis result |
| status | String | `pending`, `completed`, `failed` |
| created_at | DateTime | Auto-set on creation |
| processed_at | DateTime | Set when processing completes |

### `workflow_runs` table
Tracks each workflow execution linked to an event.

| Column | Type | Description |
|--------|------|-------------|
| id | Integer (PK) | Auto-incremented ID |
| event_id | Integer (FK) | References `events.id` |
| workflow_type | String | e.g., `pr_review` |
| status | String | `running`, `completed`, `failed` |
| result | Text | JSON with AI summary, files analyzed count |
| error | Text | Error message if workflow failed |
| started_at | DateTime | Auto-set on creation |
| completed_at | DateTime | Set when workflow finishes |

## Architecture

```
GitHub (PR opened/updated)
    │
    ▼
Webhook Endpoint (/api/v1/webhooks/github)
    │
    ▼
Event stored in database (status: pending)
    │
    ▼
PR Review Service (orchestrator)
    ├── Fetches PR diff from GitHub API
    ├── Fetches changed files list from GitHub API
    ├── Sends diff + metadata to Claude AI for analysis
    ├── Posts AI review comment on the PR
    └── Logs workflow result in database
    │
    ▼
Event updated (status: completed)
```

## Setup

### Prerequisites
- Python 3.12+
- GitHub account with a Personal Access Token or `gh` CLI authenticated
- Anthropic API key

### Installation

```bash
# Clone the repository
git clone https://github.com/dhanushchalicheemala/devkit.git
cd devkit

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Configuration

Create a `.env` file in the project root:

```env
# Required
ANTHROPIC_API_KEY=your-anthropic-api-key

# GitHub (either set GITHUB_PAT or login via gh CLI)
GITHUB_PAT=your-github-pat

# Optional
APP_ENV=development
LOG_LEVEL=DEBUG
DATABASE_URL=sqlite+aiosqlite:///./devcopilot.db
GITHUB_WEBHOOK_SECRET=your-webhook-secret
SECRET_KEY=your-jwt-secret
```

### Running

```bash
uvicorn app.main:app --reload --port 8000
```

The server starts at `http://localhost:8000`. Database tables are created automatically on startup.

### Testing the PR Review Pipeline

Send a simulated GitHub webhook to trigger a review on any open PR:

```bash
curl -X POST http://localhost:8000/api/v1/webhooks/github \
  -H "Content-Type: application/json" \
  -d '{
    "action": "opened",
    "repository": {"full_name": "your-username/your-repo"},
    "pull_request": {
      "title": "Your PR title",
      "number": 1,
      "user": {"login": "your-username"},
      "body": "PR description"
    }
  }'
```

If successful, an AI-generated review comment will appear on the PR.

## How It Works

### GitHub Client (`app/integrations/github/client.py`)
- Authenticates using `gh` CLI OAuth token (priority) or `GITHUB_PAT` from `.env`
- Fetches PR metadata, raw diffs, and changed file lists
- Posts review comments on PRs via the GitHub Issues API

### AI Service (`app/services/ai_service.py`)
- Connects to Anthropic's Claude Sonnet 4.5 API
- Builds structured prompts with PR metadata, file summaries, and code diffs
- Truncates large diffs to stay within token limits (15,000 chars)
- Returns structured reviews with summary, issues, suggestions, and verdict

### PR Review Service (`app/services/pr_review_service.py`)
- Orchestrates the full pipeline: fetch diff, analyze, post comment, log result
- Creates `WorkflowRun` records to track execution status
- Handles errors gracefully — logs failures without crashing the webhook

### Config System (`app/core/config.py`)
- Uses Pydantic Settings to load and validate environment variables from `.env`
- `load_dotenv(override=True)` ensures `.env` values override empty system env vars
- Single `settings` instance imported across the application

## Example AI Review Output

When DevCopilot reviews a PR, it posts a comment like:

```
## DevCopilot AI Review

### Summary
This PR adds JWT authentication middleware to protect API routes...

### Key Changes
- New auth service with token generation and validation
- Middleware for route protection
- Refresh token support

### Potential Issues
- Missing rate limiting on auth endpoints
- Token expiry not configurable

### Suggestions
- Add rate limiting middleware
- Make token expiry configurable via environment variable

### Review Verdict
REQUEST_CHANGES
```

## Current Status

This project is in active development. The PR review pipeline is fully functional and has been tested on real GitHub pull requests.
