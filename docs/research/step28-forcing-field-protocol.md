# STEP 28 — Ocean forcing field agreement / AVISO reference diagnostic (Phase A: preregistration only)

Rule id: `forcing-field-agreement-step28`. Base commit: 3338c7e4 (STEP 27 Phase B complete). Machine-readable rules: `docs/research/step28-preregistration.json` (section `rules`, authoritative for the validator). Phase A creates and locks the protocol, preregistration, experiment matrix and validator only; no field calculation, figure, download or model run.

## 0. Purpose and status of AVISO

STEP 25C–27 showed: GLORYS native-vs-coarse trajectory difference small (≈0.2 km median at 72 h); GLORYS depth 5.08–18.50 m difference small (≈0.1–0.6 km); windage alpha = 0.002 ≈ 3 km separation; HYCOM-vs-GLORYS trajectory separation ≈ 51 km median. STEP 28 diagnoses how the HYCOM and GLORYS velocity fields themselves differ, using the already acquired AVISO absolute geostrophic surface current (STEP 23 DATA-03, `erdTAgeo1day`) as an independent **REFERENCE FIELD**.

AVISO is a surface geostrophic current: not a full surface current, not a 15 m current, not a drifter velocity, not Lagrangian transport, **not ground truth**. It is never added to HYCOM or GLORYS, never used to tune alpha, depth, weights or blending, never treated as an observation of drifters. Every AVISO comparison is labelled REFERENCE FIELD DIAGNOSTIC. STEP 28 is a forcing-field diagnostic, not a model performance test; MODEL_RUN = FORBIDDEN; M1–M5 are not computed.

## 1. Ancestry and immutability

Required ancestors: 551668ef, d505cc5e, 5b9567e5, 5f27dc2d, 155995dd, 73fafffb, 9113e8b5, 869bc664, c395a098, ed746129, 7b0453b8, a7f62873, 4bb4342b, e0e7cfd2, db6cea2f, 2841f511, 929d3468, c974ce42, 86266b3a, a4474eb8, 2a5c8f9a, d5fb2a62, d242165d, b9078805, 0c2b3cb7, 3338c7e4. STEP 17–27 locked artifacts (list in the preregistration) keep their SHA-256; the runtime stays byte-identical to 155995dd. Any mismatch: STOP.

## 2. Frozen fields (existing data only; no download)

| field | identity | grid | cadence | depth | source files (SHA-locked) |
|---|---|---|---|---|---|
| HYCOM | GOFS 3.1 GLBv0.08 expt_53.X | 0.08° | 3-hourly instantaneous | 15.000 m | STEP 17 / STEP 20 B-3 normalized JSON datasets |
| GLORYS | GLORYS12V1 GLOBAL_MULTIYEAR_PHY_001_030 / cmems_mod_glo_phy_my_0.083deg_P1D-m | 1/12° | daily mean (00:00Z label) | 15.810070 m primary; 5.078224 / 9.572997 / 18.495560 m sensitivity only | STEP 25C normalized (D15) and STEP 27 r3 normalized, cropped to the D15 node set (D05/D10/D20) |
| AVISO | erdTAgeo1day (ERDDAP), absolute geostrophic surface current, variables u_current / v_current, m s-1, 0.25°, longitude 0–360 | 0.25° | weekly-sampled daily product, frames at 12:00Z | surface geostrophic | STEP 23 DATA-03 files (5 windows) |

No vertical interpolation, no depth change, no new AVISO/HYCOM/GLORYS/wind/observation download; erdTAssh1day is not used; no geostrophic velocity is derived from SSH.

## 3. Exact common timestamp rule (no temporal interpolation)

An AVISO frame is used only at its exact stored timestamp T. Registered per window from the STEP 23 files (all at 12:00:00Z): KE-1 2010-05-12; KE-2 2010-06-30; KE-H1 2010-08-11; KE-H2 2010-08-18; KE-H3 2010-11-17 (each the single AVISO frame inside [t0, t0+72 h]). AG-1 and AG-2 lie outside the acquired AVISO period: NO_EXACT_AVISO_TIME.

Matching of the other fields at T (preregistered convention, stated because the three products carry different time semantics):
- HYCOM: the instantaneous frame at exactly T must exist in the locked normalized dataset (3-hourly frames include 12:00Z). Missing frame → HYCOM comparisons at T are BLOCKED for that window (no substitution). Known: KE-H2 2010-08-18T12Z is the frame recorded missing in STEP 20; comparisons A and B are BLOCKED for KE-H2 and only C (GLORYS vs AVISO) is evaluated there.
- GLORYS: the daily-mean frame of the UTC day containing T (stored label T − 12 h). This is a same-UTC-day match of a daily mean to the 12:00Z reference time, not an interpolation between frames; it is disclosed as a product-cadence difference (instantaneous vs daily mean) that is part of the product identity, exactly as in STEP 25A/25C.
- No interpolation across AVISO source frames; no additional timestamps are manufactured.

## 4. Common spatial domain and sampling

