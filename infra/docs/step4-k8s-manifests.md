# Step 4 — k8s Manifests

## 前置條件

- Step 2 完成（有 Artifact Registry URL、Cloud SQL connection name、Memorystore IP、Static IP）
- Step 3 完成（ExternalSecret 已 READY，`backend-secret` k8s Secret 已存在）
- kubectl 已設定好

## 目錄結構

```
infra/k8s/
├── base/
│   ├── backend/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── hpa.yaml
│   │   └── pdb.yaml
│   ├── frontend/
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   ├── cloudsql-proxy/
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   ├── migration/
│   │   └── job.yaml
│   ├── ingress/
│   │   └── ingress.yaml
│   └── kustomization.yaml
└── overlays/
    ├── staging/
    │   ├── kustomization.yaml
    │   └── patches/
    │       └── backend-replicas.yaml
    └── production/
        ├── kustomization.yaml
        └── patches/
            └── backend-replicas.yaml
```

---

## Step 1 — 安裝 Nginx Ingress Controller

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.loadBalancerIP=<STATIC_IP> \
  --set controller.service.annotations."networking\.gke\.io/load-balancer-type"=External
```

`<STATIC_IP>` = Step 2.5 申請的 static IP。

確認 Controller 正常（等待 LB 建立，約 2-3 分鐘）：
```bash
kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx
# EXTERNAL-IP 應顯示 static IP
```

---

## Step 1b — 設定 DNS A record

> ★ 必須等 Nginx Ingress LB IP 確認後才執行（Step 1 完成、`EXTERNAL-IP` 有值）。

```bash
export PROJECT_ID=<your-project-id>
export DOMAIN=<your-domain>
export STATIC_IP=<your-static-ip>

gcloud dns record-sets create ${DOMAIN}. \
  --zone asset-zone \
  --type A \
  --ttl 300 \
  --rrdatas $STATIC_IP
```

確認 DNS 傳播（可能需要幾分鐘到數小時）：
```bash
dig $DOMAIN +short   # 應回傳 STATIC_IP
```

確認 Controller 正常：
```bash
kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx
```

---

## Step 2 — 建立 Namespace

```bash
kubectl create namespace asset-prod
kubectl create namespace asset-staging   # 若需要 staging
```

---

## Step 3 — ConfigMap（非敏感設定）

```yaml
# base/backend/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: backend-config
data:
  APP_ENV: "production"
  LOG_FORMAT: "json"
  LOG_LEVEL: "INFO"
  ENABLE_METRICS: "true"
  STORAGE_BACKEND: "gcs"
  GCS_BUCKET: "<your-bucket-name>"
  GCS_SIGNED_URLS: "true"
  GCS_URL_TTL_SECONDS: "3600"
  DB_POOL_SIZE: "5"
  WEB_CONCURRENCY: "2"
  # Cloud SQL Auth Proxy 跑在 cloudsql-proxy Service，port 3306
  DB_URL: "mysql+asyncmy://app:<password>@cloudsql-proxy:3306/app"
  DB_SYNC_URL: "mysql+pymysql://app:<password>@cloudsql-proxy:3306/app"
  # Memorystore Redis 內網 IP（Phase 3 Step 5 取得）
  REDIS_URL: "redis://<memorystore-ip>:6379/0"
  CORS_ORIGINS: "https://<your-domain>"
```

> 注意：`DB_URL` 與 `DB_SYNC_URL` 中的密碼應改為從 Secret 讀取，詳見 Phase 4。

---

## Step 4 — Cloud SQL Auth Proxy

```yaml
# base/cloudsql-proxy/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cloudsql-proxy
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cloudsql-proxy
  template:
    metadata:
      labels:
        app: cloudsql-proxy
      annotations:
        # Workload Identity 對應的 GCP Service Account
        iam.gke.io/gcp-service-account: asset-backend-sa@<PROJECT_ID>.iam.gserviceaccount.com
    spec:
      serviceAccountName: asset-backend-ksa   # k8s ServiceAccount
      containers:
        - name: cloudsql-proxy
          image: gcr.io/cloud-sql-connectors/cloud-sql-proxy:2
          args:
            - "--structured-logs"
            - "--port=3306"
            - "<PROJECT_ID>:<REGION>:<INSTANCE_NAME>"
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 200m
              memory: 256Mi
```

```yaml
# base/cloudsql-proxy/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: cloudsql-proxy
spec:
  selector:
    app: cloudsql-proxy
  ports:
    - port: 3306
      targetPort: 3306
