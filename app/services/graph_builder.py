"""
GraphBuilder: Builds and queries the Neo4j code graph.

Nodes:   Repository, File, PullRequest, Developer, Issue
Edges:   CONTAINS, TOUCHES, AUTHORED_BY, CLOSES, CONTRIBUTED_TO

Called:
  - On repo connect:  build_repo_graph()
  - After PR review:  index_pr()
  - Before PR review: get_file_experts(), get_related_prs(), get_linked_issues()
"""
import logging
import httpx
from datetime import datetime, timezone

from app.core.neo4j_client import get_session, is_available

logger = logging.getLogger(__name__)

# Languages inferred from file extension
_EXT_LANG = {
    "py": "Python", "js": "JavaScript", "ts": "TypeScript",
    "tsx": "TypeScript", "jsx": "JavaScript", "java": "Java",
    "go": "Go", "rb": "Ruby", "rs": "Rust", "cpp": "C++",
    "c": "C", "cs": "C#", "php": "PHP", "swift": "Swift",
    "kt": "Kotlin", "scala": "Scala", "sh": "Shell",
    "yaml": "YAML", "yml": "YAML", "json": "JSON",
    "md": "Markdown", "html": "HTML", "css": "CSS",
    "sql": "SQL", "tf": "Terraform",
}


def _lang_from_path(path: str) -> str:
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    return _EXT_LANG.get(ext, "Other")


