# Observability Dashboards 說明文件

> Grafana 路徑：`Dashboards > Observability`  
> 對應程式碼：`infra/k8s/base/monitoring/grafana-dashboards-cm.yaml`  
> 生成腳本：`infra/scripts/gen-dashboards.py`

---

## 系統架構

```
┌─────────────┐     PodMonitoring    ┌─────────────────────────┐
│  backend ×2 │ ──────────────────▶  │                         │
│  (FastAPI)  │ /metrics :8000       │   GMP                   │
└─────────────┘                      │   (Google Managed        │
                                     │    Prometheus)           │
┌─────────────┐     PodMonitoring    │                         │
│ frontend ×2 │ ──────────────────▶  │  container_cpu_*        │
│ (nginx +    │ nginx-exporter :9113 │  container_memory_*     │
│  exporter)  │                      │  container_network_*    │
└─────────────┘                      │  kubernetes_io:*        │
                                     │  http_requests_total    │
┌─────────────┐    kubelet cadvisor  │  nginx_http_requests_*  │
│  GKE nodes  │ ──────────────────▶  │                         │
└─────────────┘                      └─────────────┬───────────┘
                                                   │ PromQL
                                     ┌─────────────▼───────────┐
                                     │  gmp-frontend proxy     │
                                     │  monitoring ns :9090    │
                                     └─────────────┬───────────┘
                                                   │
┌─────────────┐   kube-state-metrics ┌─────────────▼───────────┐
│  GKE CIM    │ ──────────────────▶  │  Prometheus (self-host) │
└─────────────┘                      │  monitoring ns :9090    │
                                     └─────────────────────────┘
                                                   │ PromQL
┌─────────────┐   stdout JSON/CLF    ┌─────────────▼───────────┐
│  backend    │ ──────────────────▶  │  Alloy (DaemonSet)      │
│  frontend   │   k8s API stream     │  → Loki :3100           │
└─────────────┘                      └─────────────────────────┘

┌─────────────┐                      ┌─────────────────────────┐
│  Cloud SQL  │                      │  Cloud Monitoring API   │
│  MySQL      │ ──────────────────▶  │  (stackdriver)          │
└─────────────┘   Cloud Monitoring   └─────────────────────────┘
```

---

## Datasource 對照表

| Datasource 名稱  | 類型          | 端點 / 後端                                                       | 用途                              |
|-----------------|---------------|--------------------------------------------------------------------|-----------------------------------|
| `Prometheus`    | prometheus    | `http://prometheus.monitoring.svc:9090`                           | kube-state-metrics、舊版指標     |
| `GMP`           | prometheus    | `http://gmp-frontend.monitoring.svc:9090`                         | 所有 container 層級與 app 指標   |
| `Loki`          | loki          | `http://loki.monitoring.svc:3100`                                 | nginx CLF + backend JSON logs    |
| `CloudMonitoring` | stackdriver | Cloud Monitoring API（Workload Identity）                         | Cloud SQL 連線數等 GCP 原生指標  |
| `CloudLogging`  | googlecloud-logging-datasource | Cloud Logging API（Workload Identity）             | 原始 log 查詢（備用）            |

> GMP Datasource 透過 `gmp-frontend` proxy 走 Workload Identity 認證，Grafana SA 需有 `roles/monitoring.viewer`。

---

## Dashboard 1：Reference - 4 Golden Signals

**uid** `cnams-golden-signals`  
**Datasource 變數** `prom_ds`（Prometheus）、`gmp_ds`（GMP）

SRE 核心監控框架，覆蓋服務健康的四個維度。

### 面板一覽

#### 1. Latency — p95 / p99（backend）

