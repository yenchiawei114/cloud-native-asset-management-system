from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "asset_backend",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.core.email"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,          # worker 崩潰時任務會重新排入佇列
    worker_prefetch_multiplier=1, # 一次只取一個任務，避免任務堆積在記憶體
)