```

`<PROJECT_ID>:<REGION>:<INSTANCE_NAME>` = Cloud SQL connection name，可從 GCP Console 或 Phase 3 的指令取得。

---

## Step 5 — Backend Deployment

```yaml
# base/backend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
      annotations:
        iam.gke.io/gcp-service-account: asset-backend-sa@<PROJECT_ID>.iam.gserviceaccount.com
    spec:
      serviceAccountName: asset-backend-ksa
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchLabels:
                    app: backend
                topologyKey: topology.kubernetes.io/zone
      containers:
        - name: backend
          image: <REGION>-docker.pkg.dev/<PROJECT_ID>/asset/backend:latest
          ports:
            - containerPort: 8000
          envFrom:
            - configMapRef:
                name: backend-config
            - secretRef:
                name: backend-secret   # Phase 4 的 ESO 產生
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 15
          readinessProbe:
            httpGet:
              path: /readyz
              port: 8000
            initialDelaySeconds: 15
            periodSeconds: 10
            failureThreshold: 3
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
          securityContext:
            runAsNonRoot: true
            allowPrivilegeEscalation: false
```

```yaml
# base/backend/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
spec:
  selector:
    app: backend
  ports:
    - port: 8000
      targetPort: 8000
```

```yaml
# base/backend/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

```yaml
# base/backend/pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: backend
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: backend
```

---

## Step 6 — Frontend Deployment

```yaml
# base/frontend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
        - name: frontend
          image: <REGION>-docker.pkg.dev/<PROJECT_ID>/asset/frontend:latest
          ports:
            - containerPort: 80
          env:
            - name: API_BASE_URL
              value: ""   # 同 origin，Nginx Ingress 路由 /api → backend
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 128Mi
```

```yaml
# base/frontend/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend
spec:
  selector:
    app: frontend
  ports:
    - port: 80
      targetPort: 80
```

---

## Step 7 — Ingress

```yaml
# base/ingress/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: asset-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod   # 若使用 cert-manager
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
spec:
  tls:
    - hosts:
        - <your-domain>
      secretName: asset-tls
  rules:
    - host: <your-domain>
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: backend
                port:
                  number: 8000
          - path: /static
            pathType: Prefix
            backend:
              service:
                name: backend
                port:
                  number: 8000
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
```

> `frontend` 和 `/api` 共用同一 domain，不需要 CORS 設定。

---

## Step 8 — Migration Job

每次 deploy 前手動觸發（不要做成 initContainer）：

```yaml
# base/migration/job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: migration-<IMAGE_TAG>   # 每次用 sha tag 避免衝突
spec:
  ttlSecondsAfterFinished: 300
  template:
    spec:
      restartPolicy: Never
      serviceAccountName: asset-backend-ksa
      containers:
        - name: migration
          image: <REGION>-docker.pkg.dev/<PROJECT_ID>/asset/backend:<IMAGE_TAG>
          command: ["sh", "-c", "alembic upgrade head"]
          envFrom:
            - configMapRef:
                name: backend-config
            - secretRef:
                name: backend-secret
```

觸發並等待完成：
```bash
kubectl apply -f base/migration/job.yaml -n asset-prod
kubectl wait --for=condition=complete job/migration-<IMAGE_TAG> -n asset-prod --timeout=120s
```

---

## Step 9 — k8s ServiceAccount（Workload Identity）

```bash
# 建立 k8s ServiceAccount
kubectl create serviceaccount asset-backend-ksa -n asset-prod

# 綁定 GCP Service Account（Phase 3 Step 4 建立的）
kubectl annotate serviceaccount asset-backend-ksa \
  iam.gke.io/gcp-service-account=asset-backend-sa@<PROJECT_ID>.iam.gserviceaccount.com \
  -n asset-prod
```

---

## Step 10 — Apply 順序

```bash
# 1. Namespace 已建立（Step 2）
# 2. 安裝 Nginx Ingress Controller（Step 1）
# 3. 安裝 ESO + 建立 ExternalSecret（Phase 4）
# 4. Apply base manifests
kubectl apply -k infra/k8s/overlays/production -n asset-prod

# 5. 跑 Migration Job
kubectl apply -f infra/k8s/base/migration/job.yaml -n asset-prod
kubectl wait --for=condition=complete job/migration-<TAG> -n asset-prod --timeout=120s

# 6. 確認 pods 正常
kubectl get pods -n asset-prod
kubectl logs -l app=backend -n asset-prod
```

---

## 需要填入的變數清單

| 變數 | 說明 | 取得來源 |
|------|------|---------|
| `<PROJECT_ID>` | GCP 專案 ID | `gcloud config get project` |
| `<REGION>` | GKE 叢集 region | Phase 3 |
| `<INSTANCE_NAME>` | Cloud SQL instance name | Phase 3 Step 4 |
| `<STATIC_IP>` | Nginx Ingress LB IP | Phase 3 Step 6 |
| `<your-bucket-name>` | GCS bucket name | Phase 3 Step 3 |
| `<memorystore-ip>` | Memorystore Redis IP | Phase 3 Step 5 |
| `<your-domain>` | 你的 domain | Phase 3 Step 7 |
| `<IMAGE_TAG>` | docker image sha tag | GitHub Actions build |