| Series | PromQL | Datasource |
|--------|--------|------------|
| p95 backend | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="backend"}[$__rate_interval])) by (le))` | Prometheus |
| p99 backend | `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{job="backend"}[$__rate_interval])) by (le))` | Prometheus |
| p95 {{pod}} | 同上加 `by (le, pod)` | Prometheus |
| p99 {{pod}} | 同上加 `by (le, pod)` | Prometheus |

- **單位**：秒（s）
- **說明**：bucket 來自 `prometheus_fastapi_instrumentator`，label `job="backend"` 由 PodMonitoring 注入。Frontend 無延遲 histogram（nginx-exporter 僅提供連線計數）。

#### 2. Traffic — Request Rate（req/s）

| Series | PromQL | Datasource |
|--------|--------|------------|
| backend | `sum(rate(http_requests_total{job="backend"}[$__rate_interval]))` | Prometheus |
| frontend {{pod}} | `sum(rate(nginx_http_requests_total{namespace="asset-mgmt"}[$__rate_interval])) by (pod)` | GMP |

- **單位**：reqps
- **說明**：frontend 指標由 `nginx-prometheus-exporter` sidecar 從 nginx `stub_status` 匯出，PodMonitoring 送進 GMP。

#### 3. Errors — 5xx / 4xx Rate（req/s）

| Series | PromQL | Datasource |
|--------|--------|------------|
| 5xx backend | `sum(rate(http_requests_total{job="backend",status=~"5.*"}[$__rate_interval]))` | Prometheus |
| 4xx backend | `sum(rate(http_requests_total{job="backend",status=~"4.*"}[$__rate_interval]))` | Prometheus |
| 4xx {{pod}} | 同上加 `by (pod)` | Prometheus |

- **單位**：reqps
- **說明**：`status` label 值為 `"2xx"` / `"4xx"` / `"5xx"`（字串，非數字），由 instrumentator 產生。

#### 4. Saturation — CPU Utilization of Cgroup Limit

| Series | PromQL | Datasource |
|--------|--------|------------|
| {{container_name}} {{pod_name}} | `kubernetes_io:container_cpu_limit_utilization{namespace_name="asset-mgmt", container_name!=""}` | GMP |

- **單位**：percentunit（0–1）
- **說明**：GKE 原生指標，由 kubelet cadvisor 收集後由 GMP 儲存，label 名稱為 `namespace_name` / `pod_name` / `container_name`（非標準 `namespace` / `pod`）。

#### 5. Active Application Replicas（Stat）

| Series | PromQL | Datasource |
|--------|--------|------------|
| backend | `kube_deployment_status_replicas_available{namespace="asset-mgmt", deployment="backend"}` | Prometheus |
| frontend | `kube_deployment_status_replicas_available{namespace="asset-mgmt", deployment="frontend"}` | Prometheus |

#### 6. Backend p95 Latency By Replica

| Series | PromQL | Datasource |
|--------|--------|------------|
| {{pod}} | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="backend"}[$__rate_interval])) by (le, pod))` | Prometheus |

#### 7. Backend 5xx By Replica

| Series | PromQL | Datasource |
|--------|--------|------------|
| {{pod}} | `sum(rate(http_requests_total{job="backend",status=~"5.*"}[$__rate_interval])) by (pod)` | Prometheus |

---

## Dashboard 2：Reference - USE Method

**uid** `cnams-use-method`  
**Datasource 變數** `gmp_ds`（GMP）、`prom_ds`（Prometheus）、`cloudmon_ds`（CloudMonitoring）

針對**基礎設施資源**的診斷框架（Utilization / Saturation / Errors）。

### 面板一覽

#### 1. Utilization: CPU Percent of Cgroup Limit

| Series | PromQL | Datasource |
|--------|--------|------------|
| {{container_name}} {{pod_name}} | `kubernetes_io:container_cpu_limit_utilization{namespace_name="asset-mgmt", container_name!=""}` | GMP |

- **說明**：`container_name!=""` 過濾掉 pod 層級的聚合行（無 container_name 的行是 pod sandbox 整體數值）。

#### 2. Utilization: Memory Percent of Cgroup Limit

| Series | PromQL | Datasource |
|--------|--------|------------|
| {{container_name}} {{pod_name}} | `kubernetes_io:container_memory_limit_utilization{namespace_name="asset-mgmt", container_name!=""}` | GMP |

- **說明**：working set bytes / memory limit bytes，GKE 原生指標。

#### 3. Errors: 5xx Rate By Replica

| Series | PromQL | Datasource |
|--------|--------|------------|
| {{pod}} | `sum(rate(http_requests_total{job="backend",status=~"5.*"}[$__rate_interval])) by (pod)` | Prometheus |

#### 4. Saturation: Database Connections

| 設定 | 值 |
|------|---|
| Metric type | `cloudsql.googleapis.com/database/network/connections` |
| Datasource | CloudMonitoring（stackdriver） |
| Reducer | REDUCE_MEAN / ALIGN_MEAN |

