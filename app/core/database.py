from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker,AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings


engine = create_async_engine(settings.DATABASE_URL, echo = settings.DEBUG)

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
