# STEP 31 — Final model evidence synthesis and next-experiment gate (Phase A: preregistration / lock only)

Rule id: `model-evidence-synthesis-step31`. Base commit: 813e1954 (STEP 30A Phase B complete). Machine-readable companions: `step31-evidence-matrix.json` (evidence chain, component decision matrix, three-way final evidence), `step31-decision-gate.json` (model-selection gate, locked conclusions, unresolved variables, next-experiment priority, STEP 32 candidate), `step31-summary.json`, `step31-preregistration.json`; validator `tools/research/check_step31_synthesis.py`.

## 0. Scope

Synthesis only. MODEL_RUN_COUNT 0, NEW_DATA 0, NEW_TRAJECTORIES 0; alpha, depth, Stokes coefficient and forcing unchanged; no result of STEP 17-30A modified or recomputed; no model selected; nothing executed. Every cited value is read from a SHA-locked source file listed in `step31-evidence-matrix.json` (`sources`).

## 1. Ancestry and immutability

Required ancestors: 551668ef, d505cc5e, 5b9567e5, 5f27dc2d, 155995dd, 73fafffb, 7b0453b8, a7f62873, 4bb4342b, e0e7cfd2, db6cea2f, 2841f511, 929d3468, c974ce42, 86266b3a, a4474eb8, 3338c7e4, 79a0d69d, 4942421a, 289815d6, f0149153, 94d414b6, d30607c8, 471e8af9, 813e1954. All STEP 17-30A locked files keep their SHA-256; the runtime stays byte-identical to 155995dd. Any mismatch: STOP.

## 2. Evidence chain (frozen)

| step | finding | label | strength |
|---|---|---|---|
| STEP20 | alpha = 0.002 selected on the calibration set under the locked selection rule (72 h M3 median 59.055 km vs 61.314 km for alpha 0); holdout alpha 0.002 vs alpha 0 at 72 h: median delta -0.017 km, W/L 6/6 | NOT_ESTABLISHED_AS_SUPERIOR | DIRECTLY_SUPPORTED |
| STEP21 | diagnostic indications (calibration, alpha 0.002): error grows with horizon (24/48/72 h medians 25.126/39.026/59.055 km), bearing difference medians 23.898/33.371 deg at 24/48 h, regional/event dependence in the per-unit tables; windage does not resolve the error pattern (STEP 20 holdout alpha effect near zero) | DIAGNOSTIC_INDICATIONS_RECORDED | SUPPORTED_INDICATION |
| STEP22 | requirement register: higher-resolution ocean forcing (DATA-01, P1), surface-current reference (DATA-03, P1), wave/Stokes (DATA-06, P1), multi-depth (DATA-04, P2), higher-frequency ocean forcing (DATA-02, P2); no acquisition performed | REQUIREMENTS_REGISTERED | SUPPORTED_INDICATION |
| STEP25C | GLORYS12V1 (15.810070 m, daily) vs HYCOM (15.000 m, 3 h), alpha 0.002: 72 h median delta 2.167 km, W/L 14/19; label NO CLEAR DESCRIPTIVE DIFFERENCE | NO_CLEAR_DESCRIPTIVE_DIFFERENCE | DIRECTLY_SUPPORTED |
| STEP26 | Comparison 2 GLORYS native 1/12 deg vs GLORYS bilinear on the HYCOM 0.08 deg grid: 72 h median delta 0.198 km (NO_CLEAR_SPATIAL_REPRESENTATION_DIFFERENCE); Comparison 1 HYCOM_NATIVE_3H vs HYCOM_DAILY BLOCKED (native 3 h source frames incomplete for the complete registered windows); Comparison 3 BLOCKED (depends on HYCOM_DAILY) | NO_CLEAR_SPATIAL_REPRESENTATION_DIFFERENCE | DIRECTLY_SUPPORTED |
| STEP27 | GLORYS native depths 5.078224 / 9.572997 / 15.810070 / 18.495560 m: 72 h median delta vs 15.810070 m: D05 -0.339, D10 -0.086, D20 0.133 km; label NO_CLEAR_DEPTH_SENSITIVITY (holdout DEPTH_SENSITIVITY_OBSERVED, descriptive; no depth selected) | NO_CLEAR_DEPTH_SENSITIVITY | DIRECTLY_SUPPORTED |
| STEP28 | HYCOM vs GLORYS field disagreement: per-window median vector difference 0.245-0.260 m/s (median of windows 0.252), median absolute direction difference 32.3-39.9 deg; GLORYS descriptively closer to the AVISO surface-geostrophic reference field in 4/4 windows (Q2/Q3); both products exceed the AVISO geostrophic speed (Q6 MIXED); AVISO is a reference field only | AVISO_REFERENCE_ONLY | DIRECTLY_SUPPORTED |
| STEP29 | GLORYS + WW3 Stokes (x 1.0) vs GLORYS, alpha 0.002: 72 h median delta -3.496 km, W/L 19/14; label NO_CLEAR_STOKES_DIFFERENCE; holdout -3.832 km, W/L 8/4 (STOKES_DESCRIPTIVELY_FAVORED, descriptive) | NO_CLEAR_STOKES_DIFFERENCE | DIRECTLY_SUPPORTED |
| STEP30A | GLORYS + Stokes vs HYCOM, alpha 0.002: 72 h median delta -4.244 km, W/L 19/14 (consistency 0.5758 < 2/3); label NO_CLEAR_DESCRIPTIVE_DIFFERENCE; holdout 0.881 km, W/L 6/6 | NO_CLEAR_DESCRIPTIVE_DIFFERENCE | DIRECTLY_SUPPORTED |

