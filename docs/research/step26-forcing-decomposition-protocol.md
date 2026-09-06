# STEP 26 — Forcing decomposition / resolution effect (Phase A: preregistration only)

Rule id: `forcing-decomposition-step26`. Base commit: c974ce42 (STEP 25C / TEST-02, label NO CLEAR DESCRIPTIVE DIFFERENCE, preserved unchanged).
Machine-readable rules: `docs/research/step26-forcing-decomposition-rule.json` (authoritative for the validator); this document explains them.

## 0. Objective

Separate the HYCOM-versus-GLORYS trajectory difference observed in TEST-02 into the parts that existing, already-acquired data can isolate:
(1) temporal forcing representation, (2) spatial forcing representation, (3) product-specific differences, (4) native depth representation
(made visible only; not attributed). No new forcing, no new observations, no alpha re-selection, no change to STEP 20 alpha = 0.002.

## 1. Ancestry and immutability

Required ancestors: 551668ef (17), d505cc5e (18), 5b9567e5 (18b), 5f27dc2d (19), 155995dd (20), 73fafffb (20 alpha), 9113e8b5 (B-3), 869bc664 (B-4),
c395a098 (B-5), ed746129 (B-6), 7b0453b8 (21), a7f62873 (22), 4bb4342b (23), e0e7cfd2 (24), db6cea2f (24b), 2841f511 (25A), 929d3468 (25B), c974ce42 (25C).
Every STEP 17–25C locked artifact keeps its SHA-256 (list in the rule file); the research runtime stays byte-identical to 155995dd. Any mismatch: STOP.

## 2. Frozen reference (unchanged)

HYCOM GOFS 3.1 GLBv0.08, 0.08°, 15 m, 3-hourly; NCEP-DOE R2 10 m 6-hourly; alpha = 0.002; RK4, 300 s integration, 900 s output, 72 h;
bilinear spatial, linear temporal, cos(phi) at every RK4 stage; no extrapolation, smoothing, zero-fill, land substitution, source-gap filling, frame duplication.

## 3. Depth audit (explicit, mandatory in every STEP 26 output)

| forcing | native depth used in TEST-02 |
|---|---|
| HYCOM | 15.000 m |
| GLORYS12V1 | 15.810070 m (native level nearest 15 m, as stored) |
| difference | 0.810070 m |

The two forcings are NOT identical-depth forcings. Neither depth is changed, no vertical interpolation, no invented common depth.
STEP 26 does not attribute any difference to depth; depth sensitivity is TEST-04 (separate, not started).

## 4. Conditions (exactly four)

| id | condition | source | spatial | temporal | depth | purpose |
|---|---|---|---|---|---|---|
| A | HYCOM_NATIVE_3H | HYCOM GOFS 3.1 GLBv0.08 (STEP 17 / STEP 20 B-3 normalized) | 0.08° | 3 h native | 15.000 m | frozen baseline; trajectories = immutable STEP 20 runs (alpha 0.002), never re-run |
| B | HYCOM_DAILY | same HYCOM frames | 0.08° (unchanged) | arithmetic daily mean of all 8 native frames of a UTC day (00,03,…,21Z), u and v separately | 15.000 m | temporal aggregation sensitivity |
| C | GLORYS_NATIVE_DAILY | GLORYS12V1 GLOBAL_MULTIYEAR_PHY_001_030 / cmems_mod_glo_phy_my_0.083deg_P1D-m (STEP 25B files, STEP 25C normalized) | 1/12° | daily mean native | 15.810070 m | native high-resolution forcing; must reproduce STEP 25C result arrays bitwise |
| D | GLORYS_COARSE_DAILY | exactly the same GLORYS fields as C | bilinear onto the exact immutable HYCOM grid of the window | same GLORYS daily frames and labels | 15.810070 m | spatial representation sensitivity within one product |

HYCOM_DAILY labelling: each daily mean carries the 00:00Z label of the averaged UTC day, the same convention GLORYS files store, so B and D share one temporal representation.
Model integration between daily labels: linear (frozen runtime). A day is admissible only if all eight native frames exist; otherwise the day is absent and no interpolation across it is permitted.

## 5. Feasibility from existing data (fact recorded at lock; not a result)

The STEP 17 / B-3 HYCOM acquisitions cover exactly t0 (12Z) … t0+72 h (12Z): 25 frames per window. Complete UTC days available: only t0+1 and t0+2.
A 72 h run under the 00Z-label convention needs daily means for days t0 … t0+4 (five). With the 12Z-centre convention it would need t0 … t0+3 (four); day t0 (4 frames) and day t0+3 (5 frames) are incomplete under either convention.
Therefore **condition B cannot be constructed for any of the six windows from the already-acquired data** without violating the 8-frame rule or the no-new-download policy: **B = STEP26_DATA_BLOCKED (all six windows)**, and Comparisons 1 and 3 are BLOCKED. Lifting this requires a separately authorized HYCOM re-acquisition step (t0−1 d 00Z … t0+5 d 00Z); STEP 26 does not download.
Conditions A, C, D are constructible: the HYCOM grid of every window lies inside the GLORYS subset extent (verified from the normalized files at lock).

