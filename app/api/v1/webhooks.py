import json
import hmac
import hashlib
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
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


@router.post("/github", response_model=EventResponse)
async def github_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Receives webhook events from GitHub.
    Verifies signature in production, then routes to appropriate workflow.
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

    if "pull_request" in payload and payload.get("action") in ["opened", "synchronize"]:
        result = await pr_review_service.process_pr_review(payload, event, db)
        event.payload = json.dumps({"original": payload, **result})

    await db.flush()
    await db.refresh(event)

    return event
