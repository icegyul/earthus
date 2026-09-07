# STEP 56 — FINAL SCIENTIFIC STATUS AND RESEARCH STOP-POINT LOCK

**STATUS: FINAL_SCIENTIFIC_STOP_POINT**

This step performs no new scientific analysis. It records the evidence state reached by STEP 36–55 and
closes the current research chain. No cohort, forcing, bootstrap, endpoint or performance claim was
added, and nothing earlier was modified.

---

## 1. The research chain, in order

The chain ran with each step committed before the next one read it: the cohort was locked, the
experiment preregistered, the sources acquired and frozen, the trajectories executed and evaluated, the
primary bootstrap run, the execution records locked, the results reported, and an independent
reproducibility check confirmed those results could be rebuilt from the frozen records alone.

An independent validation was then preregistered. It blocked twice, first because the per-window
drifter identities the locked rule needed were absent from every authorised metadata artefact, and then,
after a pre-execution amendment authorised a limited read of the frozen observation dataset, because the
rule exhausted its candidates at 4 windows and 14 drifters against a required 6 and 20. No performance
was ever computed on that line.

A separately labelled geographic extension was preregistered over the complete non-primary region set,
its cohort locked at 6 windows and 25 drifters, its sources frozen, its 18 run units executed and
replay-matched, and its endpoint and bootstrap evaluated once. The replication criterion was not met.

A further new validation was preregistered in the East Australian Current, an unused domain. Its
observations were acquired and frozen, but the cohort reached only 5 windows and 12 unique drifters
against a required 20, so it blocked before any model ran.

## 2. Primary experiment

| item | value |
|---|---|
| status | **SUPPORTED** |
| hypothesis | H1, candidate C against baseline A |
| endpoint | 72-hour exact-timestamp paired delta |
| Theta | **-31.331 km** |
| 95 % interval | **[-72.0725, -11.7435] km** |
| valid windows | **6 / 9** |
| bootstrap | B = 10000, seed 20260907, 9999 available, 1 not available |

The preregistered primary hypothesis was supported. This alone does not establish global or operational
superiority for candidate C.

## 3. Geographic extension

| item | value |
|---|---|
| status | **NOT_SUPPORTED** |
| Theta | **-2.272 km** |
| 95 % interval | **[-9.597, +10.246] km** |
| valid windows | **5 / 6** |
| bootstrap | B = 10000, seed 20260946 |

The geographically independent extension did not satisfy the preregistered replication criterion,
because its interval includes zero. The primary finding is therefore treated as cohort- and
domain-specific evidence.

## 4. EAC validation

| item | value |
|---|---|
| domain | 40° S – 25° S, 150° E – 160° E |
| period | 2010-01-01T12:00:00Z – 2015-12-31T12:00:00Z |
| candidate starts scanned | 2191 |
| target windows | 6 |
| registered windows | 5 |
| minimum valid windows | 4 |
| target unique drifters | ≥ 20 |
| actual unique drifters | **12** |
| window gate | PASS |
| unique-drifter gate | **FAIL** |
| status | **VALIDATION_BLOCKED** |
| block reason | UNIQUE_DRIFTER_GATE_FAILED |

No performance computation was carried out in the EAC. There is no error, difference, interval or
ranking for that domain. The outcome is therefore **neither positive nor negative evidence** about
candidate C; the validation simply failed to meet its preregistered cohort requirement.

## 5. Overall

| item | value |
|---|---|
| replication | **NOT_ESTABLISHED** |
| candidate C | **CANDIDATE_ONLY** |
| operational promotion | **NO** |
| production | **NO** |

## 6. Interpretation lock

1. The primary experiment supported H1.
2. The geographic extension did not confirm independent replication in the same direction.
3. The EAC validation was blocked for an unmet unique-drifter minimum and produced no performance result.
4. Overall replication is therefore NOT_ESTABLISHED.
5. Candidate C remains CANDIDATE_ONLY.
6. C is not promoted to an operational ocean-current model or a production forecasting engine.
7. These results are not described as universally superior or globally validated.
8. The EAC block is not interpreted as a failure of C.
9. The EAC block is not interpreted as a success of C.
10. Primary, extension and EAC data are never pooled.

## 7. Research stop-point

**RESEARCH STOP-POINT = LOCKED.**

The preregistered chain is auditable as it stands, and no further analysis is added to it on the current
evidence. After this step the existing validation chain does not receive a new cohort, a new region, new
forcing, new parameter tuning, a new bootstrap, a new endpoint, a new retrospective analysis, or any
post-hoc cohort selection fitted to results.

Any future independent validation starts as a **new study identifier, a new preregistration, a new
cohort definition, a new data freeze and a new execution**. It does not proceed by modifying or
extending the results of STEP 36–56.

## 8. Product decision

Ocean intelligence work remains in active development, but candidate C is CANDIDATE_ONLY and is **not**
auto-selected as a production ocean forecasting source. The primary result is retained as research
evidence for that work.

Scientific evidence and product implementation are kept distinct: **a scientific result is not a
production model approval.**

## 9. Final scientific decision

Primary evidence remains supported. Independent replication is not established. The EAC validation
remains blocked due to insufficient unique drifters. Candidate C remains candidate-only. There is no
operational or production promotion. The current research chain is officially closed at STEP 56.

END OF STEP 56
