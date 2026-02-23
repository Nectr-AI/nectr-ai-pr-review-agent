import httpx
from app.core.config import settings

class GithubClient:
    def __init__(self):
        self.base_url = "https://api.github.com"
        self.headers = {
            "Authorization": f"Bearer {settings.GITHUB_PAT}",
            "Accept": "application/vnd.github.v3+json",
        }
    
    async def get_pull_request(self, owner: str,repo: str,pr_number: int) -> dict:
        url = f"{self.base_url}/repos/{owner}/{repo}/pulls/{pr_number}"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers = self.headers)
            response.raise_for_status()
            return response.json()
    
    async def get_pr_diff(self,owner: str, repo:str, pr_number:int) -> str:
        url = f"{self.base_url}/repos/{owner}/{repo}/pulls/{pr_number}"
        headers = {**self.headers, "Accept": "application/vnd.github.v3.diff"}
        async with httpx.AsyncClient() as client:
            response = await client.get(url,headers = headers)
            response.raise_for_status()
            return response.text
        
    async def get_pr_files(self, owner: str, repo:str, pr_number:int) -> list:
        url = f"{self.base_url}/repos/{owner}/{repo}/pulls/{pr_number}/files"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers = self.headers)
            response.raise_for_status()
            return response.json()

    async def post_pr_comment(self,owner:str,repo:str,pr_number:int,comment:str)->dict:
        url = f"{self.base_url}/repos/{owner}/{repo}/issues/{pr_number}/comments"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers = self.headers,
                json = {"body": comment},
            )
            response.raise_for_status()
            return response.json()

github_client = GithubClient()



