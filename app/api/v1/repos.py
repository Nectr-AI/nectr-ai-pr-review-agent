import logging
import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.installation import Installation
from app.models.user import User
from app.auth.dependencies import get_current_user
from app.integrations.github.webhook_manager import install_webhook, uninstall_webhook
from app.core.config import settings
from app.auth.token_encryption import decrypt_token
from app.services.project_scanner import scan_repo
from app.services.graph_builder import build_repo_graph
from app.core.neo4j_client import is_available as neo4j_available

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/repos", tags=["repos"])


async def _fetch_github_repos(access_token: str) -> list[dict]:
    """Fetch all repos the user has access to from GitHub API."""
    repos = []
    page = 1
    async with httpx.AsyncClient() as client:
        while True:
            resp = await client.get(
                "https://api.github.com/user/repos",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.v3+json",
                },
                params={"per_page": 100, "page": page, "sort": "updated", "affiliation": "owner,collaborator"},
            )
            resp.raise_for_status()
            batch = resp.json()
            if not batch:
                break
            repos.extend(batch)
            if len(batch) < 100:
                break
            page += 1
    return repos


@router.get("")
async def list_repos(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all GitHub repos for the user, annotated with connection status.
    """
    # Get all active installations for this user
    result = await db.execute(
        select(Installation).where(
            Installation.user_id == current_user.id,
            Installation.is_active == True,
        )
    )
    installations = {i.repo_full_name: i for i in result.scalars().all()}

    # Fetch repos from GitHub
    try:
        token = decrypt_token(current_user.github_access_token)
    except ValueError as e:
        # SECRET_KEY changed — token can't be decrypted, force re-login
        logger.error(f"Token decryption failed for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=401,
            detail="Session expired — please log out and sign in again to reconnect your GitHub account.",
        )

    try:
        gh_repos = await _fetch_github_repos(token)
    except Exception as e:
        logger.error(f"Failed to fetch GitHub repos: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch repositories from GitHub")

    return [
        {
            "id": r["id"],
            "name": r["name"],
            "full_name": r["full_name"],
            "description": r.get("description"),
            "private": r["private"],
            "html_url": r["html_url"],
            "updated_at": r.get("updated_at"),
            "is_connected": r["full_name"] in installations,
            "installation_id": installations[r["full_name"]].id if r["full_name"] in installations else None,
        }
        for r in gh_repos
    ]


@router.post("/{owner}/{repo}/install")
async def install_repo(
    owner: str,
    repo: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Connect a repo with one click — no redirect to GitHub required.

    Uses the user's existing OAuth token (already granted 'repo' scope) to:
    1. Create a webhook on the repo
    2. Silently wire up the GitHub App installation (bot identity)
    3. Kick off project scan + graph build in background
    """
    repo_full_name = f"{owner}/{repo}"

    # Check not already connected
    result = await db.execute(
        select(Installation).where(
            Installation.user_id == current_user.id,
            Installation.repo_full_name == repo_full_name,
            Installation.is_active == True,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Repo already connected")

    # Decrypt OAuth token — raises 401 if SECRET_KEY changed
    try:
        access_token = decrypt_token(current_user.github_access_token)
    except ValueError:
        raise HTTPException(
            status_code=401,
            detail="Session expired — please log out and sign in again.",
        )

    # Step 1: Create webhook on the repo (uses user's OAuth token)
    try:
        webhook_id, webhook_secret = await install_webhook(
            owner=owner,
            repo=repo,
            access_token=access_token,
            backend_url=settings.BACKEND_URL,
        )
    except Exception as e:
        logger.error(f"Failed to install webhook for {repo_full_name}: {e}")
        raise HTTPException(status_code=502, detail=f"Failed to install webhook: {str(e)}")

    # Step 2: Persist the Installation record
    installation = Installation(
        user_id=current_user.id,
        repo_full_name=repo_full_name,
        webhook_id=webhook_id,
        webhook_secret=webhook_secret,
        is_active=True,
    )
    db.add(installation)
    await db.commit()
    await db.refresh(installation)

    logger.info(f"User {current_user.github_username} connected {repo_full_name}")

    # Step 4: Kick off background tasks
    background_tasks.add_task(scan_repo, owner, repo, access_token)
    background_tasks.add_task(build_repo_graph, owner, repo, access_token)

    return {
        "status": "connected",
        "installation_id": installation.id,
        "repo": repo_full_name,
        "bot_identity": github_app_installation_id is not None,
    }


@router.post("/{owner}/{repo}/rescan")
async def rescan_repo(
    owner: str,
    repo: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-scan repo file tree into Neo4j. Runs synchronously and returns file count."""
    repo_full_name = f"{owner}/{repo}"

    if not neo4j_available():
        raise HTTPException(status_code=503, detail="Neo4j is not configured on this server")

    result = await db.execute(
        select(Installation).where(
            Installation.user_id == current_user.id,
            Installation.repo_full_name == repo_full_name,
            Installation.is_active == True,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Repo not connected")

    try:
        access_token = decrypt_token(current_user.github_access_token)
    except ValueError:
        raise HTTPException(
            status_code=401,
            detail="Session expired — please log out and sign in again.",
        )

    try:
        files_indexed = await build_repo_graph(owner, repo, access_token, raise_on_error=True)
    except RuntimeError as e:
        logger.error(f"Rescan failed for {repo_full_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Rescan unexpected error for {repo_full_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

    return {"status": "scan_complete", "repo": repo_full_name, "files_indexed": files_indexed}


@router.delete("/{owner}/{repo}/install")
async def uninstall_repo(
    owner: str,
    repo: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Disconnect a repo: remove webhook + mark installation inactive."""
    repo_full_name = f"{owner}/{repo}"

    result = await db.execute(
        select(Installation).where(
            Installation.user_id == current_user.id,
            Installation.repo_full_name == repo_full_name,
            Installation.is_active == True,
        )
    )
    installation = result.scalar_one_or_none()
    if not installation:
        raise HTTPException(status_code=404, detail="Installation not found")

    # Remove webhook from GitHub
    if installation.webhook_id:
        try:
            access_token = decrypt_token(current_user.github_access_token)
        except ValueError:
            raise HTTPException(
                status_code=401,
                detail="Session expired — please log out and sign in again.",
            )
        try:
            await uninstall_webhook(
                owner=owner,
                repo=repo,
                webhook_id=installation.webhook_id,
                access_token=access_token,
            )
        except Exception as e:
            logger.warning(f"Webhook removal failed for {repo_full_name}: {e}")

    installation.is_active = False
    await db.commit()

    logger.info(f"User {current_user.github_username} disconnected {repo_full_name}")
    return {"status": "disconnected", "repo": repo_full_name}
