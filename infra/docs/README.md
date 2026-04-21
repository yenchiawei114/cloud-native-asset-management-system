# 部署指南

## 工具需求

開始前確認以下工具已安裝：

```bash
gcloud --version     # Google Cloud CLI
kubectl version      # Kubernetes CLI
helm version         # Helm 3
kustomize version    # Kustomize（或用 kubectl kustomize）
docker --version     # Docker
```

安裝：
- gcloud：https://cloud.google.com/sdk/docs/install
- kubectl：`gcloud components install kubectl`
- helm：https://helm.sh/docs/intro/install/
- kustomize：`brew install kustomize`

---

## 正確執行順序

> 每個步驟都依賴前一步的產出，請嚴格照順序執行。

```
Step 1 — Docker 打包          → 已完成（Phase 0 + Phase 1）
Step 2 — GCP 基礎設施          → step2-gcp-infrastructure.md
Step 3 — Secrets 管理          → step3-secrets.md
Step 4 — k8s Manifests         → step4-k8s-manifests.md
Step 5 — CI/CD                 → step5-cicd.md
Step 6 — 可觀測性              → step6-observability.md
```

---

## Step 1 — Docker 打包（已完成）

**產出：**
- `apps/backend/Dockerfile`
- `apps/frontend/Dockerfile`
- `apps/frontend/nginx/nginx.conf`
- `apps/frontend/nginx/entrypoint.sh`
- `apps/frontend/public/config.js.template`

**本機 smoke test（建議執行一次確認 image 正常）：**

```bash
# Backend
cd apps/backend
docker build -t asset-backend:local .
docker run --rm -e DB_URL=mysql+asyncmy://x:x@x/x -e DB_SYNC_URL=mysql+pymysql://x:x@x/x -e SECRET_KEY=test -p 8000:8000 asset-backend:local
# 應看到 uvicorn 啟動 log

# Frontend
cd apps/frontend
docker build -t asset-frontend:local .
docker run --rm -e API_BASE_URL=https://example.com -p 8080:80 asset-frontend:local
# 瀏覽 http://localhost:8080 確認頁面正常
```

---

## Step 2 — GCP 基礎設施

**文件：** [step2-gcp-infrastructure.md](./step2-gcp-infrastructure.md)

**執行細項（文件內的順序）：**
1. 設定環境變數
2. 啟用 GCP API
3. 建立 Artifact Registry
4. 建立 GCS bucket
5. 建立 Cloud SQL MySQL HA
6. 申請 Static IP
7. 建立 GCP Service Account + IAM 授權
8. 把 secrets 存入 Secret Manager
9. 建立 GKE Autopilot cluster（★ GKE 需要最後建，因為 Memorystore 需要知道 VPC）
10. 建立 Memorystore Redis（與 GKE 同 VPC）
11. 設定 Workload Identity binding（需要 cluster 存在）
12. 設定 Cloud DNS

**產出（填入下方，後續步驟需要）：**

```
PROJECT_ID         = _______________
REGION             = _______________
CLUSTER_NAME       = _______________
ARTIFACT_REGISTRY  = _______________-docker.pkg.dev/_______________/asset
CLOUDSQL_CONN_NAME = _______________:_______________:asset-db
REDIS_HOST         = _______________ （Memorystore IP）
STATIC_IP          = _______________
GCS_BUCKET         = _______________
DOMAIN             = _______________
BACKEND_SA_EMAIL   = asset-backend-sa@_______________.iam.gserviceaccount.com
```

---

## Step 3 — Secrets 管理

**文件：** [step3-secrets.md](./step3-secrets.md)

**前置條件：**
- Step 2 全部完成（需要 GKE cluster + GCP SA）

**執行細項：**
1. 安裝 External Secrets Operator
2. 建立 ClusterSecretStore（指向 GCP Secret Manager）
3. 建立 k8s ServiceAccount + Workload Identity annotation
4. 建立 ExternalSecret（同步 DB URL、SECRET_KEY）

**完成標誌：**
```bash
kubectl get externalsecret -n asset-prod
# STATUS 應顯示 SecretSynced
```

---

## Step 4 — k8s Manifests

**文件：** [step4-k8s-manifests.md](./step4-k8s-manifests.md)

**前置條件：**
- Step 3 完成（ExternalSecret 已同步，Secret 已存在）

**執行細項：**
1. 建立 Namespace
2. 安裝 Nginx Ingress Controller（帶入 Step 2 的 Static IP）
3. 安裝 cert-manager + ClusterIssuer
4. 設定 Cloud DNS A record（★ 需要等 Nginx Ingress LB IP 產生，約 2-3 分鐘）
5. 建立 ConfigMap
6. Apply Cloud SQL Auth Proxy
7. Apply Backend Deployment + Service + HPA + PDB
8. Apply Frontend Deployment + Service
9. Apply Ingress
10. 跑 Migration Job
11. 確認所有 pods 正常

**完成標誌：**
```bash
kubectl get pods -n asset-prod          # 所有 pod Running
kubectl get ingress -n asset-prod       # ADDRESS 有 IP
curl https://<domain>/healthz           # {"status":"ok"}
```

---

## Step 5 — CI/CD

**文件：** [step5-cicd.md](./step5-cicd.md)

**前置條件：**
- Step 2 完成（需要 GCP project + Service Account）

> Step 5 可以與 Step 3、Step 4 平行進行，不互相依賴。

**執行細項：**
1. 建立 GitHub Actions 用 Service Account（`asset-ci-sa`）
2. 設定 Workload Identity Federation（GitHub OIDC → GCP）
3. 在 GitHub 設定 5 個 Repository Secrets
4. 建立 `.github/workflows/test.yml`
5. 建立 `.github/workflows/build.yml`
6. 建立 `.github/workflows/deploy.yml`
7. 設定 Branch Protection Rules

**完成標誌：**
- 開一個 PR → `test.yml` 自動跑並通過
- merge to main → `build.yml` 自動 build image
- `deploy.yml` 手動觸發 → pods 更新成功

---

## Step 6 — 可觀測性

**文件：** [step6-observability.md](./step6-observability.md)

**前置條件：**
- Step 4 完成（app 已在跑）

**執行細項：**
1. 確認 Cloud Logging 有收到 JSON log
2. 建立 Uptime Check（`/healthz`、`/readyz`）
3. 建立 Alert Policy（pod restart loop、5xx rate）
4. 設定通知 channel（Email 或 Slack）
5. （可選）安裝 Prometheus + Grafana

---

## 常用指令速查

```bash
# 查看 pods 狀態
kubectl get pods -n asset-prod

# 查看 backend log
kubectl logs -l app=backend -n asset-prod --tail=50

# 查看 HPA 狀態
kubectl get hpa -n asset-prod

# 查看 ExternalSecret 同步狀態
kubectl get externalsecret -n asset-prod

# 手動觸發 deploy（需先設定 deploy.yml）
gh workflow run deploy.yml -f image_tag=<sha> -f environment=production

# 查看 Cloud SQL 連線狀態
gcloud sql instances describe asset-db --format='value(state)'

# 查看 Memorystore 狀態
gcloud redis instances describe asset-redis --region <REGION> --format='value(state)'
```
