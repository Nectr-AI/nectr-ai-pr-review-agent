"""
GraphBuilder: Builds and queries the Neo4j code graph.

Nodes:   Repository, File, PullRequest, Developer, Issue
Edges:   CONTAINS, TOUCHES, AUTHORED_BY, CLOSES, CONTRIBUTED_TO, IMPORTS

Called:
  - On repo connect:  build_repo_graph()
  - After PR review:  index_pr()
  - Before PR review: get_file_experts(), get_related_prs(), get_linked_issues()
  - For review agent: get_file_dependents()
"""
import asyncio
import logging
import re
import httpx
from datetime import datetime, timezone
from pathlib import PurePosixPath

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


# ---------------------------------------------------------------------------
# Import parsing helpers — extract IMPORTS edges from source code
# ---------------------------------------------------------------------------

# Languages we attempt to parse imports for
_IMPORT_LANGS = {"TypeScript", "JavaScript", "Python"}

# Skip test/generated directories — they add noise without signal
_IMPORT_SKIP_DIRS = {
    "node_modules", ".git", "dist", "build", "__pycache__", ".next",
    "vendor", "test", "tests", "spec", "specs", "__tests__", "fixtures",
    "mocks", "__mocks__", "coverage",
}

# TS/JS: capture the string after `from`, `import`, or `require(`
_TS_IMPORT_RE = re.compile(
    r"""(?:import|from)\s+['"]([./][^'"]+)['"]"""
    r"""|require\s*\(\s*['"]([./][^'"]+)['"]\s*\)""",
    re.MULTILINE,
)

# Python: only relative imports — `from .x import` or `from ..x import`
_PY_IMPORT_RE = re.compile(
    r"""from\s+(\.+[\w.]*)\s+import|import\s+(\.+[\w.]*)""",
    re.MULTILINE,
)


def _resolve_import(base_dir: str, raw_import: str, path_set: set[str]) -> str | None:
    """
    Resolve a relative import string (e.g. './utils', '../lib/db') from
    `base_dir` to an absolute repo path using the known `path_set`.

    Tries common JS/TS extension suffixes and index files.
    Returns the matched repo-relative path or None if not found.
    """
    try:
        resolved = str(PurePosixPath(base_dir) / raw_import)
        # Normalise `..` segments
        resolved = str(PurePosixPath(resolved))
    except Exception:
        return None

    candidates = [
        resolved,
        resolved + ".ts",
        resolved + ".tsx",
        resolved + ".js",
        resolved + ".jsx",
        resolved + ".py",
        resolved + "/index.ts",
        resolved + "/index.tsx",
        resolved + "/index.js",
        resolved + "/index.jsx",
        resolved + "/__init__.py",
    ]
    for c in candidates:
        if c in path_set:
            return c
    return None


def _parse_imports(content: str, file_path: str, lang: str, path_set: set[str]) -> list[str]:
    """
    Extract absolute import targets for `file_path` from its source `content`.
    Returns a list of repo-relative target paths that exist in `path_set`.
    """
    base_dir = str(PurePosixPath(file_path).parent)
    targets: list[str] = []

    if lang in ("TypeScript", "JavaScript"):
        for m in _TS_IMPORT_RE.finditer(content):
            raw = m.group(1) or m.group(2)
            if raw:
                resolved = _resolve_import(base_dir, raw, path_set)
                if resolved and resolved != file_path:
                    targets.append(resolved)

    elif lang == "Python":
        for m in _PY_IMPORT_RE.finditer(content):
            raw = m.group(1) or m.group(2)
            if not raw:
                continue
            # Convert Python relative notation to path: `..utils` → `../utils`
            dots = len(raw) - len(raw.lstrip("."))
            module = raw.lstrip(".")
            prefix = "../" * (dots - 1) if dots > 1 else "./"
            raw_path = prefix + module.replace(".", "/")
            resolved = _resolve_import(base_dir, raw_path, path_set)
            if resolved and resolved != file_path:
                targets.append(resolved)

    # Deduplicate preserving order
    seen: set[str] = set()
    unique: list[str] = []
    for t in targets:
        if t not in seen:
            seen.add(t)
            unique.append(t)
    return unique


