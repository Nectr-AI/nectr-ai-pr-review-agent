import asyncio
import json
import logging
import re
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event
from app.models.workflow import WorkflowRun
from app.services.ai_service import ai_service
from app.services.context_service import build_review_context
from app.services.memory_extractor import extract_and_store
from app.services import graph_builder
from app.integrations.github.client import github_client

logger = logging.getLogger(__name__)

# Files that add noise but no signal to a code review
_SKIP_FILE_NAMES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "poetry.lock", "composer.lock", "Cargo.lock",
}
_SKIP_FILE_EXTS = {".min.js", ".min.css", ".map", ".snap", ".lock", ".pb", ".pyc"}

_HUNK_HEADER_RE = re.compile(r"\+(\d+)")

_ISSUE_REF_PATTERN = re.compile(
    r"(?:^|(?<=\s))(?:fixes|closes|resolves)\s+#(\d+)",
    re.IGNORECASE | re.MULTILINE,
)


def _parse_issue_refs(pr_body: str, pr_title: str) -> list[int]:
    """
    Parse 'Fixes #123', 'Closes #456', 'Resolves #789' from PR body + title.
    Returns deduplicated list of issue numbers.
    """
    text = f"{pr_title or ''} {pr_body or ''}"
    matches = _ISSUE_REF_PATTERN.findall(text)
    return list(dict.fromkeys(int(m) for m in matches))


async def _fetch_issue_details(owner: str, repo: str, issue_refs: list[int]) -> list[dict]:
    """
    Fetch issue title, state, and body from GitHub for each referenced issue number.
    Falls back gracefully if any individual issue fetch fails.
    """
    if not issue_refs:
        return []

    results = await asyncio.gather(
        *[github_client.get_issue(owner, repo, n) for n in issue_refs],
        return_exceptions=True,
    )

    enriched = []
    for issue_num, result in zip(issue_refs, results):
        if isinstance(result, Exception) or result is None:
            enriched.append({"number": issue_num, "title": f"Issue #{issue_num}", "state": "unknown", "body": ""})
        else:
            enriched.append({
                "number": result["number"],
                "title": result.get("title", f"Issue #{issue_num}"),
                "state": result.get("state", "unknown"),
                "body": (result.get("body") or "")[:300],
            })
    return enriched


async def _find_candidate_issues(
    owner: str,
    repo: str,
    pr_title: str,
    pr_body: str,
    file_paths: list[str],
    already_referenced: set[int],
    max_candidates: int = 8,
) -> list[dict]:
    """
    Fetch open issues and return the most likely candidates that this PR
    might resolve — even without an explicit 'Fixes #N' mention.

    Uses a keyword-overlap pre-filter to narrow ~50 issues down to the top
    handful; Claude does the final semantic determination in the main prompt.
    """
    try:
        issues = await github_client.get_repo_issues(owner, repo, state="open", per_page=50)
        # Drop issues already explicitly referenced in the PR body/title
        issues = [i for i in issues if i["number"] not in already_referenced]
        if not issues:
            return []

        # Build keyword set from PR title + body + file path components
        pr_text = f"{pr_title} {pr_body}".lower()
        file_keywords: set[str] = set()
        for path in file_paths:
            parts = re.split(r"[/_.\-]", path.lower())
            file_keywords.update(p for p in parts if len(p) > 2)
        pr_words = set(re.findall(r"\b\w{3,}\b", pr_text)) | file_keywords

        # Score each open issue by keyword overlap with the PR
        scored: list[tuple[int, dict]] = []
        for issue in issues:
            issue_text = f"{issue.get('title', '')} {issue.get('body') or ''}".lower()
            issue_words = set(re.findall(r"\b\w{3,}\b", issue_text))
            if not issue_words:
                continue
            overlap = len(pr_words & issue_words)
            if overlap >= 2:  # Require at least 2 shared meaningful words
                scored.append((overlap, issue))

        # Sort by overlap score (highest first) and return top N
        scored.sort(key=lambda x: x[0], reverse=True)
        return [
            {
                "number": issue["number"],
                "title": issue.get("title", f"Issue #{issue['number']}"),
                "body": (issue.get("body") or "")[:200],
                "score": score,
            }
            for score, issue in scored[:max_candidates]
        ]

    except Exception as e:
        logger.warning(f"Semantic issue candidate search failed for {owner}/{repo}: {e}")
        return []


