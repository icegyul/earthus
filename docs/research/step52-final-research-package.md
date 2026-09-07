# STEP 52 — FINAL RESEARCH PACKAGE

**STATUS: FINAL_RESEARCH_AUDIT_PASS**

Audit and packaging only. No trajectory, bootstrap, hypothesis test, sensitivity analysis, source
acquisition, cohort selection or parameter tuning was performed, and nothing was recomputed in search
of a different answer. Every locked artefact of STEP 36 through STEP 51 is unchanged.

Audit manifest: `docs/research/step52-final-audit-manifest.json`.
Evidence matrix: `docs/research/step52-final-evidence-matrix.json`.
Hash inventory: `docs/research/step52-hash-inventory.json`.
Validator: `tools/research/check_step52_final_research_package.py`.

---

## 1. Final evidence matrix

| | PRIMARY | VALIDATION EXTENSION | ORIGINAL VALIDATION |
|---|---|---|---|
| hypothesis | H1 | H_EXT | — |
| comparison | C vs A | C vs A | — |
| horizon | 72 h | 72 h | — |
| Theta | **-31.331 km** | **-2.272 km** | — |
| 95 % interval | **[-72.0725, -11.7435] km** | **[-9.597, +10.246] km** | — |
| valid windows | 6 / 9 | 5 / 6 | — |
| gate | — | PASS | **not achievable** |
| result | **SUPPORTED** | **NOT_SUPPORTED** | **BLOCKED** |

The original validation attempt reached 14 unique drifters against a required 20, and 4 selected
windows against a required 6. It never executed: no trajectory, no endpoint, no bootstrap, no
hypothesis result. It stays BLOCKED, is not reinterpreted as NOT_SUPPORTED, and is not pooled with the
extension.

## 2. Primary scientific result, frozen

H1 SUPPORTED. Candidate C against baseline A (HYCOM_NATIVE_3H) on the 72-hour exact-timestamp paired
endpoint. Theta = -31.331 km with a 95 % bootstrap interval of [-72.0725, -11.7435] km, entirely below
zero, over 6 valid windows of 9. Candidate status CANDIDATE_ONLY; operational promotion NO; production
claim NO.

Primary bootstrap: window unit, 9 registered windows, 9 draws per replicate, B = 10000,
`numpy.random.default_rng(20260907)`, `rng.integers(0,9,size=9)` with replacement, NOT_AVAILABLE
replicates never redrawn, `numpy.quantile` with method linear at q = [0.025, 0.975], 9999 available and
1 NOT_AVAILABLE.

## 3. Model and source definitions

| condition | definition |
|---|---|
| A | HYCOM_NATIVE_3H — HYCOM GOFS 3.1 GLBv0.08 expt_53.X, water_u / water_v, 15.000 m, 3-hourly |
| B | HYCOM_DAILY — same HYCOM source family, daily temporal representation built by the frozen procedure |
| C | GLORYS12V1 at native 15.810070 m + WW3 GLOB-30M CFSR uss with Stokes multiplier 1.0 + NCEP-DOE Reanalysis 2 10 m u/v |

Candidate windage alpha 0.002; RK4 with a 300 s step; 900 s output; horizons 24 / 48 / 72 h. These
match the STEP 37–40 records and the STEP 48 freeze.

## 4. Temporal representation result, preserved as descriptive

B − A at 72 h: Theta = +9.440 km, pooled descriptive +0.808 km, classification
**NO_CLEAR_TEMPORAL_DIFFERENCE**. This is descriptive only and is not extended into a new hypothesis.

## 5. Validation extension, frozen

Cohort of 6 windows and 25 unique drifters, derivation hash
`9e03db68d506358e1217db25f50ade8aa314b406063fd8c309cbe6a3092e5e45`, unmodified: KE-X1 2011-08-16T12Z,
KE-X2 2011-09-22T12Z, KE-X3 2011-09-26T12Z, KE-X4 2011-11-06T12Z, BM-X5 2013-12-19T12Z,
BM-X6 2014-01-06T12Z.

Execution: 18 planned, 18 completed, 18 replay-matched; A 6/6, B 6/6, C 6/6. Valid windows 5 of 6,
1 NOT_AVAILABLE, gate ≥ 4 PASS, with no manual removal or addition.

Result: **H_EXT NOT_SUPPORTED.** Theta = -2.272 km, 95 % interval [-9.597, +10.246] km. The upper bound
is at or above zero, so the preregistered replication criterion is not satisfied.

Extension bootstrap: B = 10000, seed 20260946, `numpy.random.default_rng`, sampling frame all 6
registered windows, 6 draws with replacement, no NA redraw, 10000 available and 0 NOT_AVAILABLE.

| horizon | Theta | 95 % interval |
|---|---|---|
| 24 h | -11.815 km | [-25.1625, +3.667] km |
| 48 h | +2.734 km | [-26.1455, +16.758] km |
| 72 h | -2.272 km | [-9.597, +10.246] km |

## 6. Independence

The primary and the extension are geographically separated. The extension has no overlap with the
primary drifter identities, none with the excluded identities and none with the primary window starts,
and it was preregistered before any extension data were accessed.

However, the extension period overlaps the temporal period of the original blocked validation attempt.
It is therefore described as a **geographically independent validation extension**, or a
geographically separated validation extension with preregistered cohort, source and execution controls.
It is not claimed to be fully independent in every dimension.

## 7. Final scientific interpretation

1. Primary H1 was supported.
2. The primary observed effect was Theta at 72 h of -31.331 km, with a 95 % interval entirely below zero.
3. The geographically independent extension did not satisfy the preregistered replication criterion.
4. The extension gave Theta at 72 h of -2.272 km, with a 95 % interval that includes zero.
5. The primary effect therefore cannot currently be treated as established general superiority across
   geographic domains.
6. C remains **CANDIDATE_ONLY**.
7. Operational promotion: **NO**.
8. Production claim: **NO**.
9. Additional independent validation would be required before operational use.

## 8. Audit integrity

| check | result |
|---|---|
| A. No locked research file changed | PASS |
| B. Primary result unchanged | PASS |
| C. Extension result unchanged | PASS |
| D. STEP 36–51 ancestry intact | PASS |
| E. Declared SHA-256 values still valid | PASS |
| F. Source identity unchanged | PASS |
| G. Cohort identity unchanged | PASS |
| H. Model configuration unchanged | PASS |
| I. Bootstrap configuration unchanged | PASS |
| J. No unauthorized data source accessed after lock | PASS |
| K. No result-driven analysis in the recorded workflow | PASS |
| L. No operational promotion occurred | PASS |
| M. No primary/extension pooling occurred | PASS |
| N. Blocked original validation remains BLOCKED | PASS |

## 9. Open items, recorded not acted on

Two items remain outside what this step is permitted to change, and both are recorded rather than
fixed:

1. The STEP 47 cohort-lock artefacts are present on disk and hash-recorded, but are not committed in
   this repository state, so the chain cannot be reproduced from the repository alone without them.
2. `data/research/step48`, `step49` and `step50` are neither tracked nor ignored, so a broad staging
   command in any session could add large scientific data.

No file was staged or modified to address either.

## 10. Language bound by this package

Forbidden: universally superior · globally superior · validated model · production ready ·
operationally proven · causally proven · C is false · C is disproven · the primary result was wrong.

Allowed: supported in the preregistered primary experiment · not reproduced under the preregistered
validation-extension criterion · geographically independent validation extension · evidence remains
insufficient for operational promotion · candidate-only.

END OF STEP 52 FINAL RESEARCH PACKAGE
