# Nectr — AI PR Review Agent

Nectr is an AI-powered developer productivity platform that automatically reviews GitHub pull requests using Claude AI. Connect a repo, and every PR gets a structured AI review posted as a comment — with inline suggestions, a verdict, and accumulated project knowledge that improves over time.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NECTR ARCHITECTURE                                │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────┐     OAuth      ┌─────────────────────────────────────────────┐
  │Developer │ ─────────────► │            FRONTEND (Vercel)                │
  │  Browser │ ◄───────────── │         Next.js 15 + React 19               │
  └──────────┘   JWT Cookie   │  /dashboard  /repos  /reviews  /analytics   │
                              └────────────────────┬────────────────────────┘
                                                   │ REST API (axios)
                                                   ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                          BACKEND (Railway)                                  │
│                        FastAPI + Uvicorn                                    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         API ROUTES                                  │   │
│  │  /auth/github          GitHub OAuth flow                            │   │
│  │  /api/v1/webhooks      GitHub webhook receiver                      │   │
│  │  /api/v1/repos         Connect / disconnect / rescan repos           │   │
│  │  /api/v1/reviews       PR review history                            │   │
│  │  /api/v1/analytics     Team metrics & dashboards                    │   │
│  │  /api/v1/memory        Mem0 CRUD + project map                      │   │
│  │  /health               Status check (DB + Neo4j)                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────┐  ┌───────────────────┐  ┌──────────────────────┐    │
│  │  pr_review_      │  │  context_service  │  │    ai_service        │    │
│  │  service.py      │  │  (builds context  │  │  (Claude Sonnet 4.5) │    │
│  │  (orchestrator)  │  │  from Neo4j+Mem0) │  │  analyze_pr()        │    │
│  └────────┬─────────┘  └─────────┬─────────┘  └──────────┬───────────┘   │
│           │                      │                         │               │
│  ┌────────▼─────────┐  ┌─────────▼─────────┐  ┌──────────▼───────────┐   │
│  │  graph_builder   │  │  memory_adapter   │  │  memory_extractor    │   │
│  │  (Neo4j writes   │  │  (Mem0 async      │  │  (post-review        │   │
│  │  + queries)      │  │  wrapper)         │  │  memory extraction)  │   │
│  └──────────────────┘  └───────────────────┘  └──────────────────────┘   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │              integrations/github/                                    │  │
│  │   client.py (fetch diff, files, post review)                         │  │
│  │   webhook_manager.py (install/uninstall per-repo webhooks)           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
         │           │             │              │
         ▼           ▼             ▼              ▼
   ┌──────────┐ ┌─────────┐ ┌──────────┐  ┌──────────┐
   │PostgreSQL│ │  Neo4j  │ │  Mem0    │  │ Anthropic│
   │(Supabase)│ │  Graph  │ │ Memory   │  │  Claude  │
   │          │ │   DB    │ │  Layer   │  │  API     │
   └──────────┘ └─────────┘ └──────────┘  └──────────┘
         ▲
   ┌─────┴──────┐
   │  GitHub    │
   │  Webhooks  │
   │  REST API  │
   └────────────┘
```

---

## PR Review Flow

```
  Developer opens / updates a Pull Request on GitHub
           │
           ▼
  GitHub → POST /api/v1/webhooks/github
           │
           ├─ Verify HMAC-SHA256 signature (per-repo secret)
           ├─ Deduplicate (ignore duplicate events within 1hr)
           ├─ Create Event row (status = pending)
           └─ Return HTTP 200 immediately ─────────────────────────────────┐
                                                                            │
  FastAPI BackgroundTask: process_pr_in_background()                       │
           │                                                                │
           ├─ 1. Fetch PR data from GitHub                                  │
           │      get_pr_diff()  get_pr_files()  get_file_content()         │
           │                                                                │
           ├─ 2. Build ReviewContext (parallel)                             │
           │      ├─ Mem0: project patterns, decisions, rules               │
           │      ├─ Mem0: developer-specific patterns & strengths          │
           │      ├─ Neo4j: file experts (who touched these files most)     │
           │      └─ Neo4j: related past PRs with file overlap              │
           │                                                                │
           ├─ 3. AI Analysis → Claude Sonnet 4.5                           │
           │      Input:  diff + file contents + context + linked issues    │
           │      Output: summary, verdict, issues list, inline suggestions │
           │                                                                │
           ├─ 4. Post Review on GitHub PR                                   │
           │      post_pr_review() with inline comments                     │
           │      (falls back to post_pr_comment() if review API fails)     │
           │                                                                │
           ├─ 5. Index PR in Neo4j Graph                                    │
           │      Creates: PullRequest + Developer nodes                    │
           │      Edges:   TOUCHES → Files                                  │
           │               AUTHORED_BY → Developer                          │
           │               CLOSES → Issues                                  │
           │                                                                │
           ├─ 6. Extract & Store Memories in Mem0                           │
           │      Claude extracts: project_pattern, decision,               │
           │      developer_pattern, developer_strength, risk_module,       │
           │      contributor_profile                                        │
           │                                                                │
           └─ 7. Update Event status → completed / failed ◄────────────────┘
