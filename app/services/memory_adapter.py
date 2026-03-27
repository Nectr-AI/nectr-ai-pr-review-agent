"""
MemoryAdapter: Thin wrapper around Mem0 for project/developer-scoped memories.
Uses project_id=repo_full_name, user_id=developer (or "project" for repo-wide).
When MEM0_API_KEY is not set, all operations no-op / return empty (graceful degradation).
"""

import asyncio
import logging
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

# Lazy init - only create client when first needed and API key exists
_mem0_client: Any = None


def _get_client():
    """Get or create Mem0 client. Returns None if not configured."""
    global _mem0_client
    if not settings.MEM0_API_KEY:
        return None
    if _mem0_client is None:
        try:
            from mem0 import MemoryClient

            _mem0_client = MemoryClient(api_key=settings.MEM0_API_KEY.strip())
            logger.info("Mem0 client initialized")
        except Exception as e:
            logger.warning(f"Mem0 client init failed: {e}")
            return None
    return _mem0_client


def _run_sync(coro_fn, *args, **kwargs):
    """Run sync Mem0 calls in thread pool to avoid blocking async event loop."""
    return asyncio.to_thread(coro_fn, *args, **kwargs)


class MemoryAdapter:
    """
    Wraps Mem0 with our scoping: project_id=repo, user_id=developer.
    All methods are async and no-op when Mem0 is not configured.
    """

    async def add_memory(
        self,
        repo: str,
        content: str,
        memory_type: str,
        developer: str | None = None,
        metadata: dict | None = None,
    ) -> str | None:
        """
        Add a memory. Returns memory id or None.
        """
        client = _get_client()
        if not client:
            return None

        meta = metadata or {}
        meta["memory_type"] = memory_type

        def _add():
            return client.add(
                messages=[{"role": "user", "content": content}],
                project_id=repo,
                user_id=developer or "project",
                metadata=meta,
                infer=False,
                version="v2",
            )

        try:
            result = await _run_sync(_add)
            # Mem0 add returns dict with results or list of events
            if isinstance(result, dict) and "results" in result:
                results = result["results"]
                if results and isinstance(results[0], dict):
                    return results[0].get("id")
            if isinstance(result, list) and len(result) > 0 and isinstance(result[0], dict):
                return result[0].get("id")
            return None
        except Exception as e:
            logger.error(f"Mem0 add failed: {e}")
            return None

    async def search_relevant(
        self,
        repo: str,
        query: str,
        developer: str | None = None,
        top_k: int = 20,
    ) -> list[dict]:
        """
        Query-driven search. Returns only memories relevant to the query.
        Mem0 v2 API requires filters — we always pass at least user_id.
        """
        client = _get_client()
        if not client:
            return []

        # Mem0 v2 requires non-empty filters for search
        if developer:
            filters = {"AND": [{"user_id": developer}]}
        else:
            filters = {"AND": [{"user_id": "project"}]}

        def _search():
            return client.search(
                query=query,
                project_id=repo,
                filters=filters,
                top_k=top_k,
                version="v2",
            )

        try:
            result = await _run_sync(_search)
            if isinstance(result, dict) and "results" in result:
                return result["results"]
            if isinstance(result, list):
                return result
            return []
        except Exception as e:
            logger.error(f"Mem0 search failed: {e}")
            return []

    async def search_project_map(self, repo: str) -> list[dict]:
        """
        Get full project_map memories for explicit "view context" action.
        """
        return await self.search_relevant(
            repo=repo,
            query="Project map, tech stack, architecture, conventions, structure",
            developer=None,
            top_k=20,
        )

    async def list_memories(
        self,
        repo: str,
        user_id: str | None = None,
    ) -> list[dict]:
        """
        List memories using Mem0 get_all API (not semantic search).
        Used when we need ALL memories, not just relevant ones.
        """
        client = _get_client()
        if not client:
            return []

        filters = {"AND": [{"user_id": user_id}]} if user_id else None

        def _list():
            return client.get_all(
                project_id=repo,
                filters=filters,
                version="v2",
            )

        try:
            result = await _run_sync(_list)
            if isinstance(result, dict) and "results" in result:
                return result["results"]
            if isinstance(result, list):
                return result
            return []
        except Exception as e:
            logger.error(f"Mem0 list failed: {e}")
            return []

    async def get_all(
        self,
        repo: str,
        memory_type: str | None = None,
    ) -> list[dict]:
        """
        List memories for a repo. Uses search with broad query.
        Used for Settings UI.
        """
        query = (
            "Project memories, rules, patterns, decisions, context, "
            "issues, contributors, PR history, developer patterns, contributor profile"
        )
        if memory_type:
            query = f"{memory_type} {query}"
        return await self.search_relevant(repo=repo, query=query, top_k=100)

    async def delete(self, memory_id: str) -> bool:
        """Delete a memory by id."""
        client = _get_client()
        if not client:
            return False

        def _delete():
            return client.delete(memory_id=memory_id)

        try:
            await _run_sync(_delete)
            return True
        except Exception as e:
            logger.error(f"Mem0 delete failed: {e}")
            return False

    def is_available(self) -> bool:
        """Whether Mem0 is configured and available."""
        return _get_client() is not None


memory_adapter = MemoryAdapter()
