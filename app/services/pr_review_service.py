import json
import logging
import re
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event
from app.models.workflow import WorkflowRun
from app.services.ai_service import ai_service
from app.services.context_service import build_review_context
from app.services.memory_adapter import memory_adapter
from app.services.memory_extractor import extract_and_store
from app.integrations.github.client import github_client

logger = logging.getLogger(__name__)

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


async def _fetch_linked_issues(
    repo_full_name: str, issue_numbers: list[int],
) -> list[dict]:
    """
    For each issue number, search Mem0 for the issue_context memory.
    Returns list of {number, content, html_url, state, labels}.
    """
    if not issue_numbers or not memory_adapter.is_available():
        return []

    results = []
    for num in issue_numbers[:5]:
        hits = await memory_adapter.search_relevant(
            repo=repo_full_name, query=f"Issue #{num}", developer=None, top_k=3,
        )
        found = False
        for hit in hits:
            meta = hit.get("metadata") or {}
            if meta.get("memory_type") == "issue_context" and meta.get("issue_number") == num:
                results.append({
                    "number": num,
                    "content": hit.get("memory", hit.get("content", "")),
                    "html_url": meta.get("html_url", ""),
                    "state": meta.get("issue_state", "unknown"),
                    "labels": meta.get("labels", []),
                })
                found = True
                break
        if not found:
            results.append({
                "number": num,
                "content": f"Issue #{num} (not yet indexed)",
                "html_url": f"https://github.com/{repo_full_name}/issues/{num}",
                "state": "unknown",
                "labels": [],
            })
    return results


async def _detect_similar(
    repo_full_name: str,
    pr_title: str,
    file_paths: list[str],
    current_pr_number: int,
) -> list[dict]:
    """
    Semantic search for the 3 most similar past PRs and issues.
    Returns list of {type, number, content, html_url}.
    """
    if not memory_adapter.is_available():
        return []

    query = f"{pr_title} {' '.join(file_paths[:8])}"
    hits = await memory_adapter.search_relevant(
        repo=repo_full_name, query=query, developer=None, top_k=10,
    )

    similar: list[dict] = []
    seen: set[str] = set()

    for hit in hits:
        meta = hit.get("metadata") or {}
        memory_type = meta.get("memory_type")
        content = hit.get("memory", hit.get("content", ""))

        if memory_type == "pr_history":
            pr_num = meta.get("pr_number")
            if pr_num and pr_num != current_pr_number and str(pr_num) not in seen:
                seen.add(str(pr_num))
                similar.append({
                    "type": "pr",
                    "number": pr_num,
                    "content": content,
                    "html_url": meta.get("html_url", ""),
                })

        elif memory_type == "issue_context":
            issue_num = meta.get("issue_number")
            key = f"issue_{issue_num}"
            if issue_num and key not in seen:
                seen.add(key)
                similar.append({
                    "type": "issue",
                    "number": issue_num,
                    "content": content,
                    "html_url": meta.get("html_url", ""),
                    "state": meta.get("issue_state", ""),
                })

        if len(similar) >= 3:
            break

    return similar


def _normalize_ws(s: str) -> str:
    """Collapse all runs of whitespace into a single space for fuzzy line matching."""
    return " ".join(s.split())


