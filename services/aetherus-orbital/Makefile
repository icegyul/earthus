.PHONY: help up down logs migrate test lint format type-check clean evidence

help:
	@echo "Aetherus Orbital Environment - Development Commands"
	@echo ""
	@echo "  make up          - Start services with Docker Compose"
	@echo "  make down        - Stop services"
	@echo "  make logs        - View service logs"
	@echo "  make migrate     - Run database migrations"
	@echo "  make test        - Run tests"
	@echo "  make lint        - Run ruff linter"
	@echo "  make format      - Format code with ruff"
	@echo "  make type-check  - Run mypy type checker"
	@echo "  make evidence    - Generate phase evidence"
	@echo "  make clean       - Clean generated files"

up:
	docker compose up -d
	@echo "Waiting for services to be healthy..."
	@sleep 5
	@docker compose ps

down:
	docker compose down

logs:
	docker compose logs -f

migrate:
	docker compose exec api python -m backend.migrations.migrate

migrate-status:
	docker compose exec api python -m backend.migrations.migrate --status

test:
	docker compose exec api pytest tests/ -v

lint:
	docker compose exec api ruff check backend/ tests/

format:
	docker compose exec api ruff format backend/ tests/

type-check:
	docker compose exec api mypy backend/

evidence:
	docker compose exec api python backend/tools/generate_evidence.py --phase P0

e2e:
	python3 -m pytest tests/e2e -m e2e -q -p no:cacheprovider

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .mypy_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .ruff_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	rm -rf .coverage htmlcov/
