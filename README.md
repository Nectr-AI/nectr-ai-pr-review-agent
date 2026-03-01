# Nectr — AI PR Review Agent

An AI-powered developer productivity platform that automatically reviews pull requests using Claude AI. When a PR is opened on a connected GitHub repo, Nectr fetches the diff, analyses it with Claude Sonnet 4.5, and posts a structured review comment directly on the PR.

## What It Does

Nectr listens for GitHub webhook events. When a pull request is opened or updated, it:

1. Receives the webhook event, verifies the per-repo HMAC-SHA256 signature, and stores it in the database
2. Returns HTTP 200 immediately (so GitHub never times out)
3. In the background: fetches the PR diff and changed files from GitHub's API
4. Queries Mem0 for relevant project context and past developer patterns
5. Sends the diff + context to Claude Sonnet 4.5 for analysis
6. Posts a structured review comment on the PR as "Nectr"
7. Extracts memories from the review and stores them in Mem0 for future reviews

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend Framework | FastAPI |
| ASGI Server | Uvicorn |
| Database ORM | SQLAlchemy (async) |
| Database | PostgreSQL via Supabase (PgBouncer pooler) |
| AI Model | Anthropic Claude Sonnet 4.5 |
| Memory Layer | Mem0 |
| Token Encryption | cryptography (Fernet/AES) |
| HTTP Client | httpx |
| Data Validation | Pydantic |
| Deployment | Railway |
| Python | 3.14 |

## Project Structure

```
app/
├── main.py                         # FastAPI app entry point
├── core/
│   ├── config.py                   # Settings from .env via Pydantic
│   └── database.py                 # Async SQLAlchemy engine + session
├── models/
│   ├── event.py                    # Webhook events table
│   ├── installation.py             # GitHub repo installations table
│   ├── user.py                     # Users table (OAuth)
│   └── workflow.py                 # Workflow runs table
├── api/v1/
│   ├── webhooks.py                 # GitHub webhook handler
│   ├── repos.py                    # Repo connect/disconnect
│   ├── memory.py                   # Memory CRUD API
│   └── ...
├── services/
│   ├── pr_review_service.py        # PR review orchestrator
│   ├── ai_service.py               # Claude integration
│   ├── context_service.py          # Mem0 context retrieval
│   ├── memory_adapter.py           # Mem0 async wrapper
│   ├── memory_extractor.py         # Post-review memory extraction
│   └── project_scanner.py          # Scans repo on connect
└── integrations/github/
    ├── client.py                   # GitHub REST API client
    └── webhook_manager.py          # Installs/removes webhooks
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/v1/webhooks/github` | GitHub webhook receiver |
| GET/POST | `/api/v1/repos` | Connect/list repos |
| GET | `/api/v1/memory` | List memories for a repo |
| POST | `/api/v1/memory` | Add a custom memory/rule |
| DELETE | `/api/v1/memory/{id}` | Delete a memory |
| GET | `/api/v1/memory/project-map` | Project map summary |
| POST | `/api/v1/memory/rescan` | Re-scan repo and rebuild project map |

## Data Flow

```
GitHub (PR opened/updated, issue opened/closed)
  ↓
Webhook POST /api/v1/webhooks/github
  ↓
Verify per-repo signature, store Event, return 200 immediately
  ↓
FastAPI BackgroundTask: process_pr_in_background(payload, event_id)
  ↓
Fetch diff from GitHub API → Build ReviewContext (Mem0) → Claude analysis
  ↓
Post comment on PR → Extract memories (Mem0) → Update Event status
```

## Setup

### Prerequisites
- Python 3.12+
- PostgreSQL (or Supabase project)
- GitHub OAuth App + Personal Access Token
- Anthropic API key
- Mem0 API key (optional — memory layer degrades gracefully without it)

### Environment Variables

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_PAT=ghp_...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
DATABASE_URL=postgresql+asyncpg://...
SECRET_KEY=...
BACKEND_URL=https://your-railway-url.up.railway.app

# Optional
MEM0_API_KEY=m0-...
GITHUB_WEBHOOK_SECRET=dev-secret-change-in-production
APP_ENV=production
LOG_LEVEL=INFO
```

### Running Locally

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Deployment

Deployed on Railway. Set all env vars in the Railway Variables tab. Railway auto-deploys on every push to `main`.

## Memory Layer (Mem0)

When a repo is connected, Nectr scans the codebase (README, package.json, Dockerfile, etc.) and stores structured project memories in Mem0:

- `tech_stack` — languages, frameworks, databases
- `architecture` — how the system is structured
- `conventions` — coding style, patterns used
- `risk_areas` — parts of the codebase that need extra attention

Before each PR review, relevant memories are retrieved and injected into the Claude prompt. After each review, new patterns and developer insights are extracted and stored for future reviews.

## Current Status

Active development. Core PR review pipeline is live on Railway.
