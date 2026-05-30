# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

All dev tasks go through the root `Makefile`. Run `make help` for the full list.

```bash
make doctor          # verify docker / uv / node / npm are present
make setup           # install backend + frontend deps, copy .env.example -> .env
make infra-up        # start MySQL + Redis via docker compose (waits for healthcheck)
make infra-down      # stop containers
make infra-reset     # stop + wipe volumes (fresh DB)
make migrate         # alembic upgrade head
make migrate-new m='add widgets'   # autogenerate a migration
make seed            # load sample assets
make backend-dev     # uvicorn --reload on :8000
make frontend-dev    # vite on :5173
make test            # backend pytest + frontend npm test (if present)
make clean           # remove uploads + python caches
```

### Running a single backend test

```bash
cd apps/backend && uv run pytest tests/test_health.py::test_name -v
```

### Backend package management

Backend uses **uv** (not pip/poetry). Add deps with `cd apps/backend && uv add <pkg>`; never edit `pyproject.toml` manually for deps. Run any python command inside the backend via `uv run ...`.

## Architecture

### Repo shape

Monorepo with two apps and shared local infra:

- `apps/backend/` — FastAPI + SQLAlchemy (async) + Alembic + Redis
- `apps/frontend/` — Vite + React + TS (dev server proxies `/api` and `/static` to backend, so no CORS dance locally)
- `infra/local/` — docker-compose for MySQL + Redis, plus tuned configs

### Environment-aware core layer (critical)

`apps/backend/src/app/core/` is **the only place that knows local vs. cloud**. Everything else (models, routes, frontend) must stay environment-agnostic. When adding features, call into this layer instead of importing cloud SDKs directly.

- `core/config.py` — Pydantic Settings reads `.env` at repo root. Single source of truth for all config.
- `core/db.py` — exposes `get_db` (async session). Backed by a single engine against `DB_URL`. `/readyz` probes the engine. **Always use `get_db`** — no read/write split.
- `core/cache.py` — shared async Redis client exported as `redis`. Do not construct your own client.
- `core/storage.py` — `Storage` ABC with `LocalStorage` / `GCSStorage` implementations. Switched via `STORAGE_BACKEND=local|gcs`. Routes call `storage.upload/get_url/delete` and never import `google.cloud.storage`.

### Alembic

Uses a **sync** engine via `pymysql` (`DB_SYNC_URL`) rather than async — simpler and avoids event-loop issues during migrations. Models must be re-exported in `app/models/__init__.py` for autogenerate to see them. Always eyeball the generated diff before committing.

### Frontend runtime config

`apps/frontend/public/config.js` populates `window.__CONFIG__` at runtime (not bundled). Locally `API_BASE_URL = ""` so Vite's proxy handles routing. In cloud deployments the container entrypoint overwrites `config.js` with real URLs — no rebuild needed per environment.

### Metrics

`/metrics` endpoint is opt-in via `ENABLE_METRICS=true` (decoupled from `APP_ENV` so each environment can flip independently). Off by default locally; turn on in cloud for Prometheus to scrape.

### Logging

`core/logging.py` wires stdout logging and switches formatter via `LOG_FORMAT`:
- `text` (local default): human-readable, terminal-friendly.
- `json` (cloud): one JSON object per line with `severity` / `message` / `timestamp` / `logger`. GKE's Cloud Logging auto-parses these fields so severity filtering and structured search Just Work.

## Adding a Feature (reference impl)

`apps/backend/src/app/api/assets.py` + `models/asset.py` is the canonical example. Workflow:

1. Add model under `app/models/foo.py`, re-export in `app/models/__init__.py`.
2. `make migrate-new m='add foos'`, review diff, `make migrate`.
3. Create router in `app/api/foos.py`, use `Depends(get_db)`. `get_db` auto-rolls back on exception — no transaction boilerplate needed.
4. Include the router in `app/main.py` with `app.include_router(foos.router, prefix="/api", tags=["foos"])`.

For Redis caching use the shared `from app.core.cache import redis`. For uploads use `from app.core.storage import storage` (works identically on local disk and GCS).

## Conventions

