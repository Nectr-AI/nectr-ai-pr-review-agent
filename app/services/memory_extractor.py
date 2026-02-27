"""
MemoryExtractor: After each completed PR review, uses Claude to extract
structured memories (patterns, decisions, developer insights) and stores them in Mem0.
"""

import json
import logging
import re

from anthropic import AsyncAnthropic

from app.core.config import settings
from app.services.memory_adapter import memory_adapter

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """Given this completed PR review, extract any learnings as structured memories.
Output each memory as a JSON object on its own line. Only output valid JSON lines, no other text.

Format per line: {"memory_type": "...", "title": "...", "content": "...", "developer": "..."}

memory_type must be one of:
- project_pattern: Architectural patterns confirmed by this PR
- decision: Approaches approved or rejected (include PR number in content)
- developer_pattern: Recurring issues for this developer
- developer_strength: Things this developer does well
- risk_module: Files that appear fragile or security-critical

Only extract 1-4 memories. Skip if nothing meaningful to learn.
Be concise. Each content: 1-2 sentences max.

PR #{pr_number} by {author} on {repo}
Title: {title}
Files changed: {files}

Review:
{review}
"""


async def extract_and_store(
    repo_full_name: str,
    pr_number: int,
    author: str,
    title: str,
    files: list[dict],
    review_summary: str,
) -> int:
    """
    Extract memories from a completed review and store in Mem0.
    Returns number of memories stored.
    """
    if not memory_adapter.is_available():
        return 0

    file_list = ", ".join(f.get("filename", "?") for f in (files or [])[:15])
    prompt = EXTRACTION_PROMPT.format(
        pr_number=pr_number,
        author=author,
        repo=repo_full_name,
        title=title or "N/A",
        files=file_list,
        review=review_summary[:3000],
    )

    try:
        client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        msg = await client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}],
        )
        response_text = msg.content[0].text
    except Exception as e:
        logger.error(f"Memory extraction failed: {e}")
        return 0

    stored = 0
    for line in response_text.strip().split("\n"):
        line = line.strip()
        # Handle markdown code blocks
        if line.startswith("```"):
            continue
        if not line or not re.match(r"^\s*\{", line):
            continue
        try:
            obj = json.loads(line)
            memory_type = obj.get("memory_type", "")
            if memory_type not in (
                "project_pattern",
                "decision",
                "developer_pattern",
                "developer_strength",
                "risk_module",
            ):
                continue
            title_val = obj.get("title", "Learning")
            content = obj.get("content", "")
            developer = obj.get("developer") or author
            if not content:
                continue

            full_content = f"{title_val}: {content}"
            await memory_adapter.add_memory(
                repo=repo_full_name,
                content=full_content,
                memory_type=memory_type,
                developer=developer if memory_type.startswith("developer") else None,
                metadata={"source_pr": pr_number},
            )
            stored += 1
        except json.JSONDecodeError:
            continue

    if stored > 0:
        logger.info(f"Extracted {stored} memories from {repo_full_name}#{pr_number}")
    return stored
