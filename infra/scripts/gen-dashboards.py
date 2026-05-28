#!/usr/bin/env python3
"""Generate Grafana dashboard ConfigMap for the four observability dashboards."""
import json, yaml, sys

# ── helpers ──────────────────────────────────────────────────────────────────

def ds(type_, uid):
    return {"type": type_, "uid": uid}

def target(expr, legend, ref, ds_ref, instant=False):
    t = {
        "datasource": ds_ref,
        "expr": expr,
        "legendFormat": legend,
        "refId": ref,
    }
    if instant:
        t["instant"] = True
    return t

def timeseries(id_, title, targets, y0=0, x=0, w=12, h=9, unit="", ds_ref=None, overrides=None):
    return {
        "id": id_,
        "type": "timeseries",
        "title": title,
        "datasource": ds_ref or targets[0]["datasource"],
        "gridPos": {"x": x, "y": y0, "w": w, "h": h},
        "targets": targets,
        "fieldConfig": {
            "defaults": {
                "unit": unit,
                "color": {"mode": "palette-classic"},
                "custom": {"lineWidth": 2, "fillOpacity": 8, "spanNulls": False},
            },
            "overrides": overrides or [],
        },
        "options": {
            "legend": {"calcs": ["mean", "max", "lastNotNull"], "displayMode": "table", "placement": "bottom"},
            "tooltip": {"mode": "multi", "sort": "desc"},
        },
    }

def stat_panel(id_, title, targets, y0=0, x=0, w=8, h=4, unit="", ds_ref=None):
    return {
        "id": id_,
        "type": "stat",
        "title": title,
        "datasource": ds_ref or targets[0]["datasource"],
        "gridPos": {"x": x, "y": y0, "w": w, "h": h},
        "targets": targets,
        "fieldConfig": {
            "defaults": {
                "unit": unit,
                "color": {"mode": "thresholds"},
                "thresholds": {
                    "mode": "absolute",
                    "steps": [{"color": "green", "value": None}, {"color": "red", "value": 0.001}],
                },
            },
            "overrides": [],
        },
        "options": {"reduceOptions": {"calcs": ["lastNotNull"]}, "colorMode": "value", "graphMode": "area", "textMode": "value"},
    }

def table_panel(id_, title, targets, y0=0, x=0, w=24, h=9, ds_ref=None):
    return {
        "id": id_,
        "type": "table",
        "title": title,
        "datasource": ds_ref or targets[0]["datasource"],
        "gridPos": {"x": x, "y": y0, "w": w, "h": h},
        "targets": targets,
        "fieldConfig": {"defaults": {}, "overrides": []},
        "options": {"footer": {"show": False}, "showHeader": True},
        "transformations": [
            {"id": "merge", "options": {}},
            {"id": "organize", "options": {"renameByName": {"handler": "Route", "status": "Status", "Value": "Requests"}}},
        ],
    }

def logs_panel(id_, title, target_expr, ds_ref, y0=0, x=0, w=24, h=8):
    return {
        "id": id_,
        "type": "logs",
        "title": title,
        "datasource": ds_ref,
        "gridPos": {"x": x, "y": y0, "w": w, "h": h},
        "targets": [{"datasource": ds_ref, "expr": target_expr, "refId": "A"}],
        "options": {
            "dedupStrategy": "none",
            "enableLogDetails": True,
            "prettifyLogMessage": False,
            "showCommonLabels": False,
            "showLabels": False,
            "showTime": True,
            "sortOrder": "Descending",
            "wrapLogMessage": True,
        },
    }

def ds_var(name, label, plugin_type, default):
    return {
        "current": {"selected": False, "text": default, "value": default},
        "hide": 0,
        "includeAll": False,
        "label": label,
        "name": name,
        "options": [],
        "query": plugin_type,
        "refresh": 1,
        "type": "datasource",
    }

def make_dashboard(title, uid, tags, panels, variables):
    return {
        "title": title,
        "uid": uid,
        "schemaVersion": 38,
        "version": 1,
        "refresh": "30s",
        "time": {"from": "now-1h", "to": "now"},
        "timezone": "browser",
        "tags": tags,
        "annotations": {"list": []},
        "templating": {"list": variables},
        "panels": panels,
    }

# ── Datasource shortcuts ──────────────────────────────────────────────────────

