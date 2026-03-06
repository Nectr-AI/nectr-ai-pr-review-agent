import json
import re
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.models.event import Event
from app.models.workflow import WorkflowRun
from app.models.installation import Installation
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.integrations.github.client import github_client
from app.services.memory_adapter import memory_adapter
from app.services import graph_builder

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["analytics"])


def _extract_pr_meta(event: Event) -> dict | None:
    """Extract PR metadata from an event's payload."""
    try:
        raw = json.loads(event.payload or "{}")
        payload = raw.get("original", raw)
        pr = payload.get("pull_request", {})
        repo = payload.get("repository", {})
        if not pr.get("number"):
            return None
        return {
            "pr_number": pr["number"],
            "repo_name": repo.get("full_name", ""),
            "author": pr.get("user", {}).get("login", "unknown"),
            "title": pr.get("title", ""),
            "created_at": pr.get("created_at"),
            "merged_at": pr.get("merged_at"),
            "merged": pr.get("merged", False),
            "state": "merged" if pr.get("merged") else pr.get("state", "open"),
            "additions": pr.get("additions", 0) or 0,
            "deletions": pr.get("deletions", 0) or 0,
            "changed_files": pr.get("changed_files", 0) or 0,
        }
    except Exception:
        return None


def _best_meta_for_pr(events: list[Event]) -> dict[str, dict]:
    """
    Build a dict of pr_key -> best metadata, preferring the event
    that has merge info (closed events) or the latest event overall.
    """
    prs: dict[str, dict] = {}
    for event in events:
        meta = _extract_pr_meta(event)
        if not meta:
            continue
        pr_key = f"{meta['repo_name']}#{meta['pr_number']}"
        existing = prs.get(pr_key)
        if not existing:
            meta["_event"] = event
            prs[pr_key] = meta
        else:
            if meta["merged"] and not existing.get("merged"):
                meta["_event"] = event
                prs[pr_key] = meta
            elif not existing.get("merged"):
                if (meta["additions"] + meta["deletions"]) > (existing["additions"] + existing["deletions"]):
                    meta["_event"] = event
                    prs[pr_key] = meta
    return prs


async def _refresh_pr_states(best_meta: dict[str, dict]) -> None:
    """Fetch live PR states from GitHub and update best_meta in-place."""
    async def _update_one(meta: dict):
        repo = meta.get("repo_name", "")
        pr_num = meta.get("pr_number")
        if not repo or not pr_num or "/" not in repo:
            return
        try:
            owner, repo_name = repo.split("/", 1)
            live_state = await github_client.get_pr_state(owner, repo_name, pr_num)
            meta["state"] = live_state
            if live_state == "merged":
                meta["merged"] = True
        except Exception:
            pass

    await asyncio.gather(*[_update_one(m) for m in best_meta.values()])


def _extract_ai_insights(workflow: WorkflowRun) -> dict | None:
    """Extract verdict, confidence, and issue counts from the AI summary."""
    if not workflow or not workflow.result:
        return None
    try:
        result = json.loads(workflow.result)
        summary = result.get("ai_summary", "")
        if not summary:
            return None

        verdict = None
        for v in ("APPROVE", "REQUEST_CHANGES", "NEEDS_DISCUSSION"):
            if v in summary:
                verdict = v
                break

        confidence = None
        m = re.search(r"Confidence:\s*(\d)/5", summary)
        if m:
            confidence = int(m.group(1))

        critical = len(re.findall(r"🔴\s*\*\*Critical", summary))
        moderate = len(re.findall(r"🟡\s*\*\*Moderate", summary))
        minor = len(re.findall(r"🟢\s*\*\*Minor", summary))

        return {
            "verdict": verdict,
            "confidence": confidence,
            "critical": critical,
            "moderate": moderate,
            "minor": minor,
        }
    except Exception:
        return None


