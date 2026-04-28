# Step 2 — GCP 基礎設施開通

> 請照文件順序執行，部分步驟有相依性（例如 Memorystore 需要 GKE 先存在才能確認 VPC）。

## 前置：設定環境變數

每次開新 terminal session 都要重新 export：

```bash
export PROJECT_ID=<your-project-id>
export REGION=asia-east1
export CLUSTER_NAME=asset-cluster
export DOMAIN=<your-domain>

gcloud config set project $PROJECT_ID
gcloud config set compute/region $REGION
```

Console 確認：右上角顯示正確的 project name。

---

## 2.1 啟用所需 API

```bash
gcloud services enable \
  container.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  dns.googleapis.com \
  iam.googleapis.com \
  compute.googleapis.com
```

等待約 1-2 分鐘。Console 確認：IAM & Admin → APIs & Services → Enabled APIs。

---

## 2.2 Artifact Registry

```bash
gcloud artifacts repositories create asset \
  --repository-format docker \
  --location $REGION \
  --description "Asset management docker images"

# 設定本機 docker 認證
gcloud auth configure-docker ${REGION}-docker.pkg.dev
```

**記錄：** `${REGION}-docker.pkg.dev/${PROJECT_ID}/asset`

---

## 2.3 GCS Bucket

```bash
BUCKET_NAME=${PROJECT_ID}-assets

gcloud storage buckets create gs://$BUCKET_NAME \
  --location $REGION \
  --uniform-bucket-level-access

cat > /tmp/cors.json <<EOF
[{
  "origin": ["https://${DOMAIN}"],
  "method": ["GET", "PUT", "POST"],
  "responseHeader": ["Content-Type"],
  "maxAgeSeconds": 3600
}]
EOF
gcloud storage buckets update gs://$BUCKET_NAME --cors-file=/tmp/cors.json
```

**記錄：** Bucket = `${PROJECT_ID}-assets`

---

## 2.4 Cloud SQL MySQL HA

```bash
gcloud sql instances create asset-db \
  --database-version MYSQL_8_0 \
  --tier db-n1-standard-2 \
  --region $REGION \
  --availability-type REGIONAL \
  --backup-start-time 02:00 \
  --enable-bin-log \
  --storage-type SSD \
  --storage-size 20GB \
  --storage-auto-increase
```

> `--availability-type REGIONAL` 開啟 HA（自動 failover），會多開一個 standby instance。

等待約 5-10 分鐘。Console 確認：SQL → asset-db → High availability 顯示 "Enabled"。

```bash
gcloud sql databases create app --instance asset-db

DB_PASSWORD=<your-strong-password>   # 自行設定，記下來
gcloud sql users create app --instance asset-db --password $DB_PASSWORD

# 取得 connection name（Auth Proxy 需要）
gcloud sql instances describe asset-db --format='value(connectionName)'
# 輸出格式：<PROJECT_ID>:<REGION>:asset-db
```

**記錄：** connection name = `_______________`

---

## 2.5 申請 Static IP

```bash
gcloud compute addresses create asset-ingress-ip \
  --global \
  --ip-version IPV4

gcloud compute addresses describe asset-ingress-ip \
  --global --format='value(address)'
```

**記錄：** Static IP = `_______________`

---

## 2.6 GCP Service Account + IAM 授權

```bash
# 建立兩個 SA
gcloud iam service-accounts create asset-backend-sa \
  --display-name "Asset Backend Service Account"

gcloud iam service-accounts create asset-ci-sa \
  --display-name "Asset CI/CD Service Account"

BACKEND_SA="asset-backend-sa@${PROJECT_ID}.iam.gserviceaccount.com"
CI_SA="asset-ci-sa@${PROJECT_ID}.iam.gserviceaccount.com"

# Backend SA：Cloud SQL + GCS + Secret Manager
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member "serviceAccount:${BACKEND_SA}" --role "roles/cloudsql.client"
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member "serviceAccount:${BACKEND_SA}" --role "roles/storage.objectAdmin"
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member "serviceAccount:${BACKEND_SA}" --role "roles/secretmanager.secretAccessor"

# CI SA：push image + deploy
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member "serviceAccount:${CI_SA}" --role "roles/artifactregistry.writer"
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member "serviceAccount:${CI_SA}" --role "roles/container.developer"
```

