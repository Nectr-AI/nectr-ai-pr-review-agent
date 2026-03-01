"""
ContextService: Builds ReviewContext by querying Mem0 with PR-specific queries.
On-demand retrieval - only fetches memories relevant to the current PR.
"""

import asyncio
from dataclasses import dataclass, field

from app.services.memory_adapter import memory_adapter


@dataclass
class ReviewContext:
    """Assembled context for a PR review."""

    project_memories: list[dict] = field(default_factory=list)
    developer_memories: list[dict] = field(default_factory=list)
    issue_memories: list[dict] = field(default_factory=list)
    pr_history_memories: list[dict] = field(default_factory=list)
    contributor_profile: list[dict] = field(default_factory=list)
    serialized: str = ""


def _filter_by_type(memories: list[dict], memory_type: str) -> list[dict]:
    """Filter memory list to only include entries with the given memory_type metadata."""
    return [
        m for m in (memories or [])
        if (m.get("metadata") or {}).get("memory_type") == memory_type
    ]


async def _noop() -> list[dict]:
    """Async no-op that returns empty list."""
    return []


async def build_review_context(
    repo_full_name: str,
    pr_title: str,
    pr_description: str,
    file_paths: list[str],
    author: str,
) -> ReviewContext:
    """
    Query-driven retrieval. Builds search query from PR content,
    fetches only relevant memories via 5 parallel Mem0 searches.
    """
    if not memory_adapter.is_available():
        return ReviewContext()

    # Query from PR content - semantic search returns relevant memories
    query_parts = [pr_title or "", (pr_description or "")[:300], ", ".join(file_paths[:10])]
    query = " ".join(q for q in query_parts if q).strip() or "Project context, rules, patterns"

    # Run all 5 searches concurrently
    results = await asyncio.gather(
        # 1. Project-level memories (rules, patterns, decisions, project_map)
        memory_adapter.search_relevant(
            repo=repo_full_name, query=query, developer=None, top_k=12,
        ),
        # 2. Developer-specific memories (patterns, strengths)
        memory_adapter.search_relevant(
            repo=repo_full_name,
            query="Developer patterns, strengths, recurring issues",
            developer=author, top_k=5,
        ) if author else _noop(),
        # 3. Issue context (search with PR query to find related issues)
        memory_adapter.search_relevant(
            repo=repo_full_name, query=query, developer=None, top_k=8,
        ),
        # 4. PR history (search with PR query to find similar past PRs)
        memory_adapter.search_relevant(
            repo=repo_full_name,
            query=f"Past PR {query}",
            developer=None, top_k=8,
        ),
        # 5. Contributor profile for PR author
        memory_adapter.search_relevant(
            repo=repo_full_name,
            query="Contributor profile",
            developer=author, top_k=3,
        ) if author else _noop(),
        return_exceptions=True,
    )

    # Safely unpack (treat exceptions as empty lists)
    project_memories = results[0] if not isinstance(results[0], (Exception, BaseException)) else []
    developer_memories = results[1] if not isinstance(results[1], (Exception, BaseException)) else []
    raw_issue = results[2] if not isinstance(results[2], (Exception, BaseException)) else []
    raw_pr_history = results[3] if not isinstance(results[3], (Exception, BaseException)) else []
    raw_contributor = results[4] if not isinstance(results[4], (Exception, BaseException)) else []

    # Filter by memory_type
    issue_memories = _filter_by_type(raw_issue, "issue_context")[:5]
    pr_history_memories = _filter_by_type(raw_pr_history, "pr_history")[:5]
    contributor_profile = _filter_by_type(raw_contributor, "contributor_profile")[:2]

    # Serialize for prompt injection (token-budgeted)
    lines: list[str] = []

    if project_memories:
        lines.append("PROJECT INTELLIGENCE:")
        for m in project_memories[:10]:
            content = m.get("memory", m.get("content", ""))
            if content:
                lines.append(f"- {content}")

    if developer_memories:
        lines.append("")
        lines.append(f"DEVELOPER CONTEXT ({author}):")
        for m in developer_memories[:5]:
            content = m.get("memory", m.get("content", ""))
            if content:
                lines.append(f"- {content}")

    if contributor_profile:
        lines.append("")
        lines.append(f"CONTRIBUTOR PROFILE ({author}):")
        for m in contributor_profile[:2]:
            content = m.get("memory", m.get("content", ""))
            if content:
                lines.append(f"- {content}")

    if issue_memories:
        lines.append("")
        lines.append("RELATED ISSUE CONTEXT:")
        for m in issue_memories[:4]:
            content = m.get("memory", m.get("content", ""))
            if content:
                lines.append(f"- {content}")

    if pr_history_memories:
        lines.append("")
        lines.append("RELATED PR HISTORY:")
        for m in pr_history_memories[:4]:
            content = m.get("memory", m.get("content", ""))
            if content:
                lines.append(f"- {content}")

    serialized = "\n".join(lines) if lines else ""

    return ReviewContext(
        project_memories=project_memories,
        developer_memories=developer_memories,
        issue_memories=issue_memories,
        pr_history_memories=pr_history_memories,
        contributor_profile=contributor_profile,
        serialized=serialized,
    )
