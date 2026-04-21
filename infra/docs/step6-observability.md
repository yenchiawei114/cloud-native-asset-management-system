# Step 6 — 可觀測性

## 前置條件

- Step 4 完成（app 已部署並正常運行）

> 優先順序：Cloud Logging（免費，零設定）> Cloud Monitoring（Uptime + Alert）> Prometheus/Grafana（可選）

---

## Step 1 — Cloud Logging（自動，無需額外設定）

GKE Autopilot 自動把 container stdout 送到 Cloud Logging。
後端已有 JSON log format（`LOG_FORMAT=json`），Cloud Logging 會自動解析 `severity`、`message`、`timestamp` 欄位。

確認正常：
```bash
# 在 Cloud Console → Logging → Log Explorer 輸入：
resource.type="k8s_container"
resource.labels.cluster_name="asset-cluster"
severity>=ERROR
```

常用 query：
```
# 所有 backend error
resource.labels.container_name="backend" severity=ERROR

# 特定 request log
httpRequest.requestUrl=~"/api/assets"

# 某個時間區間的 5xx
httpRequest.status>=500 timestamp>="2024-01-01T00:00:00Z"
```

---

## Step 2 — Cloud Monitoring：Uptime Check

```bash
# 用 gcloud 建立 Uptime check（也可在 Console 設定）
gcloud monitoring uptime-checks create \
  --display-name "Asset Backend Healthz" \
  --http \
  --hostname <your-domain> \
  --path /healthz \
  --period 60   # 每 60 秒檢查一次
```

或在 Cloud Console → Monitoring → Uptime checks → Create 設定：
- Target：`https://<your-domain>/healthz`
- Check frequency：1 minute
- Alert threshold：2 consecutive failures

---

## Step 3 — Cloud Monitoring：Alert Policy

### 3a. 5xx Error Rate Alert

```bash
gcloud alpha monitoring policies create \
  --notification-channels <CHANNEL_ID> \
  --display-name "High 5xx Rate" \
  --condition-filter='resource.type="k8s_container" AND metric.type="logging.googleapis.com/user/<log_metric_name>"' \
  --condition-threshold-value=5 \
  --condition-threshold-duration=300s
```

建議在 Console 設定更直觀：
1. Cloud Monitoring → Alerting → Create Policy
2. Condition：
   - Metric: `kubernetes.io/container/restart_count`（pod restart loop）
   - Threshold: > 5 in 10 minutes
3. Notification Channel：設定 Email 或 Slack webhook

### 3b. 建立 Log-based Metric（5xx 計數）

Cloud Console → Logging → Log-based metrics → Create metric：
- Filter: `resource.labels.container_name="backend" httpRequest.status>=500`
- Metric type: Counter
- Name: `backend_5xx_count`

然後在 Alert Policy 用此 metric 設定 threshold。

---

## Step 4 — Slack 通知（可選）

```bash
# 建立 Notification Channel
gcloud beta monitoring channels create \
  --display-name "Slack Asset Alert" \
  --type slack \
  --channel-labels "channel=#alerts,auth_token=<SLACK_BOT_TOKEN>"
```

或在 Console：Monitoring → Alerting → Notification channels → Add channel → Slack

---

## Step 5 — Prometheus + Grafana（可選，進階）

後端已有 `/metrics` endpoint（需 `ENABLE_METRICS=true`）。

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm upgrade --install kube-prometheus-stack \
  prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --set grafana.adminPassword=<GRAFANA_PASSWORD> \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false
```

建立 ServiceMonitor 讓 Prometheus 抓 backend metrics：
```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: backend
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: backend
  namespaceSelector:
    matchNames:
      - asset-prod
  endpoints:
    - port: "8000"
      path: /metrics
      interval: 30s
```

Grafana 預設在 `kubectl port-forward svc/kube-prometheus-stack-grafana 3000:80 -n monitoring`。

推薦 dashboard：
- **Kubernetes / Compute Resources / Namespace (Pods)**（ID: 17781）
- **FastAPI Observability**（自行搜尋 grafana.com/dashboards）

---

## 監控清單（上線後確認）

| 項目 | 工具 | 預期行為 |
|------|------|---------|
| Backend liveness | Cloud Monitoring Uptime | `/healthz` 每分鐘 200 |
| Backend readiness | Cloud Monitoring Uptime | `/readyz` 每分鐘 200 |
| Pod restart loop | Alert Policy | restart > 5 in 10min → 通知 |
| 5xx rate | Log-based metric + Alert | 5xx > 5/min → 通知 |
| Cloud SQL failover | Cloud Monitoring | failover 後 `/readyz` 自動恢復 |
| HPA scale event | Cloud Logging | `kubectl get events -n asset-prod` |
