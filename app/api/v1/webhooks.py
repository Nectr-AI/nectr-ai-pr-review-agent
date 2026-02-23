import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models import event
from app.models.event import Event
from app.services.ai_service import ai_service
from app.schemas.webhook import EventResponse
from app.integrations.github.client import github_client
from app.schemas.webhook import WebhookPayload
from app.services.pr_review_service import pr_review_service

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

@router.post("/github", response_model = EventResponse)
async def github_webhook(payload:dict,db:AsyncSession = Depends(get_db)):

    event_type = "unknown"
    if "pull_request" in payload:
        event_type = payload.get("action","unknown")+"_pull_request"
    elif "issue" in payload:
        event_type = payload.get("action","unknown")+"_issue"
    elif "pusher" in payload:
        event_type = "push"
    
    event = Event(
        event_type =event_type,
        source = "github",
        payload = json.dumps(payload),
        status = "pending"
    )
    db.add(event)
    await db.flush()
    await db.refresh(event)

    if "pull_request" in payload and payload.get("action") in ["opened","synchronize"]:
        result = await pr_review_service.process_pr_review(payload, event, db)
        event.payload = json.dumps({"original": payload, **result})

        await db.flush()
        await db.refresh(event)



    return event
