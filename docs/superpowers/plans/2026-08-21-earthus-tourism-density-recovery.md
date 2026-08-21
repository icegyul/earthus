# EARTHUS Tourism Density Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서울 관광 화면을 121개의 듬성한 단일 기둥에서, 공식 관측 총량을 보존하는 줌별 밀도 grid와 지역 라벨로 교체하고 현재 활성 레이어와 일치하는 박스 없는 출처 표기를 출시한다.

**Architecture:** 서울시 장소별 공식 관측은 기존 `tourism-flow-contract.js`에서 그대로 보존한다. 새 순수 모듈이 각 장소를 9~25개의 유한 kernel 기여도로 나눈 뒤 공유 grid에 합산하고, Cesium 레이어는 현재 카메라 LOD와 viewport 예산에 맞는 셀만 만든다. 지역명은 기존 한국 ADM2 polygon containment 결과로 결정하며, 출처 UI는 상세 inspector를 유지하되 기본 상태를 지도 저작권 안내 같은 inline text로 축소한다.

**Tech Stack:** 정적 ES modules, CesiumJS 1.143, Node `assert`, Playwright, 기존 Python 정적 서버, AWS S3 + CloudFront.

**Spec:** `docs/superpowers/specs/2026-08-21-earthus-v8-visual-recovery-design.md`

## Global Constraints

- 현재 dirty `main`은 수정·정리·reset하지 않는다. 구현은 최신 `origin/main`에서 만든 `/private/tmp/earthus-v8-tourism-density` 격리 worktree에서만 한다.
- `mapped.earth`의 UI, 색, 브랜드 정체성은 복제하지 않는다. 밀도 grid, LOD, 시간 상호작용 같은 데이터 표현 원리만 참고한다.
- 121개 공식 장소와 공식 값은 늘리지 않는다. 파생 셀은 모두 `REGIONAL_VISUAL_ALLOCATION`이며 장소별 allocation weight 합은 `1.0`이어야 한다.
- 실제 OD가 없으므로 이동 방향, 유입·유출, 경로 화살표를 만들지 않는다. 공개 이름은 `관광 밀도`다.
- `clampToGround`, 무한 애니메이션, 매 프레임 entity 재생성을 사용하지 않는다. 카메라 `moveEnd`와 단발 `postRender`만 사용한다.
- 셀 예산은 desktop 2,500, mobile 900이다. 초과 시 원본 관측을 버리지 않고 더 큰 shared grid로 재집계한다.
- 기본 출처 표기는 카드·박스·pill·둥근 테두리·배경이 없어야 한다. 상세 권리/상태는 사용자가 `출처`를 선택했을 때만 연다.
- 공식 관측과 공식 예보는 무료 경로를 유지한다. Earthus 자체 예보 payload나 유료 entitlement는 이번 변경에 섞지 않는다.
- 각 task의 실패 테스트를 먼저 확인하고 최소 구현 후 통과시킨다. task별 커밋 제목은 무엇이 잘못돼 있었는지 한국어로 쓴다.

---

### Task 0: 격리 작업공간과 기준선 고정

**Files:**
- Read only: `docs/HANDOVER.md`
- Read only: `docs/superpowers/specs/2026-08-21-earthus-v8-visual-recovery-design.md`
- Worktree: `/private/tmp/earthus-v8-tourism-density`

- [ ] **Step 1: 원격 기준을 갱신한다**

Run from `/Volumes/740GB/웹/World.com`:

```bash
git fetch origin
git status --short --branch
```

Expected: 현재 `main`의 ahead/behind와 dirty 파일이 그대로 보인다. 이 worktree에서는 어떤 파일도 수정하지 않는다.

- [ ] **Step 2: 최신 운영 계보에서 격리 worktree를 만든다**

```bash
git worktree add /private/tmp/earthus-v8-tourism-density -b codex/v8-tourism-density-recovery origin/main
cd /private/tmp/earthus-v8-tourism-density
git status --short --branch
```

Expected: `codex/v8-tourism-density-recovery`가 `origin/main`에서 시작하고 working tree가 clean이다. 브랜치가 이미 있으면 새 브랜치를 덮어쓰지 말고 상태를 확인한 뒤 중단한다.

- [ ] **Step 3: 기존 실패 상태를 기준선으로 기록한다**

```bash
node tools/test_tourism_flow_contract.mjs
node tools/test_tourism_flow_ui.mjs
node tools/test_v8_provenance_dock_browser.mjs
node tools/test_v8_provenance_dock_wiring.mjs
```

