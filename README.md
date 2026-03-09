# Nectr — AI PR Review Agent

Nectr is an open-source AI agent that automatically reviews every pull request in plain English. Connect a repo, and when a PR is opened Nectr posts a structured review as a GitHub comment — covering bugs, security issues, performance, and style — with a clear verdict and inline suggestions.

It gets smarter over time: a Neo4j knowledge graph tracks file ownership and related PRs, while Mem0 remembers per-project patterns and per-developer habits. Optionally pull in live context from **Linear** (linked issues), **Sentry** (production errors), or **Slack** (team messages) so every review is grounded in what's actually happening.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             NECTR ARCHITECTURE                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

  ┌──────────┐     OAuth      ┌───────────────────────────────────────────────────┐
  │Developer │ ─────────────► │             FRONTEND (Vercel)                     │
  │  Browser │ ◄───────────── │          Next.js 15 + React 19                    │
  └──────────┘   JWT Cookie   │  /dashboard  /repos  /reviews  /analytics  /team  │
                              └──────────────────────┬────────────────────────────┘
                                                     │ REST API (axios, withCredentials)
                                                     ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│                             BACKEND (Railway)                                      │
│                           FastAPI + Uvicorn                                        │
│                                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                             API ROUTES                                       │  │
│  │  /auth/github            GitHub OAuth flow                                   │  │
│  │  /api/v1/webhooks        GitHub webhook receiver (per-repo)                  │  │
│  │  /api/v1/repos           Connect / disconnect / rescan repos (no redirect)   │  │
│  │  /api/v1/reviews         PR review history                                   │  │
│  │  /api/v1/analytics       Team metrics & dashboards                           │  │
│  │  /api/v1/memory          Mem0 CRUD + project map                             │  │
│  │  /health                 Status check (DB + Neo4j)                           │  │
│  │  /mcp/sse                MCP SSE stream  (GET — server → client events)      │  │
│  │  /mcp/messages           MCP JSON-RPC    (POST — client → server)            │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                    │
│  ┌─────────────────────┐  ┌──────────────────────┐  ┌──────────────────────────┐  │
│  │  pr_review_         │  │  context_service     │  │      ai_service          │  │
│  │  service.py         │  │  (builds context     │  │  (Claude Sonnet 4.6)     │  │
│  │  (orchestrator)     │  │  from Neo4j + Mem0   │  │  agentic loop OR         │  │
│  │                     │  │  + MCP integrations) │  │  3 parallel agents)      │  │
│  └──────────┬──────────┘  └──────────────────────┘  └──────────────────────────┘  │
│             │                                                                      │
│  ┌──────────▼──────────────────────────────────────────────────────────────────┐  │
│  │                    integrations/github/                                      │  │
│  │   client.py         — fetch diff, files, post review comment (PAT)          │  │
│  │   webhook_manager.py — install / uninstall per-repo webhooks                │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                       app/mcp/                                               │  │
│  │   server.py  — FastMCP: exposes get_recent_reviews, get_contributor_stats,  │  │
│  │                get_pr_verdict, get_repo_health as MCP tools                  │  │
│  │   client.py  — MCPClientManager: pulls issues from Linear, errors from      │  │
│  │                Sentry, messages from Slack as AI review context              │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────┘
         │           │             │              │               │
         ▼           ▼             ▼              ▼               ▼
   ┌──────────┐ ┌─────────┐ ┌──────────┐  ┌──────────┐   ┌────────────┐
   │PostgreSQL│ │  Neo4j  │ │  Mem0    │  │Anthropic │   │  GitHub    │
   │(Railway) │ │  Graph  │ │ Memory   │  │  Claude  │   │  REST API  │
   └──────────┘ └─────────┘ └──────────┘  └──────────┘   └────────────┘
