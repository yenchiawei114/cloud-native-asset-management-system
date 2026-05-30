from fastapi import Request
from slowapi import Limiter

from app.core.config import settings


def _get_client_ip(request: Request) -> str:
    """取得真實客戶端 IP，優先讀取 Nginx Ingress 注入的 X-Forwarded-For。"""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(
    key_func=_get_client_ip,
    storage_uri=settings.redis_url,
)
