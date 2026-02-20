from fastapi import FastAPI
from app.core.config import settings
from contextlib import asynccontextmanager
from app.core.database import engine ,Base
from app.models import Event,WorkflowRun

@asynccontextmanager
async def lifespan(app:FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables created")
    yield
    await engine.dispose()
    print("Database connection closed")

app = FastAPI (
    title = settings.APP_NAME,
    description = "AI- powered developer productivity platform",
    version = "0.1.0",
    debug = settings.DEBUG,
    lifespan = lifespan
)


@app.get("/health")
async def health_check():
    return {
        "status":"healthy", 
        "service" : settings.APP_NAME,
        "environment" : settings.APP_ENV,
        }

