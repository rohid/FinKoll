.PHONY: start update install build docker-up docker-down docker-logs help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

start: ## Start backend + frontend in dev mode
	@bash scripts/start.sh

update: ## Pull latest changes, reinstall deps, then start
	@bash scripts/update.sh --restart

install: ## Install all dependencies without starting
	@npm install --prefix backend
	@npm install --prefix frontend
	@echo "✓ Dependencies installed."

build: ## TypeScript-compile the backend
	@npm run build --prefix backend
	@echo "✓ Backend compiled."

docker-up: ## Start production stack via Docker Compose
	docker compose up -d --build

docker-down: ## Stop Docker Compose stack
	docker compose down

docker-logs: ## Tail Docker Compose logs
	docker compose logs -f

cert: ## Generate self-signed TLS certificate (run once before docker-up on Pi)
	@bash scripts/generate-cert.sh $(HOST)
