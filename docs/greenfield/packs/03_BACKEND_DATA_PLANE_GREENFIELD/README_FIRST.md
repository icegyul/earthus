# EARTHUS V2 Backend / Data Plane — Greenfield

Zero-start backend responsibility:
Provider fetch -> Raw Artifact Receipt -> schema/drift -> canonical signal -> version/revision -> Event Store/Lineage -> materialized read model -> API/cache/CDN.

Included:
- v07-v10 backend modules
- PostgreSQL contract migrations
- storage/data/ops/security foundations referenced by backend engines
- backend-specific engine/algorithm subsets
- scoped AWS preview deployment helper
- .env.example without secrets

Production accounts, API keys, buckets, Supabase project and licenses are external gates; source code must fail closed when absent.