- **說明**：Cloud SQL MySQL 的 active connection 數，透過 `roles/monitoring.viewer` Workload Identity 從 Cloud Monitoring API 取得。目前基準值約 8 個連線。

#### 5. Utilization: Network IO Receive（kB/s）

| Series | PromQL | Datasource |
|--------|--------|------------|
| rx {{pod}} | `rate(container_network_receive_bytes_total{namespace="asset-mgmt", container!=""}[$__rate_interval])` | GMP |

- **說明**：cadvisor 指標，label 為標準格式（`namespace` / `pod` / `container`），與 `kubernetes_io:*` 系列不同。`container!=""` 過濾 pod sandbox。

---

## Dashboard 3：Reference - RED Method

**uid** `cnams-red-method`  
**Datasource 變數** `prom_ds`（Prometheus）

針對**服務請求層面**的可觀測性框架（Rate / Errors / Duration）。

### 面板一覽

#### 1. Rate By Route（req/s）

| Series | PromQL | Datasource |
|--------|--------|------------|
| {{handler}} | `sum(rate(http_requests_total{job="backend"}[$__rate_interval])) by (handler)` | Prometheus |

- **說明**：`handler` label 為 FastAPI route pattern（如 `/api/assets`、`/api/login`）。

#### 2. Error Ratio（%）

| Series | PromQL | Datasource |
|--------|--------|------------|
| frontend（全局）| `sum(rate(http_requests_total{job="backend",status=~"5.*"}[$__rate_interval])) / sum(rate(http_requests_total{job="backend"}[$__rate_interval]))` | Prometheus |
| {{pod}} | 同上加 `by (pod)` | Prometheus |

- **單位**：percentunit
- **說明**：值為 0 時表示無 5xx 錯誤，正常狀態。

#### 3. Duration Quantiles

| Series | PromQL | Datasource |
|--------|--------|------------|
| p50 backend | `histogram_quantile(0.5, sum(rate(http_request_duration_seconds_bucket{job="backend"}[$__rate_interval])) by (le))` | Prometheus |
| p95 backend | 同上 0.95 | Prometheus |
| p99 backend | 同上 0.99 | Prometheus |
| p50/p95/p99 {{pod}} | 各分位加 `by (le, pod)` | Prometheus |

- **單位**：秒（s）

#### 4. Status Codes — Last 5m（Table）

| 設定 | 值 |
|------|---|
| PromQL | `sum(increase(http_requests_total{job="backend"}[5m])) by (handler, status)` |
| Instant | true |
| 欄位轉換 | handler → Route, status → Status, Value → Requests |

---

## Dashboard 4：Reference - Log Formats

**uid** `cnams-log-formats`  
**Datasource 變數** `loki_ds`（Loki）

展示系統三種日誌格式，說明不同服務的 log 結構。

### Log 收集架構

```
backend pod stdout
  ├── uvicorn access log: 純文字 INFO:  ... "GET /api/..."
  └── app.access logger: JSON {"severity":"INFO","message":"request","service":"backend",...}
                                    │
                             Alloy loki.source.kubernetes
                             (k8s API stream，不需 hostPath)
                                    │ stage.match {container="backend"}
                                    │ stage.json → labels: severity, logger
                                    ▼
                               Loki :3100

frontend pod stdout
  └── nginx access log: CLF  172.x.x.x - - [timestamp] "GET /shop..." 200 618
                                    │
                             Alloy loki.source.kubernetes
                                    ▼
                               Loki :3100
```

### 面板一覽

#### 1. CLF: Nginx Access Logs

| 設定 | 值 |
|------|---|
| LogQL | `{namespace="asset-mgmt", container="frontend"}` |
| 格式 | CLF（Common Log Format） |

**範例輸出：**
```
172.18.0.1 - - [28/May/2026:10:47:14 +0000] "GET /shop HTTP/1.1" 200 618
10.30.128.20 - - [28/May/2026:11:25:35 +0000] "GET /readyz HTTP/1.1" 200 18 "-" "GoogleStackdriverMonitoring-UptimeChecks"
```

**欄位說明：**

