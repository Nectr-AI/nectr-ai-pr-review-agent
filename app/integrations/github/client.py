import time
import httpx
import subprocess
from collections import OrderedDict
from app.core.config import settings

PR_STATUS_CACHE_TTL = 60  # seconds
PR_STATUS_CACHE_MAX = 500  # max entries before eviction


def get_github_token() -> str:
    """
    Get the best available GitHub token.
    Priority: 1) GITHUB_PAT from .env  2) gh CLI auth token
    The gh CLI token has full OAuth scopes and always works.
    """
    if settings.APP_ENV == "production":
        if settings.GITHUB_PAT:
            return settings.GITHUB_PAT.strip()
        raise ValueError("GITHUB_PAT is required in production.")

    # Try gh CLI token first (has full permissions)
    try:
        result = subprocess.run(
            ["gh", "auth", "token"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Fallback to PAT from .env
    if settings.GITHUB_PAT:
        return settings.GITHUB_PAT.strip()

    raise ValueError("No GitHub token available. Set GITHUB_PAT or login with 'gh auth login'.")


class GithubClient:
    def __init__(self):
        self.base_url = "https://api.github.com"
        self._headers = None
        self._pr_status_cache: OrderedDict[str, tuple[str, float]] = OrderedDict()

    @property
    def headers(self):
        if self._headers is None:
            token = get_github_token()
            self._headers = {
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github.v3+json",
            }
        return self._headers
    
    async def get_pull_request(self, owner: str,repo: str,pr_number: int) -> dict:
        url = f"{self.base_url}/repos/{owner}/{repo}/pulls/{pr_number}"
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url, headers = self.headers)
            response.raise_for_status()
            return response.json()
    
    async def get_pr_diff(self,owner: str, repo:str, pr_number:int) -> str:
        url = f"{self.base_url}/repos/{owner}/{repo}/pulls/{pr_number}"
        headers = {**self.headers, "Accept": "application/vnd.github.v3.diff"}
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url,headers = headers)
            response.raise_for_status()
            return response.text
        
    async def get_pr_files(self, owner: str, repo:str, pr_number:int) -> list:
        url = f"{self.base_url}/repos/{owner}/{repo}/pulls/{pr_number}/files"
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url, headers = self.headers)
            response.raise_for_status()
            return response.json()

    async def get_pr_state(self, owner: str, repo: str, pr_number: int) -> str:
        """Fetch current PR state from GitHub with bounded LRU + TTL cache."""
        cache_key = f"{owner}/{repo}#{pr_number}"
        cached = self._pr_status_cache.get(cache_key)
        if cached and cached[1] > time.monotonic():
            self._pr_status_cache.move_to_end(cache_key)
            return cached[0]

        pr = await self.get_pull_request(owner, repo, pr_number)
        status = "merged" if pr.get("merged") else pr.get("state", "open")

        ttl = PR_STATUS_CACHE_TTL
        if status in ("merged", "closed"):
            ttl = 300  # terminal states change rarely, cache longer
        self._pr_status_cache[cache_key] = (status, time.monotonic() + ttl)
        self._pr_status_cache.move_to_end(cache_key)

        while len(self._pr_status_cache) > PR_STATUS_CACHE_MAX:
            self._pr_status_cache.popitem(last=False)

        return status

    async def post_pr_comment(self,owner:str,repo:str,pr_number:int,comment:str)->dict:
        url = f"{self.base_url}/repos/{owner}/{repo}/issues/{pr_number}/comments"
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                url,
                headers = self.headers,
                json = {"body": comment},
            )
            response.raise_for_status()
            return response.json()

github_client = GithubClient()



