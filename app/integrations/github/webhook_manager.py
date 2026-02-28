import secrets
import httpx
import logging

logger = logging.getLogger(__name__)

BACKEND_URL_DEFAULT = "http://localhost:8000"


async def install_webhook(
    owner: str,
    repo: str,
    access_token: str,
    backend_url: str = BACKEND_URL_DEFAULT,
) -> tuple[int, str]:
    """
    Install a GitHub webhook on the given repo.
    Returns (webhook_id, webhook_secret).
    """
    webhook_secret = secrets.token_hex(32)
    payload_url = f"{backend_url.rstrip('/')}/api/v1/webhooks/github"

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://api.github.com/repos/{owner}/{repo}/hooks",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json",
            },
            json={
                "name": "web",
                "active": True,
                "events": ["pull_request", "issues"],
                "config": {
                    "url": payload_url,
                    "content_type": "json",
                    "secret": webhook_secret,
                    "insecure_ssl": "0",
                },
            },
        )
        resp.raise_for_status()
        data = resp.json()

    webhook_id = data["id"]
    logger.info(f"Installed webhook {webhook_id} on {owner}/{repo}")
    return webhook_id, webhook_secret


async def uninstall_webhook(
    owner: str,
    repo: str,
    webhook_id: int,
    access_token: str,
) -> None:
    """Delete a GitHub webhook from the given repo."""
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"https://api.github.com/repos/{owner}/{repo}/hooks/{webhook_id}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json",
            },
        )
        if resp.status_code == 404:
            logger.warning(f"Webhook {webhook_id} not found on {owner}/{repo} — already deleted?")
            return
        resp.raise_for_status()
    logger.info(f"Uninstalled webhook {webhook_id} from {owner}/{repo}")
