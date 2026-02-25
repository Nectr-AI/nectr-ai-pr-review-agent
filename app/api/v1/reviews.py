import json
import logging
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.models.event import Event
from app.models.workflow import WorkflowRun
from app.auth.dependencies import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reviews", tags=["reviews"])


def _parse_review(event: Event, workflow: WorkflowRun | None) -> dict:
    """Build a rich review dict from an Event + WorkflowRun."""
    payload = {}
    try:
        raw = json.loads(event.payload or "{}")
        # Payload may be {original: {...}, status, summary} or raw webhook payload
        payload = raw.get("original", raw)
    except Exception:
        pass

    pr = payload.get("pull_request", {})
    repo = payload.get("repository", {})
    head = pr.get("head", {})

    # Extract ai_summary from workflow result
    ai_summary = None
    files_analyzed = None
    if workflow and workflow.result:
        try:
            result = json.loads(workflow.result)
            ai_summary = result.get("ai_summary")
            files_analyzed = result.get("files_analyzed")
        except Exception:
            pass

    return {
        "id": event.id,
        "event_type": event.event_type,
        "source": event.source,
        "status": event.status,
        "created_at": event.created_at,
        "processed_at": event.processed_at,
        "pr_title": pr.get("title"),
        "pr_number": pr.get("number"),
        "repo_name": repo.get("full_name"),
        "branch": head.get("ref"),
        "author": pr.get("user", {}).get("login"),
        "pr_url": pr.get("html_url"),
        "ai_summary": ai_summary,
        "files_analyzed": files_analyzed,
    }


@router.get("/")
async def list_reviews(
    limit: int = Query(default=20, le=100, ge=1),
    status: str | None = Query(default=None),
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List reviews with optional filtering."""
    query = select(Event).order_by(desc(Event.created_at)).limit(limit)

    if status:
        query = query.where(Event.status == status)

    result = await db.execute(query)
    events = result.scalars().all()

    # Fetch workflows in one go
    event_ids = [e.id for e in events]
    wf_result = await db.execute(
        select(WorkflowRun).where(WorkflowRun.event_id.in_(event_ids))
    )
    workflows_by_event = {w.event_id: w for w in wf_result.scalars().all()}

    reviews = [_parse_review(e, workflows_by_event.get(e.id)) for e in events]

    # Apply search filter client-side (simple contains)
    if search:
        s = search.lower()
        reviews = [
            r for r in reviews
            if s in (r["pr_title"] or "").lower()
            or s in (r["repo_name"] or "").lower()
            or str(r["pr_number"] or "").startswith(s)
        ]

    return reviews


@router.get("/{review_id}")
async def get_review(
    review_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get a single review with full AI summary."""
    result = await db.execute(select(Event).where(Event.id == review_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Review not found")

    wf_result = await db.execute(
        select(WorkflowRun).where(WorkflowRun.event_id == review_id)
    )
    workflow = wf_result.scalar_one_or_none()

    return _parse_review(event, workflow)
