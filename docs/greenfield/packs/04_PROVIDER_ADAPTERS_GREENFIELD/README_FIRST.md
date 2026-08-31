# EARTHUS V2 Provider Adapters — Greenfield

Provider adapters are data ingress, not visual truth by themselves.

Every production adapter must emit sourceId, observedAt/validAt, retrievedAt, rights/license metadata, schema version, raw receipt/hash, truth class and health/freshness. Browser direct calls are avoided when secrets/rights/caching require server mediation.

The included v09 adapters are foundation references and still require actual API contracts, credentials, quotas, rights review and smoke tests.
