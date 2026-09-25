# EARTHUS V1 — V38 FINAL RELEASE CANDIDATE GATE

## Product separation (fixed)
- EARTHUS: WEB / MOBILE / PLEOS
- AETHERUS: WEB / MOBILE
- AETHERUS: NEVER IN PLEOS

## Runtime architecture
Map/POI/state -> UI Adapter -> Screen Renderer -> Pleos Safety Gate.

## Pleos hard rule
Pleos is an EARTHUS-only build target. The final Pleos renderer has no AETHERUS renderer import, no AETHERUS route, no AETHERUS bundle namespace, and no AETHERUS analytics registration.

## Data/network
- static map/POI data: local-first bundle/cache
- live weather/air/ocean/disaster: network only when required
- transactional booking/coupon: on-demand external flow
- static runtime network findings must be 0

## Safety
- UNKNOWN fails safe
- DRIVING / RESTRICTED block disallowed actions at execution time
- critical disaster overrides leisure/commercial discovery
- no UI-only hiding as the sole safety mechanism

## Release gates
1. V35 integration PASS
2. V36 user journey PASS
3. V37 renderer/product separation PASS
4. V38 standalone Pleos bundle contains no AETHERUS module/dependency
5. V38 rendered Pleos HTML contains no AETHERUS brand/runtime string
6. AETHERUS WEB/MOBILE remains allowed
7. Pleos safety actions remain blocked/allowed according to policy

## Important scope statement
This package is the final integration/release-candidate kit built from the EARTHUS V1 implementation artifacts available in this workspace. It is not a compiled production APK/AAB and it does not claim that an external EARTHUS application repository was modified unless that source repository is supplied and wired to this package.