Console 確認：IAM & Admin → IAM，搜尋 `asset-backend-sa` 確認有三個 role。

---

## 2.7 把 Secrets 存入 GCP Secret Manager

```bash
# 完整 DB connection URL（直接存 URL，應用程式直接使用）
echo -n "mysql+asyncmy://app:${DB_PASSWORD}@cloudsql-proxy:3306/app" \
  | gcloud secrets create asset-db-url --data-file=-

echo -n "mysql+pymysql://app:${DB_PASSWORD}@cloudsql-proxy:3306/app" \
  | gcloud secrets create asset-db-sync-url --data-file=-

# JWT Secret Key
JWT_SECRET=$(openssl rand -hex 32)
echo -n "$JWT_SECRET" | gcloud secrets create asset-secret-key --data-file=-
echo "JWT Secret（請記下）: $JWT_SECRET"

gcloud secrets list   # 確認 3 個 secrets 都在
```

Console 確認：Security → Secret Manager，看到 3 個 secrets。

---

## 2.8 GKE Autopilot Cluster

> ★ GKE 需要在 Memorystore **之前**建立，確保兩者使用同一個 VPC。

```bash
gcloud container clusters create-auto $CLUSTER_NAME \
  --region $REGION \
  --workload-pool=${PROJECT_ID}.svc.id.goog \
  --release-channel regular
```

等待約 5-10 分鐘。取得 kubeconfig：

```bash
gcloud container clusters get-credentials $CLUSTER_NAME --region $REGION
kubectl cluster-info   # 確認可以連線
```

Console 確認：Kubernetes Engine → Clusters → asset-cluster 狀態綠色勾勾。

---

## 2.9 Memorystore Redis

> ★ 必須在 GKE cluster 建立之後執行（確保同一個 VPC）。

```bash
gcloud redis instances create asset-redis \
  --size 1 \
  --region $REGION \
  --tier standard \
  --redis-version redis_7_0 \
  --network default
```

> `--tier standard` 開啟 HA（有 replica，自動 failover）。

等待約 5 分鐘。取得 IP：

```bash
gcloud redis instances describe asset-redis \
  --region $REGION --format='value(host)'
```

**記錄：** Redis host IP = `_______________`

Console 確認：Memorystore → Redis Instances → Tier 顯示 "Standard"。

---

## 2.10 Workload Identity 綁定

> ★ 必須在 GKE cluster 建立之後執行。

```bash
BACKEND_SA="asset-backend-sa@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts add-iam-policy-binding $BACKEND_SA \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:${PROJECT_ID}.svc.id.goog[asset-prod/asset-backend-ksa]"
```

> k8s ServiceAccount `asset-backend-ksa` 在 Step 3 才會建立，
> 但這裡可以提前設定（GCP 允許 binding 指向尚未存在的 k8s SA）。

---

## 2.11 Cloud DNS

> ★ A record 要等 Step 4 裝完 Nginx Ingress 拿到 LB IP 後才能設。這裡先建 zone。

```bash
gcloud dns managed-zones create asset-zone \
  --dns-name ${DOMAIN}. \
  --description "Asset management"

# 取得 name servers（填入你的 domain registrar）
gcloud dns managed-zones describe asset-zone --format='value(nameServers)'
```

把輸出的 4 個 NS 記錄填入 domain registrar（Cloudflare / GoDaddy 等）的 NS 設定。

---

## 完成確認

```bash
echo "=== Artifact Registry ===" && gcloud artifacts repositories list --location=$REGION
echo "=== Cloud SQL ===" && gcloud sql instances describe asset-db --format='value(state)'
echo "=== GKE ===" && kubectl cluster-info
echo "=== Memorystore ===" && gcloud redis instances describe asset-redis --region $REGION --format='value(state)'
echo "=== Secrets ===" && gcloud secrets list
```

全部正常後，把所有「記錄」填入 README.md 的產出欄位，繼續 Step 3。
