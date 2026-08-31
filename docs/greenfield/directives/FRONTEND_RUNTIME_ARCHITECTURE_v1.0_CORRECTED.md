# CANONICAL SUPERSESSION NOTICE — PHYSICAL 3D INTELLIGENCE LOCK

> **STOP. 이 문서의 과거 시각/렌더 규칙은 EARTHUS V2 v5.3 CORRECTED CANONICAL과 충돌할 경우 실행하지 않는다.**
>
> 최상위 규칙:
> - `https://mapped.earth/earth` 수준은 GLOBAL 3D 경험의 **최소 PASS bar**다. 상한이 아니다.
> - EARTHUS는 `GLOBAL → CONTINENT → COUNTRY → REGION → LOCAL → UNDERWATER` 전 구간에서 **하나의 연속된 실제 데이터 기반 3D Earth**다.
> - 줌은 `2D → 3D`가 아니라 `LOW-LOD 3D → HIGH-LOD 3D`다.
> - Raster/satellite imagery는 observation/material input일 뿐 physical geometry/volume의 최종 대체물이 아니다.
> - 성능 fallback은 `HIGH_3D → MEDIUM_3D → LOW_3D → STATIC_3D → OFF`만 허용한다. `PHOTO_SPHERE`, `SATELLITE_SHELL`, `FLAT_TILE_ONLY` final fallback은 금지한다.
> - Canonical Earth State / Event / Evidence / Confidence가 truth를 만들고, 3D/4D Scene은 이를 공간적으로 표현한다.
> - Intelligence와 LLM은 분리한다. LLM은 수치·확률·원인·geometry를 생성하지 않으며, 승인된 SceneIntent를 통해 동일 3D Earth를 탐색/설명한다.
> - Simulation은 immutable observed baseline에서 branch하여 `Earth Diff`를 계산한다. LIVE/OBSERVED state를 mutate하지 않는다.
> - 이 문서 안의 `cloud shell`, `global Earth skin`, `imagery as world`, `VOLUME → ... → SHELL`, `Underwater FUTURE-only` 등 과거 문구는 아래 corrected clause 또는 v5.3 CORRECTED CANONICAL이 우선한다.

**CURRENT CANONICAL:** `EARTHUS_V2_CLAUDE_CODE_FULL_DEVELOPMENT_MASTER_v5.3_KO` (CORRECTED CANONICAL content)

---

# EARTHUS 2.0 Frontend Runtime Architecture v1.0

## Goal
Prevent the 1.0 failure mode where menus, layers, timers, fetches, and render primitives can control each other through ad-hoc globals. The v2 frontend is driven by a single scene intent/state machine.

## Reuse basis
- Reuse the existing single Cesium Viewer and requestRender/quality controls.
- Reuse existing v2 Scene Orchestrator / Visual Manifest concepts.
- Reuse generation + AbortController patterns already proven in tourism/imagery paths.
- Reuse the existing rule that Aetherus Three.js is not continuously active with the Cesium globe.
- Do not create a second Cesium Viewer for `/v2`.

## Runtime pipeline
`User action OR approved LLM Scene Tool -> SceneIntent -> SceneRecipeResolver -> Compatibility/Performance validation -> SceneTransactionCoordinator -> Slot Manager -> Existing Visual Engine Runtime -> SceneEvidenceSnapshot/Evidence`.

No menu component may call another menu's engine directly.

## Slots
1. BASE: one Physical 3D Earth base — terrain geometry + ocean surface + atmosphere + source-backed materials; imagery is material/observation input only. one owner.
2. PRIMARY: at most one dynamic data hero.
3. SECONDARY: at most one approved context renderer.
4. EVENT: PULSE event beacons; budgeted and disposable.
5. SAFETY: official warnings/restrictions. Persistent, priority above product overlays.
6. UI: panels, legends, tooltips; does not count as a data engine.

## Top-menu semantics
- EARTH: reset to Quiet Earth. PRIMARY/SECONDARY/EVENT cleared; SAFETY remains.
- WEATHER: exclusive primary. Context is added only by a registered recipe.
- OCEAN: exclusive primary. Weather may be context only for approved use cases.
- HAZARD: event primary; may auto-compose one relevant WEATHER or OCEAN context.
- HUMAN: urban/human primary; may auto-compose WEATHER context for Travel/Event/Crowd impact.
- SPACE: exclusive. Earth dynamic slots shut down/suspend; Cesium continuous rendering suspended; separate Space canvas owns the frame.
- PULSE: orchestrator. Overview uses EVENT beacons on Quiet Earth. Selecting a Pulse event may keep the PULSE panel while one target domain becomes PRIMARY.

## State ownership
The Scene State Store is the only canonical frontend state for menu, scene, primary, secondary, event, panel, focus, time pin, and Cesium suspension.

Forbidden: `window.activeLayer`, per-feature booleans that independently mount engines, feature code that turns off another feature by DOM side effect.

## Transition transaction
1. Resolve intent.
2. Validate compatibility and device budget.
3. Increment scene generation.
4. Suspend conflicting old slots without destroying recovery state.
5. Prepare new resources under the new generation token.
6. Commit only if generation is still current.
7. Dispose obsolete old resources.
8. If prepare/commit fails, rollback and resume previous scene.

## Async stale-result prevention
Every request belongs to a scene owner/generation. On scene exit, abort its requests. Even if a remote response arrives after abort, a stale generation must not be allowed to mutate Cesium/UI state.

## Resource ownership
Each scene owner registers timers, RAF loops, Workers, EventListeners, AbortControllers, Cesium Entity/DataSource/Primitive/ImageryLayer, canvas buffers, textures, and temporary object URLs. `disposeOwner()` must return the runtime to its prior resource baseline.

## Time and camera
- Earth-bound domain changes preserve camera unless an event/POI gives an explicit focus.
- EARTH reset preserves the current view and clears data layers.
- SPACE uses a separate time/camera domain and does not inherit Earth forecast time blindly.
- Time mode is preserved only when the target declares support; otherwise it returns to NOW with a reason code.

## Mobile/thermal rules
NORMAL/BALANCED/ECO may allow one PRIMARY + one SECONDARY. SAFE has no SECONDARY. Event beacons: desktop 12, mobile 7; SAFE reduces to desktop 5/mobile 3. No feature may bypass the budget.

## Definition of Done
A menu or layer is not DONE unless activation, switch-away, rapid reselect, failure rollback, stale-response rejection, disposal, mobile budget, truth labels, and screenshot/runtime evidence all pass.


## Intelligence / LLM Scene Integration

- SceneState/IntelligenceContext/FND-017 remain the single authority chain.
- `SceneEvidenceSnapshot` contains camera, scope, region, focus, selected feature, time mode, truth classes, visible semantic layers, canonical signal refs, evidence refs and source readiness.
- Render-hidden data are not automatically removed from scientific calculation.
- LLM never calls Cesium/renderer/provider directly. Approved path: `LLM → Tool Orchestrator → capability/auth → IntelligenceContext → FND-017 → SceneIntent → Scene Orchestrator → Visual Engine`.
- Simulation opens an immutable scenario branch; live observed SceneState remains untouched.
