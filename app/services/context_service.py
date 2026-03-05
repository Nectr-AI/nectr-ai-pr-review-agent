"""
ContextService: Builds ReviewContext by combining:
  - Mem0 semantic memories (project rules, developer patterns, project_map)
  - Neo4j structural context (file experts, related past PRs)
"""

import asyncio
import logging
from dataclasses import dataclass, field

from app.services.memory_adapter import memory_adapter
from app.services import graph_builder
from app.core.neo4j_client import is_available as neo4j_available

logger = logging.getLogger(__name__)


@dataclass
class ReviewContext:
    """Assembled context for a PR review."""

    project_memories: list[dict] = field(default_factory=list)
    developer_memories: list[dict] = field(default_factory=list)
    file_experts: list[dict] = field(default_factory=list)       # from Neo4j
    related_prs: list[dict] = field(default_factory=list)        # from Neo4j
    serialized: str = ""


async def _noop() -> list[dict]:
    return []


async def _get_structural_context(
    repo_full_name: str,
    file_paths: list[str],
    pr_number: int | None,
) -> tuple[list[dict], list[dict]]:
    """Query Neo4j for file experts and related past PRs."""
    if not neo4j_available() or not file_paths:
        return [], []

    experts, related = await asyncio.gather(
        graph_builder.get_file_experts(repo_full_name, file_paths[:20], top_k=5),
        graph_builder.get_related_prs(repo_full_name, file_paths[:20], exclude_pr=pr_number, top_k=5),
        return_exceptions=True,
    )
    if isinstance(experts, Exception):
        logger.warning(f"get_file_experts failed: {experts}")
        experts = []
    if isinstance(related, Exception):
        logger.warning(f"get_related_prs failed: {related}")
        related = []

    return experts, related


async def build_review_context(
    repo_full_name: str,
    pr_title: str,
    pr_description: str,
    file_paths: list[str],
    author: str,
    pr_number: int | None = None,
) -> ReviewContext:
    """
    Build complete PR review context from Mem0 (semantic) + Neo4j (structural).
    """
    # --- Mem0 parallel searches ---
    mem0_results: list = []
    if memory_adapter.is_available():
        query_parts = [pr_title or "", (pr_description or "")[:300], ", ".join(file_paths[:10])]
        query = " ".join(q for q in query_parts if q).strip() or "Project context, rules, patterns"

        mem0_results = await asyncio.gather(
            memory_adapter.search_relevant(repo=repo_full_name, query=query, developer=None, top_k=12),
            memory_adapter.search_relevant(
                repo=repo_full_name,
                query="Developer patterns, strengths, recurring issues",
                developer=author, top_k=5,
            ) if author else _noop(),
            return_exceptions=True,
        )
    else:
        mem0_results = [[], []]

    project_memories = mem0_results[0] if not isinstance(mem0_results[0], Exception) else []
    developer_memories = mem0_results[1] if not isinstance(mem0_results[1], Exception) else []

    # --- Neo4j structural context ---
    file_experts, related_prs = await _get_structural_context(repo_full_name, file_paths, pr_number)

    # --- Serialize for prompt injection ---
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

    if file_experts:
        lines.append("")
        lines.append("FILE EXPERTS (developers who frequently touch these files):")
        for e in file_experts:
            lines.append(f"- {e['login']} ({e['touch_count']} PRs)")

    if related_prs:
        lines.append("")
        lines.append("RELATED PAST PRs (touched same files):")
        for pr in related_prs:
            verdict_tag = f" [{pr['verdict']}]" if pr.get("verdict") else ""
            lines.append(
                f"- PR #{pr['number']}{verdict_tag} by {pr['author']}: {pr['title']}"
                f" (overlap: {pr['overlap']} files)"
            )

    serialized = "\n".join(lines) if lines else ""

    return ReviewContext(
        project_memories=project_memories,
        developer_memories=developer_memories,
        file_experts=file_experts,
        related_prs=related_prs,
        serialized=serialized,
    )
