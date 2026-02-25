import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from contextlib import asynccontextmanager
from app.core.database import engine, Base, async_session
from app.models import Event, WorkflowRun, User, Installation, OAuthState
from app.api.v1.webhooks import router as webhook_router
from app.api.v1.events import router as events_router
from app.api.v1.reviews import router as reviews_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.repos import router as repos_router
from app.auth.router import router as auth_router
from sqlalchemy import text

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

# CORS — locked down for production cookie auth
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
]
if settings.FRONTEND_URL and settings.FRONTEND_URL not in ALLOWED_ORIGINS:
    ALLOWED_ORIGINS.append(settings.FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Auth
app.include_router(auth_router)

# API v1
app.include_router(webhook_router, prefix="/api/v1")
app.include_router(events_router, prefix="/api/v1")
app.include_router(reviews_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
app.include_router(repos_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    """Enhanced health check with database connectivity and uptime info."""
    uptime_seconds = round(time.time() - startup_time, 1)

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