| 位置 | 說明 |
|------|------|
| `$remote_addr` | 來源 IP |
| `[$time_local]` | 時間戳（`DD/Mon/YYYY:HH:MM:SS +TZ`）|
| `"$request"` | HTTP method + path + protocol |
| `$status` | HTTP 狀態碼 |
| `$body_bytes_sent` | 回應大小（bytes） |
| `"$http_referer"` | Referer |
| `"$http_user_agent"` | User-Agent |

#### 2. logfmt: Application Request Logs

| 設定 | 值 |
|------|---|
| LogQL | `{namespace="asset-mgmt", container="backend"} \| json \| message="request"` |
| 來源 | `RequestLoggingMiddleware`（`apps/backend/src/app/core/request_logging.py`）|
| Logger | `app.access` |

**範例輸出（JSON，Cloud Logging 解析後可讀 key-value）：**
```json
{
  "severity": "INFO",
  "message": "request",
  "timestamp": "2026-05-28T12:28:22.184483+00:00",
  "logger": "app.access",
  "service": "backend",
  "replica": "backend-5d5fb7b65d-dk87p",
  "method": "GET",
  "path": "/api/assets",
  "route": "/api/assets",
  "status": 401,
  "duration_ms": 2,
  "trace_id": "ea120ab1f7874246abcea82fa951249a"
}
```

**欄位說明：**

| 欄位 | 說明 |
|------|------|
| `service` | 固定為 `"backend"` |
| `replica` | `HOSTNAME` 環境變數（pod name） |
| `method` | HTTP method |
| `path` / `route` | 請求路徑 |
| `status` | HTTP 狀態碼（整數） |
| `duration_ms` | 請求處理時間（毫秒） |
| `trace_id` | 從 `X-Cloud-Trace-Context` header 取得，無則 uuid4 |

> 跳過路徑：`/healthz`、`/readyz`、`/metrics`（避免 probe 洗版）

#### 3. JSON: Structured Error Events

| 設定 | 值 |
|------|---|
| LogQL | `{namespace="asset-mgmt", container="backend"} \| json \| severity="ERROR"` |
| 說明 | 應用程式拋出 exception 時由 `JsonFormatter` 序列化的 error log |

**範例輸出：**
```json
{
  "severity": "ERROR",
  "message": "Unhandled exception during request",
  "timestamp": "2026-05-28T10:48:02.331Z",
  "logger": "app.api.assets",
  "exception": "Traceback (most recent call last):..."
}
```

---

## 指標速查表

### Prometheus（自建，`http://prometheus.monitoring.svc:9090`）

| 指標 | 類型 | Labels | 說明 |
|------|------|--------|------|
| `http_requests_total` | counter | `job`, `pod`, `handler`, `method`, `status` | HTTP 請求總數 |
| `http_request_duration_seconds_bucket` | histogram | `job`, `pod`, `handler`, `method`, `le` | 請求延遲分桶 |
| `http_request_duration_highr_seconds_bucket` | histogram | `le` | 高解析度延遲（無 handler 分組）|
| `process_cpu_seconds_total` | counter | `job`, `pod` | Process CPU 使用（非 cgroup）|
| `process_resident_memory_bytes` | gauge | `job`, `pod` | Process 記憶體（RSS）|
| `kube_deployment_status_replicas_available` | gauge | `namespace`, `deployment` | 可用 replica 數 |
| `kube_deployment_spec_replicas` | gauge | `namespace`, `deployment` | 目標 replica 數 |

### GMP（`http://gmp-frontend.monitoring.svc:9090`）

**Container 資源（cadvisor，標準 labels）**

| 指標 | Labels | 說明 |
|------|--------|------|
| `container_cpu_usage_seconds_total` | `namespace`, `pod`, `container` | CPU 使用（累積秒） |
| `container_memory_working_set_bytes` | `namespace`, `pod`, `container` | Memory working set |
| `container_network_receive_bytes_total` | `namespace`, `pod`, `container`, `interface` | 網路接收（累積 bytes）|
| `container_cpu_cfs_throttled_periods_total` | `namespace`, `pod`, `container` | CFS throttle 週期數 |
| `container_cpu_cfs_periods_total` | `namespace`, `pod`, `container` | CFS 總週期數 |

**GKE 原生資源利用率（labels 不同：`namespace_name`, `pod_name`, `container_name`）**