## 6. Comparisons

| # | X vs Y | tests | status at lock |
|---|---|---|---|
| 1 | HYCOM_NATIVE_3H vs HYCOM_DAILY | temporal aggregation (same product, grid, depth) | BLOCKED (B unavailable) |
| 2 | GLORYS_NATIVE_DAILY vs GLORYS_COARSE_DAILY | spatial representation (same source, cadence, native depth) — cleanest spatial comparison | EXECUTABLE in Phase B |
| 3 | HYCOM_DAILY vs GLORYS_COARSE_DAILY | product difference at matched approximate grid and daily representation; depth still dataset-native → PRODUCT_COMPARISON, not PURE_RESOLUTION_COMPARISON | BLOCKED (B unavailable) |
| 4 | HYCOM_NATIVE_3H vs GLORYS_NATIVE_DAILY | full TEST-02 contrast; consistency check that STEP 26 C reproduces STEP 25C | EXECUTABLE (A from immutable STEP 20; C new STEP 26 run) |

delta = error(X) − error(Y) in km; negative = X lower error. Tie |delta| ≤ 1e-6 km. Paired median delta primary, paired mean secondary, wins/losses/ties.

## 7. Windows, drifters, observations (unchanged from TEST-02)

Calibration KE-1 (8), KE-2 (5), AG-1 (9), AG-2 (1); holdout KE-H1 (5), KE-H3 (7); total 35. KE-H2 excluded (immutable STEP 20 HYCOM baseline unavailable). AG holdout unavailable.
Release positions, times, drifter IDs, observation timestamps, regions: the STEP 25C protocol values. Observations: STEP 15 files (SHA 22c0ecff…), exact UTC, no interpolation.

## 8. Derived-data rules

HYCOM_DAILY (if ever executable): mean over the 8 frames of the UTC day for u and v separately; a node is valid only if valid in all 8 frames (else null, landMask true); record source normalized-file SHA, source frame timestamps, algorithm id `hycom-daily-8frame-mean/1`, derived-field SHA.
GLORYS_COARSE_DAILY: bilinear interpolation of each GLORYS daily field onto the HYCOM lon/lat nodes of the window (target axes SHA recorded per window: KE-1 15cfff26…, KE-2 3254be46…, AG-1 e47d224b…, AG-2 bb718e28…, KE-H1 077bbce0…, KE-H3 3f6b04ae…); a target node is valid only when all four GLORYS stencil nodes are wet in every frame (else null, landMask true); no nearest-neighbour substitution, no zero fill, no extrapolation, no smoothing, no temporal change; algorithm id `glorys-to-hycom-grid-bilinear/1`; record source normalized-file SHA, target-grid SHA, derived-field SHA, derivation-script SHA. A window is WINDOW_BLOCKED if any release point cannot be evaluated on the derived grid at t0.
Wind for every condition: the identical STEP 17 / STEP 20 B-3 normalized NCEP-DOE R2 files (SHA-locked in the STEP 25C protocol).

## 9. Model mechanics

dX/dt = U_ocean + 0.002·U_wind; RK4 300 s; output 900 s; 72 h; bilinear/linear; cos(phi) every stage; frozen runtime; STEP 18b status rules. Forbidden: extrapolation, smoothing, zero fill, land substitution, frame duplication, bias correction, nudging, assimilation, blending.

## 10. Metrics

Primary M3 (haversine R = 6371008.8 m) at exact t0+24/48/72 h: median (primary), mean, n, min, max, NOT_AVAILABLE count. Secondary M1 endpoint 72 h, M2 path length, M4 72 h separation between compared conditions, M5 observed 72 h displacement.
Strata: overall, calibration, holdout, per window (small-n descriptive). Sign test descriptive only for n ≥ 10.

## 11. Reporting language and policies

Allowed: "descriptive difference", "temporal sensitivity", "spatial representation sensitivity", "product difference". Forbidden: "selected", "best", "optimal", "superior", "validated", "proven", significance/generalization/operational claims.
No outlier removal, trimming, winsorization, weighting or case deletion; highest-error cases reported descriptively. No alpha search; alpha 0 only if a later phase explicitly registers a structural control.

## 12. Reproducibility

Each derived forcing: source SHA, derivation-script SHA, target-grid SHA, derived-field SHA. Each run: spec SHA, forcing SHA, runner SHA, result SHA, separate-process replay with matching result-array SHA. Condition C result arrays must equal the STEP 25C GLORYS alpha 0.002 arrays bitwise.

## 13. Phase A scope and lock

Phase A creates and locks only: this protocol, the rule file, the preregistration, the experiment matrix, the Phase A summary and the validator. No daily field is derived, nothing is regridded, no model runs, no metrics, no interpretation. Model run count 0; new data 0.
Phase B (not started) would execute: 6 GLORYS_NATIVE_DAILY runs, 6 GLORYS_COARSE_DAILY runs (alpha 0.002 only), Comparisons 2 and 4; Comparisons 1 and 3 remain BLOCKED until a separately preregistered HYCOM re-acquisition exists.
