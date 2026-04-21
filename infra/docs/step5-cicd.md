# Step 5 — GitHub Actions CI/CD

## 前置條件

- Step 2 完成（GCP project、`asset-ci-sa` Service Account 已建立）
- Step 4 完成後才能跑 deploy.yml，但 test.yml / build.yml 可以在 Step 4 之前先設定

## 目錄結構

```
.github/
└── workflows/
    ├── test.yml      # PR：跑測試，全過才可 merge
    ├── build.yml     # push main：build + push images
    └── deploy.yml    # 手動觸發或 build 完成後：deploy 到 GKE
```

---

## GitHub Secrets 設定

進入 GitHub → Repository → Settings → Secrets and variables → Actions，新增以下 Secrets：

| Secret 名稱 | 說明 | 取得方式 |
|------------|------|---------|
| `GCP_PROJECT_ID` | GCP 專案 ID | `gcloud config get project` |
| `GCP_REGION` | GKE 所在 region | Phase 3 決定的 region |
| `GCP_CLUSTER_NAME` | GKE cluster 名稱 | Phase 3 Step 2 |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | WIF provider 資源名稱 | 見下方 Step 0 |
| `GCP_SERVICE_ACCOUNT` | CI 用 GCP SA email | 見下方 Step 0 |

---

## Step 0 — 設定 Workload Identity Federation（GitHub Actions → GCP）

GitHub Actions 透過 OIDC 取得 GCP 授權，不需要存 SA JSON key。

```bash
export PROJECT_ID=<your-project-id>
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
export REPO=<github-owner>/<repo-name>   # e.g. yenchiawei/cloud-native-asset-management-system

# 建立 CI 用 Service Account
gcloud iam service-accounts create asset-ci-sa \
  --display-name "Asset CI/CD Service Account"

# 授予權限：push image + deploy to GKE
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member "serviceAccount:asset-ci-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role "roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member "serviceAccount:asset-ci-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role "roles/container.developer"

# 建立 Workload Identity Pool
gcloud iam workload-identity-pools create github-pool \
  --location global \
  --display-name "GitHub Actions Pool"

# 建立 OIDC Provider
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --workload-identity-pool github-pool \
  --location global \
  --issuer-uri "https://token.actions.githubusercontent.com" \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition "assertion.repository=='${REPO}'"

# 允許 GitHub Actions 使用 asset-ci-sa
POOL_ID=$(gcloud iam workload-identity-pools describe github-pool \
  --location global --format='value(name)')

gcloud iam service-accounts add-iam-policy-binding \
  asset-ci-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${REPO}"

# 取得 provider 資源名稱（填入 GitHub Secret GCP_WORKLOAD_IDENTITY_PROVIDER）
gcloud iam workload-identity-pools providers describe github-provider \
  --workload-identity-pool github-pool \
  --location global \
  --format='value(name)'
```

填入 GitHub Secrets：
- `GCP_WORKLOAD_IDENTITY_PROVIDER` = 上方指令輸出的完整 provider 名稱
- `GCP_SERVICE_ACCOUNT` = `asset-ci-sa@<PROJECT_ID>.iam.gserviceaccount.com`

---

## Step 1 — test.yml（PR 觸發）

```yaml
# .github/workflows/test.yml
name: Test

on:
  pull_request:
    branches: [main, dev]

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: app
          MYSQL_USER: app
          MYSQL_PASSWORD: app
        ports:
          - 3306:3306
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v4
        with:
          version: latest

      - name: Install deps
        working-directory: apps/backend
        run: uv sync --dev

      - name: Lint
        working-directory: apps/backend
        run: uv run ruff check src/

      - name: Test
        working-directory: apps/backend
        env:
          APP_ENV: test
          DB_URL: mysql+asyncmy://app:app@localhost:3306/app
          DB_SYNC_URL: mysql+pymysql://app:app@localhost:3306/app
          SECRET_KEY: test-secret-key
          REDIS_URL: redis://localhost:6379/0
        run: uv run pytest -v

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: apps/frontend/package-lock.json
      - name: Install deps
        working-directory: apps/frontend
        run: npm ci
      - name: Type check
        working-directory: apps/frontend
        run: npx tsc --noEmit
      - name: Test
        working-directory: apps/frontend
        run: npm test
```

