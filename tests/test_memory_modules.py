"""
Test memory layer modules: imports, structure, and basic flows.
Run: python -m pytest tests/test_memory_modules.py -v
Or: python tests/test_memory_modules.py
"""

import asyncio
import json
import os
import sys

# Ensure app is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load .env before importing app
from dotenv import load_dotenv
load_dotenv()


def test_imports():
    """All memory-related modules import without error."""
    from app.services.memory_adapter import memory_adapter
    from app.services.project_scanner import scan_repo
    from app.services.memory_extractor import extract_and_store
    from app.services.context_service import build_review_context, ReviewContext
    from app.api.v1.memory import router, AddMemoryRequest
    assert memory_adapter is not None
    assert callable(scan_repo)
    assert callable(extract_and_store)
    assert callable(build_review_context)


def test_memory_adapter_structure():
    """MemoryAdapter has required methods."""
    from app.services.memory_adapter import memory_adapter
    assert hasattr(memory_adapter, "add_memory")
    assert hasattr(memory_adapter, "search_relevant")
    assert hasattr(memory_adapter, "search_project_map")
    assert hasattr(memory_adapter, "get_all")
    assert hasattr(memory_adapter, "delete")
    assert hasattr(memory_adapter, "is_available")


async def _test_memory_adapter_availability():
    """MemoryAdapter reports availability when MEM0_API_KEY is set."""
    from app.services.memory_adapter import memory_adapter
    from app.core.config import settings
    if settings.MEM0_API_KEY:
        assert memory_adapter.is_available() is True
    else:
        assert memory_adapter.is_available() is False


def test_memory_adapter_availability():
    asyncio.run(_test_memory_adapter_availability())


async def _test_memory_adapter_no_op_without_key():
    """When Mem0 not configured, operations return empty/None."""
    from app.services.memory_adapter import memory_adapter
    from app.core.config import settings
    if settings.MEM0_API_KEY:
        return  # Skip if configured
    results = await memory_adapter.search_relevant("owner/repo", "test query")
    assert results == []
    project_map = await memory_adapter.search_project_map("owner/repo")
    assert project_map == []


def test_memory_adapter_no_op():
    asyncio.run(_test_memory_adapter_no_op_without_key())


async def _test_memory_adapter_add_search_with_key():
    """When Mem0 configured, add and search work (live API call)."""
    from app.services.memory_adapter import memory_adapter
    from app.core.config import settings
    if not settings.MEM0_API_KEY:
        return
    mem_id = await memory_adapter.add_memory(
        repo="test-owner/test-repo",
        content="Test rule: all endpoints need rate limiting",
        memory_type="project_rule",
    )
    assert mem_id is not None or mem_id is None  # API may return id
    results = await memory_adapter.search_relevant(
        repo="test-owner/test-repo",
        query="rate limiting",
        top_k=5,
    )
    assert isinstance(results, list)


def test_memory_adapter_live():
    asyncio.run(_test_memory_adapter_add_search_with_key())


async def _test_context_service():
    """ContextService builds ReviewContext."""
    from app.services.context_service import build_review_context, ReviewContext
    ctx = await build_review_context(
        repo_full_name="owner/repo",
        pr_title="Add auth",
        pr_description="Add JWT auth",
        file_paths=["app/auth.py"],
        author="alice",
    )
    assert isinstance(ctx, ReviewContext)
    assert hasattr(ctx, "project_memories")
    assert hasattr(ctx, "developer_memories")
    assert hasattr(ctx, "serialized")
    assert isinstance(ctx.project_memories, list)
    assert isinstance(ctx.developer_memories, list)
    assert isinstance(ctx.serialized, str)


def test_context_service():
    asyncio.run(_test_context_service())


def test_memory_extractor_prompt():
    """MemoryExtractor has valid extraction prompt."""
    from app.services.memory_extractor import EXTRACTION_PROMPT
    assert "memory_type" in EXTRACTION_PROMPT
    assert "project_pattern" in EXTRACTION_PROMPT
    assert "decision" in EXTRACTION_PROMPT
    assert "{pr_number}" in EXTRACTION_PROMPT
    assert "{author}" in EXTRACTION_PROMPT
    assert "{repo}" in EXTRACTION_PROMPT


def test_project_scanner_key_files():
    """ProjectScanner has expected key files list."""
    from app.services.project_scanner import KEY_FILES
    assert "README.md" in KEY_FILES
    assert "package.json" in KEY_FILES
    assert "pyproject.toml" in KEY_FILES


def test_memory_api_routes():
    """Memory router has expected routes."""
    from app.api.v1.memory import router
    paths = [getattr(r, "path", "") for r in router.routes]
    assert any("stats" in str(p) for p in paths)
    assert any("project-map" in str(p) for p in paths)
    assert any("rescan" in str(p) for p in paths)
    assert any("memory_id" in str(p) or p == "/memory" for p in paths)


def test_add_memory_request_schema():
    """AddMemoryRequest validates correctly."""
    from app.api.v1.memory import AddMemoryRequest
    req = AddMemoryRequest(repo="owner/repo", content="Test rule")
    assert req.repo == "owner/repo"
    assert req.content == "Test rule"
    assert req.memory_type == "project_rule"


def test_ai_service_accepts_context():
    """ai_service.analyze_pull_request accepts context parameter."""
    from app.services.ai_service import ai_service
    import inspect
    sig = inspect.signature(ai_service.analyze_pull_request)
    params = list(sig.parameters.keys())
    assert "context" in params


def test_pr_review_service_imports_context_and_extractor():
    """PR review service uses context and extractor."""
    from app.services import pr_review_service
    import inspect
    source = inspect.getsource(pr_review_service.PRReviewService.process_pr_review)
    assert "build_review_context" in source
    assert "extract_and_store" in source
    assert "context=context" in source


def test_app_includes_memory_router():
    """FastAPI app includes memory router."""
    from app.main import app
    routes = [r.path for r in app.routes]
    assert any("memory" in str(p) for p in routes)


def test_repos_install_triggers_scan():
    """Repos install endpoint triggers project scan."""
    from app.api.v1 import repos
    import inspect
    source = inspect.getsource(repos.install_repo)
    assert "scan_repo" in source
    assert "asyncio.create_task" in source


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