Expected: 기존 계약 검사는 통과한다. 이는 기존 단일 기둥 구현이 요구사항에 맞다는 뜻이 아니라, 변경 전 회귀 기준이다.

No commit for this task.

---

### Task 1: 질량 보존 관광 밀도 grid 계약

**Files:**
- Create: `prototype/js/tourism-density-grid.js`
- Modify: `prototype/js/tourism-flow-contract.js:295-338`
- Create: `tools/test_tourism_density_grid.mjs`
- Modify: `tools/test_tourism_flow_contract.mjs:126-145`

- [ ] **Step 1: 밀도 grid 실패 테스트를 작성한다**

`tools/test_tourism_density_grid.mjs`에 rank 1~4 장소 fixture와 동일 grid에 겹치는 두 장소 fixture를 만든다. 다음을 검증한다.

```js
const result = buildTourismDensityGrid(places, null, {
  lod: 'district', cellMeters: 95, kernelSize: 5, maxCells: 2500,
});

assert.equal(result.sourceCount, places.length);
assert.ok(result.cells.length > places.length);
for (const place of places) {
  const sum = result.cells.flatMap(cell => cell.allocations)
    .filter(row => row.placeId === place.id)
    .reduce((total, row) => total + row.weight, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `${place.id}: ${sum}`);
}
assert.ok(result.cells.every(cell => cell.valueMeaning === 'REGIONAL_VISUAL_ALLOCATION'));
assert.ok(result.cells.every(cell => cell.heightMeters >= 12 && cell.heightMeters <= 180));
assert.ok(scoreToHeight(0.79) < scoreToHeight(0.80));
assert.ok(result.cells.every(cell => !('flowDirection' in cell)));
```

추가 검증:

- `kernelSize: 3`은 장소당 9개, `kernelSize: 5`는 25개 기여도를 만든다.
- 장소별 `allocatedPopulation` 합은 공식 range midpoint와 같다.
- 공유 grid로 합쳐져도 각 장소의 weight 합은 `1.0`이다.
- `maxCells: 900`이면 셀 수가 900 이하이고 `aggregationAdjusted === true`다.
- score가 증가할 때 height와 색 단계가 모두 감소하지 않는다.
- 빨강 score 최소값 `0.80`의 높이가 주황 최대값 `0.79`보다 높다.
- unavailable 장소와 좌표 없는 장소는 셀을 만들지 않는다.

- [ ] **Step 2: 테스트가 기존 단일 기둥 API 때문에 실패하는지 확인한다**

```bash
node tools/test_tourism_density_grid.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` 또는 `buildTourismDensityGrid is not exported`로 FAIL.

- [ ] **Step 3: 공식 증거 선택을 렌더링에서 분리한다**

`prototype/js/tourism-flow-contract.js`의 현재 `towerVisual()` 안에 섞여 있는 현재/공식예보 선택을 다음 공개 함수로 이동한다.

```js
export function resolveTourismEvidence(item, at = null) {
  // official observation 또는 45분 이내 가장 가까운 official forecast만 반환
  // { level, rank, populationRange, sourceType, at, live }
}
```

기존 `towerVisual()`은 production import에서 제거하되, 한 release 동안 deprecated adapter로 남겨 고유 evidence 선택 로직이 사라지지 않았음을 확인한다. adapter는 새 score/height를 사용하고 `deprecated: true`를 표시한다.

- [ ] **Step 4: 공유 grid 순수 모듈을 최소 구현한다**

`prototype/js/tourism-density-grid.js`의 공개 인터페이스는 다음으로 고정한다.

```js
export const DENSITY_LIMITS = Object.freeze({ desktop: 2500, mobile: 900 });

export function scoreToHeight(score) {
  const s = Math.min(1, Math.max(0, Number(score)));
  return 12 + 168 * (s ** 0.70);
}

export function densityBand(score) {
  // 0.00~0.34 relaxed, 0.35~0.59 normal,
  // 0.60~0.79 crowded, 0.80~1.00 very-crowded
}

export function buildTourismDensityGrid(places, at = null, options = {}) {
  // 1. 각 공식 장소를 3x3 또는 5x5 finite kernel로 분배
  // 2. kernel weight를 장소마다 정확히 1.0으로 정규화
  // 3. 위경도를 shared grid key로 snap하고 겹치는 셀을 합산
  // 4. budget 초과 시 cellMeters를 단계적으로 키워 재집계
  // 5. allocations를 보존한 cell 배열, 장소별 합계 allocationAudit, LOD metadata 반환
}
```

