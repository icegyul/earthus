# Aetherus phase verification

## P5: Intervention Benefit Engine (IDEALIZED_REMOVAL counterfactuals only)

P5 remains `BLOCKED` until `artifacts/evidence/P5.json` says `PASSED`. The
benefit engine consumes only the fixed P4 screening/event record; baseline
graphs, scenarios, runs and benefit rows are append-only (DB triggers). REMOVE
is a counterfactual simulation — no actual removal, maneuver or command path
exists. Benefit_i(s,h,m) = R_i(G0,h,m) − R_i(Gs,h,m) on identical
metric/horizon/config; PC/MAX_PC/CONJUNCTION_EXPOSURE stay separate channels
and MISS_DISTANCE never becomes a benefit number. The live catalog has zero
operational events, so live requests return explicit INSUFFICIENT_DATA states.

```bash
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml up -d --build api
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml exec -T api python -m backend.migrations.migrate
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml exec -T api python -m pytest -q -p no:cacheprovider
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml exec -T api python -m ruff check backend tests quality
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml exec -T api python -m mypy backend
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml exec -T api python quality/check_no_tle_width.py backend
```

BEN-001 / BEN-003 validation corpus (SIMULATION_ONLY; persisted with explicit
labels so operational paths can never consume it):

```bash
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml exec -T api \
  python backend/tools/run_benefit_validation.py   # writes artifacts/evidence/p5/{validation-ben001,equivalence-ben003}.json
```

Browser E2E for the REMOVE panel (host side; requires the stack up):

```bash
python3 -m pip install -r requirements-e2e.txt
python3 -m playwright install chromium
python3 -m pytest tests/e2e/test_p5_remove_panel.py -m e2e -q -p no:cacheprovider --noconftest
```

Copy the host-side evidence into the container, generate the phase manifest,
and copy it back:

```bash
docker exec aetherus-p1-api mkdir -p /app/artifacts/evidence/p5
docker cp artifacts/evidence/p5/. aetherus-p1-api:/app/artifacts/evidence/p5/
SOURCE_SHA="$(git rev-parse HEAD)"
docker exec -e AETHERUS_GIT_COMMIT="$SOURCE_SHA" aetherus-p1-api \
  python backend/tools/generate_evidence.py --phase P5
docker cp aetherus-p1-api:/app/artifacts/evidence/P5.json artifacts/evidence/P5.json
python3 -c 'import json,sys; e=json.load(open("artifacts/evidence/P5.json")); sys.exit(0 if e["commit"] == sys.argv[1] == e["gates"]["git_commit"]["commit"] else 1)' "$SOURCE_SHA"
```

Commit the source before this command, then commit the generated evidence
separately. Generating P5 evidence before the source commit is a failed gate.

P5 hard gate: full-vs-selective must be equal within documented tolerance
(exact equality enforced) before any performance number counts; the zero-event
live catalog must produce explicit states, never beneficiaries, numbers, or
fabricated edges.

---

## P4: Conjunction Assessment (conservative screening, refined TCA, covariance-gated Pc)

P4 remains `BLOCKED` until `artifacts/evidence/P4.json` says `PASSED`. The
screening pipeline consumes only stored P1/P2 orbit solutions; conjunction
snapshots are append-only (DB trigger); Pc is computed exclusively from a valid
CDM covariance and stays `NOT_COMPUTED` for PUBLIC_GP inputs. The corrected
`p4-encounter-plane-v2` model requires an explicit common TEME frame, explicit
km² covariance units, a positive combined HBR, and the `B @ C @ B.T` encounter
plane covariance transform; registry v1 is intentionally invalidated.

Run the isolated stack with the P3 port override:

```bash
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml up -d --build
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml exec -T api python -m backend.migrations.migrate
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml exec -T api python -m pytest -q -p no:cacheprovider
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml exec -T api python -m ruff check backend tests quality
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml exec -T api python -m mypy backend
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml exec -T api python quality/check_no_tle_width.py backend
```