```

---

## Neo4j Knowledge Graph

The graph builds a structural model of the codebase and PR history.

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                      NEO4J GRAPH SCHEMA                          │
  │                                                                  │
  │   (Repository)──[:CONTAINS]──►(File)                            │
  │        │                        ▲                               │
  │        │                        │ [:TOUCHES]                    │
  │        │                   (PullRequest)──[:AUTHORED_BY]──►(Developer)
  │        │                        │           │                   │
  │        │                        │           └──[:CONTRIBUTED_TO]┘
  │        │                   [:CLOSES]                            │
  │        │                        │                               │
  │        │                        ▼                               │
  │        └──────────────────►(Issue)                              │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘

  Built on repo connect:  Repository + File nodes (full recursive tree)
  Built on PR review:     PullRequest + Developer nodes + all edges

  Queried for:
    • File experts   — developers who most frequently touch these files
    • Related PRs    — past PRs with overlapping file changes
    • Linked issues  — issues closed by this PR
```

---

## Mem0 Memory Layer

Persistent semantic memory that improves every PR review.

```
  ON REPO CONNECT                    ON EVERY PR REVIEW
  ───────────────                    ──────────────────
  project_scanner.py                 memory_extractor.py
  scans key files:                   asks Claude to extract:
  README, package.json,              • project_pattern
  Dockerfile, tsconfig,              • decision (approved/rejected)
  requirements.txt, etc.             • developer_pattern
          │                          • developer_strength
          ▼                          • risk_module
  Stored as project map              • contributor_profile
  in Mem0 (project_id=repo)                  │
                                             ▼
                                    Stored in Mem0 per developer
                                    (user_id=github_login)

  BEFORE EACH REVIEW (context_service.py)
  ───────────────────────────────────────
  Queries Mem0 in parallel:
    • Project-wide memories  (patterns, decisions, rules, risk areas)
    • Developer memories     (this author's patterns, strengths)

  → Injected into Claude prompt for richer, more accurate review
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15, React 19, TypeScript, TailwindCSS 4 |
| **Backend** | FastAPI, Uvicorn, Python 3.14 |
| **Database** | PostgreSQL via Supabase (asyncpg + SQLAlchemy) |
| **Knowledge Graph** | Neo4j (async driver) |
| **Semantic Memory** | Mem0 |
| **AI Model** | Anthropic Claude Sonnet 4.5 |
| **GitHub Integration** | GitHub OAuth + REST API + Webhooks |
| **Frontend Hosting** | Vercel |
| **Backend Hosting** | Railway |
| **Token Encryption** | Fernet (AES-128-CBC) |
| **Auth** | GitHub OAuth → JWT (httpOnly cookie) |

---

## Project Structure

```
Devkit/
├── app/                              # FastAPI backend
│   ├── main.py                       # App entry, lifespan, CORS, middleware
│   ├── core/
│   │   ├── config.py                 # Pydantic settings from .env
│   │   ├── database.py               # Async SQLAlchemy engine + session
│   │   ├── neo4j_client.py           # Neo4j async driver singleton
│   │   └── neo4j_schema.py           # Constraints + indexes
│   ├── models/
│   │   ├── user.py                   # GitHub users
│   │   ├── installation.py           # Connected repos + webhook secrets
│   │   ├── event.py                  # Incoming webhook events
│   │   ├── workflow.py               # PR review workflow runs
│   │   └── oauth_state.py            # CSRF state tokens
│   ├── api/v1/
│   │   ├── webhooks.py               # GitHub webhook receiver
│   │   ├── repos.py                  # Connect / disconnect / rescan
│   │   ├── reviews.py                # PR review history
│   │   ├── events.py                 # Event queries
│   │   ├── analytics.py              # Team metrics
│   │   └── memory.py                 # Mem0 CRUD + project map
│   ├── auth/
│   │   ├── router.py                 # GitHub OAuth flow
│   │   ├── dependencies.py           # get_current_user() dependency
│   │   ├── jwt_utils.py              # JWT sign + verify
│   │   └── token_encryption.py       # Fernet encrypt/decrypt GitHub tokens
│   ├── services/
│   │   ├── pr_review_service.py      # PR review orchestrator
│   │   ├── ai_service.py             # Claude integration
│   │   ├── context_service.py        # Mem0 + Neo4j context builder
│   │   ├── graph_builder.py          # Neo4j read + write operations
│   │   ├── memory_adapter.py         # Mem0 async wrapper
│   │   ├── memory_extractor.py       # Post-review memory extraction
│   │   └── project_scanner.py        # Initial repo scan on connect
│   └── integrations/github/
│       ├── client.py                 # GitHub REST API (diff, files, reviews)
│       └── webhook_manager.py        # Install / remove webhooks
│
└── nectr-web/                        # Next.js frontend
    └── src/
        ├── app/
        │   ├── page.tsx              # Landing page
        │   └── (dashboard)/
        │       ├── dashboard/        # Main dashboard
        │       ├── repos/            # Connect repos + rescan
        │       ├── reviews/          # PR review history
        │       ├── analytics/        # Team analytics
        │       ├── settings/         # Account settings
        │       └── team/             # Team management
        ├── components/
        │   ├── Sidebar.tsx
        │   ├── Navbar.tsx
        │   └── AuthContext.tsx
        ├── hooks/
        │   └── useRepos.ts           # useRepos, useInstallRepo, useRescanRepo
        └── lib/
            └── api.ts                # Axios instance with base URL + cookies
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (DB + Neo4j status) |
| `GET` | `/auth/github` | Start GitHub OAuth |
| `GET` | `/auth/github/callback` | OAuth callback → set JWT cookie |
| `GET` | `/auth/me` | Current user profile |
| `POST` | `/auth/logout` | Clear auth cookie |
| `POST` | `/api/v1/webhooks/github` | GitHub webhook receiver |
| `GET` | `/api/v1/repos` | List all repos with connection status |
| `POST` | `/api/v1/repos/{owner}/{repo}/install` | Connect repo + install webhook |
| `POST` | `/api/v1/repos/{owner}/{repo}/rescan` | Rebuild Neo4j graph for repo |
| `DELETE` | `/api/v1/repos/{owner}/{repo}/install` | Disconnect repo |
| `GET` | `/api/v1/reviews` | PR review history |
| `GET` | `/api/v1/analytics` | Team metrics |
| `GET` | `/api/v1/memory` | List memories for a repo |
| `POST` | `/api/v1/memory` | Add a custom rule or memory |
| `DELETE` | `/api/v1/memory/{id}` | Delete a memory |
| `GET` | `/api/v1/memory/project-map` | Project context summary |
| `POST` | `/api/v1/memory/rescan` | Re-scan repo + rebuild project map |

---

## Environment Variables

```env
# AI
ANTHROPIC_API_KEY=sk-ant-...

# GitHub
GITHUB_PAT=ghp_...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Database
DATABASE_URL=postgresql+asyncpg://...

# Auth
SECRET_KEY=...                        # JWT + Fernet encryption key

# Neo4j
NEO4J_URI=neo4j+s://xxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=...

# Mem0 (optional — degrades gracefully if not set)
MEM0_API_KEY=m0-...

# App
BACKEND_URL=https://your-app.up.railway.app
FRONTEND_URL=https://your-app.vercel.app
APP_ENV=production
LOG_LEVEL=INFO
```

---

## Running Locally

```bash
# Backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd nectr-web
npm install
npm run dev
```

---

## Deployment

- **Backend** → Railway (`main` branch auto-deploys)
- **Frontend** → Vercel (`nectr-web/` root directory)
