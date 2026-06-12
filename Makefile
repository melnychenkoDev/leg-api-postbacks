COMPOSE ?= docker compose
COMPOSE_FILE ?= docker-compose.yml
COMPOSE_DEV_FILE ?= docker-compose.dev.yml
DOMAIN ?= leg-api-postbacks.click

.PHONY: help init build up down restart logs logs-all ps shell db-push db-shell clean dev dev-down lint rebuild nginx-install nginx-cf ssl-install health

help:
	@echo "Postback Tracker — Docker commands"
	@echo ""
	@echo "  make init          Copy .env.example -> .env (if missing)"
	@echo "  make build         Build production images"
	@echo "  make up            Start production stack (app + postgres + migrate)"
	@echo "  make rebuild       Rebuild and restart production stack"
	@echo "  make down          Stop production stack"
	@echo "  make restart       Restart app container"
	@echo "  make logs          Follow container logs"
	@echo "  make ps            Show running containers"
	@echo "  make health        Check local app health"
	@echo "  make shell         Shell into app container"
	@echo "  make db-push       Run drizzle migrations"
	@echo "  make db-shell      psql into postgres"
	@echo "  make clean         Stop stack and remove volumes"
	@echo "  make dev           Start dev stack with hot reload"
	@echo "  make dev-down      Stop dev stack"
	@echo "  make nginx-install Install nginx + Let's Encrypt config (Ubuntu, sudo)"
	@echo "  make nginx-cf      Install nginx for Cloudflare Origin Cert (Ubuntu, sudo)"
	@echo "  make ssl-install   Install Let's Encrypt SSL (Ubuntu, sudo)"
	@echo "  make lint          Run TypeScript check locally"
	@echo ""
	@echo "Production URLs (after nginx + SSL):"
	@echo "  Admin:    https://$(DOMAIN)/"
	@echo "  Postback: https://$(DOMAIN)/api/postback"

init:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Created .env from .env.example — fill in TELEGRAM_BOT_TOKEN and VITE_TG_BOT_NAME"; \
	else \
		echo ".env already exists"; \
	fi

build:
	$(COMPOSE) -f $(COMPOSE_FILE) build

up: init
	$(COMPOSE) -f $(COMPOSE_FILE) up -d

down:
	$(COMPOSE) -f $(COMPOSE_FILE) down

restart:
	$(COMPOSE) -f $(COMPOSE_FILE) restart app

logs:
	$(COMPOSE) -f $(COMPOSE_FILE) logs -f app

logs-all:
	$(COMPOSE) -f $(COMPOSE_FILE) logs -f

ps:
	$(COMPOSE) -f $(COMPOSE_FILE) ps

shell:
	$(COMPOSE) -f $(COMPOSE_FILE) exec app sh

db-push:
	$(COMPOSE) -f $(COMPOSE_FILE) run --rm migrate

db-shell:
	$(COMPOSE) -f $(COMPOSE_FILE) exec db psql -U $$(grep '^POSTGRES_USER=' .env | cut -d= -f2-) -d $$(grep '^POSTGRES_DB=' .env | cut -d= -f2-)

rebuild: init
	$(COMPOSE) -f $(COMPOSE_FILE) up -d --build

clean:
	$(COMPOSE) -f $(COMPOSE_FILE) down -v --remove-orphans

dev: init
	$(COMPOSE) -f $(COMPOSE_DEV_FILE) up --build

dev-down:
	$(COMPOSE) -f $(COMPOSE_DEV_FILE) down

lint:
	npm run lint

health:
	@curl -sf http://127.0.0.1:$${APP_PORT:-3000}/health && echo "" || (echo "App is not running on 127.0.0.1:$${APP_PORT:-3000}" && exit 1)

nginx-install:
	sudo DOMAIN=$(DOMAIN) bash deploy/install-nginx.sh

nginx-cf:
	sudo DOMAIN=$(DOMAIN) bash deploy/install-nginx-cloudflare.sh

ssl-install:
	@if [ -z "$(EMAIL)" ]; then echo "Usage: make ssl-install EMAIL=your@email.com"; exit 1; fi
	sudo DOMAIN=$(DOMAIN) bash deploy/install-ssl.sh $(EMAIL)
