"""Request logging middleware.

每個 HTTP 請求結束後發出一條 logfmt 風格的結構化 log，
欄位包含 service / replica / method / path / status / duration_ms / trace_id，
對應 Dashboard 4「logfmt: Application Request Logs」面板所需格式。
"""

import logging
import os
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("app.access")

_REPLICA = os.environ.get("HOSTNAME", "unknown")
_SKIP_PATHS = {"/healthz", "/readyz", "/metrics"}


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in _SKIP_PATHS:
            return await call_next(request)

        start = time.perf_counter()
        trace_id = request.headers.get("x-cloud-trace-context", uuid.uuid4().hex).split("/")[0]

        response = await call_next(request)

        duration_ms = round((time.perf_counter() - start) * 1000)

        logger.info(
            "request",
            extra={
                "service": "backend",
                "replica": _REPLICA,
                "method": request.method,
                "path": request.url.path,
                "route": request.url.path,
                "status": response.status_code,
                "duration_ms": duration_ms,
                "trace_id": trace_id,
            },
        )
        return response
