# EARTHUS V2 v5.2 Live Reconciliation

Date: 2026-08-31 KST

Branch: `earthus-v2/real-living-earth-render`

Reconciled base: `84a7381ac2a6a43a8400e0a982631168c5bf5a77`

## Source boundary

- The local branch was fast-forwarded from `24d5184` to the verified remote base without reset, restore, clean, or stash.
- Existing dirty/untracked work was preserved. No untracked path conflicted with the 30 tracked paths introduced by the fast-forward.
- The v5.2 R2 ZIP and its 91-file internal checksum set passed.
- The package's 255 Engine / 198 Algorithm catalogs are ownership references. At the reconciled source base only two unique catalog evidence paths existed in live source.
- No new Engine ID was allocated.

## Physical Earth re-audit

| Phase | Fresh status | Evidence |
|---|---|---|
| P0 | `BROWSER_VERIFIED` | one Viewer/canvas; one canonical ArcGIS layer/provider; FND-017 v5.2 policy reaches live Cesium |
| P1 | `REAL_DATA_WIRED` + browser | NOAA IMS metadata/query/2048×1024 PNG 200; Earthus cache-only browser reads; no browser NOAA request |
| P2 | `BROWSER_VERIFIED` | global/Asia/Korea/mountain/coast framebuffer gates; Terrain3D; exaggeration 1 |
| P3 | `BROWSER_VERIFIED` as Living Earth composition | surface/coast path retained; no separate synthetic ocean geometry |
| P4 Trench | `BROWSER_VERIFIED` | TopoBathy 81×65, 10,240 triangles, deepest 10,806m, exaggeration 1 |
| P4 Underwater | `BROWSER_VERIFIED` | TopoBathy 193×157, 59,904 triangles, ~596m spacing, exaggeration 1, tightened visibility gate |
| P5 | `BROWSER_VERIFIED` | observed shell and CTH/GFS progressive path in full framebuffer suite |
| P6 | `BROWSER_VERIFIED` | Earth/polar/cloud/trench/underwater full readPixels suite passes without lowering gates |
| P7 | `RUNTIME_WIRED` | generation/abort/resource ownership retained; compute and visual LOD are independently bounded |
| P12 device | `NOT_TESTED` | requires production URL on physical iPhone/Android/Safari |

## v5.2 capability status

| Capability | Status | Evidence |
|---|---|---|
| Compute Policy Registry | `RUNTIME_WIRED` | global/free first load ceiling C1; browser FND-017 snapshot |
| Materialized Earth | `REAL_DATA_WIRED` / `BROWSER_VERIFIED` | KMA 97 stations, GFS/ECMWF model grid, 4 official typhoon events, 3 immutable artifacts |
| Dependency Invalidation | `FOUNDATION_CODE` / tested | unrelated artifact fanout 0; no-op revision rebuild 0 |
| Intelligence LOD | `RUNTIME_WIRED` | moving camera C1 ceiling independent of FULL visual tier |
| Shared/Private Projection | `FOUNDATION_CODE` / tested | opaque private key, entitlement deny, private no-store, public-field guard |
| Earth Version/Diff | `REAL_DATA_WIRED` / tested | content-addressed `ev_ba7833a481e5ed2ef648655f`; typhoon-only diff changes two leaves |
| Compute Economics | `MEASURED_LOCAL` | 10k/100k/1M reads retain one build; 100 identical deep requests one leader + 99 followers |

## Current materialized truth

- KMA observation generated: `2026-08-30T13:25:00Z`
- Positioned stations: `97`
- GFS/ECMWF model valid time: `2026-08-30T15:00:00Z`
- Official typhoon cache generated: `2026-08-30T14:25:00Z`
- Events: `ETAU`, `BANG-LANG`, `KARINA`, `LOWELL`
- Current payload: 11,761 bytes, 2,586-byte gzip equivalent
- Cost status: `INSUFFICIENT_RATE_DATA`; no cloud price was invented
- GPU required for base Earth: `false`

## Load replay

| Reads | Domain builds | Reuse factor | Heavy compute/read |
|---:|---:|---:|---:|
| 10,000 | 1 | 10,000 | 0.0001 |
| 100,000 | 1 | 100,000 | 0.00001 |
| 1,000,000 | 1 | 1,000,000 | 0.000001 |

The local measured recommendation is `NO_SCALE_NEEDED`; this is not a production-capacity claim. Production CPU/GPU/provider/egress rates and sustained queue telemetry are not yet available.

## Deployment boundary

- Deploy only files tracked beneath `prototype/v2`.
- Exclude `README.md`, package metadata, ignored `config.local.js`, and every unrelated untracked file.
- Upload exact MIME/cache headers per file.
- Preserve identical entry bytes at `/v2/` and `/v2/index.html`; `/v2` remains a V2 redirect/entry.
- Invalidate only `/v2`, `/v2/`, `/v2/index.html`, and `/v2/*`.
- Compare `/`, `/index.html`, and `/sw.js` byte-for-byte before and after deployment.

## External gates

- Physical iPhone, low-end Android, Safari, VoiceOver/TalkBack, sustained thermal and battery evidence remain `NOT_TESTED` until production is deployed and a human operates the devices.
- Private C4/C5 production endpoint remains closed while sales/entitlement approval is closed. Its contracts are implemented and tested but not publicly enabled.
- No `main` merge is part of this work.