rank band 안에서 중심이 높고 가장자리가 낮아지게 하되 서로 다른 rank band를 넘지 않게 한다. 색과 높이는 최종 `score` 하나만 사용한다. alpha는 `STALE` 여부로만 낮추며 score 의미를 바꾸지 않는다.

- [ ] **Step 5: 이전 단일 기둥 비율 검사를 새 계약으로 교체한다**

`tools/test_tourism_flow_contract.mjs`의 `height / footprint 3~4`와 `420m fixed cell` 검사를 제거하고 다음을 검증한다.

```js
const evidence = flow.resolveTourismEvidence(item, null);
assert.equal(evidence.sourceType, 'OFFICIAL_OBSERVATION');
assert.equal(evidence.rank, 2);
assert.equal(flow.resolveTourismEvidence(item, '2026-08-20T12:00:00Z').sourceType,
  'OFFICIAL_FORECAST');
assert.equal(flow.resolveTourismEvidence(missingCoord, null), null);
```

- [ ] **Step 6: 단위 테스트를 통과시킨다**

```bash
node tools/test_tourism_density_grid.mjs
node tools/test_tourism_flow_contract.mjs
cp prototype/js/tourism-density-grid.js /tmp/earthus-tourism-density-grid.mjs
node --check /tmp/earthus-tourism-density-grid.mjs
cp prototype/js/tourism-flow-contract.js /tmp/earthus-tourism-flow-contract.mjs
node --check /tmp/earthus-tourism-flow-contract.mjs
```

Expected: all PASS, both syntax checks exit 0.

- [ ] **Step 7: 커밋한다**

```bash
git add prototype/js/tourism-density-grid.js prototype/js/tourism-flow-contract.js tools/test_tourism_density_grid.mjs tools/test_tourism_flow_contract.mjs
git commit -m "fix: 관광 관측값을 기둥 하나로만 표시해 점박이였던 구조 교정"
```

---

### Task 2: Cesium LOD 셀, 지역명, 선택 연결

**Files:**
- Create: `prototype/js/tourism-density-labels.js`
- Modify: `prototype/js/layers/tourism-flow.js:5-252`
- Modify: `prototype/js/layers/registry.js:26`
- Modify: `prototype/js/main.js` only if the existing `_tourism` picker cannot open the dominant source place
- Create: `tools/test_tourism_density_labels.mjs`
- Modify: `tools/test_tourism_flow_ui.mjs:22-45`
- Modify: `tools/test_tourism_flow_browser.mjs:89-177`

- [ ] **Step 1: 지역명·LOD 실패 테스트를 먼저 작성한다**

`tools/test_tourism_density_labels.mjs`에서 다음 순수 계약을 고정한다.

```js
const labels = buildTourismLabelCandidates(places, adminByPlaceId, {
  lod: 'overview', limit: 10,
});
assert.ok(labels.length >= 1 && labels.length <= 10);
assert.ok(labels.every(label => label.kind === 'district'));
assert.equal(new Set(labels.map(label => label.text)).size, labels.length);

const close = buildTourismLabelCandidates(places, adminByPlaceId, {
  lod: 'detail', limit: 12,
});
assert.ok(close.every(label => label.text.includes(label.placeNameKo)));
```

screen 좌표 fixture로 `selectNonOverlappingLabels()`가 겹치는 사각형 중 우선순위가 높은 하나만 남기고 8~12개 limit을 지키는지 검증한다.

- [ ] **Step 2: 기존 renderer가 1 place = 1 entity라 실패하는지 확인한다**

`tools/test_tourism_flow_browser.mjs`의 one-place fixture 기대값을 다음으로 먼저 바꾼다.

```js
assert.ok(initial.cellCount >= 9 && initial.cellCount <= 25, JSON.stringify(initial));
assert.ok(initial.labelCount >= 1 && initial.labelCount <= 12, JSON.stringify(initial));
assert.equal(initial.title, '서울 관광 밀도');
assert.ok(initial.maxHeight <= 180);
assert.ok(initial.minHeight >= 12);
```

Run with a local server:

```bash
python3 -m http.server 8880 -d prototype
```

In a second terminal:

```bash
EARTHUS_TOURISM_URL=http://127.0.0.1:8880/ node tools/test_tourism_flow_browser.mjs
```

