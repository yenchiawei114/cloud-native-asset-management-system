# ---- deps stage：安裝依賴（充分利用 layer cache）----
FROM python:3.12-slim AS builder

WORKDIR /app

# asyncmy 在 linux/arm64 無預建 wheel，需從 sdist 編譯
RUN apt-get update && apt-get install -y --no-install-recommends gcc python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# 先只複製 lockfile，這層變動頻率最低
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# 再複製源碼並安裝 project 本身（--no-editable 打成 wheel，runtime 不需 src/）
COPY src/ ./src/
RUN uv sync --frozen --no-dev --extra gcs --no-editable


# ---- runtime stage ----
FROM python:3.12-slim AS runtime

WORKDIR /app

RUN addgroup --system --gid 1000 app && adduser --system --uid 1000 --ingroup app app

# 只拷貝 venv，不帶 builder 的源碼與工具鏈
COPY --from=builder --chown=app:app /app/.venv /app/.venv

# alembic migration 檔（migration service 需要）
COPY --chown=app:app alembic/ /app/alembic/
COPY --chown=app:app alembic.ini /app/alembic.ini

# 本地存儲掛載點
RUN mkdir -p /app/uploads && chown app:app /app/uploads

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

USER 1000

EXPOSE 8000

# workers 由 WEB_CONCURRENCY 環境變數控制，預設 1
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY:-1}"]
