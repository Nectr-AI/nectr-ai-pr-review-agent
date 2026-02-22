from pydantic import BaseModel
from typing import Optional ,Any
from datetime import datetime

class WebhookPayload(BaseModel):
    event_type: str
    source: str
    payload: dict[str,Any]

class EventResponse(BaseModel):
    id: int
    event_type: str
    source: str
    status :str
    created_at: datetime

    class Config:
        from_attributes = True