## 3. Component decision matrix

| component | evidence | result | status | recommendation |
|---|---|---|---|---|
| alpha windage | STEP 20 calibration selection; STEP 20 holdout alpha 0.002 vs 0 (72 h median delta -0.017 km, W/L 6/6); STEP 21 windage diagnostics | calibration-selected; holdout effect near zero | NOT_ESTABLISHED_AS_SUPERIOR | keep alpha = 0.002 frozen; no re-tuning |
| ocean spatial resolution | STEP 26 Comparison 2 (72 h median delta 0.198 km) | NO_CLEAR_SPATIAL_REPRESENTATION_DIFFERENCE | NO_CLEAR_EFFECT | no further spatial-representation test at this scale |
| ocean depth | STEP 27 four native GLORYS levels (72 h median deltas -0.339 / -0.086 / 0.133 km) | NO_CLEAR_DEPTH_SENSITIVITY | NO_CLEAR_EFFECT | keep 15.810070 m frozen; multi-depth question moves to mixed-layer / vertical-shear test (Priority 3) |
| ocean product identity | STEP 25C (72 h 2.167 km, 14/19); STEP 28 field disagreement 0.24-0.27 m/s, 32-40 deg; STEP 30A (72 h -4.244 km, 19/14) | no clear descriptive difference in either direction | GLORYS NO_CLEAR_SUPERIORITY_OVER_HYCOM; HYCOM NOT_ESTABLISHED_AS_UNIVERSALLY_SUPERIOR | no product selection; both retained (candidate / frozen reference) |
| Stokes drift | STEP 29 (72 h -3.496 km, 19/14; holdout -3.832 km, 8/4) | NO_CLEAR_STOKES_DIFFERENCE; holdout descriptively favored (n 12) | NO_CLEAR_SUPERIORITY | coefficient 1.0 frozen; reproduction on an independent expanded holdout required (Priority 2) |
| ocean temporal resolution | STEP 26 Comparison 1 (HYCOM_NATIVE_3H vs HYCOM_DAILY) BLOCKED and Comparison 3 BLOCKED; STEP 25C/26 product contrasts confound cadence with product and depth | not experimentally resolved | UNTESTED_HIGH_PRIORITY | Priority 1 TEST-TEMPORAL: acquire complete HYCOM 3-hourly source coverage for the registered windows, then HYCOM_NATIVE_3H vs HYCOM_DAILY |
| surface-current structure | STEP 28: GLORYS closer to AVISO geostrophic reference in 4/4 windows; both products exceed AVISO geostrophic speed (Q6 MIXED); AVISO reference field only | reference-field agreement differs; total transport component unresolved | UNRESOLVED_PHYSICAL_COMPONENT | Priority 4: surface / non-geostrophic component investigation |
| coastal/bathymetric | STEP 22 L6 INSUFFICIENT_EVIDENCE; no test | no evidence either way | UNTESTED | Priority 5, only if future evidence indicates relevance |
| mixed-layer / vertical shear | STEP 27 depth sweep within 5-18.5 m only; STEP 22 L3/L8; no mixed-layer data | small within-range depth effect; vertical representativeness untested | UNRESOLVED_PHYSICAL_COMPONENT | Priority 3: fixed multi-depth / mixed-layer data without post-hoc depth selection |
| wave-current coupling | only linear Stokes addition (STEP 29); no coupled wave-current physics tested | not tested | UNTESTED | no test registered; depends on Priority 1-2 outcomes |

