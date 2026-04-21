from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# .env 位於 repo 根目錄：apps/backend/src/app/core/config.py → 往上 5 層
_REPO_ROOT = Path(__file__).resolve().parents[5]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: str = "local"
    log_level: str = "DEBUG"
    log_format: str = "text"  # "text" | "json"（雲端環境建議使用 json）

    # DB：應用程式用 async driver，Alembic 用 sync driver
    db_url: str = Field(...)
    db_sync_url: str = Field(...)
    db_pool_size: int = 5

    redis_url: str = "redis://localhost:6379/0"

    # JWT
    secret_key: str = Field(...)
    algorithm: str = "HS256"

    # Storage backend："local" 或 "gcs"
    storage_backend: str = "local"
    storage_local_root: str = "./uploads"
    storage_local_base_url: str = "http://localhost:8000/static"
    gcs_bucket: str | None = None
    gcs_signed_urls: bool = False
    gcs_url_ttl_seconds: int = 3600

    # 與 app_env 解耦，讓 staging 可獨立關閉 metrics 而無須改動程式碼。
    enable_metrics: bool = False

    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
