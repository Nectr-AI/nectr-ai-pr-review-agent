"""
ProjectScanner: Scans a repo when user connects, fetches key files via GitHub API,
sends to AI for analysis, stores project_map memories in Mem0.
"""

import asyncio
import base64
import json
import logging
from dataclasses import dataclass

import httpx
from anthropic import AsyncAnthropic

from app.core.config import settings
from app.services.memory_adapter import memory_adapter

logger = logging.getLogger(__name__)

KEY_FILES = [
    "README.md",
    "CONTRIBUTING.md",
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "tsconfig.json",
    "Dockerfile",
    "docker-compose.yml",
    ".env.example",
]
MAX_FILE_SIZE = 15000  # chars per file
MAX_TOTAL_CONTEXT = 40000  # total chars for AI


@dataclass
class RepoInfo:
    description: str
    default_branch: str
    languages: dict
    files: dict[str, str]  # path -> content (truncated)


async def _fetch_repo_info(owner: str, repo: str, access_token: str) -> RepoInfo | None:
    """Fetch repo metadata and key file contents from GitHub API."""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github.v3+json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # Repo metadata
            r = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}",
                headers=headers,
            )
            r.raise_for_status()
            repo_data = r.json()

            # Languages
            lang_r = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/languages",
                headers=headers,
            )
            languages = lang_r.json() if lang_r.status_code == 200 else {}

            # Fetch key files
            files: dict[str, str] = {}
            for path in KEY_FILES:
                try:
                    fr = await client.get(
                        f"https://api.github.com/repos/{owner}/{repo}/contents/{path}",
                        headers=headers,
                    )
                    if fr.status_code != 200:
                        continue
                    data = fr.json()
                    if isinstance(data, dict) and data.get("content"):
                        content = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
                        files[path] = content[:MAX_FILE_SIZE]
                        if len(content) > MAX_FILE_SIZE:
                            files[path] += "\n... (truncated)"
                except Exception as e:
                    logger.debug(f"Could not fetch {path}: {e}")

            return RepoInfo(
                description=repo_data.get("description") or "",
                default_branch=repo_data.get("default_branch", "main"),
                languages=languages,
                files=files,
            )
        except Exception as e:
            logger.error(f"Failed to fetch repo info for {owner}/{repo}: {e}")
            return None


async def _fetch_issues_for_memory(
    owner: str, repo: str, access_token: str,
) -> list[dict]:
    """Fetch last 50 issues (excludes PRs) for Mem0 storage."""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github.v3+json",
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/issues",
            headers=headers,
            params={"state": "all", "per_page": 50, "sort": "updated"},
        )
        if resp.status_code != 200:
            return []
        results = []
        for item in resp.json():
            if "pull_request" in item:
                continue
            results.append({
                "number": item["number"],
                "title": item.get("title", ""),
                "body": (item.get("body") or "")[:500],
                "state": item.get("state", "open"),
                "labels": [l["name"] for l in item.get("labels", [])],
                "assignees": [a["login"] for a in item.get("assignees", [])],
                "html_url": item.get("html_url", ""),
            })
        return results


async def _fetch_prs_for_memory(
    owner: str, repo: str, access_token: str,
) -> list[dict]:
    """Fetch last 50 closed/merged PRs with file lists (top 10 only)."""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github.v3+json",
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/pulls",
            headers=headers,
            params={"state": "closed", "per_page": 50, "sort": "updated"},
        )
        if resp.status_code != 200:
            return []
        results = []
        for i, item in enumerate(resp.json()):
            files: list[str] = []
            if i < 10:
                try:
                    fr = await client.get(
                        f"https://api.github.com/repos/{owner}/{repo}/pulls/{item['number']}/files",
                        headers=headers,
                        params={"per_page": 30},
                    )
                    if fr.status_code == 200:
                        files = [f["filename"] for f in fr.json()]
                except Exception:
                    pass
            results.append({
                "number": item["number"],
                "title": item.get("title", ""),
                "body": (item.get("body") or "")[:500],
                "state": "merged" if item.get("merged_at") else "closed",
                "author": (item.get("user") or {}).get("login", ""),
                "labels": [l["name"] for l in item.get("labels", [])],
                "html_url": item.get("html_url", ""),
                "files": files,
            })
        return results