Expected: entity count and title assertions FAIL against the current renderer.

- [ ] **Step 3: 지역명 후보 모듈을 구현한다**

`prototype/js/tourism-density-labels.js`는 다음만 담당한다.

```js
export function buildTourismLabelCandidates(places, adminByPlaceId, options = {}) {
  // overview: ADM2 구별 weighted centroid와 구 이름
  // district/detail: ADM2 구 + 공식 관광지명
  // rank, official population midpoint, 관측 최신성 순으로 우선순위
}

export function selectNonOverlappingLabels(candidates, projectedRects, limit) {
  // 화면 밖 제거, rectangle collision 제거, 최대 8 mobile / 10 desktop / 12 detail
}
```

행정명은 `koreaAdminAt(lat, lon)` 결과만 사용한다. 실패하면 공식 관광지명은 보여도 임의의 구·동 이름을 만들지 않는다.

- [ ] **Step 4: 관광 renderer를 shared grid 방식으로 교체한다**

`prototype/js/layers/tourism-flow.js`를 다음 구조로 변경한다.

```js
import { buildTourismDensityGrid } from '../tourism-density-grid.js';
import { buildTourismLabelCandidates, selectNonOverlappingLabels }
  from '../tourism-density-labels.js';
import { koreaAdminAt } from '../korea-admin-reference.js';

// init(): cellDs와 labelDs를 한 번만 만들고 camera.moveEnd listener를 한 번만 등록
// refresh(): snapshot 검증 뒤 장소별 koreaAdminAt 결과를 Map에 cache
// renderAt(): camera height, viewport, device width로 LOD와 budget 결정
//             grid.cells만 box entity로 생성
//             cell의 dominant place를 _tourism에 넣어 기존 상세 sheet 선택을 보존
// _layoutLabelsOnce(): 단발 postRender에서 screen 좌표를 얻고 collision 결과만 show
```

LOD 기준을 테스트 가능한 상수로 둔다.

```js
const TOURISM_LOD = Object.freeze({
  overview: { minCameraHeight: 18_000, kernelSize: 5, cellMeters: 320 },
  district: { minCameraHeight: 6_000, kernelSize: 5, cellMeters: 170 },
  detail:   { minCameraHeight: 0, kernelSize: 5, cellMeters: 95 },
});
```

overview와 district에서는 shared grid 합산으로 셀 수를 줄인다. detail에서는 camera view rectangle 안의 장소만 70~110m 셀로 만든다. mobile은 900 budget을 넘으면 cell size를 키워 합산한다. `count()`는 label이 아니라 밀도 cell 수만 반환한다.

- [ ] **Step 5: 선택과 시간 변경을 보존한다**

각 cell entity에 다음을 둔다.

```js
{
  id: `tourism-density:${cell.key}`,
  _tourism: dominantPlace,
  _tourismContributors: cell.allocations,
  _tourismVisual: cell,
}
```

기존 `main.js`의 `picked?.id?._tourism` 경로가 그대로 동작하는지 테스트한다. 공식 예보 시각을 선택하면 동일 shared grid가 해당 forecast evidence로 다시 계산되어야 한다.

- [ ] **Step 6: 단위·브라우저 검사를 통과시킨다**

```bash
node tools/test_tourism_density_labels.mjs
node tools/test_tourism_flow_ui.mjs
EARTHUS_TOURISM_URL=http://127.0.0.1:8880/ node tools/test_tourism_flow_browser.mjs
cp prototype/js/layers/tourism-flow.js /tmp/earthus-tourism-flow.mjs
node --check /tmp/earthus-tourism-flow.mjs
```

Expected: all PASS, runtime page errors empty, mobile horizontal overflow 0.

- [ ] **Step 7: 커밋한다**

```bash
git add prototype/js/tourism-density-labels.js prototype/js/layers/tourism-flow.js prototype/js/layers/registry.js prototype/js/main.js tools/test_tourism_density_labels.mjs tools/test_tourism_flow_ui.mjs tools/test_tourism_flow_browser.mjs
git commit -m "fix: 관광 지역명이 숨고 단일 블록만 남았던 LOD 렌더링 교정"
```

`prototype/js/main.js`가 실제로 바뀌지 않았다면 add 목록에서 제외한다.

---

### Task 3: 관광 밀도 문구와 박스 없는 활성 출처

