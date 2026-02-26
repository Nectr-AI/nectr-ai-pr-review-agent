import json
import hmac
import hashlib
import asyncio
import logging
import traceback
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db, async_session
from app.core.config import settings
from app.models.event import Event
from app.models.installation import Installation
from app.schemas.webhook import EventResponse
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


@router.post("/github", response_model=EventResponse)
async def github_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Receives webhook events from GitHub.
    Verifies per-repo signature, saves event, then processes AI review in background.
    Returns immediately so GitHub doesn't timeout (10s limit).
    """
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")
    payload = json.loads(body)

    # Look up the per-repo webhook secret from the installations table
    if settings.APP_ENV == "production":
        repo_full_name = payload.get("repository", {}).get("full_name", "")
        secret = settings.GITHUB_WEBHOOK_SECRET  # fallback
        if repo_full_name:
            result = await db.execute(
                select(Installation.webhook_secret).where(
                    Installation.repo_full_name == repo_full_name,
                    Installation.is_active == True,
                )
            )
            db_secret = result.scalar_one_or_none()
            if db_secret:
                secret = db_secret

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

    event = Event(
        event_type=event_type,
        source="github",
        payload=json.dumps(payload),
        status="pending",
    )
    db.add(event)
    await db.flush()
    await db.refresh(event)

    # Fire-and-forget: process PR review in background
    if "pull_request" in payload and payload.get("action") in ["opened", "synchronize"]:
        event.status = "processing"
        await db.commit()  # Commit before spawning task so background session can find the event
        await db.refresh(event)
        asyncio.create_task(process_pr_in_background(payload, event.id))

    return event
