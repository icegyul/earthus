# Contributing to Aetherus Orbital Environment

## Development Workflow

### Phase-based Development

This project follows strict phase-based development per `PHASE_TASK_CARDS.md`:

1. **Never skip phases** - P1 cannot start until P0 passes all gates
2. **Evidence required** - Each phase must generate `artifacts/evidence/<phase>.json`
3. **No placeholders in core paths** - TODO/NotImplemented forbidden in production logic
4. **Scientific integrity** - Never fabricate metrics, always include provenance

### Getting Started

```bash
# Clone repository
git clone <repository-url>
cd aetherus-orbital-environment

# Start services
docker compose up -d

# Run migrations
make migrate

# Run tests
make test

# Generate evidence
make evidence
```

### Code Quality Standards

#### Required Before Commit

```bash
# Format
make format

# Lint
make lint

# Type check
make type-check

# Tests
make test
```

All must pass before creating a pull request.

#### Anti-Shortcut Rules (Enforced by CI)

- No `TODO` or `FIXME` in production code paths (tests/docs OK)
- No constant-return scientific functions
- No fabricated Pc, TCA, miss distance, position, or risk metrics
- All scientific outputs must include provenance
- Source data age and quality grade visible
- INSUFFICIENT_DATA > zero/placeholder

#### Type Safety

- Use type hints on all public functions
- Use Pydantic for API contracts
- Use SQLAlchemy models for database

#### Database

- All timestamps are `timestamptz` (UTC)
- `catalog_id` is `text` (supports 6+ digit IDs)
- Migrations are immutable - create new migrations, don't edit applied ones
- Snapshot/version data, don't overwrite

### Scientific Rules

Per Master Spec section 2:

1. **No fabricated data** - If data unavailable, return `UNAVAILABLE`/`INSUFFICIENT_DATA`
2. **Provenance required** - All scientific outputs include source, model, version, hash
3. **Metric separation** - Pc ≠ MaxProbability ≠ miss distance ≠ density
4. **Covariance requirement** - No operational Pc without valid covariance
5. **Source grading** - PUBLIC_GP ≠ OPERATIONAL_CDM ≠ CITIZEN_OBSERVATION
6. **Reproducibility** - Input hash, model version, config version stored

### Testing

#### Test Categories

- **Unit tests** - Pure functions, parsers, transforms
- **Integration tests** - Database, API contracts
- **Acceptance tests** - Per `acceptance_matrix.csv`
- **Benchmark tests** - Performance with hardware context

#### Test Data

- Use official verification fixtures (TraCSS, spec examples)
- Label test data source and license
- Never use production data in tests without sanitization

### Pull Request Process

1. Create feature branch from `main`
2. Implement changes following phase requirements
3. Ensure all quality checks pass
4. Generate evidence if completing a phase
5. Create PR with:
   - Description of changes
   - Phase completion status
   - Evidence file path (if applicable)
   - Known limitations
   - Test results

### Phase Completion Checklist

Before marking a phase DONE:

- [ ] Production code exists (no placeholder returns)
- [ ] Migrations committed and applied
- [ ] Tests pass
- [ ] Required fixtures/snapshots recorded
- [ ] API contracts exercised
- [ ] Persistence verified
- [ ] Error handling exists
- [ ] `artifacts/evidence/<phase>.json` generated
- [ ] Known limitations documented
- [ ] Phase gate in Master Spec satisfied

### Code Review Focus

Reviewers check for:

1. **Scientific correctness** - No fabricated metrics, provenance included
2. **Phase adherence** - No out-of-phase features
3. **Anti-shortcuts** - No placeholder code in critical paths
4. **Test coverage** - Core functionality tested
5. **Documentation** - API contracts, assumptions, limitations clear

### Commit Message Format

```
<phase>: <type>: <description>

<body>

Evidence: <path to evidence file if phase complete>
```

Types: feat, fix, test, docs, refactor, perf, ci

Example:
```
P0: feat: implement database migration system

Add MigrationRunner class that executes SQL files from migrations/
directory and tracks applied migrations in schema_migrations table.

Evidence: artifacts/evidence/P0.json
```

### Questions?

See:
- `MASTER_DEVELOPMENT_SPEC.md` for complete specification
- `PHASE_TASK_CARDS.md` for phase requirements
- `QUALITY_GATES.md` for quality requirements
- `VERIFICATION.md` for boot verification steps