## 4. Locked conclusions

- ALPHA: NOT_ESTABLISHED_AS_SUPERIOR (DIRECTLY_SUPPORTED)
- SPATIAL_RESOLUTION: NO_CLEAR_EFFECT (DIRECTLY_SUPPORTED)
- DEPTH: NO_CLEAR_EFFECT (DIRECTLY_SUPPORTED)
- STOKES: NO_CLEAR_SUPERIORITY (SUPPORTED_INDICATION)
- GLORYS: NO_CLEAR_SUPERIORITY_OVER_HYCOM (DIRECTLY_SUPPORTED)
- HYCOM: NOT_ESTABLISHED_AS_UNIVERSALLY_SUPERIOR (DIRECTLY_SUPPORTED)
- AVISO: REFERENCE_ONLY (DIRECTLY_SUPPORTED)
- TEMPORAL_OCEAN_FORCING: UNTESTED_HIGH_PRIORITY (PLAUSIBLE_BUT_UNTESTED)
- SURFACE_MIXED_LAYER_NON_GEOSTROPHIC_TRANSPORT: UNRESOLVED_PHYSICAL_COMPONENT (SUPPORTED_INDICATION)

## 5. Unresolved variables

TEMPORAL OCEAN FORCING RESOLUTION — UNTESTED_HIGH_PRIORITY. STEP 26 Comparison 1 (HYCOM_NATIVE_3H vs HYCOM_DAILY) was registered but BLOCKED because the HYCOM native 3 h acquisition did not span the complete required daily windows; Comparison 3 also stayed BLOCKED. 3 h vs daily HYCOM was therefore not experimentally resolved. Temporal forcing is not claimed to be the explanation of the error.

SURFACE / MIXED-LAYER / NON-GEOSTROPHIC TRANSPORT — UNRESOLVED_PHYSICAL_COMPONENT. STEP 28 shows both HYCOM and GLORYS exceed the AVISO geostrophic speed substantially. This does not establish which product is wrong; AVISO represents a different physical component than the total drifter transport. AVISO is a reference field only.

## 6. Model selection gate

Q1 GLORYS+Stokes final operational model: NO. Q2 HYCOM final operational model: NO (not an established winner). Q3 re-tune alpha: NO. Q4 reselect depth: NO. Q5 tune Stokes coefficient: NO. Q6 another confirmatory experiment justified: YES, if the research goal is a defensible final model selection.

Final research gate: MODEL_SELECTION_NOT_READY (option B; option A requires one candidate with preregistered, consistent independent holdout superiority under the locked rule, which no candidate has).

## 7. Final model status

