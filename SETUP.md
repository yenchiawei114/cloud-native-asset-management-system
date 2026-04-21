# 開發環境建置

本文件說明如何在本機架設本專案的開發環境。雲端部署（GKE、GCS、MySQL、Prometheus/Grafana）不在本文件範圍內。

---

## 前置需求

| 工具   | 版本     | 安裝方式                                                    |
| ------ | -------- | ----------------------------------------------------------- |
| Docker | 最新版   | <https://docs.docker.com/get-docker/>                       |
| uv     | 最新版   | `curl -LsSf https://astral.sh/uv/install.sh \| sh`          |
| Node   | >= v20   | <https://nodejs.org> 或使用 `nvm install 20`                |
| npm    | 內建     | 隨 Node 安裝                                                |

執行 `make doctor` 會一次檢查上述工具是否齊全。支援 macOS（ARM／Intel）與 Linux（Intel／AMD）。Docker 的記憶體維持預設值即可。

> **安裝 uv 後**，請開啟新的 shell 或執行 `source ~/.zshrc`（或對應的 shell 設定檔），讓 `~/.local/bin` 進入 `PATH`，否則 `make doctor` 仍會顯示「uv not found」。

---

## 快速啟動

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

開啟 <http://localhost:5173>，畫面上應該會顯示後端狀態、三筆種子資料，以及一個上傳表單。

---

## 設定檔

所有設定都集中在 repo 根目錄的 **`.env`**（由 `make setup` 從 `.env.example` 複製而來）。只有 Pydantic Settings 會讀取它，其他地方都不應該直接讀環境變數。

主要變數：

| 變數                | 本機預設值                                    | 備註                                         |
| ------------------- | --------------------------------------------- | -------------------------------------------- |
| `DB_WRITE_URL`      | `mysql+asyncmy://app:app@localhost:3306/app`  | 非同步寫入用                                 |
| `DB_READ_URL`       | `mysql+asyncmy://app_ro:app_ro@...`           | 非同步讀取用（本機為唯讀使用者）             |
| `DB_SYNC_URL`       | `mysql+pymysql://app:app@localhost:3306/app`  | 僅供 Alembic                                 |
| `REDIS_URL`         | `redis://localhost:6379/0`                    |                                              |
| `STORAGE_BACKEND`   | `local`                                       | `local` 或 `gcs`                             |
| `STORAGE_LOCAL_DIR` | `apps/backend/uploads`                        | 以 `/static/...` 提供                        |
| `GCS_BUCKET`        | （未設定）                                    | `STORAGE_BACKEND=gcs` 時必填                 |
| `CORS_ORIGINS`      | `http://localhost:5173`                       | 以逗號分隔                                   |

前端的執行期設定放在 **`apps/frontend/public/config.js`**（掛在 `window.__CONFIG__` 上）。本機的 `API_BASE_URL` 為 `""`，由 Vite 代理轉發至後端，因此開發時不需要設定 CORS。部署到雲端時，容器的 entrypoint 會覆寫 `config.js` 指向真正的後端網址，不需要重新 build。

---

## 疑難排解

| 現象                                           | 解決方式                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `make infra-up` 在 healthcheck 階段逾時        | `docker compose -f infra/local/docker-compose.yml logs mariadb`       |
| 後端連不到資料庫                               | 等 `make infra-up` 顯示 `OK MySQL healthy` 後再啟動                 |
| 寫入時出現 `Access denied for user 'app_ro'`   | 讀取路由誤用了寫入操作，請改用 `get_db`                               |
| 前端顯示 `backend err`                         | 後端沒啟動，或 proxy 設定有誤                                         |
| 拉完 code 後 schema 不一致                     | 執行 `make migrate`                                                   |
| 想要全新的資料庫                               | `make infra-reset && make infra-up && make migrate && make seed`      |
| 第一次執行 `npm ci` 失敗                       | 已處理——`make setup` 會自動 fallback 到 `npm install`                 |