@router.get("/summary")
async def get_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return high-level analytics summary, deduplicated by unique PR."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)

    result = await db.execute(
        select(Event).where(Event.source == "github").order_by(Event.created_at)
    )
    events = result.scalars().all()

    STATUS_PRIORITY = {"completed": 4, "failed": 3, "processing": 2, "pending": 1}

    best_meta = _best_meta_for_pr(events)
    await _refresh_pr_states(best_meta)

    pr_status: dict[str, dict] = {}
    for event in events:
        meta = _extract_pr_meta(event)
        if not meta:
            continue
        pr_key = f"{meta['repo_name']}#{meta['pr_number']}"
        existing = pr_status.get(pr_key)
        if not existing or STATUS_PRIORITY.get(event.status, 0) > STATUS_PRIORITY.get(existing["status"], 0):
            pr_status[pr_key] = {
                "status": event.status,
                "created_at": event.created_at,
            }
        if existing and event.created_at and (not existing.get("first_seen") or event.created_at < existing["first_seen"]):
            pr_status[pr_key]["first_seen"] = event.created_at
        if not existing:
            pr_status[pr_key]["first_seen"] = event.created_at

    total = len(pr_status)
    completed = sum(1 for p in pr_status.values() if p["status"] == "completed")
    success_rate = round((completed / total * 100), 1) if total > 0 else 0.0

    reviews_today = sum(
        1 for p in pr_status.values()
        if p.get("first_seen") and p["first_seen"] >= today_start
    )
    reviews_this_week = sum(
        1 for p in pr_status.values()
        if p.get("first_seen") and p["first_seen"] >= week_start
    )

    # Avg processing time from workflow_runs
    avg_result = await db.execute(
        select(WorkflowRun.started_at, WorkflowRun.completed_at).where(
            WorkflowRun.status == "completed",
            WorkflowRun.completed_at.isnot(None),
        )
    )
    rows = avg_result.all()
    durations = []
    for row in rows:
        if row.started_at and row.completed_at:
            diff = (row.completed_at - row.started_at).total_seconds()
            if 0 < diff < 300:
                durations.append(diff)
    avg_processing = round(sum(durations) / len(durations), 1) if durations else 0.0

    connected_result = await db.execute(
        select(func.count(Installation.id)).where(
            Installation.user_id == current_user.id,
            Installation.is_active == True,
        )
    )
    connected_repos = connected_result.scalar() or 0

    # ── Average time to merge ─────────────────────────────────────
    merge_hours_list: list[float] = []
    pr_sizes: list[int] = []
    for meta in best_meta.values():
        if meta.get("merged_at") and meta.get("created_at"):
            try:
                created = datetime.fromisoformat(meta["created_at"].replace("Z", "+00:00"))
                merged = datetime.fromisoformat(meta["merged_at"].replace("Z", "+00:00"))
                hours = (merged - created).total_seconds() / 3600
                if 0 < hours < 720:
                    merge_hours_list.append(hours)
            except Exception:
                pass
        pr_sizes.append(meta["additions"] + meta["deletions"])

    avg_merge_hours = round(sum(merge_hours_list) / len(merge_hours_list), 1) if merge_hours_list else None
    avg_pr_size = round(sum(pr_sizes) / len(pr_sizes)) if pr_sizes else None

    # ── Last week activity ────────────────────────────────────────
    last_week_prs = []
    for pr_key, st in pr_status.items():
        if st.get("first_seen") and st["first_seen"] >= week_start:
            meta = best_meta.get(pr_key, {})
            last_week_prs.append({
                "pr_number": meta.get("pr_number"),
                "title": meta.get("title", ""),
                "author": meta.get("author", "unknown"),
                "repo_name": meta.get("repo_name", ""),
                "state": meta.get("state", "open"),
                "additions": meta.get("additions", 0),
                "deletions": meta.get("deletions", 0),
                "changed_files": meta.get("changed_files", 0),
            })

    return {
        "total_reviews": total,
        "success_rate": success_rate,
        "avg_processing_seconds": avg_processing,
        "connected_repos": connected_repos,
        "reviews_today": reviews_today,
        "reviews_this_week": reviews_this_week,
        "avg_merge_hours": avg_merge_hours,
        "avg_pr_size": avg_pr_size,
        "last_week_activity": last_week_prs,
    }