**Files:**
- Modify: `prototype/js/layers/tourism-flow.js:182-220`
- Modify: `prototype/js/ui-tourism.js`
- Modify: `prototype/css/tourism-flow.css:1-20`
- Modify: `prototype/js/ui-source.js:139-175, 236-249, 644-649`
- Modify: `prototype/js/v8/provenance-dock.js:1-98`
- Modify: `prototype/css/v8-shell.css:3-130`
- Modify: `tools/test_tourism_flow_ui.mjs`
- Modify: `tools/test_tourism_flow_browser.mjs`
- Modify: `tools/test_v8_provenance_dock_browser.mjs`
- Modify: `tools/test_v8_provenance_dock_wiring.mjs`
- Create: `tools/test_v8_active_source_context.mjs`

- [ ] **Step 1: 잘못된 공개 문구와 출처 카드에 대한 실패 테스트를 쓴다**

실제 공개 DOM을 여는 `tools/test_tourism_flow_browser.mjs`는 다음을 요구한다.

```js
assert.match(mapOverlay.text, /서울 관광 밀도/);
assert.match(mapOverlay.text, /높이·색 = 관광 혼잡도/);
assert.doesNotMatch(mapOverlay.text, /서울 관광 흐름|블록 하나는 한 관광지|고정 표시 셀/);
assert.match(tourismSheetText, /지역 밀도 셀/);
assert.doesNotMatch(tourismSheetText, /3D 블록/);
```

`tools/test_tourism_flow_ui.mjs`의 기존 source-wiring 검사는 import, data source, box/cylinder 금지처럼
실행 경계를 연결하는 항목만 남기고 공개 문구의 정확성은 위 브라우저 행동 검사에 맡긴다.

`tools/test_v8_provenance_dock_browser.mjs`는 computed style과 텍스트를 검증한다.

```js
assert.match(initial.inlineText, /^출처:\s*서울특별시 실시간 인구데이터/);
assert.equal(initial.backgroundColor, 'rgba(0, 0, 0, 0)');
assert.equal(initial.borderTopWidth, '0px');
assert.equal(initial.borderRadius, '0px');
assert.equal(initial.countBadgeVisible, false);
```

상세 버튼을 선택하면 기존 `#srcNote` 상세가 열리고 Escape로 닫히는 접근성 계약은 유지한다.

- [ ] **Step 2: 활성 source 선택 순수 함수를 테스트한다**

`tools/test_v8_active_source_context.mjs`에서 다음을 고정한다.

```js
assert.equal(resolveActiveSourceId(id => ['tourism', 'clouds'].includes(id)), 'tourism');
assert.equal(resolveActiveSourceId(id => id === 'clouds'), 'clouds');
```

관광과 구름이 동시에 켜진 fixture에서 inline 출처에 서울시만 있고 `NOAA GMGSI`가 없는지 검증한다.

- [ ] **Step 3: 관광 화면 문구와 범례를 교체한다**

공개 제목과 범례는 아래만 기본 노출한다.

```text
서울 관광 밀도
서울시 공식 관측 · 121/121곳 · 관측 16:20 KST
높이·색 = 관광 혼잡도    여유 ─ 보통 ─ 혼잡 ─ 매우 혼잡
```

`tm-map-credit`는 top-left 제목 영역에서 제거한다. Esri 지도 credit과 데이터 source는 기존 좌하단 출처 경로로 합친다. 상세 sheet의 “3D 블록”은 “지역 밀도 셀”로 바꾸고 `REGIONAL_VISUAL_ALLOCATION` 의미를 짧게 설명한다.

- [ ] **Step 4: 관광을 현재 visual context로 우선한다**

`prototype/js/ui-source.js`에 순수 resolver를 export한다.

```js
const CONTEXT_PRIORITY = ['tourism'];

export function resolveActiveSourceId(isOn) {
  return CONTEXT_PRIORITY.find(isOn)
    || PAINT.find(isOn)
    || PRIORITY.find(isOn)
    || null;
}
```

`render()`는 이 resolver를 사용한다. 출처 상세 DOM을 만들기 전에 다음 요약을 root dataset에 둔다.

```js
this.root.dataset.inlineSource = [sourceText, made ? `${hhmm(made)} 자료` : null]
  .filter(Boolean).join(' · ');
```

동시 출처는 현재 context의 핵심 두 개까지만 dataset에 넣고 나머지는 `외 N`으로 축약한다. 관광 context에서는 구름 source를 포함하지 않는다.

- [ ] **Step 5: Provenance Dock 기본 모양을 inline attribution으로 바꾼다**