def _build_line_map(files: list[dict]) -> dict[str, dict[str, int]]:
    """
    Parse the `patch` field of each file returned by get_pr_files() and build a mapping:
        {filename: {stripped_line_content: right_side_line_number}}

    This allows us to look up the exact diff line number for a suggested change
    given the line's content (as reported by Claude in the `line_hint` field).

    Both the stripped content AND a whitespace-normalised key are stored so that
    minor indentation differences between Claude's output and the actual diff
    don't break the lookup.

    Only `+` lines (additions) are indexed since GitHub suggested changes can only
    target lines that exist on the RIGHT (new-file) side of the diff.
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
                # e.g. "@@ -85,7 +87,9 @@ def foo():"
                m = _HUNK_HEADER_RE.search(patch_line)
                if m:
                    current_right_line = int(m.group(1)) - 1  # will be incremented on first line
            elif patch_line.startswith("+"):
                current_right_line += 1
                content = patch_line[1:].strip()  # strip leading "+" and surrounding whitespace
                if content:
                    if content not in mapping:
                        mapping[content] = current_right_line
                    # Also store a whitespace-normalised key for fuzzy matching
                    norm = _normalize_ws(content)
                    if norm != content and norm not in mapping:
                        mapping[norm] = current_right_line
            elif not patch_line.startswith("-"):
                # context line (no prefix or space prefix) — advances right-side counter
                current_right_line += 1
        line_map[filename] = mapping
    return line_map


class PRReviewService:
    """
    Orchestrates the full PR review workflow:
    1. Fetch PR details + diff from GitHub
    2. Send to Claude for analysis
    3. Post the AI review as a comment on the PR (with optional inline suggestions)
    4. Log everything in the database
    """

    async def process_pr_review(self, payload: dict, event: Event, db: AsyncSession) -> dict:
        pr = payload["pull_request"]
        repo_full_name = payload.get("repository", {}).get("full_name", "")
        pr_number = pr["number"]
        # Head commit SHA — required for the PR Reviews API
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

                file_paths = [f.get("filename", "") for f in files if f.get("filename")]
                author = (pr.get("user") or {}).get("login", "")
                pr_body = pr.get("body") or ""
                pr_title = pr.get("title", "")

                # Issue-PR linking: parse "Fixes #N" references
                issue_refs = _parse_issue_refs(pr_body, pr_title)
                linked_issues = await _fetch_linked_issues(repo_full_name, issue_refs)

                # Similar past PRs/issues detection
                similar_items = await _detect_similar(
                    repo_full_name, pr_title, file_paths, pr_number,
                )

                # Build context from Mem0 (query-driven, only relevant memories)
                context = await build_review_context(
                    repo_full_name=repo_full_name,
                    pr_title=pr_title,
                    pr_description=pr_body[:500],
                    file_paths=file_paths,
                    author=author,
                )

                logger.info("Sending to Claude for AI analysis...")
                review_result = await ai_service.analyze_pull_request(
                    pr, diff, files,
                    context=context,
                    linked_issues=linked_issues,
                    similar_items=similar_items,
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
                        resolved_lines.append(
                            f"- Closes [#{issue['number']}]({issue['html_url']}): "
                            f"{issue['content'][:120]}"
                        )
                    resolved_section = "\n".join(resolved_lines) + "\n"

                # Build similar past work section
                similar_section = ""
                if similar_items:
                    sim_lines = ["\n## Related Past Work\n"]
                    for item in similar_items:
                        if item["type"] == "pr":
                            sim_lines.append(
                                f"- Similar to [PR #{item['number']}]({item['html_url']}): "
                                f"{item['content'][:100]}"
                            )
                        else:
                            state_tag = f" ({item.get('state', '')})" if item.get("state") else ""
                            sim_lines.append(
                                f"- Related to [Issue #{item['number']}]({item['html_url']}){state_tag}: "
                                f"{item['content'][:100]}"
                            )
                    similar_section = "\n".join(sim_lines) + "\n"

                comment_body = (
                    "Hi I am Nectr - AI code review agent built by "
                    "[Dhanush Chalicheemala](https://x.com/dhanush_chali)\n\n"
                    f"{summary}\n"
                    f"{resolved_section}"
                    f"{similar_section}"
                    "\n---\n"
                    "*If you have any concerns, connect with "
                    "[Dhanush Chalicheemala](https://x.com/dhanush_chali)*"
                )

                # Build inline suggested-change comments (only when Claude produced suggestions)
                inline_comments: list[dict] = []
                if review_result.inline_comments:
                    line_map = _build_line_map(files)
                    for suggestion in review_result.inline_comments:
                        file_path = suggestion.get("file", "")
                        line_hint = suggestion.get("line_hint", "").strip()
                        replacement = suggestion.get("suggestion", "")
                        comment_text = suggestion.get("comment", "")

                        if not file_path or not line_hint or not replacement:
                            continue

                        file_lines = line_map.get(file_path) or {}
                        line_number = file_lines.get(line_hint) or file_lines.get(_normalize_ws(line_hint))
                        if line_number:
                            body = f"{comment_text}\n\n```suggestion\n{replacement}\n```" if comment_text else f"```suggestion\n{replacement}\n```"
                            inline_comments.append({
                                "path": file_path,
                                "line": line_number,
                                "side": "RIGHT",
                                "body": body,
                            })
                        else:
                            logger.debug(
                                f"Suggestion line_hint not found in diff for {file_path}: {line_hint!r}"
                            )

                # Map verdict to GitHub review event
                _event_map = {
                    "APPROVE": "APPROVE",
                    "REQUEST_CHANGES": "REQUEST_CHANGES",
                    "NEEDS_DISCUSSION": "COMMENT",
                }
                github_event = _event_map.get(review_result.verdict, "COMMENT")

                # Post as a PR Review (supports inline suggestions + official review status)
                # Fall back to a flat issue comment if head_sha is unavailable
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
                    "similar_items": len(similar_items),
                })
                workflow.completed_at = datetime.now()

                event.status = "completed"
                event.processed_at = datetime.now()

                await db.flush()

                # Extract memories (runs in same background task; webhook already responded)
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
