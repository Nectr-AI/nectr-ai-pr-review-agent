from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class Installation(Base):
    __tablename__ = "installations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    repo_full_name = Column(String, nullable=False, index=True)  # "owner/repo"
    github_repo_id = Column(Integer, nullable=True)
    webhook_id = Column(Integer, nullable=True)           # GitHub webhook ID
    webhook_secret = Column(String, nullable=True)        # per-repo HMAC secret
    installation_id = Column(Integer, nullable=True)      # GitHub App installation ID
    is_active = Column(Boolean, default=True, nullable=False)
    installed_at = Column(DateTime(timezone=True), server_default=func.now())
