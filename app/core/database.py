import ssl
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker,AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings


db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

connect_args = {}
is_supabase = "supabase.co" in db_url or "supabase.com" in db_url
if is_supabase:
    ssl_ctx = ssl.create_default_context()
    connect_args["ssl"] = ssl_ctx

# Disable prepared statement cache when using Supabase pooler (PgBouncer transaction mode)
# Required for ports 6543 (transaction) — safe to set for session mode too
if "pooler.supabase.com" in db_url:
    connect_args["statement_cache_size"] = 0

engine = create_async_engine(db_url, echo = settings.DEBUG, connect_args=connect_args)

async_session = async_sessionmaker(engine, class_= AsyncSession, expire_on_commit =False)


class Base(DeclarativeBase):
    pass

async def get_db():
    async with async_session() as session:
        try :
            yield session
            await session.commit()

        except Exception:
            await session.rollback()
            raise
