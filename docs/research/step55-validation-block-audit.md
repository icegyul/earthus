# STEP 55 — VALIDATION BLOCK AUDIT AND SCIENTIFIC STATUS LOCK

**STATUS: VALIDATION_BLOCK_LOCKED**

Audit and status lock only. No source acquisition, trajectory, endpoint, bootstrap, model comparison,
new cohort, cohort expansion, parameter tuning, hypothesis test or performance analysis was performed.
All 24 audit checks pass.

---

## 1. The single fact this step seals

The EAC validation was blocked before model-performance evaluation because the preregistered minimum unique-drifter requirement was not met (12 observed versus >=20 required). Therefore, no inference about candidate C's performance in the EAC domain can be made.

EAC 검증은 사전등록된 최소 고유 드리프터 수 조건(요구 >=20명, 실제 12명)을 충족하지 못해 모델 성능 평가 전에 차단되었다. 따라서 EAC 영역에서 후보 C의 성능에 대해서는 어떠한 추론도 할 수 없다.

## 2. Frozen facts audited

| item | value |
|---|---|
| region | EAC, 40° S – 25° S, 150° E – 160° E |
| period | 2010-01-01T12:00:00Z – 2015-12-31T12:00:00Z |
| candidate window starts scanned | 2191 (the whole preregistered period) |
| target windows | 6 |
| registered windows | **5** |
| minimum valid windows | 4 |
| target unique drifters | ≥ 20 |
| actual unique drifters | **12** |

| window | start | eligible | selected |
|---|---|---|---|
| EAC-V1 | 2015-06-22 | 8 | 8 |
| EAC-V2 | 2015-06-27 | 9 | 1 |
| EAC-V3 | 2015-06-30 | 8 | 1 |
| EAC-V4 | 2015-07-05 | 9 | 1 |
| EAC-V5 | 2015-07-13 | 8 | 1 |

Overlap with prior studies: primary identities none, extension identities none, primary window starts
none, extension window starts none.

## 3. Which gate failed

| gate | requirement | observed | result |
|---|---|---|---|
| window gate | ≥ 4 valid windows | 5 | **PASS** |
| unique-drifter gate | ≥ 20 unique drifters | 12 | **FAIL** |

The window minimum was met. The unique-drifter minimum was not. A single failed minimum blocks the
study, so the overall status is **VALIDATION_BLOCKED**.

## 4. What this status is not

The EAC outcome is **not** NOT_SUPPORTED, **not** a failure of the candidate, **not** evidence that C is
worse or better, and **not** a null result. No error, difference, interval or ranking exists for this
domain because nothing was run.

Statements such as "C failed in the EAC", "C was not validated in the EAC", "the EAC result was
negative", or "validation failed in three regions" are prohibited, because no EAC performance result
exists.

## 5. Source status

Observations: **ACQUIRED and FROZEN.** 25 quarterly files, aggregate SHA-256 `68d2227c7e3ba668…`,
re-verified in this audit against the STEP 54 manifest.

Model forcing: **NOT_ACQUIRED**, because the cohort gate failed before forcing acquisition. The four
frozen identities are preserved unchanged: HYCOM GOFS 3.1 GLBv0.08 expt_53.X at 15.000 m 3-hourly;
GLORYS12V1 at native 15.810070 m; WW3 GLOB-30M CFSR uss with Stokes multiplier 1.0; NCEP-DOE R2 10 m
winds; alpha 0.002. **No substitution occurred.**

## 6. Integrity verified in this audit

STEP 52, STEP 53 and STEP 54 commits are all ancestors of the current head. Both STEP 53 protocol
hashes match the lock. The STEP 54 cohort manifest, source manifest and freeze record are byte-identical
to their commit. The cohort derivation hash `7466480e4ba800c8…` was recomputed here and matches. No
locked file was rewritten.

## 7. Exhaustiveness, and what was not attempted

The scan covered all 2191 candidate start dates of the preregistered period. No later candidate was
added to reach 20 drifters. The period was not extended beyond 2015-12-31 or moved before 2010-01-01,
the latitude and longitude bounds were not widened, the eligibility rules were not changed, the
unique-drifter requirement was not reduced, the drifter cap was not raised, and the deterministic
ordering was not altered. No alternative or "better" EAC cohort was searched for.

## 8. No protocol amendment

STEP 53 is not amended by this step. Any future EAC study wanting a wider period, wider geography, a
lower drifter threshold, a different cohort rule, source, model or alpha must be a **new preregistered
study**. Nothing may be introduced retroactively here.

## 9. Three studies, kept separate

| study | status | performance evaluated |
|---|---|---|
| 1. Primary | **SUPPORTED** — Theta 72 h = -31.331 km, 95 % CI [-72.0725, -11.7435] km, 6/9 valid windows | yes |
| 2. Geographic validation extension | **NOT_SUPPORTED** — Theta 72 h = -2.272 km, 95 % CI [-9.597, +10.246] km, 5/6 valid windows | yes |
| 3. EAC validation | **VALIDATION_BLOCKED** — 12 unique drifters < 20 required | **no** |

The three are never pooled and no combined effect estimate exists. Blocked is never conflated with not
supported.

## 10. Overall status

**REPLICATION_NOT_ESTABLISHED.** The primary was supported, but the geographically independent
extension did not satisfy the preregistered replication criterion. The EAC study cannot change this in
either direction, because it was blocked before any performance evaluation.

Candidate C remains **CANDIDATE_ONLY**. Operational promotion **NO**. Production claim **NO**. Nothing
in this step constitutes new evidence.

END OF STEP 55 AUDIT
