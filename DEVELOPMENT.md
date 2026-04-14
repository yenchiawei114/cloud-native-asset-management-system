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

### 讀寫分離（與未來 DB Proxy 的相容性）

`get_db` 與 `get_read_db` 背後是兩個獨立 engine，對應 `DB_WRITE_URL` / `DB_READ_URL`。本機雖然都指向同一個 MariaDB，但 `DB_READ_URL` 使用 `app_ro`（只有 SELECT 權限）。若路由意外在讀取 session 上寫入，本機就會被 MariaDB 拒絕，行為與雲端 replica 一致。

**開發慣例（重要）：新 endpoint 一律使用 `Depends(get_db)`。** 只有在滿足以下三個條件時才改用 `get_read_db`：

1. Endpoint 是純讀（完全不寫入）
2. 實測證實是效能熱點
3. 可以容忍 replica lag（「剛寫完馬上讀」可能讀到舊資料）

目前專案中**沒有任何 endpoint** 使用 `get_read_db`，這是刻意維持的狀態。

**為什麼這樣設計？** 未來若採用 DB proxy（MaxScale / ProxySQL），讀寫路由、session 一致性、failover 都會交給 proxy 處理，程式只需要認一個 URL。屆時的切換步驟是：

- `DB_WRITE_URL` 與 `DB_READ_URL` 都指向 proxy 的 Service
- 設 `DB_PROBE_READ=false`（`/readyz` 不需重複探測同一個端點）
- **程式零改動**

如果今天就亂用 `get_read_db`，未來切 proxy 時每個 endpoint 都要重新檢視 replica lag 風險。預設用 `get_db` 就沒這個包袱。

### Metrics

`/metrics` 端點由 `ENABLE_METRICS` 環境變數開關，與 `APP_ENV` 解耦。本機預設 `false`，雲端設 `true` 供 Prometheus 抓取。每個環境可獨立決定是否啟用，不需動程式。

### 儲存抽象層

`core/storage.py` 提供 `Storage` ABC，並有 `LocalStorage` 與 `GCSStorage` 兩種實作。Routes 永遠不該直接 import `google.cloud.storage`，只呼叫 `storage.upload() / storage.delete() / storage.get_url()`。切換到 GCS 只需改一個環境變數 `STORAGE_BACKEND=gcs`。

### Alembic

使用 `pymysql` 的 sync engine 跑 migration，比混入 async 簡單穩定。Autogenerate 可用，但 **一定要先 review diff** 才 commit。
