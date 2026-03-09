# Nectr — Vision & Roadmap

Nectr is an open-source AI code review agent. Connect a GitHub repo and every pull request gets a structured AI review posted as a comment — with a verdict, inline suggestions, linked issue detection, and a knowledge graph that gets smarter over time.

Fork it, add your API keys, and it works. No SaaS subscription, no data leaving your control.

---

## What's Built Today

### Core PR Review Pipeline

Every PR gets a full AI review automatically:

- **Diff analysis** — fetches the full diff + per-file patches from GitHub
- **Agentic review loop** — Claude runs an agentic loop with 8 tools (read file, search memory, get issue details, find related errors…) and fetches only the context it actually needs
- **Verdict** — `APPROVE`, `REQUEST_CHANGES`, or `NEEDS_DISCUSSION`
- **Inline suggestions** — code suggestion blocks placed on specific diff lines
- **Linked issue detection** — parses `Fixes #N` from PR body and fetches issue details; also semantically matches open issues the PR resolves even without an explicit mention
- **Open PR conflict detection** — flags other open PRs touching the same files
- **Comment posted via PAT** — review is posted to the PR as your GitHub account

### Knowledge Graph (Neo4j)

Built automatically as PRs are reviewed:

- **File experts** — who touched these files most → surfaced in every review
- **Related past PRs** — PRs with overlapping file changes → shown in review context
- **PR → File → Developer graph** — traversable for analytics

### Semantic Memory (Mem0)

Learns from every review:

- `project_pattern` — coding conventions and architecture decisions
- `developer_pattern` / `developer_strength` — per-developer coding habits
- `risk_module` — files that frequently introduce bugs
- `contributor_profile` — reviewer preferences and expertise

Memory is injected into future reviews as context so Claude gets smarter with each PR.

### MCP — Bidirectional

**Nectr as MCP server** — Claude Desktop and other agents can query:
- `get_recent_reviews` — review history with verdicts
- `get_contributor_stats` — top contributors by PR count
- `get_pr_verdict` — verdict for a specific PR
- `get_repo_health` — health score for a repo

**Nectr as MCP client** — pulls live context into every review from:
- Linear (linked issues + task descriptions)
- Sentry (production errors for changed files)
- Slack (relevant channel messages)

### Parallel Review Agents (opt-in)

Set `PARALLEL_REVIEW_AGENTS=true` to run three specialized agents in parallel:
- **Security agent** — authentication, injection, exposed secrets
- **Performance agent** — N+1 queries, blocking calls, memory usage
- **Style agent** — naming, patterns, consistency

A synthesis agent combines all three into the final review.

---

## Planned Features

### Issue → AI Fix → PR
When an issue is opened, an AI agent analyzes it, writes a fix, and opens a PR automatically. A human reviews and merges. Simple bugs resolved without developer toil.

### Slack Notifications
Post a Slack message when a PR review completes — summary, verdict, and link to the PR. Notify the PR author directly.

### Team Analytics Dashboard
Per-developer insights from the knowledge graph:
- PR contributions: count, files touched, merge rate
- Recurring review feedback patterns
- Velocity trends: PRs/week, review turnaround

### Retry Failed Reviews
A cron or manual trigger to re-run reviews that failed (rate limit, timeout, etc.) without needing a new push.

### GitLab Support
Extend webhook handler and client to support GitLab merge requests.

---

## Architecture

```
GitHub PR opened / updated
         │
         ▼
POST /api/v1/webhooks/github
         │
  Verify HMAC signature (per-repo secret from DB)
  Create Event row (status=pending)
  Return HTTP 200 immediately
         │
         ▼
FastAPI BackgroundTask
         │
  Fetch diff + files from GitHub
  Run parallel context fetch:
    ├─ Mem0: project patterns + developer history
    ├─ Neo4j: file experts + related past PRs
    └─ MCP: Linear issues / Sentry errors / Slack messages
         │
  Claude agentic loop (8 tools, up to 10 turns)
  — OR —
  3 parallel specialized agents → synthesis agent
         │
  Build inline comment map (AI line hints → diff line numbers)
  Post PR review via GitHub REST API (PAT)
  Index PR in Neo4j graph
  Extract + store memories in Mem0
  Update Event/Workflow status → completed
```

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript, TailwindCSS 4 |
| Backend | FastAPI, Python, asyncpg |
| AI | Anthropic Claude (agentic loop + parallel agents) |
| Memory | Mem0 |
| Graph | Neo4j |
| Database | PostgreSQL |
| Hosting | Railway (backend) + Vercel (frontend) |

---

## Design Principles

1. **Self-hostable first** — everything runs with just a handful of API keys, no proprietary infrastructure
2. **Fail safe, not fail silent** — errors are logged clearly; a failed review never silently disappears
3. **Optional integrations** — Neo4j, Mem0, Linear, Sentry, Slack are all opt-in; the core review works without them
4. **Per-repo isolation** — each repo has its own webhook secret; no cross-repo data leakage
5. **Return 200 fast** — GitHub's 10s webhook timeout is respected; all AI work runs in background tasks