---

## Step 2 — build.yml（push main 觸發）

```yaml
# .github/workflows/build.yml
name: Build & Push Images

on:
  push:
    branches: [main]

env:
  REGION: ${{ secrets.GCP_REGION }}
  PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write   # OIDC 需要

    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Configure Docker for Artifact Registry
        run: gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

      - name: Build & push backend
        uses: docker/build-push-action@v5
        with:
          context: apps/backend
          push: true
          tags: |
            ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/asset/backend:${{ github.sha }}
            ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/asset/backend:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build & push frontend
        uses: docker/build-push-action@v5
        with:
          context: apps/frontend
          push: true
          tags: |
            ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/asset/frontend:${{ github.sha }}
            ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/asset/frontend:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Trigger deploy
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.actions.createWorkflowDispatch({
              owner: context.repo.owner,
              repo: context.repo.repo,
              workflow_id: 'deploy.yml',
              ref: 'main',
              inputs: { image_tag: '${{ github.sha }}' }
            })
```

---

## Step 3 — deploy.yml（手動觸發或 build 完成後）

```yaml
# .github/workflows/deploy.yml
name: Deploy to GKE

on:
  workflow_dispatch:
    inputs:
      image_tag:
        description: "Image tag (git sha)"
        required: true
      environment:
        description: "Target environment"
        required: true
        default: production
        type: choice
        options: [production, staging]

env:
  REGION: ${{ secrets.GCP_REGION }}
  PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  CLUSTER_NAME: ${{ secrets.GCP_CLUSTER_NAME }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - name: Get GKE credentials
        uses: google-github-actions/get-gke-credentials@v2
        with:
          cluster_name: ${{ env.CLUSTER_NAME }}
          location: ${{ env.REGION }}

      - name: Set image tags in Kustomize
        working-directory: infra/k8s/overlays/${{ github.event.inputs.environment }}
        run: |
          kustomize edit set image \
            backend=${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/asset/backend:${{ github.event.inputs.image_tag }} \
            frontend=${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/asset/frontend:${{ github.event.inputs.image_tag }}

      - name: Run migration
        run: |
          # 用新 image 跑 migration job
          cat infra/k8s/base/migration/job.yaml \
            | sed "s|:latest|:${{ github.event.inputs.image_tag }}|g" \
            | sed "s|migration-placeholder|migration-${{ github.event.inputs.image_tag }}|g" \
            | kubectl apply -f - -n asset-${{ github.event.inputs.environment }}

          kubectl wait \
            --for=condition=complete \
            job/migration-${{ github.event.inputs.image_tag }} \
            -n asset-${{ github.event.inputs.environment }} \
            --timeout=120s

      - name: Deploy
        run: |
          kustomize build infra/k8s/overlays/${{ github.event.inputs.environment }} \
            | kubectl apply -f - -n asset-${{ github.event.inputs.environment }}

      - name: Wait for rollout
        run: |
          kubectl rollout status deployment/backend \
            -n asset-${{ github.event.inputs.environment }} --timeout=120s
          kubectl rollout status deployment/frontend \
            -n asset-${{ github.event.inputs.environment }} --timeout=120s
```

---

## 完整流程圖

```
PR → test.yml（pytest + lint + tsc）
        ↓ 通過後 merge to main
push main → build.yml（docker build + push to Artifact Registry）
        ↓ 自動觸發
deploy.yml（migration Job → kustomize apply → rollout status 確認）
```

---

## Branch 保護規則（GitHub Settings → Branches）

`main` branch 設定：
- [ ] Require status checks to pass before merging
  - 勾選 `backend` 和 `frontend`（test.yml 的 job 名稱）
- [ ] Require branches to be up to date before merging
- [ ] Restrict who can push to matching branches（只有 CI 或 admin）