CA-001 validation corpus metrics (synthetic 10k injected-close-pairs,
validation-only; never persisted as operational events):

```bash
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml exec -T api \
  python backend/tools/run_ca_validation.py   # writes artifacts/evidence/p4/validation-ca001.json inside the container volume
```

Browser E2E for the risk panel (host side; requires the stack up):

```bash
python3 -m pip install -r requirements-e2e.txt
python3 -m playwright install chromium
python3 -m pytest tests/e2e/test_p4_risk_panel.py -m e2e -q -p no:cacheprovider --noconftest
```

Copy the host-side evidence into the container, generate the phase manifest,
and copy it back:

```bash
docker exec aetherus-p1-api mkdir -p /app/artifacts/evidence/p4
docker cp artifacts/evidence/p4/. aetherus-p1-api:/app/artifacts/evidence/p4/
SOURCE_SHA="$(git rev-parse HEAD)"
docker exec -e AETHERUS_GIT_COMMIT="$SOURCE_SHA" aetherus-p1-api \
  python -m backend.tools.generate_evidence --phase P4
docker cp aetherus-p1-api:/app/artifacts/evidence/P4.json artifacts/evidence/P4.json
python3 -c 'import json,sys; e=json.load(open("artifacts/evidence/P4.json")); sys.exit(0 if e["commit"] == sys.argv[1] == e["gates"]["git_commit"]["commit"] else 1)' "$SOURCE_SHA"
```

Commit the source before this command, then commit the generated evidence
separately. Generating P4 evidence before the source commit is a failed gate.

P4 hard gate: `GET /api/v1/conjunctions` serves only persisted results;
a metric threshold without `metric_type` is rejected with 422; empty or
insufficient states are returned verbatim and never filled with synthetic
conjunctions, risk numbers, or Pc estimates.

---

## P3: Explore UI (API-derived 3D positions, LOD, provenance)

P3 remains `BLOCKED` until `artifacts/evidence/P3.json` says `PASSED`. The UI
renders only coordinates returned by `GET /api/v1/catalog/snapshot` and
`GET /api/v1/objects/{id}/ephemeris`; the browser never propagates an orbit.

Run the isolated stack with the P3 port override:

```bash
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml up -d --build
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml exec -T api python -m backend.migrations.migrate
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml exec -T api python -m pytest -q -p no:cacheprovider
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml exec -T api python -m ruff check backend tests quality
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml exec -T api python -m mypy backend
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml exec -T api python quality/check_no_tle_width.py backend
```

Browser E2E with network inspection (host side; requires the stack up):

```bash
python3 -m pip install -r requirements-e2e.txt
python3 -m playwright install chromium
python3 -m pytest tests/e2e -m e2e -q -p no:cacheprovider --noconftest
```

The E2E run writes `artifacts/evidence/p3/` containing the captured network
log, HAR, request/response samples, per-coordinate proof JSON, and screenshots.
Copy the evidence into the container, generate the phase manifest, and copy it
back:

```bash
docker cp artifacts/evidence/p3 aetherus-p1-api:/app/artifacts/evidence/p3
AETHERUS_GIT_COMMIT="$(git rev-parse HEAD)" \
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml -f docker-compose.p3.yml exec -T api \
  python -m backend.tools.generate_evidence --phase P3
docker cp aetherus-p1-api:/app/artifacts/evidence/P3.json artifacts/evidence/P3.json
```

P3 hard gate: the browser network trace must prove every rendered marker and
the selected orbit line derive from the two API endpoints above. A global
density view stays `INSUFFICIENT_DATA` while the ingested catalog is smaller
than the configured threshold; no synthetic population is ever rendered.

---

## P1: provider-neutral ingestion and canonical identity

P1 remains `BLOCKED` until `artifacts/evidence/P1.json` says `PASSED`. The
default regression suite intentionally skips live provider tests; fixture,
MockTransport, API-only, or cached results cannot unlock P2.

