from redis.asyncio import Redis, from_url

from app.core.config import settings

redis: Redis = from_url(settings.redis_url, decode_responses=True)


async def close_cache() -> None:
    await redis.aclose()
