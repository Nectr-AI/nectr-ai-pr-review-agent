import asyncio
import base64
import time
import logging
import httpx
import subprocess
from collections import OrderedDict
from app.core.config import settings

logger = logging.getLogger(__name__)

PR_STATUS_CACHE_TTL = 60  # seconds
PR_STATUS_CACHE_MAX = 500  # max entries before eviction


def get_github_token() -> str:
    if settings.APP_ENV == "production":
        if settings.GITHUB_PAT:
            return settings.GITHUB_PAT.strip()
        raise ValueError("GITHUB_PAT is required in production.")

    try:
        result = subprocess.run(
            ["gh", "auth", "token"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    if settings.GITHUB_PAT:
        return settings.GITHUB_PAT.strip()

    raise ValueError("No GitHub token available. Set GITHUB_PAT or login with gh auth login.")


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

    async def get_pull_request(self, owner: str, repo: str, pr_number: int) -> dict:
        url = f"{self.base_url}/repos/{owner}/{repo}/pulls/{pr_number}"
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()

    async def get_pr_diff(self, owner: str, repo: str, pr_number: int) -> str:
        url = f"{self.base_url}/repos/{owner}/{repo}/pulls/{pr_number}"
        headers = {**self.headers, "Accept": "application/vnd.github.v3.diff"}
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response.text

    async def get_pr_files(self, owner: str, repo: str, pr_number: int) -> list:
        url = f"{self.base_url}/repos/{owner}/{repo}/pulls/{pr_number}/files"
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url, headers=self.headers)
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
            ttl = 300
        self._pr_status_cache[cache_key] = (status, time.monotonic() + ttl)
        self._pr_status_cache.move_to_end(cache_key)

        while len(self._pr_status_cache) > PR_STATUS_CACHE_MAX:
            self._pr_status_cache.popitem(last=False)

        return status

    async def get_repo_issues(
        self,
        owner: str,
        repo: str,
        state: str = "all",
        per_page: int = 50,
    ) -> list[dict]:
        url = f"{self.base_url}/repos/{owner}/{repo}/issues"
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(
                url,
                headers=self.headers,
                params={
                    "state": state,
                    "per_page": per_page,
                    "page": 1,
                    "sort": "updated",
                    "direction": "desc",
                },
            )
            response.raise_for_status()
            return [item for item in response.json() if "pull_request" not in item]

    async def get_repo_pull_requests(
        self,
        owner: str,
        repo: str,
        state: str = "closed",
        per_page: int = 50,
    ) -> list[dict]:
        url = f"{self.base_url}/repos/{owner}/{repo}/pulls"
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(
                url,
                headers=self.headers,
                params={
                    "state": state,
                    "per_page": per_page,
                    "page": 1,
                    "sort": "updated",
                    "direction": "desc",
                },
            )
            response.raise_for_status()
            return response.json()

    async def get_repo_languages(self, owner: str, repo: str) -> dict[str, int]:
        url = f"{self.base_url}/repos/{owner}/{repo}/languages"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()

    async def get_repo_contributors(
        self,
        owner: str,
        repo: str,
        per_page: int = 50,
    ) -> list[dict]:
        url = f"{self.base_url}/repos/{owner}/{repo}/contributors"
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(
                url,
                headers=self.headers,
                params={"per_page": per_page, "anon": "false"},
            )
            if response.status_code == 204:
                return []
            response.raise_for_status()
            return response.json()

    async def get_repo_stats_contributors(
        self,
        owner: str,
        repo: str,
        max_retries: int = 4,
    ) -> list[dict]:
        """
        Fetch per-contributor weekly commit/addition/deletion stats.
        Returns 202 while GitHub is computing; retries up to max_retries times.
        """
        url = f"{self.base_url}/repos/{owner}/{repo}/stats/contributors"
        for attempt in range(max_retries):
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=self.headers)
                if response.status_code == 204:
                    return []
                if response.status_code == 202:
                    await asyncio.sleep(1.5 * (attempt + 1))
                    continue
                response.raise_for_status()
                data = response.json()
                return data if isinstance(data, list) else []
        return []

    async def get_pr_files_list(
        self,
        owner: str,
        repo: str,
        pr_number: int,
    ) -> list[str]:
        files = await self.get_pr_files(owner, repo, pr_number)
        return [f.get("filename", "") for f in files if f.get("filename")]

    async def get_issue(
        self,
        owner: str,
        repo: str,
        issue_number: int,
    ) -> dict | None:
        url = f"{self.base_url}/repos/{owner}/{repo}/issues/{issue_number}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=self.headers)
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()

    async def get_file_content(
        self,
        owner: str,
        repo: str,
        path: str,
        ref: str,
        max_size: int = 100_000,
    ) -> str | None:
        url = f"{self.base_url}/repos/{owner}/{repo}/contents/{path}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers=self.headers, params={"ref": ref})
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            data = resp.json()
            if data.get("type") != "file" or data.get("size", 0) > max_size:
                return None
            try:
                return base64.b64decode(data.get("content", "")).decode("utf-8")
            except (UnicodeDecodeError, ValueError):
                return None

    async def post_pr_comment(
        self,
        owner: str,
        repo: str,
        pr_number: int,
        comment: str,
    ) -> dict:
        """Post a top-level comment on a PR (issue comment thread)."""
        url = f"{self.base_url}/repos/{owner}/{repo}/issues/{pr_number}/comments"
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=self.headers, json={"body": comment})
            response.raise_for_status()
            return response.json()

    async def post_pr_review(
        self,
        owner: str,
        repo: str,
        pr_number: int,
        commit_id: str,
        body: str,
        event: str = "COMMENT",
        comments: list[dict] | None = None,
    ) -> dict:
        """Submit a pull request review (summary + optional inline comments)."""
        url = f"{self.base_url}/repos/{owner}/{repo}/pulls/{pr_number}/reviews"
        payload = {
            "commit_id": commit_id,
            "body": body,
            "event": event,
            "comments": comments or [],
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=self.headers, json=payload)
            response.raise_for_status()
            return response.json()

    async def post_review_comment(
        self,
        owner: str,
        repo: str,
        pr_number: int,
        commit_id: str,
        path: str,
        line: int,
        body: str,
        side: str = "RIGHT",
    ) -> dict:
        """Post a single inline review comment on a specific diff line."""
        url = f"{self.base_url}/repos/{owner}/{repo}/pulls/{pr_number}/comments"
        payload = {
            "body": body,
            "commit_id": commit_id,
            "path": path,
            "line": line,
            "side": side,
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=self.headers, json=payload)
            response.raise_for_status()
            return response.json()


github_client = GithubClient()