async def _get_open_pr_conflicts(
    owner: str,
    repo: str,
    current_pr_number: int,
    current_file_paths: list[str],
) -> list[dict]:
    """
    Fetch open PRs on the repo and return those that touch the same files
    as the current PR — indicating a potential conflict.
    Checks up to 10 open PRs to keep latency low.
    """
    try:
        open_prs = await github_client.get_repo_pull_requests(owner, repo, state="open", per_page=20)
        open_prs = [p for p in open_prs if p["number"] != current_pr_number][:10]
        if not open_prs:
            return []

        # Fetch changed files for each open PR in parallel
        pr_files_results = await asyncio.gather(
            *[github_client.get_pr_files_list(owner, repo, p["number"]) for p in open_prs],
            return_exceptions=True,
        )

        current_files_set = set(current_file_paths)
        conflicting = []
        for pr, pr_files in zip(open_prs, pr_files_results):
            if isinstance(pr_files, Exception):
                continue
            overlap = sorted(current_files_set & set(pr_files))
            if overlap:
                conflicting.append({
                    "number": pr["number"],
                    "title": pr.get("title", ""),
                    "author": (pr.get("user") or {}).get("login", ""),
                    "url": pr.get("html_url", f"https://github.com/{owner}/{repo}/pull/{pr['number']}"),
                    "overlap": overlap[:5],
                })

        return sorted(conflicting, key=lambda x: len(x["overlap"]), reverse=True)[:5]

    except Exception as e:
        logger.warning(f"Open PR conflict check failed for {owner}/{repo}: {e}")
        return []


def _normalize_ws(s: str) -> str:
    """Collapse all runs of whitespace into a single space for fuzzy line matching."""
    return " ".join(s.split())


def _build_line_map(files: list[dict]) -> dict[str, dict[str, int]]:
    """
    Parse the `patch` field of each file and build a mapping:
        {filename: {stripped_line_content: right_side_line_number}}

    Indexes every `+` line (additions) on the RIGHT side of the diff so that
    AI-generated `line_hint` strings can be resolved to absolute line numbers.
    Both the exact stripped content and a whitespace-normalised variant are stored
    so minor indentation differences don't silently drop suggestions.
    """
    line_map: dict[str, dict[str, int]] = {}
    for f in files:
        patch = f.get("patch", "")
        filename = f.get("filename", "")
        if not patch or not filename:
            continue
        mapping: dict[str, int] = {}
        current_right_line = 0
        for patch_line in patch.splitlines():
            if patch_line.startswith("@@"):
                m = _HUNK_HEADER_RE.search(patch_line)
                if m:
                    current_right_line = int(m.group(1)) - 1
            elif patch_line.startswith("+"):
                current_right_line += 1
                content = patch_line[1:]           # keep indentation — strip only used for lookup key
                stripped = content.strip()
                if stripped:
                    # Store with original indentation preserved for exact match
                    if content not in mapping:
                        mapping[content] = current_right_line
                    # Also store stripped + whitespace-normalised variants for fuzzy match
                    if stripped not in mapping:
                        mapping[stripped] = current_right_line
                    norm = _normalize_ws(stripped)
                    if norm not in mapping:
                        mapping[norm] = current_right_line
            elif not patch_line.startswith("-"):
                current_right_line += 1
        line_map[filename] = mapping
    return line_map


