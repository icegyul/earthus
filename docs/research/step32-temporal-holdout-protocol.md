# STEP 32 — Independent expanded validation and temporal forcing test (Phase A: preregistration / lock only)

Rule id: `expanded-holdout-and-temporal-forcing-step32`. Base commit: 671a91cf (STEP 31 locked; MODEL_SELECTION_NOT_READY). Machine-readable companions: `step32-holdout-rule.json` (derivation rule, exclusion lists, coverage metadata), `step32-holdout-derivation.json` (the derived expanded holdout, observations and calendar only), `step32-temporal-experiment-matrix.json` (conditions, windows, acquisition requirement, metrics, future validation design), `step32-summary.json`, `step32-preregistration.json`; tools `tools/research/derive_step32_holdout.py`, `tools/research/check_step32_preregistration.py`.

## 0. Scope

Phase A only. MODEL_RUN_COUNT 0, NEW_DATA 0, NEW_TRAJECTORIES 0. No HYCOM acquisition, no daily forcing, no trajectory, no M3, no model comparison, no candidate choice, no performance inspection. alpha 0.002, HYCOM depth 15.000 m, GLORYS depth 15.810070 m, Stokes coefficient 1.0 frozen. STEP 17-31 unchanged.

## 1. Ancestry and immutability

Required ancestors: 551668ef, d505cc5e, 5b9567e5, 5f27dc2d, 155995dd, 73fafffb, 9113e8b5, 869bc664, c395a098, ed746129, 7b0453b8, a7f62873, 4bb4342b, e0e7cfd2, db6cea2f, 2841f511, 929d3468, c974ce42, 86266b3a, a4474eb8, 3338c7e4, 79a0d69d, 4942421a, 289815d6, f0149153, 94d414b6, 813e1954, 671a91cf. STEP 16-31 locked files keep their SHA-256; runtime byte-identical to 155995dd. Any mismatch: STOP.

## 2. Frozen scientific status

CURRENT CANDIDATE: GLORYS12V1 15.810070 m + WW3 Stokes x 1.0 + NCEP-R2, alpha 0.002 — CANDIDATE_ONLY. FROZEN BASELINE: HYCOM GOFS 3.1 15.000 m 3-hourly + NCEP-R2, alpha 0.002 — FROZEN_REFERENCE_BASELINE. Neither is promoted to operational status; STEP 32 never selects a final model even if the candidate has lower error on the new holdout.

## 3. Questions

Primary: does the temporal representation of ocean forcing materially affect trajectory agreement? HYCOM_NATIVE_3H vs HYCOM_DAILY, everything else held constant. Second primary: can the candidate behaviour seen in STEP 29/30A be reproduced on an expanded holdout cohort not used in STEP 20 calibration, STEP 20 holdout or STEP 21-31?

## 4. Temporal experiment design

A HYCOM_NATIVE_3H: HYCOM GOFS 3.1 GLBv0.08 0.08 deg, 3-hourly instantaneous, 15 m. B HYCOM_DAILY: same source, grid and depth; daily mean of the eight frames 00, 03, 06, 09, 12, 15, 18, 21Z (u and v separately, unweighted, no temporal smoothing, no missing-frame reconstruction), labelled 00:00Z. Identical between A and B: wind, alpha, depth, spatial grid, release positions, release times, drifter IDs, computation area, observation handling, RK4, integration timestep, output timestep, interpolation rules, land mask, status rules. Only difference: ocean temporal representation. No Stokes. alpha 0.002, depth 15.000 m, NCEP-R2 wind. Stored per daily field: source file SHA, source frame timestamps, source u/v SHA, daily derived SHA, derivation script SHA.

Window requirement: every UTC day intersecting [t0 - 1 day, t0 + 72 h + 1 day] must contain all eight native frames (six UTC days, 48 frames for a 12Z release). One missing mandatory frame = WINDOW_BLOCKED; no interpolation, duplication, substitution or fill.

Metrics: M3 primary at 24/48/72 h (haversine R = 6371008.8 m, exact drifter_id + exact UTC timestamp), delta = E_HYCOM_DAILY - E_HYCOM_NATIVE_3H (km), tie 1e-6 km; M1/M2/M4/M5 secondary. Descriptive label (overall 72 h): NATIVE_3H_DESCRIPTIVELY_FAVORED / DAILY_DESCRIPTIVELY_FAVORED / NO_CLEAR_TEMPORAL_DIFFERENCE under the 2/3 consistency rule; no operational winner; no tuning from the expanded holdout.

## 5. Expanded holdout derivation (observations and calendar only)

Tool `derive_step32_holdout.py` (guarded open; forbidden: any forcing, trajectory, result, evaluation, table or summary file). Inputs: STEP 16 selection audit, cohort-step16.json, step20-holdout-derivation.json (prior IDs and windows only), STEP 15 raw observations, coastline, the locked rule. Rule: regions KE and AG; cutoff = last STEP 20 calibration window end + 30 days; candidates = STEP 16 audit eligible windows (E1-E5, A1-A3 verbatim, eligibleCount re-verified) with start >= cutoff and [start - 1 d, end + 1 d] inside HYCOM expt_53.X coverage (1994-01-01..2015-12-31); a candidate within 72 h of any prior STEP 20 calibration/holdout window start is skipped; a candidate whose required frames intersect the registered known-missing list (2010-08-18T12:00:00Z, STEP 20 KE-H2) is WINDOW_BLOCKED; chronological accumulation exactly as STEP 16/20 (new IDs exclude every prior cohort ID and already accumulated IDs; selected starts >= 72 h apart); stop at 8 windows (target) or exhaustion; HOLDOUT_MET requires >= 20 unique drifters and >= 6 windows; otherwise STEP32_HOLDOUT_INSUFFICIENT. No artificial balancing; no window chosen for expected outcome; no performance data of any kind.

