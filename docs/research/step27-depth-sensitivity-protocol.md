# STEP 27 — Depth sensitivity / vertical representativeness (Phase A: preregistration only)

Rule id: `depth-sensitivity-step27`. Base commit: a4474eb8 (STEP 26 Phase B complete). Machine-readable rules: `docs/research/step27-depth-rule.json` (authoritative for the validator).

## 0. Purpose

STEP 26 showed that spatial representation within GLORYS changes M3 by ~0.2 km median at 72 h while the HYCOM–GLORYS trajectory separation is ~51 km median, so product / physical representation differences dominate. The STEP 25C HYCOM–GLORYS comparison carries a depth difference (HYCOM 15.000 m, GLORYS 15.810070 m). STEP 27 diagnoses the depth element separately, within one product, all else held constant. STEP 17–26 results, STEP 20 alpha = 0.002, STEP 25C and STEP 26 are not modified. No alpha search. No new download in Phase A.

## 1. Ancestry and immutability

Required ancestors: 551668ef, d505cc5e, 5b9567e5, 5f27dc2d, 155995dd, 73fafffb, 9113e8b5, 869bc664, c395a098, ed746129, 7b0453b8, a7f62873, 4bb4342b, e0e7cfd2, db6cea2f, 2841f511, 929d3468, c974ce42, 86266b3a, a4474eb8. STEP 17–26 locked artifacts keep their SHA-256; the research runtime stays byte-identical to 155995dd. Any mismatch: STOP.

## 2. Frozen parameters

alpha = 0.002 (only alpha in STEP 27; no alpha 0); wind NCEP-DOE R2 10 m 6-hourly (STEP 17 / STEP 20 B-3 normalized files, SHA-locked); RK4, 300 s integration, 900 s output, 72 h; bilinear spatial, linear temporal, cos(phi) at every RK4 stage; frozen runtime; STEP 18b status rules. No smoothing, extrapolation, zero-fill, land substitution, frame duplication, gap filling, blending, bias correction, nudging, assimilation.

## 3. Scientific question

Primary: does ocean velocity depth materially affect drifter trajectory agreement when all other conditions are held constant? Secondary: is the 15 m choice adequately representative? No prior direction (shallower or deeper is not assumed better).

## 4. Product and depth candidate set (fixed before execution)

Product: GLORYS12V1, GLOBAL_MULTIYEAR_PHY_001_030 / cmems_mod_glo_phy_my_0.083deg_P1D-m, variables uo/vo, daily mean, 1/12°, same daily frames (t0−1 d … end+1 d), same horizontal subset boxes as STEP 25B.
Four conditions, each the single native GLORYS level nearest the target, taken exactly as stored (no vertical interpolation, no averaging, no depth search):

| id | target | expected native level (to be read from file metadata at acquisition) | role |
|---|---|---|---|
| D05 | 5 m | ≈ 5.078 m | alternative |
| D10 | 10 m | ≈ 9.573 m | alternative |
| D15 | 15 m | 15.810070 m (STEP 25B/25C level, exact) | control / reference (fixed now) |
| D20 | 20 m | ≈ 21.599 m | alternative |

The set is closed: no depth is added, removed, combined, weighted or interpolated after results. The reference is D15 and is not changed after results.

## 5. Data availability fact (recorded at lock; not a result)

STEP 25B acquired every window with `-z 15.81 -Z 15.81`; each raw file has a depth dimension of length 1 containing only 15.810070 m (verified for all seven files at lock). D05, D10 and D20 are therefore **not present in the already acquired data**. Per the STEP 27 instruction (§4) and the Phase A no-download rule, they are not invented, not interpolated and not downloaded here:

**STEP27_DATA_BLOCKED** — conditions D05, D10, D20 unavailable for all six windows; only D15 exists (and equals the STEP 25C Condition C forcing).

Unblocking requires a separately preregistered, authorized STEP 25B-style acquisition of the three missing native levels (same product, boxes, frames, quality gates G1–G11 per level, credentials never read/printed/stored). Phase B of STEP 27 cannot start before that record exists and passes.

## 6. Windows, drifters, observations (unchanged)

Calibration KE-1 (8), KE-2 (5), AG-1 (9), AG-2 (1); holdout KE-H1 (5), KE-H3 (7); 35 drifters. KE-H2 excluded (immutable STEP 20 HYCOM baseline unavailable); AG holdout unavailable. Release positions/times, drifter IDs, computation areas, wind files: STEP 25C protocol values. Observations: STEP 15 files (SHA 22c0ecff…), exact UTC, no interpolation.

## 7. Run matrix

4 depth conditions × 6 windows = 24 distinct model runs, alpha 0.002 only, fixed order (D05, D10, D15, D20; windows KE-1, KE-2, AG-1, AG-2, KE-H1, KE-H3). D15 runs must reproduce the STEP 25C / STEP 26 Condition C result arrays bitwise (reproduction gate). Each run replayed in a separate process; result-array SHA must match.

## 8. Metrics and comparisons

Primary M3 (haversine R = 6371008.8 m) at exact t0+24/48/72 h; median primary, mean secondary; n, min, max, NOT_AVAILABLE reported. Pairwise: D05 vs D15, D10 vs D15, D20 vs D15 with delta_depth = E_depth − E_D15 (negative = alternative depth lower error), tie |delta| ≤ 1e-6 km, paired median/mean delta, wins/losses/ties. Secondary M1, M2, M4 (depth-dependent trajectory separation D05/D10/D20 vs D15 at 24/48/72 h), M5. Strata: overall, calibration, holdout (descriptive only; never used to choose), per window (small-n, AG-2 kept visible).

## 9. Mask / validity

Identical GLORYS mask rules at every depth (masked in any frame → landMask, null). If a release stencil or required cell is invalid at a depth: DEPTH_SPECIFIC_FORCING_UNAVAILABLE for that drifter at that depth; no substitution, no fill, no nearest neighbour. Availability differences between depths are reported, never repaired.

## 10. Fairness and integrity

The only intentional difference between conditions is the native ocean velocity depth. Verified per condition before execution: same product/dataset id, same daily frames and time axis, same horizontal grid, same wind files, same alpha, same numerics, same observations, same computation area; exact source file SHA, exact native depth metadata, uo/vo present, depth dimension length 1 per file.

## 11. Policies

No depth optimization: sensitivity only; no winner for operational deployment; no re-ranking after holdout. No outlier removal, trimming, winsorization, weighting or manual exclusion. Descriptive paired analysis; no independence assumption; no independent-sample tests; no new significance threshold; sign test nominal only (n ≥ 10), never a selection criterion. Reproducibility: depth, source forcing SHA, configuration SHA, runner SHA, reader SHA, result SHA, replay SHA recorded per run; evaluator re-run byte-identical.

## 12. Phase A scope and lock

Phase A creates and locks only: this protocol, the depth rule file, the preregistration, the experiment matrix, the Phase A summary and the validator. No download, no depth field construction, no model run, no M3, no statistics. Model run count 0; new data 0. Phase B is not started and is DATA_BLOCKED at lock.