PROM  = ds("prometheus", "${prom_ds}")
GMP   = ds("prometheus", "${gmp_ds}")
LOKI  = ds("loki",       "${loki_ds}")
CLOUDMON = ds("stackdriver", "${cloudmon_ds}")

VARS_PROM_GMP = [
    ds_var("prom_ds",     "Prometheus",      "prometheus", "Prometheus"),
    ds_var("gmp_ds",      "GMP",             "prometheus", "GMP"),
]
VARS_GMP_CLOUDMON = [
    ds_var("gmp_ds",      "GMP",             "prometheus", "GMP"),
    ds_var("prom_ds",     "Prometheus",      "prometheus", "Prometheus"),
    ds_var("cloudmon_ds", "CloudMonitoring", "stackdriver", "CloudMonitoring"),
]
VARS_PROM = [ds_var("prom_ds", "Prometheus", "prometheus", "Prometheus")]
VARS_LOKI = [ds_var("loki_ds", "Loki",       "loki",       "Loki")]

# ═══════════════════════════════════════════════════════════════════════════════
# Dashboard 1 — 4 Golden Signals
# ═══════════════════════════════════════════════════════════════════════════════

Y = 0
panels_golden = []

# 1. Latency
panels_golden.append(timeseries(1, "Latency — p95 / p99 (backend)", [
    target(
        'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="backend"}[$__rate_interval])) by (le))',
        "p95 backend", "A", PROM, ),
    target(
        'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{job="backend"}[$__rate_interval])) by (le))',
        "p99 backend", "B", PROM),
    target(
        'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="backend"}[$__rate_interval])) by (le, pod))',
        "p95 {{pod}}", "C", PROM),
    target(
        'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{job="backend"}[$__rate_interval])) by (le, pod))',
        "p99 {{pod}}", "D", PROM),
], y0=Y, x=0, w=24, h=9, unit="s"))
Y += 9

# 2. Traffic + 3. Errors
panels_golden.append(timeseries(2, "Traffic — Request Rate (req/s)", [
    target(
        'sum(rate(http_requests_total{job="backend"}[$__rate_interval]))',
        "backend", "A", PROM),
    target(
        'sum(rate(nginx_http_requests_total{namespace="asset-mgmt"}[$__rate_interval])) by (pod)',
        "frontend {{pod}}", "B", GMP),
], y0=Y, x=0, w=12, h=9, unit="reqps"))

panels_golden.append(timeseries(3, "Errors — 5xx / 4xx Rate (req/s)", [
    target(
        'sum(rate(http_requests_total{job="backend",status=~"5.*"}[$__rate_interval]))',
        "5xx backend", "A", PROM),
    target(
        'sum(rate(http_requests_total{job="backend",status=~"4.*"}[$__rate_interval]))',
        "4xx backend", "B", PROM),
    target(
        'sum(rate(http_requests_total{job="backend",status=~"4.*"}[$__rate_interval])) by (pod)',
        "4xx {{pod}}", "C", PROM),
], y0=Y, x=12, w=12, h=9, unit="reqps"))
Y += 9

# 4. Saturation — CPU % of Cgroup Quota
panels_golden.append(timeseries(4, "Saturation — CPU Utilization of Cgroup Limit (%)", [
    target(
        'kubernetes_io:container_cpu_limit_utilization{namespace_name="asset-mgmt", container_name!=""}',
        "{{container_name}} {{pod_name}}", "A", GMP),
], y0=Y, x=0, w=24, h=9, unit="percentunit"))
Y += 9

# 5. Active Replicas + 6. p95 By Replica + 7. 5xx By Replica
panels_golden.append(stat_panel(5, "Active Application Replicas", [
    target(
        'kube_deployment_status_replicas_available{namespace="asset-mgmt", deployment="backend"}',
        "backend", "A", PROM),
    target(
        'kube_deployment_status_replicas_available{namespace="asset-mgmt", deployment="frontend"}',
        "frontend", "B", PROM),
], y0=Y, x=0, w=8, h=5, unit="short", ds_ref=PROM))

panels_golden.append(timeseries(6, "Backend p95 Latency By Replica", [
    target(
        'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="backend"}[$__rate_interval])) by (le, pod))',
        "{{pod}}", "A", PROM),
], y0=Y, x=8, w=8, h=5, unit="s"))

