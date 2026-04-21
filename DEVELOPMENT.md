# 開發方法

本文件說明日常開發流程與新增功能的標準作法。關於環境建置，請參考 [SETUP.md](./SETUP.md)。

---

## 日常流程

| 任務                | 指令                           |
| ------------------- | ------------------------------ |
| 啟動本機基礎設施    | `make infra-up`                |
| 關閉本機基礎設施    | `make infra-down`              |
| 清除 DB volumes     | `make infra-reset`             |
| 啟動後端            | `make backend-dev`             |
| 啟動前端            | `make frontend-dev`            |
| 新增 migration      | `make migrate-new m='add foo'` |
| 套用 migration      | `make migrate`                 |
| 載入種子資料        | `make seed`                    |
| 執行測試            | `make test`                    |
| 清除 cache 與上傳檔 | `make clean`                   |

### 執行單一後端測試

```bash
cd apps/backend && uv run pytest tests/test_health.py::test_name -v
```

### 後端套件管理

後端使用 **uv**（非 pip／poetry）。新增套件請在 `apps/backend` 目錄下執行 `uv add <pkg>`，不要手動編輯 `pyproject.toml` 的相依套件區塊。所有 Python 指令都透過 `uv run ...` 執行。

---

## 新增功能

以下三個配方足以應付大多數 endpoint。直接複製、改名、調整即可。`apps/backend/src/app/api/assets.py` 是參考實作。

### 1. 新增 model 與 migration

```python
# apps/backend/src/app/models/widget.py
from datetime import datetime
from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class Widget(Base):
    __tablename__ = "widgets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

重新 export，讓 Alembic 能偵測到：

```python
# apps/backend/src/app/models/__init__.py
from app.models.widget import Widget  # noqa: F401
```

接著：

```bash
make migrate-new m='add widgets'   # 自動產生 migration
# 打開 apps/backend/alembic/versions/<new>.py 確認 diff
make migrate                       # 套用
```

### 2. 透過 DB 讀寫

```python
# apps/backend/src/app/api/widgets.py
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Widget

router = APIRouter()

@router.get("/widgets")
async def list_widgets(db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.scalars(select(Widget))).all()
    return [{"id": w.id, "name": w.name} for w in rows]

@router.post("/widgets", status_code=201)
async def create_widget(name: str, db: AsyncSession = Depends(get_db)) -> dict:
    w = Widget(name=name)
    db.add(w)
    await db.commit()
    await db.refresh(w)
    return {"id": w.id, "name": w.name}
```

在 `main.py` 中註冊：

```python
from app.api import widgets
app.include_router(widgets.router, prefix="/api", tags=["widgets"])
```

完成了——不需要自己管 transaction，也不需要寫錯誤處理樣板。`get_db` 發生例外時會自動 rollback。

### 3. 用 Redis 做 cache

```python
from app.core.cache import redis

@router.get("/widgets/{id}/stats")
async def stats(id: int) -> dict:
    cache_key = f"widget:stats:{id}"
    cached = await redis.get(cache_key)
    if cached:
        return {"hits": int(cached), "source": "cache"}

    hits = await expensive_query(id)              # 你的程式
    await redis.setex(cache_key, 60, hits)        # 60 秒 TTL
    return {"hits": hits, "source": "db"}
```

`redis` 是共用的非同步 client，不要自己建立新的實例。常用操作：`get / set / setex / delete / incr / expire`。完整指令列表請見 <https://redis.io/docs/latest/commands/>。

### 4. 儲存檔案

```python
from uuid import uuid4
from app.core.storage import storage

key = f"widgets/{uuid4().hex}/{filename}"
await storage.upload(key, data)   # 傳入 bytes，回傳 key
url = storage.get_url(key)        # 產出公開網址
await storage.delete(key)
```

本機會寫入 `apps/backend/uploads/` 並以 `/static/...` 提供。雲端在 `STORAGE_BACKEND=gcs` 的設定下會直接打 GCS，程式完全不用改。

---

## 架構重點

### 雲端架構相容性（與 DB Proxy 的對接）

目前的開發慣例是所有新 endpoint 一律使用 `Depends(get_db)`。

**為什麼預設只用 `get_db`？**
- **簡化維護**：現代雲端架構通常透過 Database Proxy (如 Cloud SQL Auth Proxy 或 AlloyDB Proxy) 處理讀寫分流與負載平衡。
- **防止讀取延遲問題**：寫入後立即讀取時，如果誤用了 read-replica 且同步有延遲，會讀到舊資料。使用單一入口點能有效避免此問題。
- **架構純粹**：程式碼不需要關心底層是單機還是叢集，所有路由、session 一致性、failover 都交給基礎設施層處理。

本機開發環境已簡化為單一 `DB_URL` 並移除 `get_read_db`，確保程式碼在任何環境下皆具備高度的一致性與可移植性。

### Metrics

`/metrics` 端點由 `ENABLE_METRICS` 環境變數開關，與 `APP_ENV` 解耦。本機預設 `false`，雲端設 `true` 供 Prometheus 抓取。每個環境可獨立決定是否啟用，不需動程式。

### 儲存抽象層

`core/storage.py` 提供 `Storage` ABC，並有 `LocalStorage` 與 `GCSStorage` 兩種實作。Routes 永遠不該直接 import `google.cloud.storage`，只呼叫 `storage.upload() / storage.delete() / storage.get_url()`。切換到 GCS 只需改一個環境變數 `STORAGE_BACKEND=gcs`。

### Alembic

使用 `pymysql` 的 sync engine 跑 migration，比混入 async 簡單穩定。Autogenerate 可用，但 **一定要先 review diff** 才 commit。