- Do not commit `.env` (it's gitignored). `make setup` copies `.env.example` on first run.
- `CORS_ORIGINS` is comma-separated; locally only `http://localhost:5173` is needed because Vite proxies.
- Cloud assets (Dockerfiles, k8s manifests, CI/CD) live **in this repo** alongside app code — single source of truth, atomic changes across app + infra. Secrets are the only hard exception: they never enter git.

## Deployment TODO

App code is env-driven: `core/config.py` reads settings from env, `core/storage.py` swaps `LocalStorage` / `GCSStorage` via `STORAGE_BACKEND`, `core/db.py` connects via single `DB_URL`, `core/logging.py` switches formatter via `LOG_FORMAT`, and `frontend/public/config.js` injects `API_BASE_URL` at runtime. Moving to k8s is an env + manifest change, not a code change.

**Target stack:** GKE Autopilot · Cloud SQL MySQL HA · Memorystore for Redis · GCS · Nginx Ingress Controller · GitHub Actions

### Phase 0 — Code cleanup (prerequisite, do first)

Remove the read/write split that no longer applies:

- [ ] `core/db.py` — 移除 `get_read_db`、`read_engine`；只保留 `get_db` + 單一 `DB_URL`
- [ ] `core/config.py` — 移除 `DB_READ_URL`、`DB_PROBE_READ`、`DB_WRITE_URL`，改為單一 `DB_URL`
- [ ] 全域搜尋 `get_read_db`，確認無任何 router 仍在使用
- [ ] `/readyz` 只探測單一 engine

### Phase 1 — Packaging (blocks any deploy)

- [ ] **`apps/backend/Dockerfile`** — multi-stage, `python:3.12-slim` base, `uv sync --no-dev --extra gcs`, non-root user, `CMD ["uvicorn", ...]` exec form (no `--reload`), workers 由 `WEB_CONCURRENCY` env 控制
- [ ] **`apps/frontend/Dockerfile`** — two-stage: `node:20` build → `nginx:alpine` serve `dist/`；包含 `nginx.conf` + `entrypoint.sh`
- [ ] **`apps/frontend/public/config.js` → `config.js.template`** — `${API_BASE_URL}` placeholder；entrypoint 執行 `envsubst` 後輸出為 `config.js`，一個 image 打所有環境
- [ ] **`apps/frontend/nginx/nginx.conf`** — SPA fallback (`try_files $uri /index.html`)、gzip、靜態資源 cache headers
- [ ] **`.dockerignore` × 2** — backend 排除 `.venv`、`uploads/`、`__pycache__`；frontend 排除 `node_modules`、`dist`
- [ ] 本地 smoke test：`docker build` + `docker run` 確認兩個 image 正常啟動

**決策：dev 繼續跑在 host，container 僅用於 prod smoke test 和 CI build。**

### Phase 2 — k8s manifests

使用 **Kustomize**（`base/` + `overlays/staging/` + `overlays/production/`）：

```
infra/k8s/
├── README.md
├── base/
│   ├── backend/        # Deployment, Service, HPA, PodDisruptionBudget
│   ├── frontend/       # Deployment (nginx static), Service
│   ├── cloudsql-proxy/ # Deployment (Cloud SQL Auth Proxy，standalone)
│   ├── migration/      # Job: alembic upgrade head
│   └── ingress/        # Nginx IngressClass + Ingress（/ → frontend，/api → backend）
└── overlays/
    ├── staging/
    └── production/
```

- [ ] **Backend Deployment**
  - `livenessProbe` → `/healthz`，`readinessProbe` → `/readyz`
  - `securityContext: runAsNonRoot: true`
  - env 來自 ConfigMap（非敏感）+ Secret（敏感，由 ESO 同步）
  - anti-affinity：確保 pods 分散在不同 node（Autopilot multi-zone）
  - min replicas: 2（HA）
- [ ] **HPA** — CPU 70% 觸發，min 2 / max 10
- [ ] **PodDisruptionBudget** — `minAvailable: 1`，rolling update 不中斷
- [ ] **Frontend Deployment** — nginx:alpine serve 靜態檔，輕量 resource requests
- [ ] **Cloud SQL Auth Proxy** — 跑為獨立 Deployment（非 sidecar），backend 透過 `127.0.0.1:3306` 連線；Workload Identity 授權，不掛 JSON key
- [ ] **Migration Job** — 用與 backend 相同的 image，pre-deploy 手動觸發，非 initContainer
- [ ] **Nginx Ingress Controller** — 用 Helm 安裝 `ingress-nginx`，建立 LoadBalancer Service 取得 GCP External LB；路徑路由讓 frontend 與 `/api` 共用同一 origin，不需要 CORS
- [ ] **ConfigMap** — `APP_ENV`、`LOG_FORMAT`、`ENABLE_METRICS`、`STORAGE_BACKEND`、`GCS_BUCKET`、`DB_URL`（指向 cloudsql-proxy Service）、`REDIS_URL`（指向 Memorystore VPC 內網址）

### Phase 3 — GCP infrastructure

用 gcloud CLI 手動開通一次，記錄在 `infra/gcp/setup.md`（指令 + 決策，不含 secrets）：

- [ ] **GKE Autopilot cluster** — regional（e.g. `asia-east1`），啟用 Workload Identity
- [ ] **Artifact Registry** — Docker repo，供 CI push image
- [ ] **GCS bucket** — private，設定 CORS 允許你的 domain（signed URL 用）
- [ ] **Cloud SQL MySQL** — HA 實例（啟用 automatic failover），`db-n1-standard-2` 起步；建立 `app` user，限制只能從 Cloud SQL Auth Proxy 連入
- [ ] **Memorystore for Redis** — Standard tier（HA，自動 failover），與 GKE 同 VPC
- [ ] **GCP Service Account** — 綁 Workload Identity，授 `roles/cloudsql.client` + `roles/storage.objectAdmin`
- [ ] **Static global IP** — 給 Nginx Ingress 的 LoadBalancer Service annotation 用
- [ ] **Cloud DNS + Google Managed Certificate** — 指向 global IP

### Phase 4 — Secrets management

- [ ] **External Secrets Operator（ESO）** — Helm 安裝，設定 `ClusterSecretStore` 指向 GCP Secret Manager
- [ ] 每個 secret 建 `ExternalSecret` resource（DB 密碼、Redis AUTH、GCS SA）
- [ ] Manifests 裡只存 `ExternalSecret`，不存實際值；`SecretStore` 的 SA 用 Workload Identity 授權

**絕不 commit secrets，即使是 overlays。**

### Phase 5 — CI/CD

```
.github/workflows/
├── test.yml    # PR trigger：make test + ruff check + frontend lint/typecheck；全過才可 merge
├── build.yml   # push main：docker build → push Artifact Registry，tag: sha + latest
└── deploy.yml  # build 完成後：kubectl apply migration Job → kustomize | kubectl apply
```

- [ ] `build.yml` — 使用 `docker/build-push-action@v5`，`cache-from/to: type=gha`
- [ ] `deploy.yml` — 用 `google-github-actions/auth` + Workload Identity Federation 授權 kubectl（不存 SA JSON key）
- [ ] `deploy.yml` — migration Job 完成後才 apply app manifests（`kubectl wait --for=condition=complete job/migration`）
- [ ] image tag 用 `${{ github.sha }}`，overlays 用 `kustomize edit set image` 注入

### Phase 6 — Observability（post-deploy）

- [ ] **Cloud Logging** — JSON log format 已就位，GKE 自動收集，直接在 Cloud Console 查
- [ ] **Cloud Monitoring** — 建 uptime check（`/healthz`）+ alert policy（5xx rate、latency p99）
- [ ] **Prometheus + Grafana**（可選）— `kube-prometheus-stack` Helm chart，scrape backend `/metrics`（需 `ENABLE_METRICS=true`）
- [ ] **Alert 通知** — Slack 或 Email，觸發條件：error rate 飆升、pod restart loop、Cloud SQL failover

### Decisions made

- **GKE Autopilot** — Google 管 node，只付 pod resource 費用，省 ops 負擔
- **Cloud SQL MySQL HA** — 單 region，automatic failover，不做讀寫分離，優先資料一致性
- **Memorystore for Redis** — 全託管，避免 k8s 上 Redis 的 sysctl 限制（Autopilot 不允許 privileged container）
- **No read/write split** — QPS 不高，單一 `DB_URL`，確保一致性優先
- **Cloud SQL Auth Proxy as standalone Deployment** — 比 sidecar 更容易管理連線數與 scaling
- **No dev containers** — `make *-dev` 繼續為 dev 路徑，container 只用於 prod
- **Mono-repo for infra** — Dockerfiles、k8s manifests、CI 全在同一 repo