Result (locked here, before any model result exists for these drifters): 8 windows, 32 unique drifters, KE only; AG_EXPANDED_HOLDOUT_UNAVAILABLE (no AG eligible window after 2015-05-29 within coverage; no replacement data). Derivation hash 32049a15d99e3efad6ca3131ce7f25f92917c964b1eed811ac9aac2490587830.

| window | t0 | end | new drifters | eligible at t0 | ocean box (t0 bbox +-2 deg, lat clipped) | required UTC days (frames) |
|---|---|---|---|---|---|---|
| KE-X1 | 2011-05-08T12:00:00Z | 2011-05-11T12:00:00Z | 8 | 9 | 28.014..40.000 N, 136.562..159.880 E | 2011-05-07..2011-05-12 (48 frames) |
| KE-X2 | 2011-05-13T12:00:00Z | 2011-05-16T12:00:00Z | 1 | 9 | 36.554..40.000 N, 157.993..161.993 E | 2011-05-12..2011-05-17 (48 frames) |
| KE-X3 | 2011-05-28T12:00:00Z | 2011-05-31T12:00:00Z | 1 | 8 | 28.019..32.019 N, 148.779..152.779 E | 2011-05-27..2011-06-01 (48 frames) |
| KE-X4 | 2011-06-10T12:00:00Z | 2011-06-13T12:00:00Z | 1 | 8 | 35.998..39.998 N, 141.881..145.881 E | 2011-06-09..2011-06-14 (48 frames) |
| KE-X5 | 2011-06-13T12:00:00Z | 2011-06-16T12:00:00Z | 11 | 19 | 32.717..40.000 N, 140.617..157.189 E | 2011-06-12..2011-06-17 (48 frames) |
| KE-X6 | 2011-06-16T12:00:00Z | 2011-06-19T12:00:00Z | 2 | 15 | 33.236..38.836 N, 140.151..150.389 E | 2011-06-15..2011-06-20 (48 frames) |
| KE-X7 | 2011-06-19T12:00:00Z | 2011-06-22T12:00:00Z | 7 | 23 | 34.477..40.000 N, 135.652..145.468 E | 2011-06-18..2011-06-23 (48 frames) |
| KE-X8 | 2011-06-22T12:00:00Z | 2011-06-25T12:00:00Z | 1 | 23 | 33.663..37.663 N, 143.498..147.498 E | 2011-06-21..2011-06-26 (48 frames) |

KE-H1 / KE-H2 / KE-H3 and the 23 calibration drifters remain historical; none of their IDs or windows enters the expanded holdout.

## 6. Future validation design (not executed here)

After the temporal-test source and the new holdout are frozen: CANDIDATE (GLORYS + Stokes) vs BASELINE (HYCOM) on the new holdout only; M3 24/48/72 h paired per drifter, delta = E_candidate - E_HYCOM, report median / mean / min / max / W/L/T / n / NA; strata CALIBRATION (existing 23) and NEW_HOLDOUT; old holdout not included; same locked label rule as STEP 30A; no parameter selection from the new holdout; no model selection in STEP 32. Additional data requirement (registered only): GLORYS12V1 daily 15.810070 m, WW3 GLOB-30M CFSR Stokes drift and NCEP-R2 for the new windows; no substitute product.

## 7. Acquisition requirement (registered only; nothing downloaded)

HYCOM GOFS 3.1 GLBv0.08 expt_53.X, NCSS `data/{year}`, water_u/water_v, vertCoord 15, horizStride 1, timeStride 1, box = window ocean box, time range = first..last required frame per window (48 frames each). Future quality gate: product identity, file integrity, coordinate identity, time axis, variable identity, spatial coverage, temporal coverage, missing frames, units, release stencil, reproducibility. Any missing mandatory frame blocks that window. No alternative HYCOM product.

## 8. Independence, outliers, replacement

Drifters sharing a window, forcing period and release time are clustered and are not independent samples; window and regional structure is reported next to pooled counts; no independence assumption. No outlier removal, trimming, winsorization, weighting or post-hoc exclusion. After the holdout is frozen a failing model run never justifies replacing a window; coverage failures follow the preregistered data-availability rule only.

## 9. Phase B order

1 acquire HYCOM source forcing for the temporal-test windows; 2 quality-gate source forcing; 3 build HYCOM daily fields; 4 run HYCOM_NATIVE_3H vs HYCOM_DAILY; 5 independently verify replay; 6 only after the temporal-test source and the new holdout are frozen, execute candidate-vs-baseline validation on the new holdout; 7 evaluate independently. No reverse order. A separate final model-selection decision follows STEP 32.