async def _fetch_contributors_for_memory(
    owner: str, repo: str, access_token: str,
) -> list[dict]:
    """Fetch top contributors with commit counts."""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github.v3+json",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/contributors",
            headers=headers,
            params={"per_page": 50},
        )
        if resp.status_code in (204, 404):
            return []
        if resp.status_code != 200:
            return []
        return [
            {
                "login": c["login"],
                "contributions": c["contributions"],
                "html_url": c.get("html_url", ""),
            }
            for c in resp.json()
        ]


async def scan_repo_history(
    owner: str, repo: str, access_token: str,
) -> int:
    """
    Fetch historical issues, PRs, and contributors and store as
    issue_context, pr_history, and contributor_profile memories.
    Called from scan_repo after the project_map scan.
    Returns number of memories stored.
    """
    if not memory_adapter.is_available():
        return 0

    repo_full_name = f"{owner}/{repo}"
    logger.info(f"Starting repo history scan for {repo_full_name}")

    results = await asyncio.gather(
        _fetch_issues_for_memory(owner, repo, access_token),
        _fetch_prs_for_memory(owner, repo, access_token),
        _fetch_contributors_for_memory(owner, repo, access_token),
        return_exceptions=True,
    )
    issues = results[0] if not isinstance(results[0], Exception) else []
    prs = results[1] if not isinstance(results[1], Exception) else []
    contributors = results[2] if not isinstance(results[2], Exception) else []

    if isinstance(results[0], Exception):
        logger.warning(f"Issue fetch failed: {results[0]}")
    if isinstance(results[1], Exception):
        logger.warning(f"PR fetch failed: {results[1]}")
    if isinstance(results[2], Exception):
        logger.warning(f"Contributor fetch failed: {results[2]}")

    stored = 0
    BATCH_SIZE = 10  # store in batches to avoid Mem0 rate limits

    # --- Issues ---
    for batch_start in range(0, len(issues), BATCH_SIZE):
        batch = issues[batch_start : batch_start + BATCH_SIZE]
        coros = []
        for issue in batch:
            label_str = ", ".join(issue["labels"]) if issue["labels"] else "none"
            assignee_str = ", ".join(issue["assignees"]) if issue["assignees"] else "unassigned"
            content = (
                f"Issue #{issue['number']} ({issue['state']}): {issue['title']}. "
                f"Labels: {label_str}. Assignees: {assignee_str}. "
                f"Details: {issue['body']}"
            )
            coros.append(memory_adapter.add_memory(
                repo=repo_full_name,
                content=content,
                memory_type="issue_context",
                metadata={
                    "issue_number": issue["number"],
                    "issue_state": issue["state"],
                    "labels": issue["labels"],
                    "html_url": issue["html_url"],
                },
            ))
        results = await asyncio.gather(*coros, return_exceptions=True)
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                logger.warning(f"Failed to store issue_context memory: {r}")
            else:
                stored += 1

    # --- PRs ---
    for batch_start in range(0, len(prs), BATCH_SIZE):
        batch = prs[batch_start : batch_start + BATCH_SIZE]
        coros = []
        for pr in batch:
            file_str = ", ".join(pr["files"][:10]) if pr["files"] else "unknown"
            content = (
                f"Past PR #{pr['number']} ({pr['state']}) by {pr['author']}: {pr['title']}. "
                f"Files: {file_str}. "
                f"Labels: {', '.join(pr['labels']) or 'none'}. "
                f"Summary: {pr['body']}"
            )
            coros.append(memory_adapter.add_memory(
                repo=repo_full_name,
                content=content,
                memory_type="pr_history",
                metadata={
                    "pr_number": pr["number"],
                    "pr_state": pr["state"],
                    "author": pr["author"],
                    "files_changed": pr["files"],
                    "html_url": pr["html_url"],
                },
            ))
        results = await asyncio.gather(*coros, return_exceptions=True)
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                logger.warning(f"Failed to store pr_history memory: {r}")
            else:
                stored += 1

    # --- Contributors ---
    for batch_start in range(0, len(contributors), BATCH_SIZE):
        batch = contributors[batch_start : batch_start + BATCH_SIZE]
        coros = []
        for contributor in batch:
            username = contributor["login"]
            content = (
                f"Contributor {username} has made {contributor['contributions']} commits "
                f"to {repo_full_name}. Profile: {contributor['html_url']}."
            )
            coros.append(memory_adapter.add_memory(
                repo=repo_full_name,
                content=content,
                memory_type="contributor_profile",
                developer=username,
                metadata={
                    "username": username,
                    "commit_count": contributor["contributions"],
                    "source": "initial_scan",
                },
            ))
        results = await asyncio.gather(*coros, return_exceptions=True)
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                logger.warning(f"Failed to store contributor_profile memory: {r}")
            else:
                stored += 1

    logger.info(f"Repo history scan complete for {repo_full_name}: {stored} memories stored")
    return stored