async def _build_import_edges(
    owner: str,
    repo: str,
    access_token: str,
    blobs: list[dict],
    repo_full_name: str,
) -> None:
    """
    Background task: fetch source file content, parse imports, write IMPORTS
    edges to Neo4j.  Failures are fully swallowed — this is best-effort enrichment.

    Strategy:
    - Only process JS/TS/Python source files that are ≤ 100 KB
    - Skip test/generated directories
    - Limit to 200 files to stay well within GitHub rate limits (5 000 req/hr)
    - 8 concurrent GitHub API requests via semaphore
    """
    if not is_available():
        return

    SOURCE_EXTS = {"js", "ts", "tsx", "jsx", "py"}
    MAX_SIZE    = 100_000   # bytes — skip large generated files
    MAX_FILES   = 200
    SEMAPHORE   = 8

    # Build candidate list
    path_set = {b["path"] for b in blobs}
    candidates = [
        b for b in blobs
        if (
            b["path"].rsplit(".", 1)[-1].lower() in SOURCE_EXTS
            and not any(part in _IMPORT_SKIP_DIRS for part in b["path"].split("/"))
            and (b.get("size") or 0) <= MAX_SIZE
        )
    ][:MAX_FILES]

    if not candidates:
        logger.debug(f"_build_import_edges: no candidates for {repo_full_name}")
        return

    logger.info(f"_build_import_edges: parsing imports for {len(candidates)} files in {repo_full_name}")

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github.v3.raw",
    }
    sem = asyncio.Semaphore(SEMAPHORE)

    async def fetch_content(client: httpx.AsyncClient, path: str) -> str | None:
        async with sem:
            try:
                r = await client.get(
                    f"https://api.github.com/repos/{owner}/{repo}/contents/{path}",
                    headers={**headers, "Accept": "application/vnd.github.v3.raw"},
                    timeout=15.0,
                )
                if r.status_code == 200:
                    return r.text
            except Exception as exc:
                logger.debug(f"content fetch failed for {path}: {exc}")
            return None

    # Collect all (source_path, target_path) pairs
    import_pairs: list[tuple[str, str]] = []

    async with httpx.AsyncClient(timeout=20.0) as client:
        tasks = [fetch_content(client, b["path"]) for b in candidates]
        contents = await asyncio.gather(*tasks, return_exceptions=True)

    for blob, content in zip(candidates, contents):
        if not isinstance(content, str) or not content.strip():
            continue
        lang = _lang_from_path(blob["path"])
        targets = _parse_imports(content, blob["path"], lang, path_set)
        for t in targets:
            import_pairs.append((blob["path"], t))

    if not import_pairs:
        logger.info(f"_build_import_edges: no import edges found for {repo_full_name}")
        return

    logger.info(f"_build_import_edges: writing {len(import_pairs)} IMPORTS edges for {repo_full_name}")

    try:
        CHUNK = 300
        async with get_session() as session:
            for i in range(0, len(import_pairs), CHUNK):
                chunk = import_pairs[i : i + CHUNK]
                edges_data = [{"src": s, "dst": d} for s, d in chunk]
                await session.run(
                    """
                    UNWIND $edges AS e
                    MATCH (src:File {repo: $repo, path: e.src})
                    MATCH (dst:File {repo: $repo, path: e.dst})
                    MERGE (src)-[:IMPORTS]->(dst)
                    """,
                    repo=repo_full_name,
                    edges=edges_data,
                )
    except Exception as exc:
        logger.warning(f"_build_import_edges Neo4j write failed for {repo_full_name}: {exc}")