panels_golden.append(timeseries(7, "Backend 5xx By Replica", [
    target(
        'sum(rate(http_requests_total{job="backend",status=~"5.*"}[$__rate_interval])) by (pod)',
        "{{pod}}", "A", PROM),
], y0=Y, x=16, w=8, h=5, unit="reqps"))

dashboard_golden = make_dashboard(
    "Reference - 4 Golden Signals",
    "cnams-golden-signals",
    ["golden-signals", "observability"],
    panels_golden,
    VARS_PROM_GMP,
)

# ═══════════════════════════════════════════════════════════════════════════════
# Dashboard 2 — USE Method
# ═══════════════════════════════════════════════════════════════════════════════

Y = 0
panels_use = []

# 1. CPU Utilization
panels_use.append(timeseries(1, "Utilization: CPU Percent of Cgroup Limit", [
    target(
        'kubernetes_io:container_cpu_limit_utilization{namespace_name="asset-mgmt", container_name!=""}',
        "{{container_name}} {{pod_name}}", "A", GMP),
], y0=Y, x=0, w=24, h=9, unit="percentunit"))
Y += 9

# 2. Memory Utilization
panels_use.append(timeseries(2, "Utilization: Memory Percent of Cgroup Limit", [
    target(
        'kubernetes_io:container_memory_limit_utilization{namespace_name="asset-mgmt", container_name!=""}',
        "{{container_name}} {{pod_name}}", "A", GMP),
], y0=Y, x=0, w=24, h=9, unit="percentunit"))
Y += 9

# 3. 5xx Errors + 4. DB Connections
panels_use.append(timeseries(3, "Errors: 5xx Rate By Replica", [
    target(
        'sum(rate(http_requests_total{job="backend",status=~"5.*"}[$__rate_interval])) by (pod)',
        "{{pod}}", "A", PROM),
], y0=Y, x=0, w=12, h=9, unit="reqps"))

panels_use.append({
    "id": 4,
    "type": "timeseries",
    "title": "Saturation: Database Connections",
    "datasource": CLOUDMON,
    "gridPos": {"x": 12, "y": Y, "w": 12, "h": 9},
    "targets": [{
        "datasource": CLOUDMON,
        "metricType": "cloudsql.googleapis.com/database/network/connections",
        "filters": {"resourceType": "cloudsql_database", "projectId": "cloud-native-project-494008"},
        "crossSeriesReducer": "REDUCE_MEAN",
        "perSeriesAligner": "ALIGN_MEAN",
        "alignmentPeriod": "60s",
        "aliasBy": "DB Connections",
        "refId": "A",
    }],
    "fieldConfig": {
        "defaults": {"unit": "short", "color": {"mode": "palette-classic"}, "custom": {"lineWidth": 2, "fillOpacity": 8}},
        "overrides": [],
    },
    "options": {
        "legend": {"calcs": ["mean", "max", "lastNotNull"], "displayMode": "table", "placement": "bottom"},
        "tooltip": {"mode": "multi"},
    },
})
Y += 9

# 5. Network IO
panels_use.append(timeseries(5, "Utilization: Network IO Receive (kB/s)", [
    target(
        'rate(container_network_receive_bytes_total{namespace="asset-mgmt", container!=""}[$__rate_interval])',
        "rx {{pod}}", "A", GMP),
], y0=Y, x=0, w=24, h=9, unit="KBs"))

dashboard_use = make_dashboard(
    "Reference - USE Method",
    "cnams-use-method",
    ["use-method", "observability"],
    panels_use,
    VARS_GMP_CLOUDMON,
)

# ═══════════════════════════════════════════════════════════════════════════════
# Dashboard 3 — RED Method
# ═══════════════════════════════════════════════════════════════════════════════

Y = 0
panels_red = []

# 1. Rate By Route
panels_red.append(timeseries(1, "Rate By Route (req/s)", [
    target(
        'sum(rate(http_requests_total{job="backend"}[$__rate_interval])) by (handler)',
        "{{handler}}", "A", PROM),
], y0=Y, x=0, w=24, h=9, unit="reqps"))
Y += 9