async def _fetch_file_tree(owner: str, repo: str, access_token: str) -> list[dict]:
    """
    Fetch the full recursive file tree from GitHub.
    GitHub caps the recursive tree at ~100k nodes; when truncated=true we fall back
    to indexing only the top-level directories (still useful for impact analysis).
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github.v3+json",
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        # Get repo metadata (default branch + size sanity check)
        r = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}",
            headers=headers,
        )
        r.raise_for_status()
        repo_data = r.json()
        default_branch = repo_data.get("default_branch", "main")
        repo_size_kb = repo_data.get("size", 0)

        if repo_size_kb > 500_000:  # >500 MB — likely a monorepo, warn but continue
            logger.warning(f"{owner}/{repo} is large ({repo_size_kb} KB), tree may be truncated")

        # Fetch recursive tree
        tree_r = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/git/trees/{default_branch}",
            headers=headers,
            params={"recursive": "1"},
        )
        tree_r.raise_for_status()
        data = tree_r.json()

        if data.get("truncated"):
            logger.warning(
                f"{owner}/{repo} tree was truncated by GitHub (>100k nodes). "
                "Only partial file set will be indexed."
            )

        blobs = [item for item in data.get("tree", []) if item.get("type") == "blob"]

        # Skip binary/generated files that aren't useful for analysis
        SKIP_DIRS = {"node_modules", ".git", "dist", "build", "__pycache__", ".next", "vendor"}
        filtered = [
            b for b in blobs
            if not any(part in SKIP_DIRS for part in b["path"].split("/"))
        ]
        logger.info(f"{owner}/{repo}: {len(blobs)} total blobs, {len(filtered)} after filtering")
        return filtered


# ---------------------------------------------------------------------------
# Write operations
# ---------------------------------------------------------------------------

async def build_repo_graph(owner: str, repo: str, access_token: str) -> int:
    """
    Called when a repo is connected.
    Creates :Repository and :File nodes, and CONTAINS edges.
    Returns number of files indexed.
    """
    if not is_available():
        return 0

    repo_full_name = f"{owner}/{repo}"
    logger.info(f"Building Neo4j graph for {repo_full_name}")

    try:
        blobs = await _fetch_file_tree(owner, repo, access_token)
    except Exception as e:
        logger.warning(f"File tree fetch failed for {repo_full_name}: {e}")
        return 0

    if not blobs:
        return 0

    try:
        async with get_session() as session:
            # Upsert Repository node
            await session.run(
                """
                MERGE (r:Repository {full_name: $full_name})
                SET r.scanned_at = $now
                """,
                full_name=repo_full_name,
                now=datetime.now(timezone.utc).isoformat(),
            )

            # Batch-upsert File nodes + CONTAINS edges (chunks of 200)
            total = 0
            CHUNK = 200
            for i in range(0, len(blobs), CHUNK):
                chunk = blobs[i : i + CHUNK]
                files_data = [
                    {
                        "path": b["path"],
                        "language": _lang_from_path(b["path"]),
                        "size": b.get("size", 0),
                    }
                    for b in chunk
                ]
                await session.run(
                    """
                    UNWIND $files AS f
                    MERGE (file:File {repo: $repo, path: f.path})
                    SET file.language = f.language, file.size = f.size
                    WITH file
                    MATCH (r:Repository {full_name: $repo})
                    MERGE (r)-[:CONTAINS]->(file)
                    """,
                    repo=repo_full_name,
                    files=files_data,
                )
                total += len(chunk)

        logger.info(f"Graph built for {repo_full_name}: {total} files indexed")
        return total

    except Exception as e:
        logger.error(f"build_repo_graph failed for {repo_full_name}: {e}")
        return 0


async def index_pr(
    repo_full_name: str,
    pr_number: int,
    title: str,
    author: str,
    files_changed: list[str],
    verdict: str,
    issue_numbers: list[int] | None = None,
) -> None:
    """
    Called after a PR review is posted.
    Creates PullRequest + Developer nodes and TOUCHES / AUTHORED_BY / CLOSES edges.
    """
    if not is_available():
        return

    try:
        async with get_session() as session:
            # Upsert PR node
            await session.run(
                """
                MERGE (pr:PullRequest {repo: $repo, number: $number})
                SET pr.title = $title,
                    pr.author = $author,
                    pr.verdict = $verdict,
                    pr.reviewed_at = $now
                """,
                repo=repo_full_name,
                number=pr_number,
                title=title,
                author=author,
                verdict=verdict,
                now=datetime.now(timezone.utc).isoformat(),
            )

            # Upsert Developer + AUTHORED_BY + CONTRIBUTED_TO
            if author:
                await session.run(
                    """
                    MERGE (d:Developer {login: $login})
                    WITH d
                    MATCH (pr:PullRequest {repo: $repo, number: $number})
                    MERGE (pr)-[:AUTHORED_BY]->(d)
                    WITH d
                    MATCH (r:Repository {full_name: $repo})
                    MERGE (d)-[:CONTRIBUTED_TO]->(r)
                    """,
                    login=author,
                    repo=repo_full_name,
                    number=pr_number,
                )

            # TOUCHES edges for changed files
            if files_changed:
                await session.run(
                    """
                    UNWIND $paths AS path
                    MATCH (pr:PullRequest {repo: $repo, number: $number})
                    MERGE (f:File {repo: $repo, path: path})
                    MERGE (pr)-[:TOUCHES]->(f)
                    """,
                    repo=repo_full_name,
                    number=pr_number,
                    paths=files_changed,
                )

            # CLOSES edges for linked issues
            for issue_num in (issue_numbers or []):
                await session.run(
                    """
                    MERGE (i:Issue {repo: $repo, number: $issue_num})
                    WITH i
                    MATCH (pr:PullRequest {repo: $repo, number: $pr_num})
                    MERGE (pr)-[:CLOSES]->(i)
                    """,
                    repo=repo_full_name,
                    issue_num=issue_num,
                    pr_num=pr_number,
                )

    except Exception as e:
        logger.error(f"index_pr failed for {repo_full_name}#{pr_number}: {e}")


# ---------------------------------------------------------------------------
# Query operations (used by context_service and pr_review_service)
# ---------------------------------------------------------------------------

async def get_file_experts(
    repo_full_name: str,
    file_paths: list[str],
    top_k: int = 5,
) -> list[dict]:
    """
    Returns developers who have most frequently touched the given files.
    Result: [{"login": str, "touch_count": int}]
    """
    if not is_available() or not file_paths:
        return []

    try:
        async with get_session() as session:
            result = await session.run(
                """
                UNWIND $paths AS path
                MATCH (pr:PullRequest {repo: $repo})-[:TOUCHES]->(f:File {repo: $repo, path: path})
                MATCH (pr)-[:AUTHORED_BY]->(d:Developer)
                RETURN d.login AS login, count(*) AS touch_count
                ORDER BY touch_count DESC
                LIMIT $top_k
                """,
                repo=repo_full_name,
                paths=file_paths,
                top_k=top_k,
            )
            return [{"login": r["login"], "touch_count": r["touch_count"]} async for r in result]
    except Exception as e:
        logger.error(f"get_file_experts failed: {e}")
        return []


async def get_related_prs(
    repo_full_name: str,
    file_paths: list[str],
    exclude_pr: int | None = None,
    top_k: int = 5,
) -> list[dict]:
    """
    Returns past PRs that touched the same files (structural similarity).
    Result: [{"number": int, "title": str, "author": str, "verdict": str}]
    """
    if not is_available() or not file_paths:
        return []

    try:
        async with get_session() as session:
            result = await session.run(
                """
                UNWIND $paths AS path
                MATCH (pr:PullRequest {repo: $repo})-[:TOUCHES]->(f:File {repo: $repo, path: path})
                WHERE ($exclude IS NULL OR pr.number <> $exclude)
                  AND pr.verdict IS NOT NULL
                WITH pr, count(DISTINCT f) AS overlap
                ORDER BY overlap DESC
                LIMIT $top_k
                RETURN pr.number AS number,
                       pr.title AS title,
                       pr.author AS author,
                       pr.verdict AS verdict,
                       overlap
                """,
                repo=repo_full_name,
                paths=file_paths,
                exclude=exclude_pr,
                top_k=top_k,
            )
            return [
                {
                    "number": r["number"],
                    "title": r["title"],
                    "author": r["author"],
                    "verdict": r["verdict"],
                    "overlap": r["overlap"],
                }
                async for r in result
            ]
    except Exception as e:
        logger.error(f"get_related_prs failed: {e}")
        return []


async def get_linked_issues(
    repo_full_name: str,
    issue_numbers: list[int],
) -> list[dict]:
    """
    Look up Issue nodes from the graph (populated when PRs that close them are indexed).
    Falls back to empty dicts for issues not yet in the graph.
    Result: [{"number": int, "closed_by": [pr_numbers]}]
    """
    if not is_available() or not issue_numbers:
        return []

    results = []
    try:
        async with get_session() as session:
            for num in issue_numbers:
                r = await session.run(
                    """
                    MATCH (i:Issue {repo: $repo, number: $num})
                    OPTIONAL MATCH (pr:PullRequest)-[:CLOSES]->(i)
                    RETURN i.number AS number,
                           collect(pr.number) AS closed_by
                    """,
                    repo=repo_full_name,
                    num=num,
                )
                record = await r.single()
                if record:
                    results.append({
                        "number": record["number"],
                        "closed_by": record["closed_by"],
                    })
                else:
                    results.append({"number": num, "closed_by": []})
    except Exception as e:
        logger.error(f"get_linked_issues failed: {e}")

    return results
