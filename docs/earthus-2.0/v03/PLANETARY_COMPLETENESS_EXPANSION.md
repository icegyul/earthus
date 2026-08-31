# EARTHUS 2.0 Engine Foundation v0.3 — Planetary Completeness Expansion

## Why v0.3 exists

v0.2 corrected the core architecture but still concentrated on Weather, Cloud, Human Flow, storage and core visuals. v0.3 fills missing production boundaries around data compilation, ocean, hazards, cross-domain intelligence, security, QA, space-event handoff and product analytics.

## Package delta

- Base v0.2 engines: 124
- New v0.3 engines: 55
- Total engines: 179
- Base v0.2 algorithms: 53
- New v0.3 algorithms: 30
- Total algorithms: 83

## The most important new boundaries

1. **Data Plane** — providers no longer feed visuals directly; tile/time/revision/cache contracts sit between canonical signals and renderers.
2. **Ocean** — scalar current, vector current, wave, swell, tide, buoy observation and coastal exposure are separate meanings.
3. **Hazards** — official warning is its own authority layer; Earthus derived context never replaces it.
4. **Planet State Graph** — cross-domain signals can be compared and explained without silently calling correlation causation.
5. **Security/QA** — redaction, abuse guard, privacy minimization, fault injection and launch gates become first-class engines.
6. **Space Event Bridge** — launch events can move from Earthus Event view to Aetherus without merging the render/runtime domains.

## Production rule

`IMPLEMENTED_FOUNDATION` means executable contract/algorithm code exists in this package. It does **not** mean the external provider, AWS runtime, Cesium integration, Supabase schema, NAS, or mobile device QA is Production complete.
