.PHONY: doctor setup infra-up infra-down infra-reset migrate migrate-new seed backend-dev frontend-dev test clean help

help:
	@echo "Targets:"
	@echo "  doctor              Check required tools are installed"
	@echo "  setup               Install backend + frontend deps, copy .env"
	@echo "  infra-up            Start MySQL + Redis (Docker)"
	@echo "  infra-down          Stop MySQL + Redis"
	@echo "  infra-reset         Stop + wipe volumes (fresh DB)"
	@echo "  migrate             Run Alembic upgrade head"
	@echo "  migrate-new m='msg' Create new migration"
	@echo "  seed                Load test data"
	@echo "  backend-dev         Run FastAPI with --reload"
	@echo "  frontend-dev        Run Vite dev server"
	@echo "  test                Run all tests"
	@echo "  clean               Remove uploads, caches"

doctor:
	@command -v docker >/dev/null 2>&1 || { echo "X docker not found"; exit 1; }
	@docker info >/dev/null 2>&1 || { echo "X docker daemon not running"; exit 1; }
	@command -v uv >/dev/null 2>&1 || { echo "X uv not found. Install: curl -LsSf https://astral.sh/uv/install.sh | sh"; exit 1; }
	@command -v node >/dev/null 2>&1 || { echo "X node not found"; exit 1; }
	@command -v npm >/dev/null 2>&1 || { echo "X npm not found"; exit 1; }
	@node -v | grep -Eq "v(20|21|22|23|24)\." || echo "WARN node should be >= v20 (got $$(node -v))"
	@echo "OK all tools present"

setup: doctor
	cd apps/backend && uv sync
	@if [ -f apps/frontend/package-lock.json ]; then \
		cd apps/frontend && npm ci; \
	else \
		cd apps/frontend && npm install; \
	fi
	@[ -f .env ] || cp .env.example .env
	@echo "OK setup complete. Edit .env if needed, then 'make infra-up'"

infra-up:
	cd infra/local && docker compose up -d
	@echo "Waiting for MySQL to be healthy..."
	@for i in $$(seq 1 60); do \
		status=$$(docker inspect --format='{{.State.Health.Status}}' local-mysql-1 2>/dev/null || echo "starting"); \
		if [ "$$status" = "healthy" ]; then echo "OK MySQL healthy"; exit 0; fi; \
		sleep 1; \
	done; \
	echo "X MySQL did not become healthy in 60s"; exit 1

infra-down:
	cd infra/local && docker compose down

infra-reset:
	cd infra/local && docker compose down -v
	@echo "OK volumes wiped"

migrate:
	cd apps/backend && uv run alembic upgrade head

migrate-new:
	@if [ -z "$(m)" ]; then echo "Usage: make migrate-new m='message'"; exit 1; fi
	cd apps/backend && uv run alembic revision --autogenerate -m "$(m)"

seed:
	cd apps/backend && uv run python scripts/seed.py

backend-dev:
	cd apps/backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

frontend-dev:
	cd apps/frontend && npm run dev

test:
	cd apps/backend && uv run pytest
	cd apps/frontend && npm test --if-present

clean:
	rm -rf apps/backend/uploads apps/backend/.pytest_cache
	find . -type d -name __pycache__ -prune -exec rm -rf {} + 2>/dev/null || true
