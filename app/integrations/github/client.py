import httpx
import subprocess
from app.core.config import settings


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
        token = get_github_token()
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
        }
    
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