DOM controller와 상세 inspector는 보존하되 기본 button은 다음 구조로 단순화한다.

```html
<button class="pd-toggle" aria-expanded="false">
  <b class="pd-label">출처:</b>
  <span class="pd-summary">서울특별시 실시간 인구데이터 · 16:20 자료</span>
</button>
```

기본 `.pd-toggle`에는 background, border, border-radius, box-shadow, backdrop-filter, count badge가 없다. 작은 글자와 text-shadow만 허용한다. 상세 펼침 상태의 `#srcNote`는 기존 source inspector 내용을 유지한다.

- [ ] **Step 6: 테스트를 통과시킨다**

```bash
node tools/test_tourism_flow_ui.mjs
node tools/test_v8_active_source_context.mjs
node tools/test_v8_provenance_dock_browser.mjs
node tools/test_v8_provenance_dock_wiring.mjs
cp prototype/js/ui-source.js /tmp/earthus-ui-source.mjs
node --check /tmp/earthus-ui-source.mjs
```

Expected: all PASS.

- [ ] **Step 7: 커밋한다**

```bash
git add prototype/js/layers/tourism-flow.js prototype/js/ui-tourism.js prototype/css/tourism-flow.css prototype/js/ui-source.js prototype/js/v8/provenance-dock.js prototype/css/v8-shell.css tools/test_tourism_flow_ui.mjs tools/test_tourism_flow_browser.mjs tools/test_v8_provenance_dock_browser.mjs tools/test_v8_provenance_dock_wiring.mjs tools/test_v8_active_source_context.mjs
git commit -m "fix: 관광 화면에 다른 레이어 출처 카드와 흐름 문구가 노출되던 문제 교정"
```

---

### Task 4: 듬성함 재발 방지 시각·성능 E2E

**Files:**
- Modify: `tools/test_tourism_relief_live_visual.mjs:19-98`
- Create: `tools/test_tourism_density_visual_browser.mjs`
- Modify: `tools/test_tourism_flow_browser.mjs`

- [ ] **Step 1: 셀 개수만 아닌 화면 밀도 실패 기준을 추가한다**

full 121-place snapshot으로 desktop/mobile에서 다음 값을 수집한다.

```js
{
  sourcePlaceCount,
  densityCellCount,
  placesWithNineAllocations,
  visibleLabelCount,
  occupiedScreenBins,
  medianNearestNeighborPx,
  minHeight,
  maxHeight,
  sourceWeightErrors,
  runtimeErrors,
}
```

수용 기준:

- `sourcePlaceCount === 121`
- desktop `densityCellCount > 900 && densityCellCount <= 2500`
- mobile `densityCellCount > 400 && densityCellCount <= 900`
- full grid 기준 모든 유효 장소의 allocation 기여도 9개 이상
- `sourceWeightErrors.length === 0`
- `minHeight >= 12`, `maxHeight <= 180`
- visible label 1~12개, 중복 구 이름 없음
- 화면을 12×12px bin으로 나눴을 때 `occupiedScreenBins >= 363`
- 화면상 nearest-neighbor p50은 desktop 24px 이하, mobile 18px 이하
- runtime error 0, horizontal overflow 0

- [ ] **Step 2: 기존 코드에서 실패를 확인한다**

```bash
EARTHUS_TOURISM_URL=http://127.0.0.1:8880/ node tools/test_tourism_density_visual_browser.mjs
```

Expected: 기존 121 entity 화면에서는 density cell count와 occupied bin 기준 FAIL.

- [ ] **Step 3: 카메라 3단계와 두 viewport를 검수한다**

각 viewport에서 overview 26km, district 12km, detail 4km로 이동해 LOD가 바뀌는지 검증한다. entity 생성은 `camera.moveEnd` 뒤 한 번만 일어나야 하며 5초 idle 동안 entity count와 render request가 계속 증가하지 않아야 한다.

스크린샷 저장 경로:

```text
/private/tmp/earthus-tourism-density-desktop-overview.png
/private/tmp/earthus-tourism-density-desktop-detail.png
/private/tmp/earthus-tourism-density-mobile-overview.png
/private/tmp/earthus-tourism-density-mobile-detail.png
```

- [ ] **Step 4: 전체 관광 회귀 검사를 통과시킨다**