async def _fetch_file_tree(owner: str, repo: str, access_token: str) -> list[dict]:
    """
    Fetch the full recursive file tree from GitHub.
    GitHub caps the recursive tree at ~100k nodes; when truncated=true we log a
    warning but continue with the partial set.
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

        # Skip binary/generated directories that aren't useful for analysis
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

async def build_repo_graph(owner: str, repo: str, access_token: str, raise_on_error: bool = False) -> int:
    """
    Called when a repo is connected (or on rescan).
    Creates :Repository and :File nodes + CONTAINS edges.
    Removes stale File nodes (files deleted from the repo since last scan).
    Returns number of files indexed.

    If raise_on_error=True, exceptions propagate to the caller (used by rescan endpoint
    so the real error is surfaced in the HTTP response instead of silently returning 0).
    """
    if not is_available():
        if raise_on_error:
            raise RuntimeError("Neo4j is not available")
        return 0

    repo_full_name = f"{owner}/{repo}"
    logger.info(f"Building Neo4j graph for {repo_full_name}")

    try:
        blobs = await _fetch_file_tree(owner, repo, access_token)
    except Exception as e:
        logger.warning(f"File tree fetch failed for {repo_full_name}: {e}")
        if raise_on_error:
            raise RuntimeError(f"GitHub API error fetching file tree: {e}") from e
        return 0

    if not blobs:
        logger.warning(f"No blobs returned for {repo_full_name} — empty repo or token lacks repo scope")
        if raise_on_error:
            raise RuntimeError(
                "GitHub returned 0 files. Check that your OAuth token has 'repo' scope "
                "and that the repository is not empty."
            )
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
                    MERGE (r:Repository {full_name: $repo})
                    MERGE (r)-[:CONTAINS]->(file)
                    """,
                    repo=repo_full_name,
                    files=files_data,
                )
                total += len(chunk)

            # Remove stale File nodes (files no longer in the repo tree).
            current_paths = [b["path"] for b in blobs]
            deleted = await session.run(
                """
                MATCH (r:Repository {full_name: $repo})-[:CONTAINS]->(f:File)
                WHERE NOT f.path IN $paths
                WITH f, count(f) AS n
                DETACH DELETE f
                RETURN n
                """,
                repo=repo_full_name,
                paths=current_paths,
            )
            summary = await deleted.consume()
            if summary.counters.nodes_deleted:
                logger.info(
                    f"Removed {summary.counters.nodes_deleted} stale file node(s) "
                    f"from {repo_full_name}"
                )

        logger.info(f"Graph built for {repo_full_name}: {total} files indexed")

        # Kick off import-edge parsing as a background task.
        # This is best-effort: failures here are fully swallowed and
        # never affect the HTTP response or the rescan endpoint.
        asyncio.create_task(
            _build_import_edges(owner, repo, access_token, blobs, repo_full_name)
        )

        return total

    except Exception as e:
        logger.error(f"build_repo_graph Neo4j write failed for {repo_full_name}: {e}")
        if raise_on_error:
            raise RuntimeError(f"Neo4j write failed: {e}") from e
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

            # FIX: Use MERGE (not MATCH) for Repository so CONTRIBUTED_TO is never
            # silently dropped when index_pr() races ahead of build_repo_graph().
            if author:
                await session.run(
                    """
                    MERGE (d:Developer {login: $login})
                    WITH d
                    MATCH (pr:PullRequest {repo: $repo, number: $number})
                    MERGE (pr)-[:AUTHORED_BY]->(d)
                    WITH d
                    MERGE (r:Repository {full_name: $repo})
                    MERGE (d)-[:CONTRIBUTED_TO]->(r)
                    """,
                    login=author,
                    repo=repo_full_name,
                    number=pr_number,
                )

            # TOUCHES edges for changed files.
            # FIX: Set language on MERGEd File nodes so they are never "hollow"
            # (missing language/size) even if build_repo_graph hasn't run yet.
            if files_changed:
                files_data = [
                    {"path": p, "language": _lang_from_path(p)}
                    for p in files_changed
                ]
                await session.run(
                    """
                    UNWIND $files AS f
                    MATCH (pr:PullRequest {repo: $repo, number: $number})
                    MERGE (file:File {repo: $repo, path: f.path})
                    ON CREATE SET file.language = f.language
                    MERGE (pr)-[:TOUCHES]->(file)
                    """,
                    repo=repo_full_name,
                    number=pr_number,
                    files=files_data,
                )

            # CLOSES edges — batch with UNWIND to avoid N+1 per issue
            if issue_numbers:
                await session.run(
                    """
                    UNWIND $issue_nums AS issue_num
                    MERGE (i:Issue {repo: $repo, number: issue_num})
                    WITH i, issue_num
                    MATCH (pr:PullRequest {repo: $repo, number: $pr_num})
                    MERGE (pr)-[:CLOSES]->(i)
                    """,
                    repo=repo_full_name,
                    issue_nums=issue_numbers,
                    pr_num=pr_number,
                )

    except Exception as e:
        logger.error(f"index_pr failed for {repo_full_name}#{pr_number}: {e}")


# ---------------------------------------------------------------------------
# Query operations (used by context_service and pr_review_service)
# ---------------------------------------------------------------------------