Run an isolated stack without World.com integration:

```bash
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml up -d --build
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml exec -T api python -m backend.migrations.migrate
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml exec -T api python -m pytest -q -p no:cacheprovider
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml exec -T api python -m ruff check backend tests quality
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml exec -T api python -m mypy backend
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml exec -T api python quality/check_no_tle_width.py backend
```

The P1 schema must include migration `003_ingestion_policy_identity_and_rejections`,
the run-artifact, rejection, and identity-conflict tables, plus PostGIS and pgcrypto.
Every stored P1 OMM response must preserve its raw bytes and return
`covariance_status: INSUFFICIENT_DATA` with `pc_status: NOT_COMPUTED`.
The local `INTERNAL_ADMIN_TOKEN` additionally protects provider health, identity
conflicts, and bounded `/internal/ingestion/runs` metadata; it never returns raw
provider bodies, credentials, or cookie material.

Before live proof, use no credential values. The opt-in negative test makes no
CelesTrak request and confirms Space-Track returns the explicit unavailable state:

```bash
P1_RUN_LIVE_PROVIDER_TESTS=1 P1_LIVE_CATALOG_ID=25544 P1_EXPECT_SPACETRACK_UNAVAILABLE=1 \
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml up -d --force-recreate api
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml exec -T api \
  python -m pytest tests/integration/test_live_provider_evidence.py -m live_provider -q
```

After adding only valid credentials to ignored local `.env`, remove
`P1_EXPECT_SPACETRACK_UNAVAILABLE`, recreate `api`, and run that same test once.
It performs one fresh source request per provider and writes no credential, cookie,
or raw response body to evidence. Generate evidence with a host revision ID:

If that permitted request has already preserved a raw snapshot but an older parser
rejected it, correct the parser and run the live test again. It reprocesses the
exact content-addressed snapshot without a second provider request; it never
manufactures a replacement record.

```bash
AETHERUS_GIT_COMMIT="$(git rev-parse HEAD)" \
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml up -d --force-recreate api
docker-compose -p aetherus-p1 -f docker-compose.yml -f docker-compose.p1.yml exec -T api \
  python -m backend.tools.generate_evidence --phase P1
docker cp aetherus-p1-api:/app/artifacts/evidence/P1.json artifacts/evidence/P1.json
```

Do not retry a failed authenticated call. `AUTH_FAILED`, `UNAVAILABLE`, or
`RATE_LIMITED` keeps P1 blocked; correct the configuration or wait for the provider
policy interval. P1 does not implement propagation, conjunction assessment, risk,
or collision probability.

---

# P0 Clean Clone Boot Verification

This document provides step-by-step verification that P0 implementation is complete and passes all gates.

## Prerequisites

- Docker and Docker Compose installed
- Git
- Make (optional, for convenience commands)

## Clean Clone Verification

### Step 1: Clone Repository

```bash
git clone <repository-url> aetherus-test
cd aetherus-test
```

### Step 2: Start Services

```bash
# Using docker compose
docker compose up -d

# Or using make
make up
```

Expected output:
- PostgreSQL container healthy
- Redis container healthy
- API container healthy

Verify with:
```bash
docker compose ps
```

All services should show `healthy` status.

### Step 3: Run Migrations

```bash
# Using docker compose
docker compose exec api python -m backend.migrations.migrate

# Or using make
make migrate
```

Expected output:
```
INFO - Ensured schema_migrations table exists
INFO - Applying migration: 001_initial_schema
INFO - Migration 001_initial_schema applied successfully in XXXms
INFO - Migration run complete
```

Verify migration status:
```bash
make migrate-status
```

Should show:
```
✓ Applied    001_initial_schema
Applied: 1 / 1
```

### Step 4: Check Health Endpoints