```bash
node tools/test_tourism_flow_contract.mjs
node tools/test_tourism_density_grid.mjs
node tools/test_tourism_density_labels.mjs
node tools/test_tourism_flow_ui.mjs
EARTHUS_TOURISM_URL=http://127.0.0.1:8880/ node tools/test_tourism_flow_browser.mjs
EARTHUS_TOURISM_URL=http://127.0.0.1:8880/ node tools/test_tourism_density_visual_browser.mjs
EARTHUS_TOURISM_URL=http://127.0.0.1:8880/ node tools/test_tourism_relief_live_visual.mjs
```

Expected: all PASS.

- [ ] **Step 5: 스크린샷을 눈으로 검수한다**

네 이미지를 열어 다음을 확인한다.

- 고립된 121개 큰 기둥이 아니라 작은 셀이 이어진 지역 밀도로 읽힌다.
- 빨강이 주황·노랑보다 낮아 보이지 않는다.
- 구 이름과 공식 관광지명이 화면을 덮지 않고 8~12개 이내다.
- source는 좌하단 inline 한 줄이며 카드가 아니다.
- OD 화살표나 가짜 이동선이 없다.

- [ ] **Step 6: 커밋한다**

```bash
git add tools/test_tourism_relief_live_visual.mjs tools/test_tourism_density_visual_browser.mjs tools/test_tourism_flow_browser.mjs
git commit -m "test: 듬성한 관광 점박이 화면이 다시 통과하던 시각 검수 보강"
```

---

### Task 5: 캐시 버전, 정적 배포 목록, 운영 검증

**Files:**
- Modify: `prototype/index.html:109-117` and main script query near the end of body
- Modify: `prototype/js/layers/registry.js:26`
- Modify: `prototype/sw.js:18-19`
- Modify: `tools/verify_weather_tourism_live.mjs`
- Create: `tools/verify_tourism_density_live.mjs`
- Create: `tools/deploy_tourism_density.sh`
- Create: `tools/test_tourism_density_release_manifest.mjs`

- [ ] **Step 1: release manifest 실패 테스트를 쓴다**

가짜 `aws` executable을 임시 PATH에 두고 배포 스크립트를 실제 실행해, 아래 변경 파일의 업로드
호출과 MIME/cache 인자를 모두 기록하는 행동 검사를 작성한다. source text grep으로 대신하지 않는다.

```text
index.html                                  text/html; charset=utf-8
sw.js                                       text/javascript; charset=utf-8
css/tourism-flow.css                        text/css; charset=utf-8
css/v8-shell.css                            text/css; charset=utf-8
js/tourism-flow-contract.js                 text/javascript; charset=utf-8
js/tourism-density-grid.js                  text/javascript; charset=utf-8
js/tourism-density-labels.js                text/javascript; charset=utf-8
js/layers/tourism-flow.js                   text/javascript; charset=utf-8
js/layers/registry.js                       text/javascript; charset=utf-8
js/ui-tourism.js                            text/javascript; charset=utf-8
js/ui-source.js                             text/javascript; charset=utf-8
js/v8/provenance-dock.js                    text/javascript; charset=utf-8
```

Run:

```bash
node tools/test_tourism_density_release_manifest.mjs
```

Expected: deploy script가 아직 없어 FAIL.

- [ ] **Step 2: cache-bust와 service worker cache를 한 release token으로 맞춘다**

release token은 `20260821-tourism-density1`로 고정한다.

- `prototype/index.html`: tourism CSS, v8-shell CSS, main script query 갱신
- `prototype/js/layers/registry.js`: tourism layer import query 갱신
- `prototype/sw.js`: `CACHE`를 `earthus-shell-2026-08-21-tourism-density1`로 변경하고 이전 cache를 legacy set에 추가
- 브라우저/운영 verifier의 dynamic import query도 동일 token으로 변경

- [ ] **Step 3: scoped deploy script와 live verifier를 구현한다**

`tools/deploy_tourism_density.sh`는 `set -euo pipefail`을 사용하고 위 파일만 `s3://earthus-cache-kr/app/`에 올린다. 모든 `aws s3 cp`에 `--content-type`과 `--cache-control no-cache`를 명시한다. 마지막에 CloudFront `E193CZEBLWEB56`의 정확한 경로만 무효화한다.

`tools/verify_tourism_density_live.mjs`는 service worker를 허용한 clean context에서 mobile/desktop 모두 검증한다.

