from fastapi import APIRouter
from sqlalchemy import text

from app.core.cache import redis
from app.core.config import settings
from app.core.db import read_engine, write_engine

router = APIRouter()


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    """Liveness：程序存活即可，不檢查任何外部依賴。"""
    return {"status": "ok"}


@router.get("/readyz")
async def readyz() -> dict[str, str]:
    """Readiness：檢查 write DB（以及可選的 read DB）與 Redis 是否可連線。

    本地環境同時探測兩個 engine，若 read replica 設定錯誤會讓 pod 變為 unready。
    若部署在 DB proxy 後方（僅單一端點），請設定 DB_PROBE_READ=false 以略過重複探測。
    """
    async with write_engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    if settings.db_probe_read:
        async with read_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    await redis.ping()
    return {"status": "ready"}
