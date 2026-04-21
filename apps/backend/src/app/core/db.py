from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

engine: AsyncEngine = create_async_engine(
    settings.db_url,
    pool_size=settings.db_pool_size,
    pool_pre_ping=True,
    pool_recycle=3600,
)

Session = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with Session() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def dispose_engines() -> None:
    await engine.dispose()
