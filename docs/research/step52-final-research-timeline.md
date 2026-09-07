# STEP 52 — FINAL RESEARCH TIMELINE

The sequence in which the chain was locked, each step committed before the next one read it. Commit
identifiers are recorded exactly as verified; anything that could not be verified is marked
UNVERIFIED and is never guessed.

---

| step | role | commit | ancestry |
|---|---|---|---|
| STEP 36 | COHORT LOCK | `043a09b8539955868651a06e7c2c44e3c606803f` | verified |
| STEP 37 | EXPERIMENT PREREGISTRATION LOCK | `74d19f0a9661a41d63a08c56bbd3f91e9d8b312d` | verified |
| STEP 38 | PRIMARY SOURCE ACQUISITION / DATA FREEZE | `23e78f863fb092aa9e3c36e4d74d4afd4393e7f4` | verified |
| STEP 39 | PRIMARY EXECUTION / EVALUATION | UNVERIFIED (records locked by STEP 41) | via STEP 41 |
| STEP 40 | PRIMARY BOOTSTRAP LOCK | `2b1a7baa7ef9e69d25cecbff2b09fca8700fca80` | verified |
| STEP 41 | STEP 39 RECORDS / TOOL LOCK | `9a3223089099bcb09a2589cc8a4bda82fcb47ae5` | verified |
| STEP 42 | FINAL PRIMARY SCIENTIFIC RESULTS | `bae85245e827f53ee9782201c442ea7849c04e82` | verified |
| STEP 43 | REPRODUCIBILITY VERIFICATION | `15970d9735330fb937e86af449c1deef6763b5d1` | verified |
| STEP 44 | INDEPENDENT VALIDATION PREREGISTRATION | `5f8d5c38bfc9cc6a168707ae0b1b643c99ad46f9` | verified |
| STEP 45A | ORIGINAL VALIDATION INPUT-MISSING BLOCK | `b0f0274f14ae491e34f0bcb85874056d92260f46` | verified |
| STEP 45B | PROTOCOL AMENDMENT | `7249c38d355f97c4f264d2f4d7611ce5013bd8d7` | verified |
| STEP 45C | ORIGINAL VALIDATION COHORT BLOCK | `fa9c0590d634a6d6f30cc8a6cd2797c94e0ae7dd` | verified |
| STEP 46 | VALIDATION EXTENSION PREREGISTRATION | `f7be980e3aa1e71c4cc96b7aca699e1d4b1faec7` | verified |
| STEP 47 | VALIDATION EXTENSION COHORT LOCK | UNVERIFIED (artefacts hash-recorded, not committed) | not in repository |
| STEP 48 | VALIDATION EXTENSION SOURCE / DATA FREEZE | `00516cd1562d50b9380f4eef4ad66611822ae99c` | verified |
| STEP 49 | VALIDATION EXTENSION EXECUTION | `fbb080af5723c32488ddf976d64f067ba12a4555` | verified |
| STEP 50 | VALIDATION EXTENSION ENDPOINT + BOOTSTRAP | `85824367b6fd12c066da0e191f6731a0400293ab` | verified |
| STEP 51 | FINAL INDEPENDENT VALIDATION INTERPRETATION | `539205efba50cb1940c337db3f51717d9b5c14be` | verified |

Runtime `155995dd` is an ancestor of the current head throughout.

## How the chain ran

**Primary line.** The cohort was fixed first, then the experiment was preregistered, then the sources
were acquired and frozen, and only then were trajectories executed and evaluated. The bootstrap came
after the execution was complete, the execution records were locked afterwards, the results were
reported, and an independent reproducibility check confirmed the reported values could be rebuilt from
the frozen records alone.

**Original validation line.** An independent validation was preregistered, then blocked twice: first
because the per-window drifter identities needed by the locked rule were absent from every authorised
metadata artefact, and then, after a pre-execution amendment authorised a limited read of the frozen
observation dataset, because the rule exhausted its candidate windows at 4 windows and 14 drifters
against a required 6 and 20. No performance was ever computed on that line.

**Extension line.** A separately labelled extension was preregistered over the complete non-primary
region set, its cohort locked at 6 windows and 25 drifters, its sources acquired and frozen, its 18 run
units executed and replay-matched, and its endpoint and preregistered bootstrap evaluated once. The
replication criterion was not met.

**Interpretation.** The two results were locked side by side and never merged, and the language for
describing them was fixed at the same time.

## Order property

At no point did a result influence an earlier choice. Each cohort, source set, parameter and criterion
was fixed and committed before the data that could have informed it were read, and every blocked
outcome was preserved as blocked rather than converted into a negative finding.

END OF STEP 52 TIMELINE
