import json
import hmac
import hashlib
import asyncio
import traceback
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db, async_session
from app.core.config import settings
from app.models.event import Event
from app.schemas.webhook import EventResponse
from app.services.pr_review_service import pr_review_service

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def verify_github_signature(payload_body: bytes, signature: str) -> bool:
    """
    Verify that the webhook actually came from GitHub.
    GitHub signs every webhook with your secret using HMAC-SHA256.
    """
    if not settings.GITHUB_WEBHOOK_SECRET:
        return True

    expected = "sha256=" + hmac.new(
        settings.GITHUB_WEBHOOK_SECRET.encode(),
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
        try:
            result = await db.execute(
                __import__("sqlalchemy").select(Event).where(Event.id == event_id)
            )
            event = result.scalar_one()

            review_result = await pr_review_service.process_pr_review(payload, event, db)
            event.payload = json.dumps({"original": payload, **review_result})

            await db.commit()
            print(f"Background PR review completed for event {event_id}: {review_result.get('status')}")

        except Exception as e:
            print(f"Background PR review FAILED for event {event_id}: {e}")
            traceback.print_exc()
            try:
                event.status = "failed"
                await db.commit()
            except Exception:
                await db.rollback()


@router.post("/github", response_model=EventResponse)
async def github_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Receives webhook events from GitHub.
    Verifies signature, saves event, then processes AI review in background.
    Returns immediately so GitHub doesn't timeout (10s limit).
    """
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")

    if settings.APP_ENV == "production" and not verify_github_signature(body, signature):
        raise HTTPException(status_code=403, detail="Invalid webhook signature")

    payload = json.loads(body)

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
        asyncio.create_task(process_pr_in_background(payload, event.id))
        event.status = "processing"
        await db.flush()
        await db.refresh(event)

    return event
