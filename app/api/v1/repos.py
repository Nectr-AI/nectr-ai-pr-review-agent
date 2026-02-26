import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.installation import Installation
from app.models.user import User
from app.auth.dependencies import get_current_user
from app.integrations.github.webhook_manager import install_webhook, uninstall_webhook
from app.core.config import settings
from app.auth.token_encryption import decrypt_token

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


@router.get("/")
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
        gh_repos = await _fetch_github_repos(decrypt_token(current_user.github_access_token))
    except Exception as e:
        logger.error(f"Failed to fetch GitHub repos: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch GitHub repos")

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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Connect a repo: install GitHub webhook + record Installation."""
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

    # Install webhook on GitHub
    try:
        webhook_id, webhook_secret = await install_webhook(
            owner=owner,
            repo=repo,
            access_token=decrypt_token(current_user.github_access_token),
            backend_url=settings.BACKEND_URL,
        )
    except Exception as e:
        logger.error(f"Failed to install webhook for {repo_full_name}: {e}")
        raise HTTPException(status_code=502, detail=f"Failed to install webhook: {str(e)}")

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
    return {"status": "connected", "installation_id": installation.id, "repo": repo_full_name}


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
            await uninstall_webhook(
                owner=owner,
                repo=repo,
                webhook_id=installation.webhook_id,
                access_token=decrypt_token(current_user.github_access_token),
            )
        except Exception as e:
            logger.warning(f"Webhook removal failed for {repo_full_name}: {e}")

    installation.is_active = False
    await db.commit()

    logger.info(f"User {current_user.github_username} disconnected {repo_full_name}")
    return {"status": "disconnected", "repo": repo_full_name}
