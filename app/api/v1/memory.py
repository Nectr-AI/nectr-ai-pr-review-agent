"""
Memory API: CRUD for Mem0 memories, project map view, rescan.
"""

import logging
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.core.database import get_db
from app.models.installation import Installation
from app.models.user import User
from app.auth.dependencies import get_current_user
from app.auth.token_encryption import decrypt_token
from app.services.memory_adapter import memory_adapter
from app.services.project_scanner import scan_repo

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/memory", tags=["memory"])


class AddMemoryRequest(BaseModel):
    repo: str
    content: str
    memory_type: str = "project_rule"


async def _ensure_repo_connected(db: AsyncSession, user_id: int, repo: str) -> None:
    """Raise 403 if user doesn't have this repo connected."""
    result = await db.execute(
        select(Installation).where(
            Installation.user_id == user_id,
            Installation.repo_full_name == repo,
            Installation.is_active == True,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Repo not connected or access denied")


@router.get("")
async def list_memories(
    repo: str = Query(..., description="owner/repo"),
    memory_type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List memories for a repo. User must have repo connected."""
    await _ensure_repo_connected(db, current_user.id, repo)
    memories = await memory_adapter.get_all(repo=repo, memory_type=memory_type)
    return {"memories": memories, "count": len(memories)}


@router.get("/stats")
async def memory_stats(
    repo: str = Query(..., description="owner/repo"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Memory counts by type for a repo."""
    await _ensure_repo_connected(db, current_user.id, repo)
    memories = await memory_adapter.get_all(repo=repo)
    by_type: dict[str, int] = {}
    for m in memories:
        meta = m.get("metadata", m) or {}
        if isinstance(meta, dict):
            t = meta.get("memory_type", "unknown")
        else:
            t = "unknown"
        by_type[t] = by_type.get(t, 0) + 1
    return {"repo": repo, "total": len(memories), "by_type": by_type}


@router.get("/project-map")
async def get_project_map(
    repo: str = Query(..., description="owner/repo"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get full project map for a repo (for view context / onboarding)."""
    await _ensure_repo_connected(db, current_user.id, repo)
    memories = await memory_adapter.search_project_map(repo=repo)
    return {"memories": memories, "count": len(memories)}


@router.post("/rescan")
async def rescan_repo(
    background_tasks: BackgroundTasks,
    repo: str = Query(..., description="owner/repo"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-run project scanner for this repo."""
    await _ensure_repo_connected(db, current_user.id, repo)
    if not memory_adapter.is_available():
        raise HTTPException(status_code=503, detail="Memory layer not configured")
    if "/" not in repo:
        raise HTTPException(status_code=400, detail="repo must be owner/repo")
    owner, repo_name = repo.split("/", 1)
    access_token = decrypt_token(current_user.github_access_token)
    background_tasks.add_task(scan_repo, owner, repo_name, access_token)
    return {"status": "rescan_started", "repo": repo}


@router.post("")
async def add_memory(
    body: AddMemoryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually add a memory (e.g. project rule)."""
    await _ensure_repo_connected(db, current_user.id, body.repo)
    if not memory_adapter.is_available():
        raise HTTPException(status_code=503, detail="Memory layer not configured")
    memory_id = await memory_adapter.add_memory(
        repo=body.repo,
        content=body.content,
        memory_type=body.memory_type,
    )
    return {"id": memory_id, "status": "added"}


@router.delete("/{memory_id}")
async def delete_memory(
    memory_id: str,
    repo: str = Query(..., description="owner/repo"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a memory by id."""
    await _ensure_repo_connected(db, current_user.id, repo)
    ok = await memory_adapter.delete(memory_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Memory not found or already deleted")
    return {"status": "deleted"}
