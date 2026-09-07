# STEP 49 — VALIDATION EXTENSION EXECUTION

**STATUS: VALIDATION_EXTENSION_EXECUTION_PASS**

The locked STEP 47 cohort was executed on the frozen STEP 48 sources. All 18 run units completed and
replay-matched. The endpoint raw material was produced. **No bootstrap, no hypothesis test, no
decision.**

Protocol: `docs/research/step49-validation-extension-execution-protocol.json`.
Execution manifest: `docs/research/step49-validation-extension-execution-manifest.json`.
Validator: `tools/research/check_step49_validation_extension.py`.
Outputs: `data/research/step49/` (never staged).

---

## 1. Inputs, unchanged

| Input | Identity |
|---|---|
| Cohort (STEP 47) | 6 windows / 25 unique drifters, derivation hash `9e03db68d506358e…`, reselected NO, modified NO |
| Sources (STEP 48) | commit `00516cd1…`, acquisition `e8b5caca…`, freeze `8d50c2ae…` |
| Runtime | **155995dd**, one model source SHA across all runs, no random seed, deterministic |
| Parameters | alpha 0.002 · Stokes 1.0 · A/B depth 15.000 m · C depth 15.810070 m · RK4 300 s · output 900 s · 72 h · horizons 24/48/72 h |

Forcing preparation used the frozen derivations: condition B daily fields derived for all 6 windows
with the land mask identical to condition A, and the condition C composite built for all 6 windows
with every wave quality gate PASS. The STEP 49 tools are derived from the frozen STEP 39 tools by
identity and path patches only, algorithm unchanged, which is the same precedent by which the STEP 39
tools were derived from STEP 32. Bridge views translate the locked cohort and frozen sources into the
schema those tools expect; they re-acquire nothing and select nothing.

## 2. Run units

18 planned, **18 completed**, **18 replay-matched** (6 windows × A/B/C, each verified by a separate
process re-running the same construction from on-disk inputs).

| condition | windows | outcome |
|---|---|---|
| A HYCOM_NATIVE_3H | 6 | all COMPLETED |
| B HYCOM_DAILY | 6 | all COMPLETED |
| C GLORYS + Stokes candidate | 6 | all COMPLETED |

## 3. Availability by horizon (25 registered drifters)

| horizon | A valid | B valid | C valid | C-A paired |
|---|---|---|---|---|
| 24 h | 24 | 25 | 24 | 24 |
| 48 h | 23 | 24 | 24 | 23 |
| 72 h | 23 | 23 | 24 | 23 |

Worth stating plainly: at 72 hours the candidate has **more** valid positions than the baseline
(24 against 23). Unlike the primary experiment, there is no candidate-only availability loss here.

## 4. Per-window detail

| window | drifters | 24 h A/B/C/paired | 48 h A/B/C/paired | 72 h A/B/C/paired | valid at 72 h |
|---|---|---|---|---|---|
| KE-X1 | 10 | 10/10/10/10 | 10/10/10/10 | 10/10/10/10 | yes |
| KE-X2 | 2 | 2/2/2/2 | 1/1/2/1 | 1/1/2/1 | yes |
| KE-X3 | 1 | 0/1/0/0 | 0/1/0/0 | 0/0/0/0 | **no** |
| KE-X4 | 1 | 1/1/1/1 | 1/1/1/1 | 1/1/1/1 | yes |
| BM-X5 | 9 | 9/9/9/9 | 9/9/9/9 | 9/9/9/9 | yes |
| BM-X6 | 2 | 2/2/2/2 | 2/2/2/2 | 2/2/2/2 | yes |

## 5. Missingness (recorded, never repaired)

Two drifter pairs are NOT_AVAILABLE at 72 hours, and both are **baseline-side** losses:

| window | drifter | missing side | frozen reason |
|---|---|---|---|
| KE-X2 | 37042 | A | A: OUT_OF_DOMAIN (C completed) |
| KE-X3 | 40083 | A and C | A: OUT_OF_DOMAIN; C: OUT_OF_DOMAIN |

KE-X3 holds a single registered drifter, so its loss removes the whole window from the primary
endpoint. No value was imputed, substituted, removed or manually repaired: imputation 0,
substitution 0, manual exclusion 0.

## 6. Endpoint raw material

For each drifter and horizon the table carries E_A, E_B, E_C, delta_CA and delta_BA, with the frozen
definition E_X,i(h) = haversine(model position at exactly t0+h, observed position at exactly t0+h),
R = 6 371 008.8 m, in km, paired on exact drifter identity and exact UTC timestamp.

25 rows. Table `data/research/step49/step49-endpoint-raw.csv`.

**Deliberately not computed in this step:** Theta_extension, any descriptive label, any bootstrap, any
interval, any hypothesis decision.

## 7. Execution gate

Valid window definition (frozen STEP 46): a registered window with at least one valid C-A pair at 72
hours.

**Valid windows: 5** — KE-X1, KE-X2, KE-X4, BM-X5, BM-X6. Required: at least 4.
**Gate result: PASS.** No window was added or removed to satisfy it.

## 8. Reproducibility

Per-run separate-process replay matched for all 18 runs. The entire experiment was then executed again
into an independent directory: every scientific field is identical for all 18 runs, and each result
file is identical once creation-timestamp keys are stripped. The only differing field is the hash of
the result file itself, which covers those timestamps. The endpoint table was recomputed three times
and is byte-identical. **Scientific outputs byte-identical: YES; differences are metadata timestamps
only.**

## 9. What did not happen

No bootstrap, hypothesis test, H_EXT evaluation, VALIDATION_EXTENSION_SUPPORTED or
_NOT_SUPPORTED declaration, operational promotion, candidate promotion, parameter tuning, source
selection, window selection, drifter selection, manual exclusion or result-driven rerun.

**H_EXT: NOT EVALUATED.** Bootstrap: NOT RUN. Hypothesis test: NOT RUN. Operational promotion: NOT RUN.

**PRIMARY_RESULT_MODIFIED = FALSE.** The primary experiment stands at Theta -31.331 km, 95 % interval
[-72.0725, -11.7435] km, H1 SUPPORTED, candidate CANDIDATE_ONLY, operational promotion NO. The
original STEP 44 validation remains VALIDATION_COHORT_BLOCKED. This extension remains a separate
experiment.

## 10. Note on preparation defects corrected before the passing run

Two defects in the new STEP 49 bridge and evaluator were found and fixed, both in tooling rather than
in data or rules. The bridge initially omitted the wave-file status field, which blocked the candidate
forcing gate; and the endpoint evaluator first labelled an invalid pair with the candidate's terminal
status even when the baseline was the missing side, and could not write outside the repository during
replay. No source, threshold, cohort, parameter or rule was changed, and the corrected runs reused the
same frozen bytes.

END OF STEP 49 REPORT
