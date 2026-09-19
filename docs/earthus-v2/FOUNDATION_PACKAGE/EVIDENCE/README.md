# EARTHUS 2.0 Engine Foundation v0.2

## Production Architecture Correction

This package converts the EARTHUS 2.0 master direction into a safer implementation foundation. It is designed to be applied to the **verified canonical local EARTHUS repository**, not blindly to a stale remote checkout.

### Package scale

- Engine/component catalog: **124**
- Algorithm/contract catalog: **53**
- Executable or adapter module mappings: **93**
- Automated tests: **148 passed / 0 failed**
- True foundation contracts: **16**
- Product P0 entries outside the foundation: **7**

### What v0.2 corrects

1. Reuses verified EARTHUS 1.0 assets instead of rebuilding them.
2. Separates algorithms from visual renderers.
3. Makes Terrain, Country Focus and geospatial reference first-class foundations.
4. Adds a common visual-engine lifecycle and resource ownership contract.
5. Separates cloud, precipitation, runoff, rivers and flooding.
6. Corrects forecast/calibration into a closed SHADOW -> Ground Truth -> Calibration -> CANARY loop.
7. Adds a canonical S3 signal lake index without replacing the proven S3/CloudFront data plane.
8. Adds product/tile-specific satellite source selection rather than one global source order.
9. Adds domain-policy adapters so one Best Window formula is not reused blindly across tourism, hiking, surfing, events and safety.
10. Adds paid entitlement, rights, quota, usage and country-readiness contracts without hiding official safety data.
11. Adds safe S3-to-NAS archive and restore foundations.
12. Adds cost, observation-gap, fail-soft scene and trust-ledger ideas.

### Maturity vocabulary

- `REUSE_AS_IS`: keep verified implementation and freeze its contract.
- `REUSE_WITH_ADAPTER`: retain working code and normalize its interface.
- `HARDEN`: retain behavior but add reliability, security, rights, observability and tests.
- `REFACTOR`: preserve proven data/UX truth while replacing the internal boundary.
- `IMPLEMENTED_FOUNDATION`: executable pure foundation code and tests exist in this package; provider/Cesium/AWS/Supabase wiring may still be required.
- `SPECIFIED_NEXT`: design is complete enough to implement, but no production implementation is claimed.
- `FUTURE_VISION`: explicitly not a current completion target.

### Repository safety rule

The read-only audit was performed at local `main@2eb7c4ba91e5e33fa13ca9d5ffbc65a9c1ce75ec`; at that moment the local repository was 72 commits ahead of `origin/main`. Re-run the repository identity check before applying this package. Never reset, pull over, or deploy from an unverified branch.

### Start here

1. Read `SOURCE_BASIS.md`.
2. Read `PRODUCTION_ARCHITECTURE_CORRECTION.md`.
3. Review `REUSE_DECISION_MATRIX.md`.
4. Run `tools/earthus2-v02/run_all_checks.sh`.
5. Apply `CODEX_APPLY_DIRECTIVE.md` to the verified canonical local repository.
6. Build Wave 0 only before domain expansion.

### Non-claims

This package is not yet wired to the live EARTHUS repository, AWS, Supabase, NAS or `earthus.net/v2`. Passing pure tests does not prove provider runtime, browser rendering, real-device thermal behavior, commercial rights or production deployment.
