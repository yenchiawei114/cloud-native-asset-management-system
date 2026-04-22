"""Logging 設定。

GKE 上的 Cloud Logging 會自動把看起來像 JSON 的 stdout 解析為 JSON，
並把 `severity` / `message` / `timestamp` 提升為結構化欄位。
本地環境則保留純文字格式，因為終端機顯示較易讀。

透過 LOG_FORMAT=json|text 切換。
"""

import json
import logging
import sys
from datetime import datetime, timezone

from app.core.config import settings

# Python log level → Cloud Logging severity 名稱對應表。
_SEVERITY = {
    logging.DEBUG: "DEBUG",
    logging.INFO: "INFO",
    logging.WARNING: "WARNING",
    logging.ERROR: "ERROR",
    logging.CRITICAL: "CRITICAL",
}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "severity": _SEVERITY.get(record.levelno, record.levelname),
            "message": record.getMessage(),
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "logger": record.name,
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


class _HealthCheckFilter(logging.Filter):
    """過濾掉 uvicorn access log 中的 health check 請求，避免 log 被 probe 洗版。"""

    _PATHS = ("/healthz", "/readyz")

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return not any(path in msg for path in self._PATHS)


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    if settings.log_format.lower() == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
        )

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(settings.log_level.upper())

    logging.getLogger("uvicorn.access").addFilter(_HealthCheckFilter())