async def get_repo_files(repo_full_name: str) -> list[dict]:
    """
    Returns all File nodes for a repo from Neo4j, enriched with PR touch counts.
    Used by the repo map endpoint to power the codebase visualisation.
    Result: [{"path": str, "language": str, "size": int, "pr_count": int}]
    """
    if not is_available():
        return []

    try:
        async with get_session() as session:
            result = await session.run(
                """
                MATCH (r:Repository {full_name: $repo})-[:CONTAINS]->(f:File)
                OPTIONAL MATCH (pr:PullRequest)-[:TOUCHES]->(f)
                RETURN f.path      AS path,
                       f.language  AS language,
                       f.size      AS size,
                       count(pr)   AS pr_count
                ORDER BY f.path
                """,
                repo=repo_full_name,
            )
            records = await result.data()
            return [
                {
                    "path":     r["path"],
                    "language": r["language"] or "Other",
                    "size":     r["size"] or 0,
                    "pr_count": r["pr_count"] or 0,
                }
                for r in records
            ]
    except Exception as e:
        logger.error(f"get_repo_files failed for {repo_full_name}: {e}")
        return []


async def get_repo_graph_nodes(repo_full_name: str, limit: int = 700) -> list[dict]:
    """
    Returns file nodes for the force-directed graph view.
    Each node carries its language and PR touch count (used for sizing + glow).
    Result: [{"id": str, "language": str, "pr_count": int}]
    """
    if not is_available():
        return []

    try:
        async with get_session() as session:
            result = await session.run(
                """
                MATCH (r:Repository {full_name: $repo})-[:CONTAINS]->(f:File)
                OPTIONAL MATCH (pr:PullRequest)-[:TOUCHES]->(f)
                WITH f, count(DISTINCT pr) AS pr_count
                RETURN f.path     AS id,
                       f.language AS language,
                       pr_count
                ORDER BY pr_count DESC
                LIMIT $limit
                """,
                repo=repo_full_name,
                limit=limit,
            )
            records = await result.data()
            return [
                {
                    "id":       r["id"],
                    "language": r["language"] or "Other",
                    "pr_count": r["pr_count"] or 0,
                }
                for r in records
            ]
    except Exception as e:
        logger.error(f"get_repo_graph_nodes failed for {repo_full_name}: {e}")
        return []


