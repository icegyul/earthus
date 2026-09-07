# STEP 50 — VALIDATION EXTENSION ENDPOINT AGGREGATION AND PREREGISTERED BOOTSTRAP

**H_EXT = NOT_SUPPORTED**

This is the first and only evaluation of the extension hypothesis. It consumed the frozen STEP 49
execution alone: no trajectory was re-run, no observation, forcing or source was read, and nothing was
re-executed after seeing a result.

Protocol: `docs/research/step50-validation-extension-endpoint-protocol.json`.
Results: `docs/research/step50-validation-extension-results.json`.
Validator: `tools/research/check_step50_validation_extension.py`.

---

## 1. Cohort and inputs, unchanged

6 registered windows, 25 registered drifters, derivation hash `9e03db68d506358e…`. Cohort modified NO,
reselected NO. Inputs are the STEP 49 execution manifest and endpoint raw material at their frozen
hashes, plus the frozen STEP 30A rule.

## 2. Endpoint

delta_i(h) = E_C,i(h) − E_A,i(h), where E is the haversine error between the modelled and observed
position at exactly t0+h, R = 6 371 008.8 m, in km. Delta_w(h) is the median over a window's valid
paired drifter deltas. **Theta_extension(h) is the median over windows with at least one valid pair,
with equal window weighting.** A window with more drifters carries no extra weight, and the pooled
drifter median is descriptive only, never the primary endpoint. Nothing was imputed.

## 3. Window results (Delta_w, km; valid pairs in brackets)

| window | registered | 24 h | 48 h | 72 h | status |
|---|---|---|---|---|---|
| KE-X1 | 10 | +3.667 (10) | +3.521 (10) | **−2.272** (10) | VALID |
| KE-X2 | 2 | −12.6515 (2) | +16.758 (1) | **+10.246** (1) | VALID |
| KE-X3 | 1 | NOT_AVAILABLE (0) | NOT_AVAILABLE (0) | NOT_AVAILABLE (0) | **NOT_AVAILABLE** |
| KE-X4 | 1 | −11.815 (1) | −5.320 (1) | **−2.985** (1) | VALID |
| BM-X5 | 9 | +2.962 (9) | +2.734 (9) | **+1.338** (9) | VALID |
| BM-X6 | 2 | −25.1625 (2) | −26.1455 (2) | **−9.597** (2) | VALID |

Valid windows: **5**. NOT_AVAILABLE windows: **1**.

## 4. Theta_extension

| horizon | Theta_extension | valid windows |
|---|---|---|
| 24 h | −11.815 km | 5 |
| 48 h | +2.734 km | 5 |
| 72 h | **−2.272 km** | 5 |

## 5. Preregistered window-level bootstrap

Sampling unit window; sampling frame **all 6 registered windows including the NOT_AVAILABLE one**;
B = 10000; seed 20260946; `numpy.random.default_rng(20260946)` with `rng.integers(0, 6, size=6)` per
replicate, drawn with replacement; a window drawn k times contributes k times; NOT_AVAILABLE replicates
counted and never redrawn; no drifter-level resampling in the primary; interval by
`numpy.quantile(..., [0.025, 0.975], method="linear")`.

| horizon | Theta | 95 % interval | available | NOT_AVAILABLE |
|---|---|---|---|---|
| 24 h | −11.815 km | [−25.1625, +3.667] km | 10000 | 0 |
| 48 h | +2.734 km | [−26.1455, +16.758] km | 10000 | 0 |
| 72 h | **−2.272 km** | **[−9.597, +10.246] km** | 10000 | 0 |

Every 72-hour interval includes zero.

## 6. H_EXT decision

The preregistered rule requires all three of: the candidate descriptively favoured, the window-level
upper bound below zero, and the gate satisfied.

| condition | outcome |
|---|---|
| Descriptive favour (STEP 46 preregistered, frozen STEP 30A rule on the pooled 72 h pairs) | **NOT met** — pooled median +1.338 km, 11 wins against 12 losses, win share 0.478 below the required two thirds; label NO_CLEAR_EXTENSION_DIFFERENCE |
| Q0.975(72 h) < 0 km | **NOT met** — upper bound +10.246 km |
| Gate ≥ 4 valid windows | met — 5 valid windows |

**H_EXT = NOT_SUPPORTED.**

### A divergence between two stated criteria, reported not resolved

The STEP 46 preregistration defines descriptive favour by the frozen STEP 30A rule, while the STEP 50
directive states it as Theta_extension(72 h) < 0. These disagree here: the preregistered rule says the
candidate is **not** favoured, the directive's simpler test says it **is**, since Theta is −2.272 km.

Both were computed and are recorded side by side; neither was merged into the other. The
preregistration governs. **The divergence does not change the outcome**: the interval condition fails
under either reading, so H_EXT is NOT_SUPPORTED both ways.

## 7. Secondary and sensitivity

The 24-hour and 48-hour horizons are secondary and did not affect the decision, which uses the 72-hour
endpoint alone.

Sensitivity only, preregistered, never used for H_EXT and never replacing the primary interval:
drifter-level bootstrap of the pooled median, B = 10000, separate `numpy.random.default_rng(20260946)`.

| horizon | pooled median | 95 % interval | n |
|---|---|---|---|
| 24 h | +3.043 km | [−7.018, +7.584] km | 24 |
| 48 h | −0.971 km | [−8.7916, +16.758] km | 23 |
| 72 h | +1.338 km | [−12.4279, +21.205] km | 23 |

## 8. Missingness

| window | drifter | missing side at 72 h | frozen reason |
|---|---|---|---|
| KE-X2 | 37042 | A | A: OUT_OF_DOMAIN (C completed) |
| KE-X3 | 40083 | A and C | A: OUT_OF_DOMAIN; C: OUT_OF_DOMAIN |

KE-X3 holds one registered drifter, so its loss makes the whole window NOT_AVAILABLE under the frozen
rule. Imputation 0, substitution 0, manual exclusion 0, windows added or removed 0.

## 9. Reproducibility

The aggregation and the whole bootstrap were re-executed in separate processes three times. All
replicate records and every scientific field are byte-identical; the only differences are the output
path label and the creation timestamp. **REPRODUCIBILITY: PASS. BYTE_IDENTICAL: YES.**

## 10. Interpretation, kept separate from the primary

**PRIMARY:** H1 SUPPORTED. Theta −31.331 km, 95 % interval [−72.0725, −11.7435] km. Not recomputed,
not modified.

**EXTENSION:** H_EXT NOT_SUPPORTED on the extension cohort.

The two are never pooled. There is no combined cohort, no combined bootstrap, no meta-analysis and no
overall global claim. The primary nine-window cohort and the extension six-window cohort are not summed.
Nothing from the original STEP 44 validation attempt is pooled with extension performance either, since
that attempt produced no performance evaluation at all before it was blocked.

This is a **geographically independent validation extension** relative to the primary cohort: its
drifter identities and windows do not overlap the primary, and its geographic domain is separate. It
shares its calendar period with the original blocked validation design, so no temporal independence
from that attempt is claimed.

Candidate status remains **CANDIDATE_ONLY**. Operational promotion NO, production deployment NO, global
superiority NO, causal claim NO, universal claim NO. The candidate is not a production model.

Read plainly: on this cohort the candidate's advantage seen in the primary experiment did not
reproduce. The observed 72-hour effect is small, −2.272 km against −31.331 km in the primary, and its
interval spans zero.

END OF STEP 50 REPORT
