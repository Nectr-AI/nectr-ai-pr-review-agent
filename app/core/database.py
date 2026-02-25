import ssl
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker,AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings


db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

connect_args = {}
if "supabase.co" in db_url or "pooler.supabase.com" in db_url:
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE
    connect_args["ssl"] = ssl_ctx

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
