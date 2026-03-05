import asyncio
import time
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from contextlib import asynccontextmanager
from app.core.database import engine, Base, async_session
from app.core.neo4j_client import init_driver, close_driver, get_session, is_available as neo4j_available
from app.core.neo4j_schema import create_schema
from app.models import Event, WorkflowRun, User, Installation, OAuthState
from app.api.v1.webhooks import router as webhook_router
from app.api.v1.events import router as events_router
from app.api.v1.reviews import router as reviews_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.repos import router as repos_router
from app.api.v1.memory import router as memory_router
from app.auth.router import router as auth_router
from sqlalchemy import select, text

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

startup_time = time.time()


async def _scan_unindexed_repos():
    """
    Background task: runs after startup.
    Finds all active installations not yet in Neo4j and scans their file trees.
    Skips gracefully if Neo4j is not configured.
    """
    if not neo4j_available():
        return

    await asyncio.sleep(5)  # Let the server fully start

    from app.services.graph_builder import build_repo_graph
    from app.auth.token_encryption import decrypt_token

    try:
        async with async_session() as db:
            result = await db.execute(
                select(Installation, User)
                .join(User, Installation.user_id == User.id)
                .where(Installation.is_active == True)
            )
            rows = result.all()

        logger.info(f"Startup scan: checking {len(rows)} active installation(s)")

        for installation, user in rows:
            repo_full_name = installation.repo_full_name

            # Check if already indexed in Neo4j
            already_indexed = False
            try:
                async with get_session() as session:
                    r = await session.run(
                        "MATCH (r:Repository {full_name: $fn}) RETURN r.scanned_at LIMIT 1",
                        fn=repo_full_name,
                    )
                    record = await r.single()
                    already_indexed = record is not None
            except Exception:
                pass

            if already_indexed:
                logger.debug(f"Startup scan: {repo_full_name} already indexed, skipping")
                continue

            logger.info(f"Startup scan: indexing {repo_full_name}")
            try:
                owner, repo = repo_full_name.split("/")
                access_token = decrypt_token(user.github_access_token)
                await build_repo_graph(owner, repo, access_token)
            except Exception as e:
                logger.warning(f"Startup scan failed for {repo_full_name}: {e}")

    except Exception as e:
        logger.warning(f"Startup scan task error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # PostgreSQL
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables created")

    # Neo4j
    await init_driver()
    await create_schema()

    # Backfill any connected repos not yet in Neo4j
    asyncio.create_task(_scan_unindexed_repos())

    yield

    await engine.dispose()
    print("Database connection closed")
    await close_driver()


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
    "http://localhost:3001",  # Next.js dev server
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
app.include_router(memory_router, prefix="/api/v1")


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
    """Health check: database, Neo4j, and uptime."""
    uptime_seconds = round(time.time() - startup_time, 1)

    db_status = "healthy"
    try:
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    neo4j_status = "not configured"
    if neo4j_available():
        try:
            async with get_session() as session:
                await session.run("RETURN 1")
            neo4j_status = "healthy"
        except Exception as e:
            neo4j_status = f"unhealthy: {str(e)}"

    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.APP_ENV,
        "uptime_seconds": uptime_seconds,
        "database": db_status,
        "neo4j": neo4j_status,
    }
