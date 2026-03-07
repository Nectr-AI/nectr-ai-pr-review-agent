"""
GitHub App JWT + Installation Token authentication.

Provides JWT-based auth for the Nectr GitHub App so that PR review comments
appear as the app bot (with its own avatar) rather than a personal account.

Usage:
    token_manager = GitHubAppTokenManager()
    token = await token_manager.get_token_for_repo("owner", "repo")
    headers = {"Authorization": f"Bearer {token}", ...}
"""

import time
import logging

import httpx
import jwt  # PyJWT >= 2.x

from app.core.config import settings

logger = logging.getLogger(__name__)

GITHUB_API_BASE = "https://api.github.com"

_TOKEN_TTL_SECONDS = 3600
_TOKEN_REFRESH_BUFFER = 300


def _get_private_key() -> str:
    raw = settings.GITHUB_APP_PRIVATE_KEY or ""
    # The env var stores PEM with literal backslash-n; convert to real newlines
    return raw.replace(chr(92) + chr(110), chr(10))


def generate_app_jwt() -> str:
    if not settings.GITHUB_APP_ID:
        raise ValueError("GITHUB_APP_ID is not configured in settings.")
    if not settings.GITHUB_APP_PRIVATE_KEY:
        raise ValueError("GITHUB_APP_PRIVATE_KEY is not configured in settings.")
    now = int(time.time())
    payload = {
        "iat": now - 60,
        "exp": now + 600,
        "iss": settings.GITHUB_APP_ID,
    }
    private_key = _get_private_key()
    token: str = jwt.encode(
        payload,
        private_key,
        algorithm="RS256",
        headers={"alg": "RS256"},
    )
    return token


async def get_installation_id(owner: str, repo: str) -> int:
    app_jwt = generate_app_jwt()
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/installation"
    headers = {
        "Authorization": f"Bearer {app_jwt}",
        "Accept": "application/vnd.github.v3+json",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()
    installation_id = data.get("id")
    if not installation_id:
        raise ValueError(
            f"GitHub API response did not contain an installation id "
            f"for {owner}/{repo}: {data}"
        )
    logger.debug("Resolved installation_id=%s for %s/%s", installation_id, owner, repo)
    return int(installation_id)


async def get_installation_token(installation_id: int) -> tuple[str, float]:
    app_jwt = generate_app_jwt()
    url = f"{GITHUB_API_BASE}/app/installations/{installation_id}/access_tokens"
    headers = {
        "Authorization": f"Bearer {app_jwt}",
        "Accept": "application/vnd.github.v3+json",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, headers=headers)
        response.raise_for_status()
        data = response.json()
    token = data.get("token")
    if not token:
        raise ValueError(
            f"GitHub API response did not contain a token for "
            f"installation {installation_id}: {data}"
        )
    expiry = time.monotonic() + _TOKEN_TTL_SECONDS - _TOKEN_REFRESH_BUFFER
    logger.debug(
        "Obtained installation token for installation_id=%s (expires in ~%ds)",
        installation_id,
        _TOKEN_TTL_SECONDS - _TOKEN_REFRESH_BUFFER,
    )
    return token, expiry


class GitHubAppTokenManager:
    """
    Caches installation access tokens per repository and refreshes them
    automatically before they expire.
    """

    def __init__(self) -> None:
        self._cache: dict[str, tuple[str, float]] = {}
        self._installation_id_cache: dict[str, int] = {}

    def is_configured(self) -> bool:
        return bool(settings.GITHUB_APP_ID and settings.GITHUB_APP_PRIVATE_KEY)

    async def get_token_for_repo(self, owner: str, repo: str) -> str:
        if not self.is_configured():
            raise ValueError(
                "GitHub App credentials (GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY) "
                "are not configured."
            )
        cache_key = f"{owner}/{repo}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            token, expiry = cached
            if time.monotonic() < expiry:
                return token
            logger.debug("Cached token for %s is expired, refreshing.", cache_key)
        token, expiry = await self._fetch_token(owner, repo)
        self._cache[cache_key] = (token, expiry)
        return token

    def invalidate(self, owner: str, repo: str) -> None:
        cache_key = f"{owner}/{repo}"
        self._cache.pop(cache_key, None)
        self._installation_id_cache.pop(cache_key, None)
        logger.debug("Invalidated token cache for %s", cache_key)

    async def _fetch_token(self, owner: str, repo: str) -> tuple[str, float]:
        cache_key = f"{owner}/{repo}"
        installation_id = self._installation_id_cache.get(cache_key)
        if installation_id is None:
            try:
                installation_id = await get_installation_id(owner, repo)
                self._installation_id_cache[cache_key] = installation_id
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 404:
                    raise ValueError(
                        f"GitHub App is not installed on {owner}/{repo}. "
                        "Install the app from your GitHub App settings page."
                    ) from exc
                raise
        return await get_installation_token(installation_id)


github_app_token_manager = GitHubAppTokenManager()