- release token과 live asset bytes
- live snapshot 공식 121곳
- desktop/mobile cell budget
- `서울 관광 밀도` 제목
- 지역명 label 존재
- 좌하단 inline source가 서울특별시이며 cloud source가 아님
- default source computed style에 box/background/border 없음
- reload 뒤 service worker controller와 같은 결과
- runtime error 0

- [ ] **Step 4: 배포 전 전체 검사를 다시 통과시킨다**

```bash
node tools/test_tourism_flow_contract.mjs
node tools/test_tourism_density_grid.mjs
node tools/test_tourism_density_labels.mjs
node tools/test_tourism_flow_ui.mjs
node tools/test_v8_active_source_context.mjs
node tools/test_v8_provenance_dock_browser.mjs
node tools/test_v8_provenance_dock_wiring.mjs
node tools/test_tourism_density_release_manifest.mjs
EARTHUS_TOURISM_URL=http://127.0.0.1:8880/ node tools/test_tourism_flow_browser.mjs
EARTHUS_TOURISM_URL=http://127.0.0.1:8880/ node tools/test_tourism_density_visual_browser.mjs
```

Expected: all PASS.

- [ ] **Step 5: release wiring을 커밋한다**

```bash
git add prototype/index.html prototype/js/layers/registry.js prototype/sw.js tools/verify_weather_tourism_live.mjs tools/verify_tourism_density_live.mjs tools/deploy_tourism_density.sh tools/test_tourism_density_release_manifest.mjs
git commit -m "fix: 관광 밀도 자산이 이전 캐시에 남아 운영 화면이 바뀌지 않던 경로 교정"
```

- [ ] **Step 6: 원격 main fast-forward 가능 여부를 확인한다**

```bash
git fetch origin
git rebase origin/main
git status --short --branch
git log --oneline --decorate origin/main..HEAD
```

Expected: clean tree, 위 task 커밋만 `origin/main` 위에 있다. 충돌 시 현재 dirty main을 건드리지 말고 중단한다.

- [ ] **Step 7: feature branch와 main을 force 없이 push한다**

```bash
git push origin codex/v8-tourism-density-recovery
git push origin codex/v8-tourism-density-recovery:main
```

Expected: 둘 다 fast-forward 성공. non-fast-forward면 force하지 않고 중단한다.

- [ ] **Step 8: scoped 파일만 배포한다**

```bash
bash tools/deploy_tourism_density.sh
```

Expected: 각 upload의 Content-Type이 명시되고 CloudFront invalidation ID가 출력된다.

- [ ] **Step 9: 운영 bytes, cache, UI를 검증한다**

```bash
EARTHUS_LIVE_URL='https://earthus.net/?earth=1&earthView=data&earthLayer=tourism&release=20260821-tourism-density1' node tools/verify_tourism_density_live.mjs
```

Expected: desktop/mobile/reload 모두 PASS, 운영 캡처가 `/private/tmp/earthus-tourism-density-live-*.png`에 남는다.

- [ ] **Step 10: 배포 증거를 기록한다**

최종 보고에는 다음을 적는다.

- feature와 main commit SHA
- CloudFront invalidation ID와 완료 상태
- live verifier 결과
- desktop/mobile 실제 cell 수와 label 수
- source place 121, allocation 오류 0
- 운영 캡처 경로
- 현재 dirty local `main`을 변경하지 않았다는 확인

---

## Final Acceptance Checklist

- [ ] 121개 공식 장소가 유지되고 가짜 관측점·OD가 없다.
- [ ] 장소별 allocation weight 합이 정확히 `1.0`이다.
- [ ] 서울 overview가 121개 단일 box가 아닌 shared density grid로 읽힌다.
- [ ] desktop 셀 수는 2,500 이하, mobile은 900 이하이며 듬성함 회귀 기준을 통과한다.
- [ ] score, height, color가 단조이고 빨강 최소 높이가 주황 최대 높이보다 높다.
- [ ] ADM2 polygon containment 기반 구 이름과 공식 관광지명이 LOD에 맞게 표시된다.
- [ ] 기본 출처는 좌하단 inline text이며 카드/박스가 아니다.
- [ ] 관광과 구름이 함께 켜져도 관광 화면 기본 출처는 서울특별시다.
- [ ] 현재/공식 예보 시간 선택과 상세 sheet가 유지된다.
- [ ] idle 상태에서 entity 재생성이나 무한 렌더가 없다.
- [ ] clean browser, service worker reload, live URL에서 같은 결과다.
- [ ] 현재 dirty `main`과 레거시 파일을 삭제·reset하지 않았다.