async def scan_repo(owner: str, repo: str, access_token: str) -> bool:
    """
    Scan repo, analyze with AI, store project_map memories.
    Returns True on success.
    """
    if not memory_adapter.is_available():
        logger.info("Mem0 not configured, skipping project scan")
        return False

    repo_full_name = f"{owner}/{repo}"
    logger.info(f"Starting project scan for {repo_full_name}")

    info = await _fetch_repo_info(owner, repo, access_token)
    if not info:
        return False

    # Build context for AI
    context_parts = [
        f"Repository: {repo_full_name}",
        f"Description: {info.description}",
        f"Default branch: {info.default_branch}",
        f"Languages: {json.dumps(info.languages)}",
        "",
        "--- Key files ---",
    ]
    total_len = 0
    for path, content in info.files.items():
        block = f"\n### {path}\n{content}\n"
        if total_len + len(block) > MAX_TOTAL_CONTEXT:
            break
        context_parts.append(block)
        total_len += len(block)

    context = "\n".join(context_parts)

    # AI analysis
    try:
        client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        prompt = f"""Analyze this repo and produce a structured project map. Output 3-6 concise memories, each as a standalone JSON object on its own line:
{{"type": "project_map", "title": "...", "content": "..."}}

Types to extract:
- tech_stack: Languages, frameworks, build tools, DB, auth
- architecture: Layering, patterns (service layer, repository, etc.)
- conventions: Naming, error handling, imports, testing style
- structure: Key directories and their purpose
- risk_areas: Auth, DB, external APIs, config

Be concise. Each content should be 2-5 sentences max.

Repo context:
{context}
"""
        msg = await client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        response_text = msg.content[0].text
    except Exception as e:
        logger.error(f"AI analysis failed for {repo_full_name}: {e}")
        return False

    # Parse and store memories
    stored = 0
    for line in response_text.strip().split("\n"):
        line = line.strip()
        if not line or not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
            title = obj.get("title", "Project context")
            content = obj.get("content", "")
            if not content:
                continue
            await memory_adapter.add_memory(
                repo=repo_full_name,
                content=f"{title}: {content}",
                memory_type="project_map",
                metadata={"chunk": title},
            )
            stored += 1
        except json.JSONDecodeError:
            continue

    logger.info(f"Project scan complete for {repo_full_name}: stored {stored} memories")

    # Run history scan (issues, PRs, contributors) after project_map
    try:
        await scan_repo_history(owner, repo, access_token)
    except Exception as e:
        logger.warning(f"Repo history scan failed (non-fatal): {e}")

    return stored > 0
