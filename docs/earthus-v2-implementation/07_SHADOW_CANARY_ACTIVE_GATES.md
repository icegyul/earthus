# Intelligence release gates

## DRAFT
Code or experiment only. No production input/output assumption.

## SHADOW
Real production inputs may be consumed. Output is stored and evaluated but does not change public user decisions.

## CANARY
Only after source/truth/safety/backtest or calibration gates pass. Limited exposure with rollback.

## ACTIVE
Requires live evidence and measurable acceptance criteria. A class/file/test-fixture is not evidence of ACTIVE.

### Capability-specific gates
- Travel Discovery: Provider evidence + truth labels + safety gate + offline backtest/user test.
- Pollution Lens: Provider evidence + truth labels + vector gate + source-attribution guard.
- Earth Pulse: Provider evidence + news dedup + action location guard + safety priority.
- Forecast: Provider evidence + ground truth + calibration metrics + rollback plan.
- Personal: consent boundary + explicit-context-only + delete/export path.
