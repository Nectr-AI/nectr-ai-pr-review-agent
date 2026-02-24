import time
import logging
from fastapi import FastAPI, Request
from app.core.config import settings
from contextlib import asynccontextmanager
from app.core.database import engine, Base, async_session
from app.models import Event, WorkflowRun
from app.api.v1.webhooks import router as webhook_router
from app.api.v1.events import router as events_router
from sqlalchemy import text

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

startup_time = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables created")
    yield
    await engine.dispose()
    print("Database connection closed")


app = FastAPI(
    title=settings.APP_NAME,
    description="AI-powered developer productivity platform",
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
    lifespan=lifespan,
)

app.include_router(webhook_router, prefix="/api/v1")
app.include_router(events_router, prefix="/api/v1")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests with method, path, and response time."""
    start = time.time()
    response = await call_next(request)
    duration = round((time.time() - start) * 1000, 2)
    logger.info(f"{request.method} {request.url.path} → {response.status_code} ({duration}ms)")
    return response


@app.get("/health")
async def health_check():
    """
    Enhanced health check with database connectivity and uptime info.
    """
    uptime_seconds = round(time.time() - startup_time, 1)

    # Check database connectivity
    db_status = "healthy"
    try:
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.APP_ENV,
        "uptime_seconds": uptime_seconds,
        "database": db_status,
    }
