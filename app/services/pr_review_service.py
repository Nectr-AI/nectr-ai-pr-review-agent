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


def _normalize_ws(s: str) -> str:
    """Collapse all runs of whitespace into a single space for fuzzy line matching."""
    return " ".join(s.split())


def _build_line_map(files: list[dict]) -> dict[str, dict[str, int]]:
    """
    Parse the `patch` field of each file returned by get_pr_files() and build a mapping:
        {filename: {stripped_line_content: right_side_line_number}}
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
                m = _HUNK_HEADER_RE.search(patch_line)
                if m:
                    current_right_line = int(m.group(1)) - 1
            elif patch_line.startswith("+"):
                current_right_line += 1
                content = patch_line[1:].strip()
                if content:
                    if content not in mapping:
                        mapping[content] = current_right_line
                    norm = _normalize_ws(content)
                    if norm != content and norm not in mapping:
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

                file_paths = [f.get("filename", "") for f in files if f.get("filename")]
                author = (pr.get("user") or {}).get("login", "")
                pr_body = pr.get("body") or ""
                pr_title = pr.get("title", "")

                # Parse issue references from PR body/title
                issue_refs = _parse_issue_refs(pr_body, pr_title)

                # Build context from Mem0 (semantic) + Neo4j (structural)
                context = await build_review_context(
                    repo_full_name=repo_full_name,
                    pr_title=pr_title,
                    pr_description=pr_body[:500],
                    file_paths=file_paths,
                    author=author,
                    pr_number=pr_number,
                )

                # Linked issues from Neo4j graph
                linked_issues = await graph_builder.get_linked_issues(repo_full_name, issue_refs)

                logger.info("Sending to Claude for AI analysis...")
                review_result = await ai_service.analyze_pull_request(
                    pr, diff, files,
                    context=context,
                    linked_issues=linked_issues,
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
                        resolved_lines.append(
                            f"- Closes [#{issue['number']}]"
                            f"(https://github.com/{repo_full_name}/issues/{issue['number']})"
                        )
                    resolved_section = "\n".join(resolved_lines) + "\n"

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
                        line_hint = suggestion.get("line_hint", "").strip()
                        replacement = suggestion.get("suggestion", "")
                        comment_text = suggestion.get("comment", "")

                        if not file_path or not line_hint or not replacement:
                            continue

                        file_lines = line_map.get(file_path) or {}
                        line_number = file_lines.get(line_hint) or file_lines.get(_normalize_ws(line_hint))
                        if line_number:
                            body = (
                                f"{comment_text}\n\n```suggestion\n{replacement}\n```"
                                if comment_text
                                else f"```suggestion\n{replacement}\n```"
                            )
                            inline_comments.append({
                                "path": file_path,
                                "line": line_number,
                                "side": "RIGHT",
                                "body": body,
                            })

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
                })
                workflow.completed_at = datetime.now()

                event.status = "completed"
                event.processed_at = datetime.now()

                await db.flush()

                # Index PR in Neo4j graph (non-blocking, failures are logged not raised)
                await graph_builder.index_pr(
                    repo_full_name=repo_full_name,
                    pr_number=pr_number,
                    title=pr_title,
                    author=author,
                    files_changed=file_paths,
                    verdict=review_result.verdict,
                    issue_numbers=issue_refs,
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
