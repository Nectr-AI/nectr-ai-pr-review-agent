from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.models.event import Event
from app.models.workflow import WorkflowRun
from app.schemas.webhook import EventResponse

router = APIRouter(prefix="/events", tags=["events"])


@router.get("/", response_model=list[EventResponse])
async def list_events(
    limit: int = Query(default=20, le=100, ge=1),
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    List recent webhook events.
    Optionally filter by status: pending, completed, failed.
    """
    query = select(Event).order_by(desc(Event.created_at)).limit(limit)

    if status:
        query = query.where(Event.status == status)

    result = await db.execute(query)
    events = result.scalars().all()
    return events


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(event_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific event by ID."""
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    return event


@router.get("/{event_id}/debug")
async def debug_event(event_id: int, db: AsyncSession = Depends(get_db)):
    """Debug endpoint: shows event payload and workflow errors."""
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Get associated workflow runs
    wf_result = await db.execute(
        select(WorkflowRun).where(WorkflowRun.event_id == event_id)
    )
    workflows = wf_result.scalars().all()

    return {
        "event": {
            "id": event.id,
            "event_type": event.event_type,
            "status": event.status,
            "created_at": str(event.created_at),
        },
        "workflows": [
            {
                "id": w.id,
                "status": w.status,
                "error": w.error,
                "started_at": str(w.started_at),
                "completed_at": str(w.completed_at) if w.completed_at else None,
            }
            for w in workflows
        ],
    }