CURRENT_RESEARCH_MODEL: GLORYS12V1 + WW3 Stokes (x 1.0) + NCEP-R2, alpha 0.002, depth 15.810070 m — CANDIDATE_ONLY, NOT_OPERATIONALLY_VALIDATED. CANDIDATE_ONLY does not mean selected. Retained: HYCOM GOFS 3.1, alpha 0.002 — FROZEN_REFERENCE_BASELINE. FROZEN_REFERENCE does not mean established as superior.

## 8. Three-way final evidence (frozen STEP 25C / STEP 29 / STEP 30A values)

| horizon | n | HYCOM median M3 | GLORYS median M3 | GLORYS+Stokes median M3 | GLORYS−HYCOM (25C) | Stokes−GLORYS (29) | Stokes−HYCOM (30A) |
|---|---|---|---|---|---|---|---|
| 24h | 35 | 17.762 | 19.701 | 21.655 | 1.366 km, 15/20 | -0.869 km, 21/14 | 0.037 km, 17/18 |
| 48h | 34 | 33.601 | 39.54 | 35.659 | 4.915 km, 15/19 | 0.909 km, 15/19 | 2.749 km, 13/21 |
| 72h | 33 | 48.81 | 51.988 | 44.652 | 2.167 km, 14/19 | -3.496 km, 19/14 | -4.244 km, 19/14 |

Holdout 72 h (12 KE drifters): GLORYS−HYCOM 2.955 km (5/7); Stokes−GLORYS -3.832 km (8/4); Stokes−HYCOM 0.881 km (6/6). Median deltas are paired medians and do not add across comparisons.

## 9. Next-experiment priority (registered only; nothing executed)

1. TEMPORAL_FORCING (TEST-TEMPORAL): HYCOM_NATIVE_3H vs HYCOM_DAILY on the registered windows. Requirement: acquire enough HYCOM 3-hourly source forcing to construct complete daily fields for every registered window. Basis: STEP 26 Comparison 1 registered but BLOCKED by incomplete source coverage; no performance data may be inferred from the missing comparison.
2. EXPANDED_INDEPENDENT_HOLDOUT (EXPANDED_HOLDOUT): test whether the STEP 29/30A holdout pattern reproduces outside the current 12-drifter KE holdout. Requirement: new independently derived holdout cohort with sufficient drifter count and window diversity; no current holdout reused as new. Basis: STEP 29 holdout 8/4 and STEP 30A holdout 6/6 rest on 12 KE drifters.
3. MIXED_LAYER_VERTICAL_SHEAR (MIXED-LAYER): vertical representativeness without post-hoc depth selection. Requirement: fixed multi-depth velocity data (registered before use). Basis: STEP 27 covers 5-18.5 m only; STEP 22 L3/L8.
4. SURFACE_NON_GEOSTROPHIC (SURFACE-NONGEO): surface-current components not represented by AVISO geostrophic velocity. Requirement: reference data for non-geostrophic surface transport. Basis: STEP 28 Q6 MIXED; both products exceed AVISO geostrophic speed.
5. COASTAL_BATHYMETRIC (COASTAL): coastal / bathymetric interaction. Requirement: only if future evidence indicates relevance. Basis: STEP 22 L6 INSUFFICIENT_EVIDENCE.

Ordering follows evidence gaps, not a search for a favorable result. No performance data may be inferred from a blocked comparison.

## 10. STEP 32 candidate

STEP 32: INDEPENDENT EXPANDED VALIDATION / TEMPORAL FORCING TEST — phase name and rationale registered only. Exact model runs are not designed here; a separate STEP 32 Phase A will define the precise data and cohort requirements.

## 11. Evidence strength vocabulary

DIRECTLY_SUPPORTED, SUPPORTED_INDICATION, PLAUSIBLE_BUT_UNTESTED, INSUFFICIENT_EVIDENCE. Descriptive wording only; no statistical significance, generalization, causal or operational claim.
