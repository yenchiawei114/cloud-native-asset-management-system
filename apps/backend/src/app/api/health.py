from fastapi import APIRouter
from sqlalchemy import text

from app.core.cache import redis
from app.core.db import engine

router = APIRouter()


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    """Liveness：程序存活即可，不檢查任何外部依賴。"""
    return {"status": "ok"}


@router.get("/readyz")
async def readyz() -> dict[str, str]:
    """Readiness：檢查 DB 與 Redis 是否可連線。"""
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    await redis.ping()
    return {"status": "ready"}
