"""
ContextService: Builds ReviewContext by querying Mem0 with PR-specific queries.
On-demand retrieval - only fetches memories relevant to the current PR.
"""

from dataclasses import dataclass

from app.services.memory_adapter import memory_adapter


@dataclass
class ReviewContext:
    """Assembled context for a PR review."""

    project_memories: list[dict]
    developer_memories: list[dict]
    serialized: str  # Ready to inject into prompt


async def build_review_context(
    repo_full_name: str,
    pr_title: str,
    pr_description: str,
    file_paths: list[str],
    author: str,
) -> ReviewContext:
    """
    Query-driven retrieval. Builds search query from PR content,
    fetches only relevant memories.
    """
    project_memories: list[dict] = []
    developer_memories: list[dict] = []

    if not memory_adapter.is_available():
        return ReviewContext(
            project_memories=[],
            developer_memories=[],
            serialized="",
        )

    # Query from PR content - semantic search returns relevant memories
    query_parts = [pr_title or "", (pr_description or "")[:300], ", ".join(file_paths[:10])]
    query = " ".join(q for q in query_parts if q).strip() or "Project context, rules, patterns"

    # Project-level memories (rules, patterns, decisions)
    project_memories = await memory_adapter.search_relevant(
        repo=repo_full_name,
        query=query,
        developer=None,
        top_k=15,
    )

    # Developer-specific memories (if author has history)
    if author:
        developer_memories = await memory_adapter.search_relevant(
            repo=repo_full_name,
            query="Developer patterns, strengths, recurring issues",
            developer=author,
            top_k=5,
        )

    # Serialize for prompt injection
    lines = []
    if project_memories:
        lines.append("PROJECT INTELLIGENCE:")
        for m in project_memories[:12]:
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

    serialized = "\n".join(lines) if lines else ""

    return ReviewContext(
        project_memories=project_memories,
        developer_memories=developer_memories,
        serialized=serialized,
    )
