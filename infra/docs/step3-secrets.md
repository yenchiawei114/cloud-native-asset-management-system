# Step 3 — Secrets 管理

> 使用 External Secrets Operator（ESO）+ GCP Secret Manager。
> Manifests 裡只存 ExternalSecret resource，不存實際值。
> GCP Secret Manager 的 secrets 已在 Step 2.7 存好。

## 前置條件

- Step 2 全部完成（GKE cluster 存在、3 個 secrets 已存入 Secret Manager、WIF binding 已設定）
- kubectl 已設定好（`gcloud container clusters get-credentials ...`）

---

## 3.1 建立 Namespace

```bash
kubectl create namespace asset-prod
```

---

## 3.2 建立 k8s ServiceAccount（Workload Identity）

```bash
# 建立 k8s SA
kubectl create serviceaccount asset-backend-ksa -n asset-prod

# 加上 annotation，讓它對應到 GCP SA（Step 2.10 已設好 WIF binding）
kubectl annotate serviceaccount asset-backend-ksa \
  iam.gke.io/gcp-service-account=asset-backend-sa@<PROJECT_ID>.iam.gserviceaccount.com \
  -n asset-prod
```

---

## 3.3 安裝 External Secrets Operator

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm repo update

helm upgrade --install external-secrets external-secrets/external-secrets \
  --namespace external-secrets --create-namespace \
  --set installCRDs=true
```

確認 pods 正常：
```bash
kubectl get pods -n external-secrets
# 應看到 external-secrets 開頭的 pods 都是 Running
```

---

## 3.4 建立 ClusterSecretStore

ClusterSecretStore 讓所有 namespace 都能從同一個 Secret Manager 拉 secrets。

建立檔案 `infra/k8s/base/secrets/cluster-secret-store.yaml`：

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: gcp-secret-manager
spec:
  provider:
    gcpsm:
      projectID: <PROJECT_ID>
      auth:
        workloadIdentity:
          clusterLocation: <REGION>
          clusterName: <CLUSTER_NAME>
          serviceAccountRef:
            name: asset-backend-ksa
            namespace: asset-prod
```

```bash
kubectl apply -f infra/k8s/base/secrets/cluster-secret-store.yaml

# 確認狀態
kubectl get clustersecretstore gcp-secret-manager
# STATUS 應顯示 Valid
```

---

## 3.5 建立 ExternalSecret

建立檔案 `infra/k8s/base/secrets/backend-external-secret.yaml`：

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: backend-secret
  namespace: asset-prod
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: gcp-secret-manager
    kind: ClusterSecretStore
  target:
    name: backend-secret      # ESO 產生的 k8s Secret 名稱
    creationPolicy: Owner
  data:
    - secretKey: DB_URL        # k8s Secret 的 key
      remoteRef:
        key: asset-db-url      # GCP Secret Manager 的 secret 名稱（Step 2.7 存的）
    - secretKey: DB_SYNC_URL
      remoteRef:
        key: asset-db-sync-url
    - secretKey: SECRET_KEY
      remoteRef:
        key: asset-secret-key
```

```bash
kubectl apply -f infra/k8s/base/secrets/backend-external-secret.yaml
```

---

## 3.6 確認同步成功

```bash
# 查看 ExternalSecret 狀態（等待約 30 秒）
kubectl get externalsecret backend-secret -n asset-prod
# READY 欄位應顯示 True，STATUS 顯示 SecretSynced

# 確認 k8s Secret 已產生（值是 base64，正常不會明文顯示）
kubectl get secret backend-secret -n asset-prod
```

如果 READY 顯示 False，查看詳細錯誤：
```bash
kubectl describe externalsecret backend-secret -n asset-prod
# 常見原因：WIF binding 未生效（等 1-2 分鐘）、SA annotation 寫錯
```

---

## Secret 對應清單

| GCP Secret Manager | k8s Secret key | 說明 |
|-------------------|----------------|------|
| `asset-db-url` | `DB_URL` | 完整 asyncmy URL（backend 用） |
| `asset-db-sync-url` | `DB_SYNC_URL` | 完整 pymysql URL（Alembic migration 用） |
| `asset-secret-key` | `SECRET_KEY` | JWT signing key |

Step 4（k8s manifests）的 backend Deployment 會透過 `envFrom.secretRef` 讀取這些值。
