import logging
from datetime import datetime, timedelta, timezone, date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.models.event import Event
from app.models.workflow import WorkflowRun
from app.models.installation import Installation
from app.auth.dependencies import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary")
async def get_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return high-level analytics summary."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)

    # Total reviews (PR events only)
    total_result = await db.execute(
        select(func.count(Event.id)).where(Event.source == "github")
    )
    total = total_result.scalar() or 0

    # Completed count
    completed_result = await db.execute(
        select(func.count(Event.id)).where(
            Event.source == "github", Event.status == "completed"
        )
    )
    completed = completed_result.scalar() or 0
    success_rate = round((completed / total * 100), 1) if total > 0 else 0.0

    # Today's count
    today_result = await db.execute(
        select(func.count(Event.id)).where(
            Event.source == "github",
            Event.created_at >= today_start,
        )
    )
    reviews_today = today_result.scalar() or 0

    # This week's count
    week_result = await db.execute(
        select(func.count(Event.id)).where(
            Event.source == "github",
            Event.created_at >= week_start,
        )
    )
    reviews_this_week = week_result.scalar() or 0

    # Avg processing time (seconds)
    avg_result = await db.execute(
        select(WorkflowRun.started_at, WorkflowRun.completed_at).where(
            WorkflowRun.status == "completed",
            WorkflowRun.completed_at.isnot(None),
        )
    )
    rows = avg_result.all()
    durations = []
    for row in rows:
        if row.started_at and row.completed_at:
            diff = (row.completed_at - row.started_at).total_seconds()
            if 0 < diff < 300:  # Sanity check: 0–5 minutes
                durations.append(diff)
    avg_processing = round(sum(durations) / len(durations), 1) if durations else 0.0

    # Connected repos (active installations for this user)
    connected_result = await db.execute(
        select(func.count(Installation.id)).where(
            Installation.user_id == current_user.id,
            Installation.is_active == True,
        )
    )
    connected_repos = connected_result.scalar() or 0

    return {
        "total_reviews": total,
        "success_rate": success_rate,
        "avg_processing_seconds": avg_processing,
        "connected_repos": connected_repos,
        "reviews_today": reviews_today,
        "reviews_this_week": reviews_this_week,
    }


@router.get("/timeline")
async def get_timeline(
    days: int = Query(default=30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return daily review counts for the last N days."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)

    result = await db.execute(
        select(Event.created_at, Event.status).where(
            Event.source == "github",
            Event.created_at >= start,
        )
    )
    rows = result.all()

    # Build a dict keyed by date string
    by_date: dict[str, dict] = {}
    for i in range(days):
        d = (now - timedelta(days=days - 1 - i)).date()
        by_date[d.isoformat()] = {"date": d.isoformat(), "total": 0, "completed": 0, "failed": 0}

    for row in rows:
        if row.created_at:
            d_str = row.created_at.date().isoformat()
            if d_str in by_date:
                by_date[d_str]["total"] += 1
                if row.status == "completed":
                    by_date[d_str]["completed"] += 1
                elif row.status == "failed":
                    by_date[d_str]["failed"] += 1

    return list(by_date.values())