```

---

## PR Review Flow

```
  Developer opens / updates a Pull Request on GitHub
           │
           ▼
  GitHub → POST /api/v1/webhooks/github
           │
           ├─ Verify HMAC-SHA256 signature
           ├─ Deduplicate (ignore duplicate events within 1hr)
           ├─ Create Event row (status = pending)
           └─ Return HTTP 200 immediately
                    │
                    ▼
  BackgroundTask: process_pr_in_background()
           │
           ├─ 1. Fetch PR data from GitHub
           │      get_pr_diff()  get_pr_files()  get_file_content()
           │
           ├─ 2. Pull MCP context (if configured)
           │      ├─ Linear: linked issues & task descriptions
           │      ├─ Sentry: related errors for changed files
           │      └─ Slack: relevant channel messages
           │
           ├─ 3. Build ReviewContext (parallel)
           │      ├─ Mem0: project patterns, decisions, rules
           │      ├─ Mem0: developer-specific patterns & strengths
           │      ├─ Neo4j: file experts (who touched these files most)
           │      └─ Neo4j: related past PRs with file overlap
           │
           ├─ 4. AI Analysis — two modes (set PARALLEL_REVIEW_AGENTS)
           │
           │      STANDARD (default)               PARALLEL (opt-in)
           │      ──────────────────               ────────────────────
           │      Single agentic loop              asyncio.gather() runs:
           │      with 8 MCP-style tools           ├─ Security agent
           │      (search code, fetch              ├─ Performance agent
           │       issues, get errors…)            └─ Style agent
           │                                        ▼
           │                                  Synthesis agent combines
           │                                  all three into final review
           │
           ├─ 5. Post Review on GitHub PR
           │      • Posts as your GitHub account (PAT)
           │      • Inline review comments + top-level summary
           │
           ├─ 6. Index PR in Neo4j Graph
           │      Creates: PullRequest + Developer nodes
           │      Edges:   TOUCHES → Files
           │               AUTHORED_BY → Developer
           │               CLOSES → Issues
           │
           ├─ 7. Extract & Store Memories in Mem0
           │      Claude extracts: project_pattern, decision,
           │      developer_pattern, developer_strength, risk_module,
           │      contributor_profile
           │
           └─ 8. Update Event status → completed / failed
```

---

## MCP — Bidirectional Integration

### Nectr as MCP Server (outbound)

External agents can query Nectr's data at `GET /mcp/sse` (SSE) / `POST /mcp/messages` (JSON-RPC).

| Tool | Description |
|------|-------------|
| `get_recent_reviews` | Recent PR reviews with verdicts and summaries |
| `get_contributor_stats` | Top contributors with PR-touch counts |
| `get_pr_verdict` | AI verdict for a specific PR number |
| `get_repo_health` | Repository health score (0–100) |

**Connect Claude Desktop:**
```json
{
  "mcpServers": {
    "nectr": {
      "url": "https://devkit-production.up.railway.app/mcp/sse"
    }
  }
}
```

### Nectr as MCP Client (inbound context)

Nectr pulls live data from third-party tools during every PR review.

| Integration | Data pulled | Env vars required |
|-------------|-------------|-------------------|
| Linear | Linked issues + task descriptions | `LINEAR_MCP_URL`, `LINEAR_API_KEY` |
| Sentry | Related errors for changed files | `SENTRY_MCP_URL`, `SENTRY_AUTH_TOKEN` |
| Slack | Relevant channel messages | `SLACK_MCP_URL` |

Each integration is optional — if the env vars are not set, that source is silently skipped.

---

## Neo4j Knowledge Graph

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
    • File experts    — developers who most frequently touch these files
    • Related PRs     — past PRs with overlapping file changes
    • Linked issues   — issues closed by this PR
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15, React 19, TypeScript, TailwindCSS 4 |
| **Backend** | FastAPI, Uvicorn, Python 3.14 |
| **Database** | PostgreSQL (asyncpg + SQLAlchemy async) |
| **Knowledge Graph** | Neo4j (async driver) |
| **Semantic Memory** | Mem0 |
| **AI Model** | Anthropic Claude Sonnet 4.6 |
| **GitHub Integration** | GitHub OAuth + REST API + Webhooks |
| **MCP** | FastMCP (server) + httpx MCP client |
| **Frontend Hosting** | Vercel |
| **Backend Hosting** | Railway |
| **Auth** | GitHub OAuth → JWT (httpOnly, SameSite=None, Secure) |
| **Token Encryption** | Fernet (AES-128-CBC) |

---

## Project Structure

```
Devkit/
├── app/                              # FastAPI backend
│   ├── main.py                       # App entry, lifespan, CORS, middleware
│   ├── core/
│   │   ├── config.py                 # Pydantic settings (all env vars)
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
│   │   ├── webhooks.py               # GitHub webhook receiver (per-repo only)
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
│   │   ├── pr_review_service.py      # PR review orchestrator (standard + parallel mode)
│   │   ├── ai_service.py             # Claude integration + parallel agent runner
│   │   ├── context_service.py        # Mem0 + Neo4j + MCP context builder
│   │   ├── graph_builder.py          # Neo4j read + write operations
│   │   ├── memory_adapter.py         # Mem0 async wrapper
│   │   ├── memory_extractor.py       # Post-review memory extraction
│   │   └── project_scanner.py        # Initial repo scan on connect
│   ├── integrations/github/
│   │   ├── client.py                 # GitHub REST API (diff, files, post review)
│   │   └── webhook_manager.py        # Install / remove webhooks
│   └── mcp/
│       ├── server.py                 # FastMCP server (4 tools + 1 resource)
│       └── client.py                 # MCP client (Linear, Sentry, Slack)
│
├── alembic/                          # DB migrations
│   └── versions/
│       ├── e83f4b0f5bf4_*.py         # Initial schema
│       └── a1b2c3d4e5f6_*.py         # Add installation_id + github_repo_id
│
└── nectr-web/                        # Next.js frontend
    └── src/
        ├── app/
        │   ├── page.tsx              # Landing page
        │   └── (dashboard)/
        │       ├── dashboard/        # Main dashboard + top contributors sparklines
        │       ├── repos/            # Connect repos (no GitHub redirect)
        │       ├── reviews/          # PR review history
        │       ├── analytics/        # Team analytics
        │       ├── settings/         # Account settings
        │       └── team/             # Team management
        ├── components/
        │   ├── Sidebar.tsx
        │   ├── Navbar.tsx
        │   └── AppLayout.tsx
        ├── hooks/
        │   ├── useRepos.ts           # useRepos, useInstallRepo, useRescanRepo
        │   └── useAnalytics.ts       # useAnalyticsSummary, useTimeline, useInsights
        └── lib/
            └── api.ts                # Axios instance (base URL + withCredentials)
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (DB + Neo4j + uptime) |
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
| `GET` | `/mcp/sse` | MCP SSE event stream |
| `POST` | `/mcp/messages` | MCP JSON-RPC message ingestion |

