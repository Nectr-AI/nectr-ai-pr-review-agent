from fastapi import FastAPI
from app.core.config import settings



app = FastAPI(
    title = settings.APP_NAME,
    description = "AI- powered developer productivity platform",
    version = "0.1.0",
    debug = settings.DEBUG
)

@app.get("/health")
async def health_check():
    return {"status":"healthy", "service" : settings.APP_NAME,"environment" : settings.APP_ENV}

