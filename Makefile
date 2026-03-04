DOP := doppler run --
COMPOSE_DEV := $(DOP) docker compose -f docker-compose.yml -f docker-compose.dev.yml
COMPOSE_PROD := $(DOP) docker compose -f docker-compose.yml -f docker-compose.prod.yml

# ─── Core ─────────────────────────────────────────────────────────────────────

.PHONY: setup
setup: ## First-time setup: install deps, init Supabase volumes, print next steps
	@echo "Installing dependencies..."
	yarn install
	@echo ""
	@echo "Initializing Supabase volumes..."
	$(MAKE) init-volumes
	@echo ""
	@echo "Setup complete. Next steps:"
	@echo "  1. Run 'doppler setup' and select the mani project + dev_personal config"
	@echo "  2. Run 'gcloud auth application-default login' for Firebase ADC"
	@echo "  3. Run 'make dev' to start all services"

.PHONY: dev
dev: ## Start Supabase (Docker) + Manifold API & web (local yarn)
	@echo "Starting Supabase in Docker..."
	$(COMPOSE_DEV) up -d
	@echo ""
	@echo "Waiting for database to be healthy..."
	@$(COMPOSE_DEV) exec -T db pg_isready -U postgres -h localhost > /dev/null 2>&1 || sleep 3
	@-lsof -ti :3000 | xargs kill 2>/dev/null; rm -f web/.next/dev/lock; true
	@echo ""
	@echo "Starting Manifold API + Web locally..."
	@$(DOP) bash -c 'echo "  API:    http://localhost:8088" && \
		echo "  Web:    http://localhost:3000" && \
		echo "  Studio: http://localhost:3002" && \
		echo "  Kong:   $$NEXT_PUBLIC_SUPABASE_URL" && \
		echo "  DB:     localhost:$$SUPABASE_DB_PORT" && \
		echo ""'
	$(DOP) bash -c 'npx concurrently \
			-n API,NEXT,TS \
			-c white,magenta,cyan \
			"PORT=8088 yarn --cwd=backend/api dev" \
			"yarn --cwd=web serve" \
			"yarn --cwd=web ts-watch"'

.PHONY: dev-db
dev-db: ## Start only Supabase (Docker)
	$(COMPOSE_DEV) up -d
	@echo ""
	@echo "Supabase services starting..."
	@$(DOP) bash -c 'echo "  Studio: http://localhost:3002" && \
		echo "  Kong:   $$NEXT_PUBLIC_SUPABASE_URL" && \
		echo "  DB:     localhost:$$SUPABASE_DB_PORT"'

.PHONY: dev-api
dev-api: ## Start only Manifold API (requires Supabase running)
	@-lsof -ti :8088 | xargs kill 2>/dev/null; true
	$(DOP) env \
		PORT=8088 \
		yarn --cwd=backend/api dev

.PHONY: dev-web
dev-web: ## Start only Manifold web (requires API running)
	@-lsof -ti :3000 | xargs kill 2>/dev/null; rm -f web/.next/dev/lock; true
	$(DOP) yarn --cwd=web serve

.PHONY: down
down: ## Stop Supabase containers
	$(COMPOSE_DEV) down

.PHONY: logs
logs: ## Tail logs from Supabase containers
	$(COMPOSE_DEV) logs -f

.PHONY: restart
restart: ## Restart Supabase containers
	$(COMPOSE_DEV) restart

.PHONY: shell
shell: ## Open a shell with Doppler env vars loaded
	@$(DOP) bash

# ─── Database ─────────────────────────────────────────────────────────────────

DBPSQL = $(DOP) bash -c 'PGPASSWORD=$$POSTGRES_PASSWORD psql -h 127.0.0.1 -p $${POSTGRES_PORT:-5432} -U postgres -d postgres "$$@"' --

.PHONY: psql
psql: ## Connect to the local PostgreSQL database
	$(DBPSQL)

.PHONY: db-init
db-init: ## Seed + apply all schema files + migrations (full DB setup)
	$(DOP) bash scripts/db-init.sh

.PHONY: db-seed
db-seed: ## Run Manifold seed.sql against local database
	$(DBPSQL) -f backend/supabase/seed.sql

.PHONY: db-migrate
db-migrate: ## Run Supabase migrations
	@for f in backend/supabase/migrations/*.sql; do \
		echo "Applying $$f..."; \
		$(DOP) bash -c "PGPASSWORD=\$$POSTGRES_PASSWORD psql -h 127.0.0.1 -p \$${POSTGRES_PORT:-5432} -U postgres -d postgres -f $$f"; \
	done

.PHONY: db-reset
db-reset: ## Reset database volumes and restart Supabase
	$(COMPOSE_DEV) down -v
	$(COMPOSE_DEV) up -d

.PHONY: db-studio
db-studio: ## Open Supabase Studio in browser
	open http://localhost:3002

# ─── Utilities ────────────────────────────────────────────────────────────────

.PHONY: status
status: ## Show running containers and health
	$(COMPOSE_DEV) ps

.PHONY: clean
clean: ## Stop services and remove all volumes
	$(COMPOSE_DEV) down -v --remove-orphans

.PHONY: pull-upstream
pull-upstream: ## Sync fork with upstream manifold repo
	gh repo sync --branch main

.PHONY: init-volumes
init-volumes: ## Download Supabase init SQL files for Docker volumes
	@mkdir -p volumes/db volumes/api
	@if [ ! -f volumes/db/roles.sql ]; then \
		echo "Downloading Supabase Docker init files..."; \
		curl -sL https://raw.githubusercontent.com/supabase/supabase/master/docker/volumes/db/roles.sql -o volumes/db/roles.sql; \
		curl -sL https://raw.githubusercontent.com/supabase/supabase/master/docker/volumes/db/jwt.sql -o volumes/db/jwt.sql; \
		curl -sL https://raw.githubusercontent.com/supabase/supabase/master/docker/volumes/db/realtime.sql -o volumes/db/realtime.sql; \
		curl -sL https://raw.githubusercontent.com/supabase/supabase/master/docker/volumes/db/webhooks.sql -o volumes/db/webhooks.sql; \
		curl -sL https://raw.githubusercontent.com/supabase/supabase/master/docker/volumes/db/_supabase.sql -o volumes/db/_supabase.sql; \
		curl -sL https://raw.githubusercontent.com/supabase/supabase/master/docker/volumes/db/logs.sql -o volumes/db/logs.sql; \
		curl -sL https://raw.githubusercontent.com/supabase/supabase/master/docker/volumes/db/pooler.sql -o volumes/db/pooler.sql; \
		curl -sL https://raw.githubusercontent.com/supabase/supabase/master/docker/volumes/api/kong.yml -o volumes/api/kong.yml; \
		echo "Done."; \
	else \
		echo "Supabase volumes already initialized."; \
	fi

# ─── Deployment ───────────────────────────────────────────────────────────────

.PHONY: deploy
deploy: ## Deploy to GCP VM at manifold.mikhailtal.dev (uses prod compose)
	@echo "TODO: Implement GCP VM deployment"
	@echo "Production compose: docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d"

# ─── Help ─────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
