import json
import hmac
import hashlib
import logging
import traceback
import httpx
from datetime import datetime, timedelta
from fastapi import APIRouter, BackgroundTasks, Depends, Request, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db, async_session
from app.core.config import settings
from app.models.event import Event
from app.models.installation import Installation
from app.services.pr_review_service import pr_review_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def verify_github_signature(payload_body: bytes, signature: str, secret: str) -> bool:
    """
    Verify that the webhook actually came from GitHub.
    GitHub signs every webhook with the per-repo secret using HMAC-SHA256.
    """
    if not secret:
        return True

    expected = "sha256=" + hmac.new(
        secret.encode(),
        payload_body,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


async def process_pr_in_background(payload: dict, event_id: int):
    """
    Process PR review in the background so we can respond to GitHub quickly.
    GitHub has a 10-second timeout — our AI review takes 30-60 seconds.
    """
    async with async_session() as db:
        event = None
        try:
            result = await db.execute(
                select(Event).where(Event.id == event_id)
            )
            event = result.scalar_one()

            review_result = await pr_review_service.process_pr_review(payload, event, db)
            event.payload = json.dumps({"original": payload, **review_result})

            await db.commit()
            logger.info(f"Background PR review completed for event {event_id}: {review_result.get('status')}")

        except Exception as e:
            logger.error(f"Background PR review FAILED for event {event_id}: {e}")
            traceback.print_exc()
            try:
                if event is not None:
                    event.status = "failed"
                    await db.commit()
                else:
                    await db.rollback()
            except Exception:
                await db.rollback()


@router.post("/github")
async def github_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Receives webhook events from GitHub.
    Handles both GitHub App events (installation, PR) and legacy per-repo webhooks.
    Returns immediately so GitHub doesn't timeout (10s limit).
    """
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")
    payload = json.loads(body)

    # Verify signature.
    # Per-repo webhooks (installed via Nectr UI) are signed with the per-repo
    # secret stored in the DB.  GitHub App webhooks are signed with the
    # app-level GITHUB_WEBHOOK_SECRET.  Always prefer the per-repo secret when
    # one exists — fall back to the app-level secret for App-delivered events.
    if settings.APP_ENV == "production":
        repo_full_name = payload.get("repository", {}).get("full_name", "")
        secret = settings.GITHUB_WEBHOOK_SECRET  # fallback (App-level or global)

        if repo_full_name:
            result = await db.execute(
                select(Installation.webhook_secret).where(
                    Installation.repo_full_name == repo_full_name,
                    Installation.is_active == True,
                )
            )
            db_secret = result.scalar_one_or_none()
            if db_secret:
                secret = db_secret  # per-repo secret takes priority

        if not verify_github_signature(body, signature, secret):
            logger.warning(f"Invalid webhook signature for {repo_full_name}")
            raise HTTPException(status_code=403, detail="Invalid webhook signature")

    event_type = "unknown"
    if "pull_request" in payload:
        event_type = payload.get("action", "unknown") + "_pull_request"
    elif "issue" in payload:
        event_type = payload.get("action", "unknown") + "_issue"
    elif "pusher" in payload:
        event_type = "push"

    is_pr = "pull_request" in payload and payload.get("action") in ["opened", "synchronize"]

    # Deduplicate: if a pending/processing event for this PR exists within the last hour, skip.
    # Scoped to the event_type + status + recent time window to avoid full-table scans.
    if is_pr:
        pr_number = payload["pull_request"]["number"]
        repo_name = payload.get("repository", {}).get("full_name", "")
        cutoff = datetime.utcnow() - timedelta(hours=1)
        result = await db.execute(
            select(Event).where(
                Event.event_type == event_type,
                Event.status.in_(["pending", "processing"]),
                Event.created_at >= cutoff,
            )
        )
        for candidate in result.scalars().all():
            try:
                p = json.loads(candidate.payload or "{}")
                p = p.get("original", p)
                if (p.get("pull_request", {}).get("number") == pr_number
                        and p.get("repository", {}).get("full_name") == repo_name):
                    logger.info(f"Skipping duplicate webhook for {repo_name}#{pr_number}")
                    return JSONResponse(
                        content={"status": "duplicate_skipped", "detail": f"Event already exists for {repo_name}#{pr_number}"},
                        status_code=200,
                    )
            except (json.JSONDecodeError, KeyError):
                continue

    event = Event(
        event_type=event_type,
        source="github",
        payload=json.dumps(payload),
        status="pending",
    )
    db.add(event)
    await db.flush()
    await db.refresh(event)

    if is_pr:
        event.status = "processing"
        await db.commit()
        await db.refresh(event)
        background_tasks.add_task(process_pr_in_background, payload, event.id)
    else:
        await db.commit()

    return JSONResponse(
        content={"status": "received", "event_id": event.id, "event_type": event_type},
        status_code=200,
    )
