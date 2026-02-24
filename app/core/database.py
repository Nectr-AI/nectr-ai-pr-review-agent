from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker,AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings


db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(db_url, echo = settings.DEBUG)

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
