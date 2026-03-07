"""
app/mcp/server.py
=================
Nectr MCP Server (OUTBOUND).

Exposes Nectr's review data as an MCP server so external agents
(Linear, Slack, Claude Desktop, etc.) can pull PR reviews, verdicts,
contributor stats, and repo health via the Model Context Protocol.

Transport: SSE — mounted at /mcp via app/mcp/router.py.
"""

from __future__ import annotations

import json
import logging

from mcp.server.fastmcp import FastMCP

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# FastMCP server instance — name shown to MCP clients during capability exchange
# ---------------------------------------------------------------------------
mcp = FastMCP("Nectr")


# ---------------------------------------------------------------------------
# Internal helpers — lazy DB / graph access; never crash on import
# ---------------------------------------------------------------------------


async def _query_db_reviews(repo: str, limit: int) -> list[dict]:
    """Query recent PR-review workflow runs from the application database.

    Returns an empty list (with a warning log) if the database is unreachable
    or no matching rows exist, so callers can degrade gracefully.
    """
    try:
        from app.core.database import async_session
        from app.models.workflow import WorkflowRun
        from sqlalchemy import select, desc

        async with async_session() as db:
            stmt = (
                select(WorkflowRun)
                .where(WorkflowRun.workflow_type == "pr_review")
                .order_by(desc(WorkflowRun.created_at))
                .limit(limit)
            )
            result = await db.execute(stmt)
            rows = result.scalars().all()

        reviews: list[dict] = []
        for row in rows:
            meta: dict = {}
            if row.result_data:
                try:
                    meta = (
                        json.loads(row.result_data)
                        if isinstance(row.result_data, str)
                        else row.result_data
                    )
                except (ValueError, TypeError):
                    pass
            reviews.append(
                {
                    "id": row.id,
                    "repo": meta.get("repo", repo),
                    "pr_number": meta.get("pr_number"),
                    "verdict": meta.get("verdict", "UNKNOWN"),
                    "summary": meta.get("summary", ""),
                    "created_at": row.created_at.isoformat() if row.created_at else None,
                    "status": row.status,
                }
            )
        return reviews
    except Exception as exc:
        logger.warning("MCP _query_db_reviews failed: %s", exc)
        return []


async def _query_contributor_stats(repo: str) -> list[dict]:
    """Pull contributor stats from the Neo4j knowledge graph.

    Falls back to an empty list if Neo4j is not configured or the query fails.
    """
    try:
        from app.services import graph_builder

        stats = await graph_builder.get_file_experts(repo, paths=[], top_k=20)
        return [
            {"login": s.get("login", ""), "pr_count": s.get("touch_count", 0)}
            for s in (stats or [])
        ]
    except Exception as exc:
        logger.warning("MCP _query_contributor_stats failed: %s", exc)
        return []


# ---------------------------------------------------------------------------
# MCP Tools — callable by any MCP-compatible client
# ---------------------------------------------------------------------------


@mcp.tool()
async def get_recent_reviews(repo: str, limit: int = 10) -> list[dict]:
    """Get recent PR reviews for a repository with verdicts and summaries.

    Args:
        repo:  Full repository name, e.g. ``owner/repo``.
        limit: Maximum number of reviews to return (default 10, capped at 50).

    Returns:
        List of review dicts:
        ``{id, repo, pr_number, verdict, summary, created_at, status}``.
    """
    limit = min(max(1, limit), 50)
    reviews = await _query_db_reviews(repo, limit)
    if not reviews:
        logger.info("MCP get_recent_reviews: no reviews found for %s", repo)
    return reviews


@mcp.tool()
async def get_contributor_stats(repo: str) -> list[dict]:
    """Get top contributors for a repository with PR-touch counts.

    Args:
        repo: Full repository name, e.g. ``owner/repo``.

    Returns:
        List of contributor dicts: ``{login, pr_count}``.
    """
    return await _query_contributor_stats(repo)


@mcp.tool()
async def get_pr_verdict(repo: str, pr_number: int) -> dict:
    """Get Nectr's AI verdict for a specific pull request.

    Args:
        repo:      Full repository name, e.g. ``owner/repo``.
        pr_number: GitHub PR number.

    Returns:
        ``{repo, pr_number, verdict, summary, created_at}``
        or ``{error}`` when the review is not found.
    """
    try:
        from app.core.database import async_session
        from app.models.workflow import WorkflowRun
        from sqlalchemy import select, desc

        async with async_session() as db:
            stmt = (
                select(WorkflowRun)
                .where(WorkflowRun.workflow_type == "pr_review")
                .order_by(desc(WorkflowRun.created_at))
                .limit(100)
            )
            result = await db.execute(stmt)
            rows = result.scalars().all()

        repo_name = repo.split("/")[-1]
        for row in rows:
            meta: dict = {}
            if row.result_data:
                try:
                    meta = (
                        json.loads(row.result_data)
                        if isinstance(row.result_data, str)
                        else row.result_data
                    )
                except (ValueError, TypeError):
                    pass
            stored_repo = meta.get("repo", "")
            if meta.get("pr_number") == pr_number and stored_repo.endswith(repo_name):
                return {
                    "repo": repo,
                    "pr_number": pr_number,
                    "verdict": meta.get("verdict", "UNKNOWN"),
                    "summary": meta.get("summary", ""),
                    "created_at": row.created_at.isoformat() if row.created_at else None,
                }
        return {"error": f"No review found for {repo}#{pr_number}"}
    except Exception as exc:
        logger.warning("MCP get_pr_verdict failed: %s", exc)
        return {"error": str(exc)}


@mcp.tool()
async def get_repo_health(repo: str) -> dict:
    """Get overall repository health metrics.

    Derives a 0-100 health score from review activity, and reports review
    coverage percentage and indexed PR count.

    Args:
        repo: Full repository name, e.g. ``owner/repo``.

    Returns:
        ``{repo, review_coverage_pct, avg_merge_time_hours,
          open_prs_indexed, health_score, note}``.
    """
    try:
        from app.core.database import async_session
        from app.models.workflow import WorkflowRun
        from sqlalchemy import select, func

        async with async_session() as db:
            stmt = select(func.count()).select_from(WorkflowRun).where(
                WorkflowRun.workflow_type == "pr_review",
                WorkflowRun.status == "completed",
            )
            result = await db.execute(stmt)
            reviewed_count: int = result.scalar() or 0

        health_score = min(100, int((reviewed_count / 20) * 100))
        return {
            "repo": repo,
            "review_coverage_pct": min(100, reviewed_count * 5),
            "avg_merge_time_hours": None,   # requires merge-event timestamp tracking
            "open_prs_indexed": reviewed_count,
            "health_score": health_score,
            "note": "avg_merge_time_hours requires merge-event tracking (roadmap item)",
        }
    except Exception as exc:
        logger.warning("MCP get_repo_health failed: %s", exc)
        return {
            "repo": repo,
            "review_coverage_pct": 0,
            "avg_merge_time_hours": None,
            "open_prs_indexed": 0,
            "health_score": 0,
            "error": str(exc),
        }


# ---------------------------------------------------------------------------
# MCP Resource — streaming reviews as serialised JSON
# ---------------------------------------------------------------------------


@mcp.resource("nectr://repos/{repo}/reviews")
async def reviews_resource(repo: str) -> str:
    """Recent reviews for a repository serialised as a JSON string.

    URI pattern: ``nectr://repos/<owner>/<repo>/reviews``
    """
    reviews = await _query_db_reviews(repo, limit=20)
    return json.dumps(reviews, indent=2, default=str)