class PRReviewService:
    """
    Orchestrates the full PR review workflow:
    1. Fetch PR details + diff from GitHub
    2. Build context from Mem0 (semantic) + Neo4j (structural — file experts, related PRs)
    3. Send to Claude for analysis
    4. Post the AI review as a comment on the PR (with optional inline suggestions)
    5. Index the PR in Neo4j + extract Mem0 learned memories
    """

    async def process_pr_review(self, payload: dict, event: Event, db: AsyncSession) -> dict:
        pr = payload["pull_request"]
        repo_full_name = payload.get("repository", {}).get("full_name", "")
        pr_number = pr["number"]
        head_sha: str = (pr.get("head") or {}).get("sha", "")

        logger.info(f"Starting PR review for {repo_full_name}#{pr_number} (head={head_sha[:7] if head_sha else 'unknown'})")

        workflow = WorkflowRun(
            event_id=event.id,
            workflow_type="pr_review",
            status="running",
        )

        db.add(workflow)
        await db.flush()

        try:
            diff = ""
            files = []
            if repo_full_name:
                owner, repo = repo_full_name.split("/")

                logger.info(f"Fetching diff and files for {owner}/{repo}#{pr_number}")
                diff = await github_client.get_pr_diff(owner, repo, pr_number)
                files = await github_client.get_pr_files(owner, repo, pr_number)
                logger.info(f"Got {len(files)} files, diff length: {len(diff)} chars")

                # Fetch full content of changed files for cross-file reasoning.
                # Sort by additions (most-changed first), skip generated/binary files.
                candidates = [
                    f for f in sorted(files, key=lambda x: x.get("additions", 0), reverse=True)[:8]
                    if f.get("filename")
                    and f.get("status") != "removed"
                    and f["filename"].split("/")[-1] not in _SKIP_FILE_NAMES
                    and not any(f["filename"].endswith(e) for e in _SKIP_FILE_EXTS)
                ]
                file_contents: dict[str, str] = {}
                if candidates and head_sha:
                    raw_contents = await asyncio.gather(
                        *[github_client.get_file_content(owner, repo, f["filename"], head_sha)
                          for f in candidates],
                        return_exceptions=True,
                    )
                    for f, content in zip(candidates, raw_contents):
                        if isinstance(content, str) and content:
                            if len(content) > 8000:
                                content = content[:8000] + "\n# ... (truncated)"
                            file_contents[f["filename"]] = content
                logger.info(f"Fetched full content for {len(file_contents)} file(s)")

                file_paths = [f.get("filename", "") for f in files if f.get("filename")]
                author = (pr.get("user") or {}).get("login", "")
                pr_body = pr.get("body") or ""
                pr_title = pr.get("title", "")

                # Parse issue references from PR body/title
                issue_refs = _parse_issue_refs(pr_body, pr_title)

                # Fetch issue details, open PR conflicts, and semantic candidates in parallel
                issue_details, open_pr_conflicts, candidate_issues = await asyncio.gather(
                    _fetch_issue_details(owner, repo, issue_refs),
                    _get_open_pr_conflicts(owner, repo, pr_number, file_paths),
                    _find_candidate_issues(
                        owner, repo,
                        pr_title, pr_body,
                        file_paths,
                        already_referenced=set(issue_refs),
                    ),
                    return_exceptions=True,
                )
                if isinstance(issue_details, Exception):
                    logger.warning(f"Issue detail fetch failed: {issue_details}")
                    issue_details = [{"number": n, "title": f"Issue #{n}", "state": "unknown", "body": ""} for n in issue_refs]
                if isinstance(open_pr_conflicts, Exception):
                    logger.warning(f"Open PR conflict check failed: {open_pr_conflicts}")
                    open_pr_conflicts = []
                if isinstance(candidate_issues, Exception):
                    logger.warning(f"Semantic issue candidate search failed: {candidate_issues}")
                    candidate_issues = []

                logger.info(
                    f"Context: {len(issue_details)} linked issues, "
                    f"{len(open_pr_conflicts)} open PR conflict(s), "
                    f"{len(candidate_issues)} semantic issue candidate(s)"
                )

                # Build context from Mem0 (semantic) + Neo4j (structural)
                context = await build_review_context(
                    repo_full_name=repo_full_name,
                    pr_title=pr_title,
                    pr_description=pr_body[:500],
                    file_paths=file_paths,
                    author=author,
                    pr_number=pr_number,
                    open_prs=open_pr_conflicts,
                )

                # Linked issues — use enriched details (title + state from GitHub)
                linked_issues = issue_details

                logger.info("Sending to Claude for AI analysis...")
                review_result = await ai_service.analyze_pull_request(
                    pr, diff, files,
                    context=context,
                    linked_issues=linked_issues,
                    file_contents=file_contents,
                    potential_issues=candidate_issues or None,
                    similar_items=[
                        {
                            "type": "pr",
                            "number": p["number"],
                            "content": p["title"],
                            "html_url": f"https://github.com/{repo_full_name}/pull/{p['number']}",
                        }
                        for p in context.related_prs
                    ],
                )
                summary = review_result.summary
                logger.info(
                    f"AI analysis complete, summary length: {len(summary)} chars, "
                    f"verdict: {review_result.verdict}, "
                    f"suggestions: {len(review_result.inline_comments)}"
                )

                # Build resolved issues section
                resolved_section = ""
                if linked_issues:
                    resolved_lines = ["\n## Resolved Issues\n"]
                    for issue in linked_issues:
                        state_icon = "🟢" if issue.get("state") == "open" else "🔵"
                        title = issue.get("title", f"Issue #{issue['number']}")
                        resolved_lines.append(
                            f"- {state_icon} Closes [#{issue['number']}: {title}]"
                            f"(https://github.com/{repo_full_name}/issues/{issue['number']})"
                        )
                    resolved_section = "\n".join(resolved_lines) + "\n"

                # Build semantic issue matches section (issues resolved without explicit reference)
                semantic_section = ""
                if review_result.semantic_issue_matches:
                    sem_lines = ["\n## 🔍 Potentially Resolves\n"]
                    sem_lines.append(
                        "_These open issues appear to be resolved by this PR's changes, "
                        "even though they weren't explicitly mentioned:_\n"
                    )
                    for match in review_result.semantic_issue_matches:
                        issue_num = match.get("number")
                        reason = match.get("reason", "")
                        confidence = match.get("confidence", "medium")
                        conf_icon = "🟡" if confidence == "medium" else "🟢"
                        # Try to find the title from candidate_issues list
                        title = next(
                            (c["title"] for c in (candidate_issues or []) if c["number"] == issue_num),
                            f"Issue #{issue_num}",
                        )
                        sem_lines.append(
                            f"- {conf_icon} [#{issue_num}: {title}]"
                            f"(https://github.com/{repo_full_name}/issues/{issue_num})"
                            f" — {reason}"
                        )
                    semantic_section = "\n".join(sem_lines) + "\n"
                    logger.info(
                        f"Semantic issue matches found: "
                        f"{[m['number'] for m in review_result.semantic_issue_matches]}"
                    )

                # Build open PR conflicts section
                conflicts_section = ""
                if open_pr_conflicts:
                    conflict_lines = ["\n## ⚠️ Open PR Conflicts\n"]
                    conflict_lines.append("These open PRs touch the same files — coordinate to avoid merge conflicts:\n")
                    for p in open_pr_conflicts:
                        overlap_str = ", ".join(f"`{f}`" for f in p["overlap"][:3])
                        extra = f" (+{len(p['overlap']) - 3} more)" if len(p["overlap"]) > 3 else ""
                        conflict_lines.append(
                            f"- [PR #{p['number']}]({p['url']}): **{p['title']}** by @{p['author']}"
                            f" — shared files: {overlap_str}{extra}"
                        )
                    conflicts_section = "\n".join(conflict_lines) + "\n"

                # Build similar past work section (from Neo4j related_prs in context)
                similar_section = ""
                if context.related_prs:
                    sim_lines = ["\n## Related Past Work\n"]
                    for p in context.related_prs[:3]:
                        verdict_tag = f" [{p['verdict']}]" if p.get("verdict") else ""
                        sim_lines.append(
                            f"- Similar to [PR #{p['number']}]"
                            f"(https://github.com/{repo_full_name}/pull/{p['number']}){verdict_tag}: "
                            f"{p['title']}"
                        )
                    similar_section = "\n".join(sim_lines) + "\n"

                comment_body = (
                    "Hi I am Nectr - AI code review agent built by "
                    "[Dhanush Chalicheemala](https://x.com/dhanush_chali)\n\n"
                    f"{summary}\n"
                    f"{resolved_section}"
                    f"{semantic_section}"
                    f"{conflicts_section}"
                    f"{similar_section}"
                    "\n---\n"
                    "*If you have any concerns, connect with "
                    "[Dhanush Chalicheemala](https://x.com/dhanush_chali)*"
                )

                # Build inline suggested-change comments
                inline_comments: list[dict] = []
                if review_result.inline_comments:
                    line_map = _build_line_map(files)
                    for suggestion in review_result.inline_comments:
                        file_path = suggestion.get("file", "")
                        line_hint = (suggestion.get("line_hint") or "").strip()
                        end_line_hint = (suggestion.get("end_line_hint") or "").strip()
                        replacement = suggestion.get("suggestion", "")
                        comment_text = suggestion.get("comment", "")

                        if not file_path or not line_hint or not replacement:
                            continue

                        file_lines = line_map.get(file_path) or {}

                        # Resolve start line — try exact, stripped, then whitespace-normalised
                        def _resolve(hint: str) -> int | None:
                            return (
                                file_lines.get(hint)
                                or file_lines.get(hint.strip())
                                or file_lines.get(_normalize_ws(hint.strip()))
                            )

                        start_line = _resolve(line_hint)
                        if not start_line:
                            continue  # can't place comment — skip

                        body = (
                            f"{comment_text}\n\n```suggestion\n{replacement}\n```"
                            if comment_text
                            else f"```suggestion\n{replacement}\n```"
                        )

                        comment_obj: dict = {
                            "path": file_path,
                            "line": start_line,
                            "side": "RIGHT",
                            "body": body,
                        }

                        # Multi-line suggestion: add start_line + start_side when end differs
                        if end_line_hint:
                            end_line = _resolve(end_line_hint)
                            if end_line and end_line > start_line:
                                comment_obj["start_line"] = start_line
                                comment_obj["start_side"] = "RIGHT"
                                comment_obj["line"] = end_line

                        inline_comments.append(comment_obj)

                # Map verdict to GitHub review event
                _event_map = {
                    "APPROVE": "APPROVE",
                    "REQUEST_CHANGES": "REQUEST_CHANGES",
                    "NEEDS_DISCUSSION": "COMMENT",
                }
                github_event = _event_map.get(review_result.verdict, "COMMENT")

                logger.info(
                    f"Posting PR review to {owner}/{repo}#{pr_number} "
                    f"(event={github_event}, inline_comments={len(inline_comments)})"
                )
                if head_sha:
                    try:
                        await github_client.post_pr_review(
                            owner, repo, pr_number,
                            commit_id=head_sha,
                            body=comment_body,
                            event=github_event,
                            comments=inline_comments,
                        )
                        logger.info("PR review posted successfully!")
                    except Exception as review_err:
                        logger.warning(
                            f"post_pr_review failed ({review_err}), falling back to flat comment"
                        )
                        await github_client.post_pr_comment(owner, repo, pr_number, comment_body)
                else:
                    logger.warning("No head_sha available — posting flat issue comment as fallback")
                    await github_client.post_pr_comment(owner, repo, pr_number, comment_body)

                workflow.status = "completed"
                workflow.result = json.dumps({
                    "ai_summary": summary,
                    "files_analyzed": len(files),
                    "comment_posted": True,
                    "verdict": review_result.verdict,
                    "inline_suggestions": len(inline_comments),
                    "linked_issues": [i["number"] for i in linked_issues],
                    "related_prs": len(context.related_prs),
                    "open_pr_conflicts": len(open_pr_conflicts),
                    "semantic_issue_matches": [m["number"] for m in review_result.semantic_issue_matches],
                })
                workflow.completed_at = datetime.now()

                event.status = "completed"
                event.processed_at = datetime.now()

                await db.flush()

                # Merge explicit issue refs + high-confidence semantic matches for Neo4j indexing
                semantic_issue_nums = [
                    m["number"] for m in review_result.semantic_issue_matches
                    if m.get("confidence") == "high"
                ]
                all_issue_numbers = list(dict.fromkeys(issue_refs + semantic_issue_nums))

                # Index PR in Neo4j graph (non-blocking, failures are logged not raised)
                await graph_builder.index_pr(
                    repo_full_name=repo_full_name,
                    pr_number=pr_number,
                    title=pr_title,
                    author=author,
                    files_changed=file_paths,
                    verdict=review_result.verdict,
                    issue_numbers=all_issue_numbers,
                )

                # Extract Mem0 learned memories (patterns, decisions, developer profile)
                await extract_and_store(
                    repo_full_name=repo_full_name,
                    pr_number=pr_number,
                    author=author,
                    title=pr_title,
                    files=files,
                    review_summary=summary,
                )

                return {
                    "status": "completed",
                    "summary": summary,
                    "files_analyzed": len(files),
                    "inline_suggestions": len(inline_comments),
                }

        except Exception as e:
            logger.error(f"PR review failed for {repo_full_name}#{pr_number}: {e}", exc_info=True)
            workflow.status = "failed"
            workflow.error = str(e)
            workflow.completed_at = datetime.now()
            event.status = "failed"
            await db.flush()

            return {"status": "failed", "error": str(e)}


pr_review_service = PRReviewService()
