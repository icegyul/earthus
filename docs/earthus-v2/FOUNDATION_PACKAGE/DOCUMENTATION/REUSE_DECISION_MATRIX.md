# EARTHUS 1.0 -> 2.0 Reuse Decision Matrix

| Component | Verified current state | Decision | v0.2 action | Acceptance gate |
|---|---|---|---|---|
| Cesium Globe Core | PRODUCTION_ACTIVE | REUSE_AS_IS | Freeze viewer contract; mount `/v2` through adapter | Real-device regression gate |
| Thermal/Render Quality | PRODUCTION_ACTIVE | REUSE_AS_IS | Bind v2 quality profiles and resource measurements | 30-cycle/context-loss/30-minute thermal |
| v8 Truth Contract | IMPLEMENTED/contract tested | REUSE_AS_IS | Map classes without semantic drift | Official/forecast/analysis/simulation separation |
| v8 Unified Time | PARTIAL global adoption | REUSE_WITH_ADAPTER | Extend to one availability/time contract | No feature-specific time mixing |
| v8 Source Registry | IMPLEMENTED | HARDEN | Add schema, rights, quota, health and provenance | Every provider has current contract/status |
| AWS Lambda/EventBridge collectors | 69 deployed / 60 referenced enabled at audit | HARDEN | Keep collectors; add health/DLQ/DAG/circuit-breaker | Do not equate enabled schedule with fresh source |
| S3/CloudFront data plane | PRODUCTION_ACTIVE | REUSE_WITH_ADAPTER | Keep routes; add canonical keys/manifests/versioning | Backward compatibility and replay |
| Supabase control plane | PRODUCTION_ACTIVE/PARTIAL drift | HARDEN | Retain auth/plans/orders/watch; add server entitlements and parity checks | RLS/Edge deployment E2E |
| Seoul citydata_ppltn | PRODUCTION_ACTIVE but audit snapshot stale | REUSE_WITH_ADAPTER | Preserve 121 registry, freshness, provider forecast | No fake fine grid |
| Seoul generic citydata | NOT_FOUND | SPECIFIED_NEXT | Build only after current contract capture | Do not call it already connected |
| KTO | PARTIAL | REUSE_WITH_ADAPTER | Use existing 9-service contract/adapter; close schedule/UI drift | Operation-level runtime evidence |
| KMA | PRODUCTION_ACTIVE | REUSE_WITH_ADAPTER | Use existing forecast/radar/warning/weather assets | Provider registry and Weather Fusion adapter |
| AirKorea | PRODUCTION_ACTIVE; alert adapter absent | HARDEN | Keep 673-station observation path; add alert/source priority/freshness | Official alert hard gate separate |
| Layer Menu | 61 definitions / copy-status drift | HARDEN | Generate from manifest and provider readiness | No hidden/misleading active state |
| Population renderer | Aggregate radial kernels | REFACTOR | Reuse budgets/freshness/mass audit; add pooled instances when actual cells exist | Aggregate truth retained |
| Weather renderers | Existing field/flow/imagery | REUSE_WITH_ADAPTER | Standardize Field/Flow/Volume contracts | No vectorless flow |
| Watch/Push | Code paths exist; device E2E unknown | HARDEN | Cooldown/dedupe/deep-link/token lifecycle | Real-device delivery evidence |
| Aetherus Three.js | Separate lazy canvas | PRESERVE_BOUNDARY | Do not merge into EARTHUS v2 renderer by default | No simultaneous hidden WebGL engines |