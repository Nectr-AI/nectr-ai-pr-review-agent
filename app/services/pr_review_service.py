import json
import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event
from app.models.workflow import WorkflowRun
from app.services.ai_service import ai_service
from app.services.context_service import build_review_context
from app.services.memory_extractor import extract_and_store
from app.integrations.github.client import github_client

logger = logging.getLogger(__name__)


class PRReviewService:
    """
    Orchestrates the full PR review workflow:
    1. Fetch PR details + diff from GitHub
    2. Send to Claude for analysis
    3. Post the AI review as a comment on the PR
    4. Log everything in the database
    """

    async def process_pr_review(self, payload: dict, event: Event, db: AsyncSession) -> dict:
        pr = payload["pull_request"]
        repo_full_name = payload.get("repository", {}).get("full_name", "")
        pr_number = pr["number"]

        logger.info(f"Starting PR review for {repo_full_name}#{pr_number}")

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

                # Build context from Mem0 (query-driven, only relevant memories)
                file_paths = [f.get("filename", "") for f in files if f.get("filename")]
                author = (pr.get("user") or {}).get("login", "")
                context = await build_review_context(
                    repo_full_name=repo_full_name,
                    pr_title=pr.get("title", ""),
                    pr_description=(pr.get("body") or "")[:500],
                    file_paths=file_paths,
                    author=author,
                )

                logger.info("Sending to Claude for AI analysis...")
                summary = await ai_service.analyze_pull_request(
                    pr, diff, files, context=context
                )
                logger.info(f"AI analysis complete, summary length: {len(summary)} chars")

                comment_body = (
                    "Hi I am Nectr - AI code review agent built by "
                    "[Dhanush Chalicheemala](https://x.com/dhanush_chali)\n\n"
                    f"{summary}\n\n"
                    "---\n"
                    "*If you have any concerns, connect with "
                    "[Dhanush Chalicheemala](https://x.com/dhanush_chali)*"
                )

                logger.info(f"Posting review comment to {owner}/{repo}#{pr_number}")
                await github_client.post_pr_comment(owner, repo, pr_number, comment_body)
                logger.info("Review comment posted successfully!")

                workflow.status = "completed"
                workflow.result = json.dumps({
                    "ai_summary": summary,
                    "files_analyzed": len(files),
                    "comment_posted": True,
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
                    title=pr.get("title", ""),
                    files=files,
                    review_summary=summary,
                )

                return {
                    "status": "completed",
                    "summary": summary,
                    "files_analyzed": len(files),
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
