# EARTHUS V1 — V38 FINAL RELEASE CANDIDATE

V38 is the final integration/release-candidate stage for the EARTHUS V1 Pleos architecture.

## Fixed product matrix
| Product | WEB | MOBILE | PLEOS |
|---|---:|---:|---:|
| EARTHUS | ✅ | ✅ | ✅ |
| AETHERUS | ✅ | ✅ | ❌ |

AETHERUS is explicitly excluded from Pleos, while remaining part of the Web/Mobile product family.

## Finalized
- V35 actual app integration facade
- V36 UI adapter
- V37 actual screen renderer
- standalone Pleos EARTHUS-only renderer
- product/build target separation
- safety/action gating
- final release gate and test harness
- file manifest/checksums

## Important scope
The production EARTHUS application repository itself was not present in this workspace. Therefore this package is the **final release-candidate integration kit and gate**, not a compiled production APK/AAB and not a claim that an external production repository was modified.

To create the actual production binary, apply the V38 source handoff to the real EARTHUS source tree, connect the real provider/map/Pleos adapters, then rerun the V38 gate before packaging.
