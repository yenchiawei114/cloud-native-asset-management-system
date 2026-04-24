import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from prometheus_fastapi_instrumentator import Instrumentator

from app.api import assets, auth, health, ticket, user
from app.core.cache import close_cache
from app.core.config import settings
from app.core.db import dispose_engines
from app.core.logging import configure_logging
from app.core.storage import LocalStorage, storage

configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("starting app (env=%s, storage=%s)", settings.app_env, settings.storage_backend)
    yield
    logger.info("shutting down")
    await dispose_engines()
    await close_cache()


app = FastAPI(title="Asset Management", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 僅本地環境：將上傳檔案掛載於 /static/*，讓前端可直接讀取。
# 雲端環境（GCS）時，URL 由 storage.get_url() 產生，完全繞過本應用程式。
if isinstance(storage, LocalStorage):
    app.mount("/static", StaticFiles(directory=str(storage.root)), name="static")

# Metrics 透過 ENABLE_METRICS 環境變數啟用，與 APP_ENV 解耦，
# 讓每個環境（local/staging/prod）可獨立切換，無須改動程式碼。
if settings.enable_metrics:
    Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

app.include_router(health.router, tags=["health"])
app.include_router(assets.router, prefix="/api", tags=["assets"])
app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(ticket.router, prefix="/api", tags=["tickets"])
app.include_router(user.router, prefix="/api", tags=["users"])