@router.get("/timeline")
async def get_timeline(
    days: int = Query(default=30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return daily review counts for the last N days, deduplicated by PR per day."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    start = now - timedelta(days=days)

    result = await db.execute(
        select(Event).where(
            Event.source == "github",
            Event.created_at >= start,
        ).order_by(Event.created_at)
    )
    events = result.scalars().all()

    by_date: dict[str, dict] = {}
    for i in range(days):
        d = (now - timedelta(days=days - 1 - i)).date()
        by_date[d.isoformat()] = {"date": d.isoformat(), "total": 0, "completed": 0, "failed": 0, "_seen": set()}

    STATUS_PRIORITY = {"completed": 4, "failed": 3, "processing": 2, "pending": 1}

    pr_best_status: dict[str, dict[str, str]] = {}

    for event in events:
        meta = _extract_pr_meta(event)
        if not meta or not event.created_at:
            continue
        d_str = event.created_at.date().isoformat()
        if d_str not in by_date:
            continue
        pr_key = f"{meta['repo_name']}#{meta['pr_number']}"
        day_key = f"{d_str}:{pr_key}"

        if day_key not in pr_best_status:
            pr_best_status[day_key] = {"date": d_str, "pr_key": pr_key, "status": event.status}
        elif STATUS_PRIORITY.get(event.status, 0) > STATUS_PRIORITY.get(pr_best_status[day_key]["status"], 0):
            pr_best_status[day_key]["status"] = event.status

    for entry in pr_best_status.values():
        d_str = entry["date"]
        if d_str in by_date:
            by_date[d_str]["total"] += 1
            if entry["status"] == "completed":
                by_date[d_str]["completed"] += 1
            elif entry["status"] == "failed":
                by_date[d_str]["failed"] += 1

    for d in by_date.values():
        d.pop("_seen", None)

    return list(by_date.values())


@router.get("/insights")
async def get_insights(
    days: int = Query(default=30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Rich analytics: merge time, per-author stats, verdict breakdown,
    confidence distribution, issue categories, and per-repo breakdown.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    start = now - timedelta(days=days)

    result = await db.execute(
        select(Event).where(
            Event.source == "github",
            Event.created_at >= start,
        )
    )
    events = result.scalars().all()

    event_ids = [e.id for e in events]
    wf_result = await db.execute(
        select(WorkflowRun).where(WorkflowRun.event_id.in_(event_ids))
    ) if event_ids else None
    workflows_by_event = {}
    if wf_result:
        workflows_by_event = {w.event_id: w for w in wf_result.scalars().all()}

    best_meta = _best_meta_for_pr(events)
    await _refresh_pr_states(best_meta)

    # ── Accumulators ──────────────────────────────────────────────
    merge_times_hours: list[float] = []
    authors: dict[str, dict] = {}
    repos: dict[str, dict] = {}
    verdicts = {"APPROVE": 0, "REQUEST_CHANGES": 0, "NEEDS_DISCUSSION": 0}
    confidence_dist = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    issue_categories = {"critical": 0, "moderate": 0, "minor": 0}
    total_issues = 0
    pr_sizes: list[int] = []

    seen_prs: set[str] = set()

    for event in events:
        raw_meta = _extract_pr_meta(event)
        if not raw_meta:
            continue

        pr_key = f"{raw_meta['repo_name']}#{raw_meta['pr_number']}"
        if pr_key in seen_prs:
            continue
        seen_prs.add(pr_key)

        meta = best_meta.get(pr_key, raw_meta)
        author = meta["author"]
        repo_name = meta["repo_name"]

        wf_event = meta.get("_event", event)
        wf = workflows_by_event.get(wf_event.id) or workflows_by_event.get(event.id)
        insights = _extract_ai_insights(wf)

        # ── PR size ───────────────────────────────────────────────
        pr_sizes.append(meta["additions"] + meta["deletions"])

        # ── Merge time ────────────────────────────────────────────
        if meta.get("merged_at") and meta.get("created_at"):
            try:
                created = datetime.fromisoformat(meta["created_at"].replace("Z", "+00:00"))
                merged = datetime.fromisoformat(meta["merged_at"].replace("Z", "+00:00"))
                hours = (merged - created).total_seconds() / 3600
                if 0 < hours < 720:
                    merge_times_hours.append(hours)
            except Exception:
                pass

        # ── Per-author ────────────────────────────────────────────
        if author not in authors:
            authors[author] = {"author": author, "prs": 0, "merged": 0, "issues_flagged": 0, "avg_confidence": []}
        authors[author]["prs"] += 1
        if meta["state"] == "merged":
            authors[author]["merged"] += 1

        # ── Per-repo ──────────────────────────────────────────────
        if repo_name not in repos:
            repos[repo_name] = {"repo": repo_name, "prs": 0, "merged": 0, "issues": 0}
        repos[repo_name]["prs"] += 1
        if meta["state"] == "merged":
            repos[repo_name]["merged"] += 1

        if not insights:
            continue

        # ── Verdict ───────────────────────────────────────────────
        if insights["verdict"] and insights["verdict"] in verdicts:
            verdicts[insights["verdict"]] += 1

        # ── Confidence ────────────────────────────────────────────
        if insights["confidence"] and insights["confidence"] in confidence_dist:
            confidence_dist[insights["confidence"]] += 1
            authors[author]["avg_confidence"].append(insights["confidence"])

        # ── Issues ────────────────────────────────────────────────
        pr_issues = insights["critical"] + insights["moderate"] + insights["minor"]
        issue_categories["critical"] += insights["critical"]
        issue_categories["moderate"] += insights["moderate"]
        issue_categories["minor"] += insights["minor"]
        total_issues += pr_issues
        authors[author]["issues_flagged"] += pr_issues
        repos[repo_name]["issues"] += pr_issues

    # ── Finalize per-author ───────────────────────────────────────
    author_list = []
    for a in authors.values():
        conf = a.pop("avg_confidence")
        a["avg_confidence"] = round(sum(conf) / len(conf), 1) if conf else None
        author_list.append(a)
    author_list.sort(key=lambda x: x["prs"], reverse=True)

    # ── Finalize per-repo ─────────────────────────────────────────
    repo_list = list(repos.values())
    for r in repo_list:
        r["merge_rate"] = round(r["merged"] / r["prs"] * 100, 1) if r["prs"] else 0
    repo_list.sort(key=lambda x: x["prs"], reverse=True)

    avg_pr_size = round(sum(pr_sizes) / len(pr_sizes)) if pr_sizes else None

    # ── Merge time stats ─────────────────────────────────────────
    avg_merge = round(sum(merge_times_hours) / len(merge_times_hours), 1) if merge_times_hours else None
    median_merge = None
    if merge_times_hours:
        s = sorted(merge_times_hours)
        mid = len(s) // 2
        median_merge = round(s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2, 1)
    fastest_merge = round(min(merge_times_hours), 1) if merge_times_hours else None
    slowest_merge = round(max(merge_times_hours), 1) if merge_times_hours else None

    return {
        "period_days": days,
        "total_prs": len(seen_prs),
        "avg_pr_size": avg_pr_size,
        "merge_time": {
            "avg_hours": avg_merge,
            "median_hours": median_merge,
            "fastest_hours": fastest_merge,
            "slowest_hours": slowest_merge,
            "sample_size": len(merge_times_hours),
        },
        "verdicts": verdicts,
        "confidence_distribution": confidence_dist,
        "issue_categories": {**issue_categories, "total": total_issues},
        "per_author": author_list,
        "per_repo": repo_list,
    }


@router.get("/contributors")
async def get_contributors(
    repo: str = Query(..., description="owner/repo to query"),
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    per_page: int = Query(default=20, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Team leader view: per-developer summary from Mem0 contributor_profile,
    developer_pattern, and developer_strength memories.
    """
    result = await db.execute(
        select(Installation).where(
            Installation.user_id == current_user.id,
            Installation.repo_full_name == repo,
            Installation.is_active == True,
        )
    )
    if not result.scalar_one_or_none():
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Repo not connected or access denied")

    if not memory_adapter.is_available():
        return {"repo": repo, "contributor_count": 0, "contributors": [], "note": "Memory layer not configured"}

    all_memories = await memory_adapter.get_all(repo=repo)

    by_developer: dict[str, dict] = {}
    for m in all_memories:
        meta = m.get("metadata") or {}
        memory_type = meta.get("memory_type", "")
        content = m.get("memory", m.get("content", ""))

        dev = meta.get("username") or m.get("user_id") or "project"
        if dev in ("project", ""):
            continue

        if dev not in by_developer:
            by_developer[dev] = {
                "username": dev,
                "profile_summary": None,
                "patterns": [],
                "strengths": [],
                "pr_count": 0,
                "commit_count": 0,
                "last_seen_pr": None,
            }

        if memory_type == "contributor_profile":
            by_developer[dev]["profile_summary"] = content
            by_developer[dev]["pr_count"] = max(
                by_developer[dev]["pr_count"],
                meta.get("pr_count", 0) or 0,
            )
            by_developer[dev]["commit_count"] = max(
                by_developer[dev]["commit_count"],
                meta.get("commit_count", 0) or 0,
            )
        elif memory_type == "developer_pattern":
            by_developer[dev]["patterns"].append(content)
        elif memory_type == "developer_strength":
            by_developer[dev]["strengths"].append(content)

        source_pr = meta.get("source_pr")
        if source_pr:
            if not by_developer[dev]["last_seen_pr"] or source_pr > by_developer[dev]["last_seen_pr"]:
                by_developer[dev]["last_seen_pr"] = source_pr

    all_contributors = sorted(
        by_developer.values(),
        key=lambda x: x.get("pr_count", 0),
        reverse=True,
    )

    total = len(all_contributors)
    start = (page - 1) * per_page
    end = start + per_page
    paginated = all_contributors[start:end]

    return {
        "repo": repo,
        "contributor_count": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page if total > 0 else 1,
        "contributors": paginated,
    }


@router.get("/graph")
async def get_graph_analytics(
    repo: str = Query(..., description="owner/repo to query"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Repo intelligence from Neo4j graph + GitHub API:
    - Language distribution (GitHub API — byte-accurate)
    - File hotspots (most PR-touched files)
    - High-risk files (most REQUEST_CHANGES verdicts)
    - Dead files (never touched by any reviewed PR)
    - Code ownership (file → dominant contributor)
    - Developer expertise (per dev: top directories)
    """
    result = await db.execute(
        select(Installation).where(
            Installation.user_id == current_user.id,
            Installation.repo_full_name == repo,
            Installation.is_active == True,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Repo not connected or access denied")

    if "/" not in repo:
        raise HTTPException(status_code=400, detail="repo must be in 'owner/repo' format")

    owner, repo_name = repo.split("/", 1)

    # Run all queries in parallel
    (
        languages_result,
        hotspots,
        high_risk,
        dead_files,
        ownership,
        expertise,
    ) = await asyncio.gather(
        github_client.get_repo_languages(owner, repo_name),
        graph_builder.get_file_hotspots(repo, limit=10),
        graph_builder.get_high_risk_files(repo, limit=8),
        graph_builder.get_dead_files_stats(repo),
        graph_builder.get_code_ownership(repo, limit=10),
        graph_builder.get_developer_expertise(repo, limit=8),
        return_exceptions=True,
    )

    # Gracefully handle partial failures
    if isinstance(languages_result, Exception):
        logger.warning(f"Language fetch failed for {repo}: {languages_result}")
        languages_result = {}
    if isinstance(hotspots, Exception):
        hotspots = []
    if isinstance(high_risk, Exception):
        high_risk = []
    if isinstance(dead_files, Exception):
        dead_files = {"count": 0, "sample": []}
    if isinstance(ownership, Exception):
        ownership = []
    if isinstance(expertise, Exception):
        expertise = []

    # Convert raw language bytes → sorted list with percentages
    total_bytes = sum(languages_result.values()) if languages_result else 0
    languages = [
        {
            "name": lang,
            "bytes": bytes_count,
            "pct": round(bytes_count / total_bytes * 100, 1) if total_bytes else 0,
        }
        for lang, bytes_count in sorted(languages_result.items(), key=lambda x: x[1], reverse=True)
    ]

    return {
        "repo": repo,
        "languages": languages,
        "file_hotspots": hotspots,
        "high_risk_files": high_risk,
        "dead_files": dead_files,
        "code_ownership": ownership,
        "developer_expertise": expertise,
    }
