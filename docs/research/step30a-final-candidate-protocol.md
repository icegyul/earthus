# STEP 30A — Final candidate vs frozen baseline benchmark (Phase A: preregistration only)

Rule id: `final-candidate-benchmark-step30a`. Base commit: f0149153 (STEP 29 Phase B complete). Machine-readable rules: `step30a-rule.json` (authoritative for the validators). Phase A creates and locks the protocol, rule, preregistration, Phase A summary and validators; no evaluation, no M1–M5, no model run.

## 0. Purpose

STEP 29 (TEST-06) found for GLORYS12V1 + alpha 0.002 + WW3 Stokes drift versus GLORYS12V1 + alpha 0.002: 72 h paired median delta −3.496 km, W/L 19/14, label NO_CLEAR_STOKES_DIFFERENCE under the locked rule; holdout 72 h median delta −3.832 km, W/L 8/4. STEP 30A benchmarks the already-computed GLORYS + Stokes candidate directly against the immutable STEP 25C HYCOM baseline. It re-evaluates existing trajectories only: no new forcing, no new run, no parameter search, alpha unchanged.

## 1. Ancestry and immutability

Required ancestors: 551668ef, d505cc5e, 5b9567e5, 5f27dc2d, 155995dd, 73fafffb, 9113e8b5, 869bc664, c395a098, ed746129, 7b0453b8, a7f62873, 4bb4342b, e0e7cfd2, db6cea2f, 2841f511, 929d3468, c974ce42, 86266b3a, a4474eb8, 3338c7e4, 79a0d69d, 4942421a, 289815d6, f0149153. STEP 17–29 locked outputs keep their SHA-256; the runtime stays byte-identical to 155995dd. Any mismatch: STOP.

## 2. Scientific question

Primary: does the already-computed GLORYS12V1 + Stokes drift candidate produce lower observed-versus-model trajectory error than the frozen HYCOM baseline? This is a final-candidate benchmark, not parameter optimization, tuning, forcing selection or alpha selection.

## 3. The two trajectory sources (only these enter the primary comparison)

| role | model | trajectories (SHA-locked) |
|---|---|---|
| CANDIDATE | GLORYS12V1 native 15.810070 m + WW3 GLOB-30M CFSR surface Stokes drift × 1.0 + NCEP-DOE R2 windage alpha 0.002 (dX/dt = U_GLORYS + U_Stokes + 0.002·U_wind) | STEP 29 treatment alpha 0.002 runs, six windows (`step29-stokes-manifest.json`, condition treatment, alpha 0.002); never re-run |
| BASELINE | HYCOM GOFS 3.1 GLBv0.08 15.000 m 3-hourly + NCEP-DOE R2 alpha 0.002 (dX/dt = U_HYCOM + 0.002·U_wind) | STEP 25C protocol `hycomBaseline["0.002"]` = STEP 20 SHA-locked trajectories; never re-run |

Frozen identities: alpha 0.002, Stokes coefficient 1.0, GLORYS depth 15.810070 m, HYCOM depth 15.000 m (the 0.810070 m depth difference and the product-cadence difference are part of the product identity, as in STEP 25C/26).

## 4. Windows, pairing, availability

Calibration KE-1 (8), KE-2 (5), AG-1 (9), AG-2 (1); holdout KE-H1 (5), KE-H3 (7); 35 drifters. KE-H2 excluded (frozen HYCOM baseline unavailable); AG holdout unavailable; no window added. Pairing by exact drifter_id and exact UTC timestamp t0+24/48/72 h against the STEP 15 observations (SHA 22c0ecff…); no interpolation, no nearest-timestamp matching, no resampling. A drifter enters a horizon only when candidate and baseline are both valid there and the observation exists; n and NOT_AVAILABLE are reported; nothing is imputed. Availability is inherited (candidate from STEP 29, baseline from STEP 25C/20); no domain change, no rerun, no repair.

## 5. Metrics

Primary M3 (haversine R = 6371008.8 m): delta_final = E_candidate − E_HYCOM per paired drifter; tie |delta| ≤ 1e-6 km; paired median delta primary, paired mean secondary; wins (candidate lower) / losses / ties; per horizon: candidate and baseline median, mean, min, max; n, NOT_AVAILABLE. Secondary M1 (72 h endpoint displacement), M2 (path length), M4 (candidate–HYCOM trajectory separation at 24/48/72 h), M5 (observed 72 h displacement). Strata: overall, calibration, holdout, per window (small-n descriptive; AG-2 kept). Top-3 candidate errors per horizon with the corresponding HYCOM errors. No outlier removal, trimming, winsorization, weighting or manual exclusion. Descriptive sign test (n ≥ 10) nominal only.

## 6. Interpretation rule (locked; overall stratum, 72 h)

A CANDIDATE_DESCRIPTIVELY_FAVORED if median delta < −tie AND wins/(wins+losses) ≥ 2/3; B HYCOM_DESCRIPTIVELY_FAVORED if median delta > +tie AND losses/(wins+losses) ≥ 2/3; C NO_CLEAR_DESCRIPTIVE_DIFFERENCE otherwise. Same rule as STEP 25C/29; no new threshold; no operational-superiority claim; holdout never used for selection (the candidate is already fixed; no re-ranking).

## 7. Mandatory context (frozen values; no recomputation)

Three-way side-by-side per stratum and horizon from the frozen tables: A HYCOM (STEP 25C `error_H002`), B GLORYS (STEP 25C `error_G002`), C GLORYS + Stokes (STEP 29 `error_T002`), plus the two comparisons that must not be confused: STEP 29 (C vs B) and STEP 30A (C vs A). A candidate can improve on GLORYS and still be worse than HYCOM; both are stated. No causal claim.

## 8. Fairness

Same observations, drifter IDs, timestamps, windows, horizons, metric and evaluation code for both sources; the only difference is the model identity (HYCOM baseline vs GLORYS + Stokes candidate). Forbidden in this step: changing alpha, Stokes coefficient, depth, forcing, timestep, interpolation; adding physics; blending HYCOM and GLORYS; ensemble optimization; any trajectory generation (MODEL_RUN_COUNT must remain 0; a generated trajectory = STEP30A_MODEL_RUN_GATE_VIOLATION).

## 9. Reproducibility and outputs

Evaluation is deterministic: run twice, paired table / summary / evaluation JSON byte-identical; input trajectory SHAs unchanged. Phase B outputs: `step30a-final-candidate-manifest.json`, `-evaluation.json`, `-summary.json` (Phase B summary is written as `step30a-final-candidate-summary.json`; the Phase A `step30a-summary.json` stays locked), `-table.csv`, validator `tools/research/check_step30a_final_candidate.py`. STEP 25C and STEP 29 outputs are not overwritten.

## 10. Phase A scope

Locked here: this protocol, `step30a-rule.json`, `step30a-preregistration.json`, `step30a-summary.json`, `tools/research/check_step30a_preregistration.py`. Evaluation NOT RUN; M1–M5 not computed; model run count 0; new data 0.
