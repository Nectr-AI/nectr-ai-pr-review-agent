from sqlalchemy import Column, String, DateTime, Text, Integer
from sqlalchemy.sql import func
from app.core.database import Base

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer,primary_key = True,autoincrement = True)
    event_type = Column(String(50),nullable = False)
    source = Column(String(50),nullable = False)
    payload = Column(Text,nullable = False)
    status = Column(String(20),nullable =False)
    created_at = Column(DateTime,server_default = func.now())
    processed_at = Column(DateTime,nullable=True)
