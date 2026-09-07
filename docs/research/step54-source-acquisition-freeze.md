# STEP 54 — EAC VALIDATION SOURCE ACQUISITION AND DATA FREEZE

**STATUS: VALIDATION_BLOCKED**

The preregistered cohort feasibility gate was not satisfied. The East Australian Current domain yielded
**5 registered windows and 12 unique drifters** against a locked minimum of 20 unique drifters. Nothing
was relaxed, extended or replaced to reach a different outcome, and no forcing data were acquired.

**No scientific result was produced.** No trajectory, endpoint, delta, Theta, bootstrap, interval,
ranking or comparison was computed at any point.

---

## 1. Gates cleared before any work

| gate | result |
|---|---|
| STEP 53 commit `b5cfb97a…` is an ancestor of HEAD | PASS |
| STEP 52 commit `4af3fd8f…` is an ancestor of HEAD | PASS |
| Protocol markdown SHA-256 `a9b6457ddce51c5b…` | MATCH |
| Protocol JSON SHA-256 `79c601beffd8ee94…` | MATCH |
| Tracked research files modified | 0 |

## 2. Domain and period, unchanged

Region **EAC**, 40° S – 25° S, 150° E – 160° E. Period **2010-01-01T12:00:00Z** through
**2015-12-31T12:00:00Z**. Neither was modified. This validation's independence is geographic; it is
**not fully temporally independent**, as the preregistration already disclosed.

## 3. Observation acquisition

The observations were acquired from the same NOAA Global Drifter Program hourly quality-controlled
ERDDAP endpoint and with the same mechanism, fields and quarterly layout as the original observation
step, differing only in the box and the period, both fixed by the lock. A 3° request margin was applied
around the registered box, exactly as before.

| item | value |
|---|---|
| files | 25 quarterly CSV files, 2010 Q1 through 2016 Q1 |
| extra quarter | 2016 Q1, so a window starting 2015-12-31 still has its full 72-hour coverage |
| aggregate SHA-256 | `68d2227c7e3ba668…` |
| drifters loaded | 88 |
| duplicate-conflict drifters | 0 |
| substitution | none |

Originals were written once and are not modified. Every file carries its size, SHA-256, HTTP status and
the exact query used.

## 4. Cohort derivation under the locked rule

The frozen STEP 16 evaluation was applied verbatim to the EAC box: drogue attached through window end,
buoy type SVP or SVPB, 73 hourly samples with no gap over one hour and provider gap at most 3600 s,
start more than 100 km from the coastline, start inside the box, then the window-level advection
criteria. Candidate window starts were scanned in strict chronological order across the whole period.
No ranking of any kind was applied, and no performance information exists for this region.

Scanned candidate window starts: **2191**. Registered windows: **5**.

| window | start | eligible | selected | cumulative unique |
|---|---|---|---|---|
| EAC-V1 | 2015-06-22T12:00:00Z | 8 | 8 | 8 |
| EAC-V2 | 2015-06-27T12:00:00Z | 9 | 1 | 9 |
| EAC-V3 | 2015-06-30T12:00:00Z | 8 | 1 | 10 |
| EAC-V4 | 2015-07-05T12:00:00Z | 9 | 1 | 11 |
| EAC-V5 | 2015-07-13T12:00:00Z | 8 | 1 | 12 |

Selected identities: 132572, 132574, 132583, 139657, 139658, 139660, 139661, 139662, 139663, 139664,
139665, 139666.

## 5. Feasibility gate

| requirement | locked value | obtained | met |
|---|---|---|---|
| target windows | 6 | 5 | no |
| minimum valid windows | 4 | 5 | yes |
| **minimum unique drifters** | **20** | **12** | **no** |
| maximum drifters per window | 12 | 8 | yes |

The unique-drifter minimum is a hard preregistered minimum, not a target. With 12 against 20 the cohort
cannot be formed, so the study status is **VALIDATION_BLOCKED**, exactly as the earlier validation line
was blocked at 14 against 20.

**What was not done:** no window invented, no temporal period extended, no geographic domain expanded,
no eligibility threshold lowered, no region replaced, no target adjusted.

## 6. Non-overlap verification

| check | result |
|---|---|
| new identities ∩ primary identities | empty |
| new identities ∩ extension identities | empty |
| new window starts ∩ primary window starts | empty |
| new window starts ∩ extension window starts | empty |

All four intersections empty: **PASS**. The 113-identity exclusion set was applied and its hash matched
the value fixed at the lock.

## 7. Forcing sources: identities preserved, acquisition not attempted

The four frozen source identities remain exactly as locked: HYCOM GOFS 3.1 GLBv0.08 expt_53.X at
15.000 m 3-hourly; GLORYS12V1 at native 15.810070 m; WW3 GLOB-30M CFSR uss with Stokes multiplier 1.0;
NCEP-DOE Reanalysis 2 10 m winds; alpha 0.002.

None was acquired. The cohort gate blocked first, and acquiring forcing for a cohort that cannot satisfy
the locked minimum would serve no purpose. This is recorded as NOT_ATTEMPTED_COHORT_BLOCKED rather than
as a source failure, and **no substitution of any kind was made**.

## 8. Coverage

Observation coverage is verified for all five registered windows at t0, t0+24 h, t0+48 h and t0+72 h,
which is implied by the eligibility rule itself: a window is only registered when every eligible drifter
has all 73 hourly samples across the window. The four forcing components are recorded as NOT_EVALUATED
rather than assumed.

## 9. Determinism

The cohort derivation was run three times, once in place and twice into separate directories. The
manifests are identical apart from the creation timestamp, and the derivation hash is stable at
`7466480e4ba800c841a7b9c152b6e1b028de506e5fcf28e777ff18ee51427763`.

## 10. What this outcome does and does not mean

It means the East Australian Current, over 2010–2015 and under the locked eligibility rules, does not
contain enough independent drifters to form the preregistered cohort. Only five windows in a single
mid-2015 stretch reached even the eight-drifter eligibility floor, and they shared most of their
drifters.

It says **nothing** about how candidate C performs there. No model was run and no comparison exists.
This is a feasibility outcome, not a performance outcome.

## 11. Scientific status, unchanged

Primary SUPPORTED. Validation extension NOT_SUPPORTED. Original validation BLOCKED. STEP 53
PREREGISTERED. STEP 54 **VALIDATION_BLOCKED**. Candidate C remains CANDIDATE_ONLY, operational
promotion NO, production claim NO.

END OF STEP 54 FREEZE RECORD
