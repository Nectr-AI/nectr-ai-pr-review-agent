from sqlalchemy import Column,String, Text, DateTime ,Integer,ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base

class WorkflowRun(Base):

    __tablename__ = "workflow_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    workflow_type = Column(String(50), nullable=False)     # "pr_review", "error_triage", "ticket_sync"
    status = Column(String(20), default="running")         # "running", "completed", "failed"
    result = Column(Text, nullable=True)                   # JSON result of what happened
    error = Column(Text, nullable=True)                    # Error message if failed
    started_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)

    