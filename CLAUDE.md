# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

All dev tasks go through the root `Makefile`. Run `make help` for the full list.

```bash
make doctor          # verify docker / uv / node / npm are present
make setup           # install backend + frontend deps, copy .env.example -> .env
make infra-up        # start MariaDB + Redis via docker compose (waits for healthcheck)
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
- `infra/local/` — docker-compose for MariaDB + Redis, plus tuned configs

### Environment-aware core layer (critical)

`apps/backend/src/app/core/` is **the only place that knows local vs. cloud**. Everything else (models, routes, frontend) must stay environment-agnostic. When adding features, call into this layer instead of importing cloud SDKs directly.

- `core/config.py` — Pydantic Settings reads `.env` at repo root. Single source of truth for all config.
- `core/db.py` — exposes `get_db` (write session) and `get_read_db` (read session). They are backed by **separate engines** against `DB_WRITE_URL` and `DB_READ_URL`. Locally, `DB_READ_URL` points at a `app_ro` user with SELECT-only grants — writing through `get_read_db` fails locally the same way it would against a cloud replica. **Default to `get_db` everywhere** — see the "Adding a Feature" note. `/readyz` probes both engines; set `DB_PROBE_READ=false` behind a DB proxy where both URLs point at the same endpoint.
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
3. Create router in `app/api/foos.py`, use `Depends(get_db)`. `get_db` auto-rolls back on exception — no transaction boilerplate needed. **Do not reach for `get_read_db`** unless the endpoint is (a) pure read, (b) a proven hot path, and (c) tolerant of replica lag. Keeping every endpoint on `get_db` makes a future DB proxy (MaxScale/ProxySQL) switch a pure infra change with zero code churn. See `DEVELOPMENT.md` → 讀寫分離.
4. Include the router in `app/main.py` with `app.include_router(foos.router, prefix="/api", tags=["foos"])`.

For Redis caching use the shared `from app.core.cache import redis`. For uploads use `from app.core.storage import storage` (works identically on local disk and GCS).

## Conventions

- Do not commit `.env` (it's gitignored). `make setup` copies `.env.example` on first run.
- `CORS_ORIGINS` is comma-separated; locally only `http://localhost:5173` is needed because Vite proxies.
- Cloud assets (Dockerfiles, k8s manifests, CI/CD) live **in this repo** alongside app code — single source of truth, atomic changes across app + infra. Secrets are the only hard exception: they never enter git.

## Deployment TODO

App code is designed to be env-driven: `core/config.py` reads settings from env, `core/storage.py` swaps `LocalStorage` / `GCSStorage` via `STORAGE_BACKEND`, `core/db.py` splits read/write via two URLs, `core/logging.py` switches formatter via `LOG_FORMAT`, and `frontend/public/config.js` injects `API_BASE_URL` at runtime. The goal is that moving to k8s should be an env + manifest change, not a code change — verify this assumption against the current code before each deployment step. What's missing is the packaging + infra layer. Target deployment: GKE + GCS only (MariaDB / Redis self-hosted as container images on k8s, no Cloud SQL / Memorystore).

### Phase 1 — Packaging (blocks any deploy)

- [ ] **`apps/backend/Dockerfile`** — multi-stage, `python:3.12-slim` base, `uv sync --no-dev --extra gcs`, non-root user, `CMD ["uvicorn", ...]` exec form (no `--reload`), uses `--workers N` tuned by env. Must work identically for local `docker build` smoke test and GitHub Actions build — no dev shortcuts baked in.
- [ ] **`apps/frontend/Dockerfile`** — two-stage: `node:20` build → `nginx:alpine` serve. Ships `dist/` + `nginx.conf` + `entrypoint.sh`.
- [ ] **`apps/frontend/public/config.js` → `config.js.template`** — template with `${API_BASE_URL}` placeholder; entrypoint runs `envsubst` on container start so one image targets multiple environments.
- [ ] **`apps/frontend/nginx/nginx.conf`** — SPA fallback (`try_files $uri /index.html`), gzip, cache headers for static assets.
- [ ] **`.dockerignore` × 2** — backend excludes `.venv`, `uploads/`, `__pycache__`, `.pytest_cache`; frontend excludes `node_modules`, `dist`.
- [ ] **Decision: dev stays on host, containers are prod-only.** Do not add a dev target to the Dockerfile — `make backend-dev` / `make frontend-dev` remain the fast iteration path. Containers are used for (a) local smoke test of the prod image, (b) CI build for deploy.

