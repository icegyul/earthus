# Aetherus Orbital Environment

Space object tracking, conjunction assessment, and intervention simulation platform.

## P0 Status

Repository skeleton, database migrations, Docker Compose, health checks, and CI infrastructure.

## Quick Start

```bash
# Start services
docker compose up -d

# Run migrations
docker compose exec api python -m backend.migrations.migrate

# Run tests
docker compose exec api pytest

# Check health
curl http://localhost:8000/health
```

## Project Structure

```
backend/
  api/          # FastAPI routes
  models/       # Database models
  services/     # Business logic
  migrations/   # Database migrations
  tests/        # Test suite
frontend/       # Next.js UI (future phases)
migrations/     # SQL migrations
artifacts/      # Evidence and benchmarks
  evidence/     # Phase completion evidence
```

## Development

```bash
# Lint
docker compose exec api ruff check backend/

# Type check
docker compose exec api mypy backend/

# Format
docker compose exec api ruff format backend/
```

## Requirements

- Docker & Docker Compose
- PostgreSQL 15+ with PostGIS
- Redis 7+
- Python 3.11+
- Node 20+ (for frontend phases)

## Architecture

- **API**: FastAPI with async PostgreSQL
- **Database**: PostgreSQL + PostGIS for spatial indexing
- **Cache**: Redis for ephemeris and job status
- **Queue**: Celery for async computation (P4+)
- **Frontend**: Next.js + CesiumJS (P3+)

## Scientific Rules (Enforced)

- No fabricated metrics (Pc, TCA, miss distance)
- All scientific outputs include provenance
- Source data age and quality grade visible
- 6+ digit catalog IDs supported
- UTC timestamps only (display conversion in UI)
- INSUFFICIENT_DATA > zero/placeholder

## License

Proprietary - All Rights Reserved