Comparison nodes = AVISO 0.25° nodes (longitude converted from 0–360 to −180–180 for reference only; no shift of values) that lie inside the window's STEP 25A ocean box **and** inside the HYCOM and GLORYS grid extents (no extrapolation). At each node HYCOM and GLORYS are sampled by bilinear interpolation of their native fields at the frame defined in §3, valid only if all four stencil nodes are wet/non-null (HYCOM: non-null at that frame; GLORYS: landMask false, i.e. valid in every frame); AVISO valid only if the node value is not masked. A node enters a paired comparison only when every field of that comparison is valid there. Comparison A (HYCOM vs GLORYS) is evaluated on the same AVISO node set (primary) and additionally on the HYCOM native 0.08° nodes with GLORYS sampled bilinearly (STEP 26 Condition D method; secondary, finer). No zero fill, land substitution, nearest-neighbour replacement or smoothing.

## 5. Comparisons and metrics (per window, per timestamp, common valid cells only)

A. HYCOM vs GLORYS · B. HYCOM vs AVISO · C. GLORYS vs AVISO (model = first, reference = second).
Per cell: Δu = u_model − u_ref, Δv = v_model − v_ref, vector difference |Δ| = √(Δu² + Δv²); speeds |V| = √(u² + v²); relative speed difference (|V_model| − |V_ref|)/|V_ref| only where |V_ref| ≠ 0 exactly (else NOT_AVAILABLE; no epsilon); signed direction difference = wrapped bearing(model) − bearing(ref) in (−180°, 180°] where bearing = atan2(u, v) in degrees clockwise from north, defined only when both speeds ≠ 0 exactly; absolute direction difference = |signed| ∈ [0°, 180°]; positive signed = model rotated clockwise from reference (convention documented; never called a "bias").
Per comparison: median/mean speed of both fields; median/mean/min/max vector difference; median/mean relative speed difference; median/mean/min/max absolute direction difference; fractions clockwise / counter-clockwise (ties at exactly 0° counted separately); Pearson correlation of u and of v across common cells (NOT_AVAILABLE if a field has zero variance); RMS vector difference; spatial median absolute difference of u and of v; percentiles (10, 25, 50, 75, 90) of |Δ|. Descriptive field-structure diagnostics; no significance claims.

## 6. Depth diagnostic (no depth selection)

Comparison C repeated for GLORYS D05 (5.078224 m), D10 (9.572997 m), D15 (15.810070 m), D20 (18.495560 m) on the same common cells (fields from the STEP 27 r3 normalized files, identical grid). Reported as "change of agreement with the surface-geostrophic reference across native depth"; no ranking, no preferred depth.

## 7. Relation to frozen trajectory results (context only; no M3 recomputation)

For each eligible window the STEP 25C paired table's per-window median 72 h GLORYS-vs-HYCOM trajectory separation (column `GH_sep72h_alpha0.002`) is listed next to the window's median field vector difference of comparison A. Descriptive association only (a listing and its rank order); no regression, no predictive model, no causal inference.

## 8. Eligibility, strata, structure

Eligible field windows: KE-1 (field-level, independent of the STEP 23 trajectory-stencil PARTIAL), KE-2, KE-H1, KE-H2 (C only), KE-H3, subject to ≥ 1 common valid cell; AG-1/AG-2 NO_EXACT_AVISO_TIME. Labels kept: CALIBRATION KE-1, KE-2 (AG-1, AG-2 not evaluable); HOLDOUT KE-H1, KE-H3; KE-H2 = field-reference coverage window (STEP 20 pairing unchanged). Every window reported separately (window, timestamp, valid-cell count, HYCOM/GLORYS/AVISO speeds, A/B/C vector differences, direction differences); pooled values, if any, are labelled and never replace per-window values. Holdout is not used to choose a forcing.

## 9. Figures (Phase B, diagnostic only, if feasible)

Per window and timestamp: 1 HYCOM speed, 2 GLORYS speed, 3 AVISO speed, 4 |HYCOM−GLORYS|, 5 |HYCOM−AVISO|, 6 |GLORYS−AVISO|, 7 HYCOM–GLORYS signed direction difference; rendered deterministically (SVG, fixed colour scales shared across the three speed panels and across the three difference panels; no normalization that exaggerates differences); each carries dataset, timestamp, window, resolution, depth and valid-cell count. Stored under `docs/research/step28-figures/`.

## 10. Evidence classification, language, questions

Each statement in Phase B is tagged DIRECTLY_SUPPORTED / SUPPORTED_INDICATION / PLAUSIBLE_BUT_UNTESTED / INSUFFICIENT_EVIDENCE; the terms listed under `forbiddenLanguage` in the preregistration (causal, proof, truth-claim and product-verdict wording) are not used. Allowed phrasing: "X showed greater similarity to the AVISO geostrophic surface-current reference under the tested field metric" or "no clear field-level difference". Questions Q1–Q6 (field disagreement vs trajectory separation; which product looks more AVISO-like; magnitude vs direction vs pattern; consistency across KE windows; effect of GLORYS depth on AVISO agreement; plausibility of associating trajectory product difference with field difference) are answered descriptively only.

## 11. Frozen parameters and prohibitions

alpha = 0.002, depths, windage, forcing weights and blending coefficients are not modified; no optimization; no new data; MODEL_RUN = FORBIDDEN (trajectory runs 0; M1–M5 not computed); no parameter search.

## 12. Phase A scope

Locked here: this protocol, `step28-preregistration.json`, `step28-experiment-matrix.json`, `tools/research/check_step28_forcing_field.py`. Phase B (separate instruction) would create the field-comparison manifest, evaluation, summary, table and figures.
