# One-week Codex execution queue

The queue is ordered to minimize wasted reasoning and reduce blast radius.

## C0 — Baseline safety (read-only)
Output: exact current SHA, branch divergence, dirty/untracked inventory, existing `/v2` collision check. No source edit.

## C1 — Apply accelerator
Copy add-only files. Run all local syntax/contract tests. No deployment.

## C2 — VS-00 Quiet Earth
Load `/v2/` with the existing `viewer.js`. Evidence: browser screenshot, console error 0, `globalThis.__earthusViewer` exists, no second viewer, no v2 dynamic feature active.

## C3 — VS-01 Menu/Scene Runtime
Exercise EARTH/WEATHER/OCEAN/HAZARD/HUMAN/PULSE/SPACE. Evidence: 50-cycle stress, one primary, EARTH returns no v2-owned layers, SPACE exclusive state, no stale commit.

## C4 — Existing layer preview bridge
Wire only already-existing 1.0 layer modules necessary to make selected v2 features visibly render. Preserve their generation/Abort/dispose contracts; do not rewrite proven parsers/renderers.

## C5 — VS-02 Seoul Population
Actual `citydata_ppltn` → Backend v1 ingestion/read model → HUMAN visualization. If Backend v1 cannot be deployed in the week, keep legacy preview explicitly labeled and do not call VS-02 production complete.

## C6 — VS-03 Weather
KMA official current/forecast/warning contract first. Add only one visual phenomenon at a time. Verify OFF disposal and current/forecast labels.

## C7 — Integration closeout
Run root regressions, desktop/mobile browser checks, diff review, evidence report. Deploy `/v2` only if deployment credentials and the user's current deployment rules are available; never modify `/` as part of this mission.