```bash
# API health check
curl http://localhost:8000/health

# Expected response (status 200 or 503 if degraded):
{
  "status": "healthy",
  "version": "0.1.0-p0",
  "timestamp": "...",
  "phase": "P0",
  "services": {
    "database": "healthy",
    "api": "healthy"
  },
  "scientific_features": {
    "ingestion": "not_implemented",
    "orbit_propagation": "not_implemented",
    "conjunction_assessment": "not_implemented",
    "benefit_engine": "not_implemented"
  }
}

# API status
curl http://localhost:8000/api/v1/status
```

### Step 5: Run Tests

```bash
# Using docker compose
docker compose exec api pytest tests/ -v

# Or using make
make test
```

Expected: All tests pass

### Step 6: Run Linting

```bash
make lint
```

Expected: No errors

### Step 7: Run Type Checking

```bash
make type-check
```

Expected: No errors or only acceptable warnings

### Step 8: Generate Evidence

```bash
make evidence
```

Expected output:
```
Evidence written to: artifacts/evidence/P0.json
Status: PASSED
```

Check the evidence file:
```bash
cat artifacts/evidence/P0.json
```

Should contain:
- `"status": "PASSED"`
- All gates marked as passed
- List of implemented features
- Known limitations
- Next phase requirements

### Step 9: Verify Database Schema

```bash
docker compose exec postgres psql -U aetherus -d aetherus -c "\dt"
```

Expected: List of all tables from schema.sql including:
- data_source
- space_object
- orbit_solution
- conjunction_event
- risk_edge
- intervention_scenario
- benefit_result
- And all other tables from 001_initial_schema.sql

### Step 10: Anti-Shortcut Checks

Verify no placeholder patterns in production code:

```bash
# Should return nothing
grep -r "TODO\|FIXME\|NotImplemented\|pass  # placeholder" backend/ --exclude-dir=__pycache__ --exclude="*.pyc"
```

Verify catalog_id is text, not integer:

```bash
docker compose exec postgres psql -U aetherus -d aetherus -c "\d space_object"
```

Should show `catalog_id | text`

## Quality Gates Checklist

- [ ] Docker Compose starts all services
- [ ] PostgreSQL container is healthy with PostGIS
- [ ] Redis container is healthy
- [ ] API container is healthy
- [ ] Migrations run successfully
- [ ] All tables created from schema.sql
- [ ] Health endpoints return expected structure
- [ ] All tests pass
- [ ] Linting passes with no errors
- [ ] Type checking passes
- [ ] No TODO/placeholder in production code paths
- [ ] Evidence JSON generated with PASSED status
- [ ] catalog_id stored as text (supports 6+ digits)
- [ ] All timestamps use timestamptz (UTC)
- [ ] PostGIS and pgcrypto extensions enabled

## Known Limitations (Expected)

These are documented in the evidence file and are expected for P0:

1. No data ingestion (requires P1)
2. No orbit propagation (requires P2)
3. No UI (requires P3)
4. No conjunction assessment (requires P4)
5. Database schema complete but unpopulated
6. API endpoints are infrastructure only

## Next Steps

After P0 verification passes, proceed to P1 implementation:

- CelesTrak adapter
- Raw artifact immutable storage
- 6+ digit catalog ID support
- OMM parser with provenance
- Rate limiting and retry logic

## Troubleshooting

### Services won't start

```bash
docker compose down
docker compose up -d --build
```

### Database connection errors

Check PostgreSQL logs:
```bash
docker compose logs postgres
```

Verify connection string in backend/config.py matches docker-compose.yml

### Tests fail

Check if migrations were run:
```bash
make migrate-status
```

Check test database connection:
```bash
docker compose exec api python -c "from backend.database import check_db_health; import asyncio; print(asyncio.run(check_db_health()))"
```

### Port conflicts

If ports 5432, 6379, or 8000 are in use:

```bash
# Stop conflicting services or modify docker-compose.yml ports
docker compose down
# Edit docker-compose.yml to use different ports
# Then restart
docker compose up -d
```