| 指標 | 說明 |
|------|------|
| `kubernetes_io:container_cpu_limit_utilization` | CPU 使用率 / CPU limit（0–1）|
| `kubernetes_io:container_memory_limit_utilization` | Memory 使用率 / Memory limit（0–1）|

**應用程式指標（PodMonitoring 抓取）**

| 指標 | Labels | 說明 |
|------|--------|------|
| `http_requests_total` | `job`, `pod`, `handler`, `method`, `status`, `namespace` | Backend HTTP 請求（同 Prometheus）|
| `http_request_duration_seconds_bucket` | 同上 | Backend 請求延遲 |
| `nginx_http_requests_total` | `job="frontend"`, `pod`, `namespace` | Nginx 處理請求總數 |
| `nginx_connections_active` | `pod` | 當前活躍連線數 |
| `nginx_connections_accepted` | `pod` | 已接受連線總數（counter）|

### Loki（`http://loki.monitoring.svc:3100`）

| Stream selector | 內容 | 格式 |
|-----------------|------|------|
| `{namespace="asset-mgmt", container="frontend"}` | Nginx access log | CLF |
| `{namespace="asset-mgmt", container="backend"}` | App logs（混合 uvicorn text + JSON）| text / JSON |
| `{namespace="asset-mgmt", container="backend"} \| json \| message="request"` | Request middleware log | JSON |
| `{namespace="asset-mgmt", container="backend"} \| json \| severity="ERROR"` | Error events | JSON |

**Alloy 自動注入的 stream labels：**
`namespace`, `pod`, `container`, `app`, `job`, `instance`

**Alloy 從 backend JSON body 提取的 labels：**
`severity`（DEBUG/INFO/WARNING/ERROR/CRITICAL）、`logger`（logger 名稱）

### CloudMonitoring（stackdriver，Cloud Monitoring API）

| Metric type | 說明 |
|-------------|------|
| `cloudsql.googleapis.com/database/network/connections` | Cloud SQL active connections |

---

## PodMonitoring 設定

```yaml
# backend — apps/backend:/metrics :8000
apiVersion: monitoring.googleapis.com/v1
kind: PodMonitoring
metadata:
  name: backend
  namespace: asset-mgmt
spec:
  selector:
    matchLabels:
      app: backend
  endpoints:
    - port: 8000
      path: /metrics
      interval: 30s

# frontend — nginx-exporter sidecar :9113
apiVersion: monitoring.googleapis.com/v1
kind: PodMonitoring
metadata:
  name: frontend
  namespace: asset-mgmt
spec:
  selector:
    matchLabels:
      app: frontend
  endpoints:
    - port: 9113
      path: /metrics
      interval: 30s
```

---

## Dashboard 變數說明

每個 dashboard 頂部有 datasource picker 變數，可在 Grafana UI 切換：

| 變數名 | 類型 | 預設值 | 出現在 |
|--------|------|--------|--------|
| `prom_ds` | datasource（prometheus）| Prometheus | D1, D2, D3 |
| `gmp_ds` | datasource（prometheus）| GMP | D1, D2 |
| `loki_ds` | datasource（loki）| Loki | D4 |
| `cloudmon_ds` | datasource（stackdriver）| CloudMonitoring | D2 |

---

## 已知限制

| 項目 | 原因 | 替代方案 |
|------|------|---------|
| Frontend 無延遲 histogram | nginx-exporter 的 `stub_status` 不提供 latency 分桶 | 加 OpenTelemetry nginx module；或改用 log-based metrics（Loki recording rules）|
| Frontend 無 per-route 指標 | `stub_status` 只有全局計數 | 同上，或改用 nginx VTS module（需重建 image）|
| `kubernetes_io:*` labels 格式不同 | GKE 原生指標使用 `namespace_name`/`pod_name`/`container_name` | PromQL 中使用 `namespace_name` 而非 `namespace` |
| `container_spec_cpu_quota` 無資料 | GKE Autopilot 不暴露此指標 | 已改用 `kubernetes_io:container_cpu_limit_utilization` |
| Log Formats 的 backend 需實際 API 請求 | Middleware 跳過 `/healthz`/`/readyz`/`/metrics` | 正常使用者流量即會產生；測試可手動打 `/api/assets` 等端點 |