---

## Environment Variables

```env
# AI
ANTHROPIC_API_KEY=sk-ant-...

# GitHub OAuth + API
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_PAT=ghp_...                    # Used to post PR review comments
GITHUB_WEBHOOK_SECRET=...             # Optional global fallback webhook secret

# Database
DATABASE_URL=postgresql+asyncpg://...

# Auth
SECRET_KEY=...                        # JWT signing + Fernet encryption key

# Neo4j
NEO4J_URI=neo4j+s://xxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=...

# Mem0 (optional)
MEM0_API_KEY=m0-...

# MCP integrations (all optional — skip if not needed)
LINEAR_MCP_URL=...
LINEAR_API_KEY=lin_api_...
SENTRY_MCP_URL=...
SENTRY_AUTH_TOKEN=...
SLACK_MCP_URL=...

# App
BACKEND_URL=https://your-app.up.railway.app
FRONTEND_URL=https://your-app.vercel.app
APP_ENV=production
LOG_LEVEL=INFO

# Feature flags
PARALLEL_REVIEW_AGENTS=false          # Set true to run 3 parallel specialized agents
```

---

## Running Locally

```bash
# Backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                  # fill in required values
uvicorn app.main:app --reload --port 8000

# Frontend
cd nectr-web
cp .env.example .env.local            # set NEXT_PUBLIC_API_URL=http://localhost:8000
# Note: Next.js dev server runs on port 3000 by default
npm install
npm run dev
```

---

## Fork & Self-Host

Nectr is designed to be forked and self-hosted. You own your data and your API keys.

### Required keys (minimum to get reviews working)

| Key | Where to get it |
|-----|----------------|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | [github.com/settings/developers](https://github.com/settings/developers) → New OAuth App |
| `GITHUB_PAT` | [github.com/settings/tokens](https://github.com/settings/tokens) → Classic token with `repo` scope |
| `DATABASE_URL` | [Supabase](https://supabase.com) free tier (or any PostgreSQL) |
| `SECRET_KEY` | `python -c "import secrets; print(secrets.token_hex(32))"` |

All other keys (`NEO4J_*`, `MEM0_API_KEY`, `LINEAR_*`, `SENTRY_*`, `SLACK_*`) are optional — skip any you don't need.

### GitHub OAuth App callback URL

Set the **Authorization callback URL** in your GitHub OAuth App to:
```
https://your-backend.up.railway.app/auth/github/callback
```

---

## Deployment

- **Backend** → Railway (`main` branch auto-deploys, migrations run on startup)
- **Frontend** → Vercel (`nectr-web/` root directory, set `NEXT_PUBLIC_API_URL` in Vercel env)
