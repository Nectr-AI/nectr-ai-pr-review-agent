"""
ProjectScanner: Scans a repo when first connected, fetches key files via
the GitHub API, sends them to Claude for analysis, and stores the resulting
project-map memories in Mem0 so every future PR review has codebase context.
"""

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


async def scan_repo(owner: str, repo: str, access_token: str) -> bool:
    """
    Scan repo, analyze with AI, store project_map memories in Mem0.
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
    return stored > 0
