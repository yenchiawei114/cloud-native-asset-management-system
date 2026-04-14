from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings


def _build_engine(url: str) -> AsyncEngine:
    return create_async_engine(
        url,
        pool_size=settings.db_pool_size,
        pool_pre_ping=True,
        pool_recycle=3600,
    )


write_engine: AsyncEngine = _build_engine(settings.db_write_url)
read_engine: AsyncEngine = _build_engine(settings.db_read_url)

WriteSession = async_sessionmaker(write_engine, expire_on_commit=False)
ReadSession = async_sessionmaker(read_engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """預設 DB session（write engine）。除非有特殊理由，否則一律使用此函式。

    發生例外時自動 rollback，讓 endpoint 程式碼不必為了清理而自行包 try/except。
    """
    async with WriteSession() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def get_read_db() -> AsyncGenerator[AsyncSession, None]:
    """唯讀 session，請謹慎使用。

    新 endpoint 一律預設使用 get_db，只有同時滿足以下條件才切換到 get_read_db：
    (a) endpoint 為純讀取操作；
    (b) 已被證實為 hot path；
    (c) 可以容忍 replica lag（避免「剛寫入馬上讀取卻讀不到」的 bug）。

    未來規劃：若導入 DB proxy（MaxScale / ProxySQL），讀寫路由會移到 proxy 處理，
    此函式會退化為 get_db 的別名。目前所有 endpoint 都使用 get_db，
    未來切換只是純粹的 infra 變更，不需改動任何應用程式碼。
    """
    async with ReadSession() as session:
        yield session


async def dispose_engines() -> None:
    await write_engine.dispose()
    await read_engine.dispose()