# 2. Error Ratio + 3. Duration Quantiles
panels_red.append(timeseries(2, "Error Ratio (%)", [
    target(
        'sum(rate(http_requests_total{job="backend",status=~"5.*"}[$__rate_interval])) / sum(rate(http_requests_total{job="backend"}[$__rate_interval]))',
        "frontend", "A", PROM),
    target(
        'sum(rate(http_requests_total{job="backend",status=~"5.*"}[$__rate_interval])) by (pod) / sum(rate(http_requests_total{job="backend"}[$__rate_interval])) by (pod)',
        "{{pod}}", "B", PROM),
], y0=Y, x=0, w=12, h=9, unit="percentunit"))

panels_red.append(timeseries(3, "Duration Quantiles", [
    target(
        'histogram_quantile(0.5,  sum(rate(http_request_duration_seconds_bucket{job="backend"}[$__rate_interval])) by (le))',
        "p50 backend", "A", PROM),
    target(
        'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="backend"}[$__rate_interval])) by (le))',
        "p95 backend", "B", PROM),
    target(
        'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{job="backend"}[$__rate_interval])) by (le))',
        "p99 backend", "C", PROM),
    target(
        'histogram_quantile(0.5,  sum(rate(http_request_duration_seconds_bucket{job="backend"}[$__rate_interval])) by (le, pod))',
        "p50 {{pod}}", "D", PROM),
    target(
        'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="backend"}[$__rate_interval])) by (le, pod))',
        "p95 {{pod}}", "E", PROM),
    target(
        'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{job="backend"}[$__rate_interval])) by (le, pod))',
        "p99 {{pod}}", "F", PROM),
], y0=Y, x=12, w=12, h=9, unit="s"))
Y += 9

# 4. Status Codes table
panels_red.append(table_panel(4, "Status Codes — Last 5m", [
    {
        "datasource": PROM,
        "expr": 'sum(increase(http_requests_total{job="backend"}[5m])) by (handler, status)',
        "legendFormat": "{{handler}} {{status}}",
        "refId": "A",
        "instant": True,
        "format": "table",
    }
], y0=Y, x=0, w=24, h=8))

dashboard_red = make_dashboard(
    "Reference - RED Method",
    "cnams-red-method",
    ["red-method", "observability"],
    panels_red,
    VARS_PROM,
)

# ═══════════════════════════════════════════════════════════════════════════════
# Dashboard 4 — Log Formats
# ═══════════════════════════════════════════════════════════════════════════════

Y = 0
panels_logs = []

panels_logs.append(logs_panel(1,
    "CLF: Nginx Access Logs",
    '{namespace="asset-mgmt", container="frontend"}',
    LOKI, y0=Y))
Y += 8

panels_logs.append(logs_panel(2,
    "logfmt: Application Request Logs",
    '{namespace="asset-mgmt", container="backend"} | json | message="request"',
    LOKI, y0=Y))
Y += 8

panels_logs.append(logs_panel(3,
    "JSON: Structured Error Events",
    '{namespace="asset-mgmt", container="backend"} | json | severity="ERROR"',
    LOKI, y0=Y))

dashboard_logs = make_dashboard(
    "Reference - Log Formats",
    "cnams-log-formats",
    ["logs", "observability"],
    panels_logs,
    VARS_LOKI,
)

# ═══════════════════════════════════════════════════════════════════════════════
# Output ConfigMap YAML
# ═══════════════════════════════════════════════════════════════════════════════

cm = {
    "apiVersion": "v1",
    "kind": "ConfigMap",
    "metadata": {
        "name": "grafana-dashboards",
        "namespace": "monitoring",
    },
    "data": {
        "golden-signals.json":  json.dumps(dashboard_golden,  indent=2, ensure_ascii=False),
        "use-method.json":      json.dumps(dashboard_use,      indent=2, ensure_ascii=False),
        "red-method.json":      json.dumps(dashboard_red,      indent=2, ensure_ascii=False),
        "log-formats.json":     json.dumps(dashboard_logs,     indent=2, ensure_ascii=False),
    }
}

# Write YAML — use literal block scalars for the JSON values
print("apiVersion: v1")
print("kind: ConfigMap")
print("metadata:")
print("  name: grafana-dashboards")
print("  namespace: monitoring")
print("data:")
for filename, content in cm["data"].items():
    print(f"  {filename}: |")
    for line in content.splitlines():
        print(f"    {line}")
