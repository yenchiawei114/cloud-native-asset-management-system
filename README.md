# Cloud-Native Asset Management System

一個全端資產管理應用，部署於 GKE Autopilot，搭配完整的 CI/CD、可觀測性與安全管理 stack。

- 本機環境建置：請見 [SETUP.md](./SETUP.md)
- 日常開發與新增功能：請見 [DEVELOPMENT.md](./DEVELOPMENT.md)
- 雲端部署步驟：請見 `infra/docs/`

---

## TL;DR（本機開發）

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

開啟 <http://localhost:5173>，畫面應顯示後端狀態、種子資料與上傳表單。

---

## 專案結構

```
.
├── apps/
│   ├── backend/                  # FastAPI 服務
│   │   ├── src/app/
│   │   │   ├── core/             # config / db / cache / storage / security / logging
│   │   │   ├── models/           # SQLAlchemy models
│   │   │   ├── api/              # route handlers
│   │   │   └── main.py           # FastAPI 進入點
│   │   ├── alembic/              # migrations
│   │   ├── Dockerfile
│   │   └── tests/
│   └── frontend/                 # Vite + React + TS
│       ├── src/
│       ├── nginx/                # nginx.conf + entrypoint.sh
│       ├── public/config.js      # window.__CONFIG__（執行期注入）
│       └── Dockerfile
├── infra/
│   ├── local/                    # docker-compose + MySQL/Redis 設定
│   ├── k8s/                      # Kustomize manifests
│   │   ├── base/                 # Deployment / Service / HPA / PDB / Ingress / ESO
│   │   ├── overlays/production/  # production 差異化設定
│   │   └── cert-manager/         # Google Managed Certificate
│   ├── helm/                     # kube-prometheus-stack / Grafana / Loki / Alloy values
│   └── docs/                     # 雲端部署 step-by-step 說明
└── .github/workflows/
    ├── test.yml                  # PR：pytest + lint + typecheck
    ├── build.yml                 # push main：docker build → Artifact Registry
    └── deploy.yml                # build 後：migration job → kustomize apply
```

`core/` 層是整個 codebase 唯一知道「本機 vs. 雲端」差異的地方——models、routes、frontend 都保持與環境無關。

---

## 雲端架構

| 元件 | 技術 |
| --- | --- |
| 運算 | GKE Autopilot（asia-east1） |
| 資料庫 | Cloud SQL MySQL HA，Cloud SQL Auth Proxy 連線 |
| 快取 | Memorystore for Redis（Standard tier） |
| 儲存 | GCS（signed URL） |
| 網路 | Nginx Ingress Controller + External LoadBalancer |
| TLS | cert-manager + Google Managed Certificate |
| Secrets | External Secrets Operator → GCP Secret Manager |
| 認證 | Workload Identity Federation（CI/CD 與 pod 均不掛 JSON key） |
| 可觀測性 | Prometheus + Grafana + Loki + Alloy（Helm）/ Cloud Logging |

### CI/CD 流程

```
PR → test.yml（pytest / lint / typecheck）
           ↓ merge to main
     build.yml（docker build → Artifact Registry，tag: git sha）
           ↓ 完成後自動觸發
     deploy.yml（kubectl apply migration Job → kustomize | kubectl apply）
```

---

## 文件導覽

| 目的 | 文件 |
| --- | --- |
| 第一次建環境、設定、疑難排解 | [SETUP.md](./SETUP.md) |
| 日常指令、新增功能、架構細節 | [DEVELOPMENT.md](./DEVELOPMENT.md) |
| GCP 基礎建設開通 | [infra/docs/step2-gcp-infrastructure.md](./infra/docs/step2-gcp-infrastructure.md) |
| Secrets 管理（ESO） | [infra/docs/step3-secrets.md](./infra/docs/step3-secrets.md) |
| k8s manifests 部署 | [infra/docs/step4-k8s-manifests.md](./infra/docs/step4-k8s-manifests.md) |
| CI/CD 設定 | [infra/docs/step5-cicd.md](./infra/docs/step5-cicd.md) |
| 可觀測性 stack | [infra/docs/step6-observability.md](./infra/docs/step6-observability.md) |
| Claude Code 專案指南 | [CLAUDE.md](./CLAUDE.md) |
