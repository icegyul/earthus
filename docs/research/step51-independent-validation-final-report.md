# STEP 51 — INDEPENDENT VALIDATION FINAL REPORT

**Interpretation lock only.** No experiment, statistic or recomputation was performed in this step.
Every value below is read from the frozen records of STEP 36 through STEP 50.

---

## 1. The two results, kept apart

| | PRIMARY EXPERIMENT | VALIDATION EXTENSION |
|---|---|---|
| comparison | C vs A | C vs A |
| horizon | 72 h | 72 h |
| Theta | **-31.331 km** | **-2.272 km** |
| 95 % interval | **[-72.0725, -11.7435] km** | **[-9.597, +10.246] km** |
| hypothesis | H1 | H_EXT |
| status | **SUPPORTED** | **NOT_SUPPORTED** |
| cohort | 9 windows | 6 windows / 25 drifters |
| valid windows | 6 / 9 | 5 / 6 (1 NOT_AVAILABLE) |
| gate | — | PASS |

The primary interval lies entirely below zero. The extension interval includes zero.

## 2. What this means

In the preregistered primary experiment the primary criterion was met, so H1 is SUPPORTED. In the
geographically independent validation extension the preregistered replication criterion was not met,
so H_EXT is NOT_SUPPORTED. Primary evidence exists; replication evidence is insufficient.

**The primary preregistered experiment supported H1, with the candidate showing a lower 72-hour
endpoint error than the frozen baseline. However, the geographically independent validation extension
did not satisfy the preregistered replication criterion because its 95% bootstrap interval included
zero. The observed primary effect therefore should not be interpreted as established general
superiority, and additional independent validation would be required before any operational
promotion.**

1차 실험에서는 사전등록된 기준에 따라 H1이 지지되었다. 그러나 지리적으로 독립된 검증 확장에서는
사전등록된 재현 기준을 충족하지 못했다. 따라서 현재의 1차 결과는 일반적 우월성이 확립된 것으로
해석하기보다, 해당 사전등록 코호트와 실험 영역에서 관찰된 증거로 취급해야 한다.

## 3. Why the extension did not meet the criterion

Only the arithmetic is stated. Theta_extension at 72 hours is -2.272 km with a 95 % interval of
[-9.597, +10.246] km. The upper bound is +10.246 km, which is at or above zero, so the preregistered
interval condition fails and H_EXT is NOT_SUPPORTED.

**No cause is attributed.** These experiments cannot discriminate between a region effect, a seasonal
effect, a source problem in any of the four products, a parameter problem or a drifter-quality
problem, and none of these is asserted.

## 4. Extension results by horizon

| horizon | Theta | 95 % interval |
|---|---|---|
| 24 h | -11.815 km | [-25.1625, +3.667] km |
| 48 h | +2.734 km | [-26.1455, +16.758] km |
| 72 h | -2.272 km | [-9.597, +10.246] km |

The 24 h and 48 h figures are secondary. The decision used the preregistered 72-hour criterion alone.

## 5. Execution and reproducibility

The extension ran 18 of 18 run units, all completed and all replay-matched, with B = 10000 and seed
20260946, 10000 available replicates and 0 NOT_AVAILABLE at every horizon. Reproducibility passed at
both the execution and the endpoint stage, with scientific fields byte-identical across separate
processes.

## 6. Independence, stated precisely

This is a **geographically independent validation extension**. Its basis: no drifter identity overlaps
the primary cohort, no primary window start is reused, its geographic domain is separate, and it was
preregistered before the cohort was locked, the sources frozen, the execution run and the endpoint
evaluated.

It is **not** described as fully independent in every dimension, and no temporal independence from the
original validation attempt is claimed, because that attempt and this extension share the same
validation period.

## 7. The original validation attempt stays blocked

The earlier validation attempt failed its cohort gate at 14 unique drifters and never reached
execution: no trajectory, no endpoint, no bootstrap, no performance evaluation of any kind. It remains
**BLOCKED**, preserved unchanged. A blocked attempt is not a negative result, is never reported as
NOT_SUPPORTED, and is never pooled with extension results.

## 8. Status of the candidate

**CANDIDATE_ONLY.** Primary SUPPORTED and extension NOT_SUPPORTED together are insufficient evidence
for operational promotion. Operational promotion NO. Production claim NO. The candidate is not
promoted, not production, not operational and not deployed.

## 9. Limitations

1. Primary cohort size is 9 windows.
2. Primary valid windows are 6.
3. The extension has 6 registered windows.
4. The extension has 5 valid windows.
5. The extension satisfied its gate at the disclosed structural ceiling of 6 selectable windows.
6. The extension 95 % interval includes zero.
7. The extension is geographically independent but shares its validation period with the original
   validation attempt.
8. These results alone cannot support a claim of universal or general superiority.
9. Candidate C is not an operational model.

## 10. Separation guarantees

The primary and extension results were not pooled. There is no combined cohort, no combined bootstrap,
no meta-analysis and no overall global claim. Neither result was recomputed in this step. The primary
nine-window cohort and the extension six-window cohort are never summed.

## 11. Next research status

Candidate C remains CANDIDATE_ONLY. Any further work requires a new preregistration and must not
modify these results. Possible directions include additional geographic validation, additional
temporal validation, a larger cohort, or alternative forcing validation. **No new research is started
in this step.**

END OF STEP 51 FINAL REPORT
