# Cloud-Native Asset Management System

一個全端資產管理應用。本 README 聚焦於 **本機開發**——雲端部署（GKE、GCS、MySQL 主從、Prometheus/Grafana）雖然已透過設定接入 codebase，但不在本文件涵蓋範圍內。

- 環境建置：請見 [SETUP.md](./SETUP.md)
- 日常開發與新增功能：請見 [DEVELOPMENT.md](./DEVELOPMENT.md)

---

## TL;DR

```bash
make doctor          # 檢查 docker / uv / node / npm
make setup           # 安裝後端與前端相依套件，並複製 .env
make infra-up        # 以 Docker 啟動 MySQL + Redis
make migrate         # 建立資料表
make seed            # 載入範例資料

# 開兩個終端機：
make backend-dev     # FastAPI 跑在 http://localhost:8000
make frontend-dev    # Vite   跑在 http://localhost:5173
```

開啟 <http://localhost:5173>，畫面應顯示後端狀態、三筆種子資料與上傳表單。完整步驟與疑難排解請見 [SETUP.md](./SETUP.md)。

---

## 專案結構

```
.
├── apps/
│   ├── backend/                  # FastAPI 服務
│   │   ├── src/app/
│   │   │   ├── core/             # config / db / cache / storage
│   │   │   ├── models/           # SQLAlchemy models
│   │   │   ├── api/              # route handlers
│   │   │   └── main.py           # FastAPI 進入點
│   │   ├── alembic/              # migrations
│   │   ├── scripts/seed.py
│   │   └── tests/
│   └── frontend/                 # Vite + React + TS
│       ├── src/
│       │   ├── lib/              # api client + 執行期設定
│       │   ├── App.tsx
│       │   └── main.tsx
│       └── public/config.js      # window.__CONFIG__（執行期注入）
├── infra/local/                  # docker-compose + MySQL/Redis 設定
├── .env.example                  # 複製為 .env
└── Makefile                      # 所有開發任務
```

`core/` 層是整個 codebase 唯一知道「本機 vs. 雲端」差異的地方——models、routes、frontend 都保持與環境無關。

---

## 文件導覽

| 目的                         | 文件                               |
| ---------------------------- | ---------------------------------- |
| 第一次建環境、設定、疑難排解 | [SETUP.md](./SETUP.md)             |
| 日常指令、新增功能、架構細節 | [DEVELOPMENT.md](./DEVELOPMENT.md) |
| Claude Code 專案指南         | [CLAUDE.md](./CLAUDE.md)           |

---

## 待設定

- Kubernetes manifests／Helm charts（雲端）
- GitHub Actions workflows（計畫中）
- Prometheus + Grafana stack（雲端）
- GCS bucket 初始化／IAM（雲端）
- MySQL (GCP Cloud SQL / Local Docker)
- Redis (GCP MemoryStore / Local Docker)

程式碼的組織方式讓這些東西日後要補上時，不需要動到商業邏輯——只會影響 `core/` 層與 infra manifests。