async def get_repo_graph_edges(repo_full_name: str, limit: int = 2000) -> list[dict]:
    """
    Returns two kinds of edges for the force-directed graph:

    1. IMPORTS edges  — structural, derived from import/require statements.
       type = "import",   weight = 1
    2. Co-change edges — behavioural, files that appear together in same PR.
       type = "co_change", weight = number of shared PRs

    Both sets are deduplicated and capped at `limit` total edges.
    Result: [{"source": str, "target": str, "weight": int, "type": str}]
    """
    if not is_available():
        return []

    try:
        async with get_session() as session:
            # ── 1. IMPORTS edges ──────────────────────────────────────────────
            import_result = await session.run(
                """
                MATCH (r:Repository {full_name: $repo})-[:CONTAINS]->(src:File)-[:IMPORTS]->(dst:File)
                WHERE (r)-[:CONTAINS]->(dst)
                RETURN src.path AS source,
                       dst.path AS target,
                       1        AS weight,
                       'import' AS type
                LIMIT $limit
                """,
                repo=repo_full_name,
                limit=limit,
            )
            import_records = await import_result.data()

            # ── 2. Co-change edges ────────────────────────────────────────────
            cochange_result = await session.run(
                """
                MATCH (r:Repository {full_name: $repo})-[:CONTAINS]->(f1:File)
                MATCH (r)-[:CONTAINS]->(f2:File)
                MATCH (f1)<-[:TOUCHES]-(pr:PullRequest)-[:TOUCHES]->(f2)
                WHERE f1.path < f2.path
                RETURN f1.path             AS source,
                       f2.path             AS target,
                       count(DISTINCT pr)  AS weight,
                       'co_change'         AS type
                ORDER BY weight DESC
                LIMIT $limit
                """,
                repo=repo_full_name,
                limit=limit,
            )
            cochange_records = await cochange_result.data()

        # Merge: co-change edges win if same pair exists in both (richer weight)
        edge_map: dict[tuple[str, str], dict] = {}
        for r in import_records:
            key = (r["source"], r["target"])
            edge_map[key] = {"source": r["source"], "target": r["target"], "weight": 1, "type": "import"}
        for r in cochange_records:
            key = (r["source"], r["target"])
            # If the same pair is also an IMPORTS edge, upgrade to co_change
            edge_map[key] = {
                "source": r["source"],
                "target": r["target"],
                "weight": r["weight"] or 1,
                "type": "co_change",
            }

        return list(edge_map.values())[:limit]

    except Exception as e:
        logger.error(f"get_repo_graph_edges failed for {repo_full_name}: {e}")
        return []


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
    Result: [{"number": int, "title": str, "author": str, "verdict": str, "overlap": int}]
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
    Look up Issue nodes in a single batched query (UNWIND).
    Returns [{"number": int, "closed_by": [pr_numbers]}] for each issue.
    Falls back to {"number": N, "closed_by": []} for issues not yet in the graph.
    """
    if not is_available() or not issue_numbers:
        return []

    try:
        async with get_session() as session:
            # FIX: single round-trip via UNWIND instead of N sequential queries
            result = await session.run(
                """
                UNWIND $nums AS num
                OPTIONAL MATCH (i:Issue {repo: $repo, number: num})
                OPTIONAL MATCH (pr:PullRequest)-[:CLOSES]->(i)
                RETURN num,
                       i IS NOT NULL AS found,
                       collect(pr.number) AS closed_by
                """,
                repo=repo_full_name,
                nums=issue_numbers,
            )
            return [
                {
                    "number": r["num"],
                    "closed_by": r["closed_by"],
                }
                async for r in result
            ]
    except Exception as e:
        logger.error(f"get_linked_issues failed: {e}")
        return [{"number": n, "closed_by": []} for n in issue_numbers]


async def get_file_dependents(
    repo_full_name: str,
    file_paths: list[str],
    top_k: int = 15,
) -> dict:
    """
    Returns the blast radius of the given files using the IMPORTS graph.

    - `direct`:      files that directly import any of the given paths (1 hop)
    - `transitive`:  files that import those importers (2 hops)

    Used by the PR review agent to understand which parts of the codebase
    may be affected by the changes in the PR.

    Result: {"direct": [path, ...], "transitive": [path, ...]}
    """
    if not is_available() or not file_paths:
        return {"direct": [], "transitive": []}

    try:
        async with get_session() as session:
            # Direct dependents — files that IMPORTS any changed file
            direct_result = await session.run(
                """
                UNWIND $paths AS target
                MATCH (dependent:File {repo: $repo})-[:IMPORTS]->(f:File {repo: $repo, path: target})
                RETURN DISTINCT dependent.path AS path
                LIMIT $top_k
                """,
                repo=repo_full_name,
                paths=file_paths,
                top_k=top_k,
            )
            direct_paths = [r["path"] async for r in direct_result]

            if not direct_paths:
                return {"direct": [], "transitive": []}

            # Transitive dependents (1 additional hop) — files that import the direct dependents
            transitive_result = await session.run(
                """
                UNWIND $direct AS direct_path
                MATCH (transitive:File {repo: $repo})-[:IMPORTS]->(d:File {repo: $repo, path: direct_path})
                WHERE NOT transitive.path IN $paths AND NOT transitive.path IN $direct
                RETURN DISTINCT transitive.path AS path
                LIMIT $top_k
                """,
                repo=repo_full_name,
                direct=direct_paths,
                paths=file_paths,
                top_k=top_k,
            )
            transitive_paths = [r["path"] async for r in transitive_result]

        return {"direct": direct_paths, "transitive": transitive_paths}

    except Exception as e:
        logger.error(f"get_file_dependents failed for {repo_full_name}: {e}")
        return {"direct": [], "transitive": []}


# ---------------------------------------------------------------------------
# Analytics queries (used by /analytics/graph endpoint)
# ---------------------------------------------------------------------------

async def get_file_hotspots(repo_full_name: str, limit: int = 10) -> list[dict]:
    """Files touched by the most PRs — indicates high churn / high importance."""
    if not is_available():
        return []
    try:
        async with get_session() as session:
            result = await session.run(
                """
                MATCH (pr:PullRequest {repo: $repo})-[:TOUCHES]->(f:File)
                RETURN f.path AS path, f.language AS language, count(pr) AS pr_count
                ORDER BY pr_count DESC LIMIT $limit
                """,
                repo=repo_full_name,
                limit=limit,
            )
            return [
                {"path": r["path"], "language": r["language"] or "Other", "pr_count": r["pr_count"]}
                async for r in result
            ]
    except Exception as e:
        logger.error(f"get_file_hotspots failed: {e}")
        return []


async def get_high_risk_files(repo_full_name: str, limit: int = 8) -> list[dict]:
    """Files that repeatedly get REQUEST_CHANGES verdict — fragile, needs attention."""
    if not is_available():
        return []
    try:
        async with get_session() as session:
            result = await session.run(
                """
                MATCH (pr:PullRequest {repo: $repo, verdict: "REQUEST_CHANGES"})-[:TOUCHES]->(f:File)
                RETURN f.path AS path, f.language AS language, count(pr) AS risk_count
                ORDER BY risk_count DESC LIMIT $limit
                """,
                repo=repo_full_name,
                limit=limit,
            )
            return [
                {"path": r["path"], "language": r["language"] or "Other", "risk_count": r["risk_count"]}
                async for r in result
            ]
    except Exception as e:
        logger.error(f"get_high_risk_files failed: {e}")
        return []


async def get_dead_files_stats(repo_full_name: str, sample_limit: int = 12) -> dict:
    """Files in the repo never touched by any reviewed PR — potentially stale/unused."""
    if not is_available():
        return {"count": 0, "sample": []}
    try:
        async with get_session() as session:
            result = await session.run(
                """
                MATCH (r:Repository {full_name: $repo})-[:CONTAINS]->(f:File)
                WHERE NOT (f)<-[:TOUCHES]-()
                RETURN f.path AS path, f.language AS language
                ORDER BY f.path
                LIMIT $sample_limit
                """,
                repo=repo_full_name,
                sample_limit=sample_limit,
            )
            sample = [
                {"path": r["path"], "language": r["language"] or "Other"}
                async for r in result
            ]

            # Get total count in a separate query
            count_result = await session.run(
                """
                MATCH (r:Repository {full_name: $repo})-[:CONTAINS]->(f:File)
                WHERE NOT (f)<-[:TOUCHES]-()
                RETURN count(f) AS dead_count
                """,
                repo=repo_full_name,
            )
            total = 0
            async for row in count_result:
                total = row["dead_count"]
                break

            return {"count": total, "sample": sample}
    except Exception as e:
        logger.error(f"get_dead_files_stats failed: {e}")
        return {"count": 0, "sample": []}


async def get_code_ownership(repo_full_name: str, limit: int = 10) -> list[dict]:
    """For each heavily-touched file, who is the dominant contributor."""
    if not is_available():
        return []
    try:
        async with get_session() as session:
            result = await session.run(
                """
                MATCH (pr:PullRequest {repo: $repo})-[:AUTHORED_BY]->(d:Developer),
                      (pr)-[:TOUCHES]->(f:File)
                WITH f.path AS path, d.login AS dev, count(*) AS touches
                ORDER BY path, touches DESC
                WITH path,
                     collect({dev: dev, touches: touches})[0] AS top_owner,
                     sum(touches) AS total_touches
                WHERE total_touches >= 2
                RETURN path, top_owner.dev AS owner, top_owner.touches AS owner_touches, total_touches
                ORDER BY total_touches DESC LIMIT $limit
                """,
                repo=repo_full_name,
                limit=limit,
            )
            return [
                {
                    "path": r["path"],
                    "owner": r["owner"],
                    "owner_touches": r["owner_touches"],
                    "total_touches": r["total_touches"],
                }
                async for r in result
            ]
    except Exception as e:
        logger.error(f"get_code_ownership failed: {e}")
        return []


async def get_developer_expertise(repo_full_name: str, limit: int = 8) -> list[dict]:
    """Per developer: which top-level directories they contribute to most."""
    if not is_available():
        return []
    try:
        async with get_session() as session:
            result = await session.run(
                """
                MATCH (pr:PullRequest {repo: $repo})-[:AUTHORED_BY]->(d:Developer),
                      (pr)-[:TOUCHES]->(f:File)
                WITH d.login AS dev,
                     CASE WHEN size(split(f.path, '/')) > 1
                          THEN split(f.path, '/')[0]
                          ELSE '(root)' END AS directory,
                     count(*) AS touches
                ORDER BY dev, touches DESC
                WITH dev,
                     collect({directory: directory, touches: touches})[0..4] AS top_dirs,
                     sum(touches) AS total_touches
                RETURN dev, top_dirs, total_touches
                ORDER BY total_touches DESC LIMIT $limit
                """,
                repo=repo_full_name,
                limit=limit,
            )
            return [
                {
                    "dev": r["dev"],
                    "top_dirs": [dict(d) for d in r["top_dirs"]],
                    "total_touches": r["total_touches"],
                }
                async for r in result
            ]
    except Exception as e:
        logger.error(f"get_developer_expertise failed: {e}")
        return []