### Phase 2 — k8s manifests skeleton

Prefer **Kustomize** (`base/` + `overlays/staging/` + `overlays/production/`) over Helm for this scale. Layout:

```
infra/k8s/
├── README.md                     # what each piece does, how to apply
├── base/
│   ├── backend/                  # Deployment, Service, HPA
│   ├── frontend/                 # Deployment, Service
│   ├── mariadb/                  # StatefulSet (master + replica), 2 Services (write/read)
│   ├── redis/                    # Deployment (single pod is fine to start)
│   ├── migration/                # Job template (alembic upgrade head)
│   └── ingress/                  # path-based: / → frontend, /api → backend (no CORS needed)
└── overlays/
    ├── staging/
    └── production/
```

- [ ] Backend Deployment: `livenessProbe` → `/healthz`, `readinessProbe` → `/readyz`, resource requests/limits, `securityContext: runAsNonRoot`, env from ConfigMap + Secret.
- [ ] Frontend Deployment: same shape, lighter resources.
- [ ] MariaDB StatefulSet with replication. Easiest path: Bitnami MariaDB Helm chart's values as reference, or `mariadb-operator`. Two Services: `mariadb-write` (→ master pod), `mariadb-read` (→ replica pods).
- [ ] Redis Deployment (single pod to start; Sentinel/cluster later if needed).
- [ ] Migration Job — runs `alembic upgrade head` with the same image as backend. Trigger pre-deploy, not as initContainer (avoids race conditions when scaling).
- [ ] Ingress with path routing — avoids CORS entirely (frontend and `/api` share origin).
- [ ] ConfigMap for non-sensitive env (`APP_ENV`, `LOG_FORMAT`, `ENABLE_METRICS`, `STORAGE_BACKEND`, `GCS_BUCKET`, `GCS_SIGNED_URLS`, URLs pointing at in-cluster Services).
- [ ] HPA on backend (CPU-based to start).

### Phase 3 — GCP infrastructure

Out of git-managed manifests but document here:

- [ ] GKE cluster (Autopilot or Standard, your call).
- [ ] Artifact Registry repo for images.
- [ ] GCS bucket — **private**, with CORS configured for signed URLs from frontend origin.
- [ ] GCP Service Account + **Workload Identity** binding so backend pods access GCS without mounting JSON keys.
- [ ] Cloud DNS + managed certificate for the Ingress.

### Phase 4 — Secrets management

**Never commit secrets**, even to overlays. Pick one:

- [ ] **External Secrets Operator + GCP Secret Manager** (recommended) — secrets live in GCP, ESO syncs them to k8s Secrets. Manifests reference `SecretStore` / `ExternalSecret` resources, not raw values.
- [ ] **Sealed Secrets** — encrypt secrets before committing. Simpler but coupling to cluster key.

### Phase 5 — CI/CD

- [ ] `.github/workflows/build.yml` — on push to main: build backend + frontend images (multi-arch if needed), push to Artifact Registry, tag with `${{ github.sha }}` + `latest`. Use `docker/build-push-action@v5` with `cache-from/to: type=gha`.
- [ ] `.github/workflows/deploy.yml` — after build: run migration Job, then `kustomize build overlays/<env> | kubectl apply -f -`. Or switch to ArgoCD / Flux (GitOps) for declarative sync.
- [ ] `.github/workflows/test.yml` — on PR: `make test` + `ruff check` + frontend lint/typecheck. Must pass before merge.

### Phase 6 — Observability (post-deploy polish)

- [ ] Prometheus stack (`kube-prometheus-stack` Helm chart) scraping `/metrics` from backend.
- [ ] Grafana dashboards for HTTP latency, DB pool saturation, Redis hit rate.
- [ ] Alert rules (PagerDuty / Slack) for error rate, pod restart loops.
- [ ] Structured log-based metrics in Cloud Logging (leverages the JSON log format already in place).

### Non-goals / decisions already made

- **No Cloud SQL / Memorystore** — MariaDB and Redis run as container images on k8s. Trade-off: more ops work, but full portability and lower cost.
- **Read/write split stays app-layer** — `DB_WRITE_URL` / `DB_READ_URL` point at two k8s Services. No MaxScale / ProxySQL unless failover automation becomes a real need.
- **No dev containers** — host-run dev via `make *-dev` is faster and already works. Containers are prod-only.
- **Mono-repo for infra** — Dockerfiles, k8s manifests, CI all live here. Easier for a small team; re-evaluate if the repo outgrows it.
