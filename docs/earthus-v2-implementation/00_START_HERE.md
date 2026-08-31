# EARTHUS 2.0 — CODEX ONE-WEEK IMPLEMENTATION ACCELERATOR

This package exists to reduce agent reasoning and token use during the next implementation week.
It is an **add-only integration package**. It does not overwrite EARTHUS 1.0 `/` and does not claim Production completion.

## Hard boundaries
- Never reset/pull/clean the user's current canonical worktree just because remote `main` is older/newer.
- Read `AGENTS.md`, Luna skill and `docs/HANDOVER*.md` before repository changes.
- Existing Cesium viewer is reused. A second `Cesium.Viewer` is forbidden.
- `/v2` is isolated. Do not replace `/`.
- No secret values in source, docs, logs or chat.
- No `clampToGround`, endless animation loop, fabricated values, fabricated coordinates or fabricated provider endpoints.
- OFF means actual abort/stop/dispose, not merely hidden UI.
- Foundation catalog growth is frozen unless implementation produces explicit Gap Evidence.

## What is prebuilt here
1. `/prototype/v2/` isolated shell.
2. Frontend Foundation v1.0 pure scene transaction modules.
3. Feature registry for WEATHER/OCEAN/HAZARD/HUMAN/SPACE/PULSE.
4. Legacy layer bridge that only owns layers it activated.
5. Scene/runtime adapter and 50-cycle stress API.
6. Pulse-news fail-closed normalizer.
7. Country focus presets for KR/JP/US/GB.
8. Machine-readable wiring manifest.
9. Node tests and repository apply/check scripts.
10. Vertical-slice execution contracts VS-00 through VS-07.

## First command after copying into the canonical repository
```bash
tools/earthus2-v2/run_repo_checks.sh
```
Then serve `prototype/` using the repository's normal local server and open `/v2/`.
