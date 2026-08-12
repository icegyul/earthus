import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = async path => readFile(new URL(path, root), 'utf8');

/* contour-math는 gridmath import만 data module로 치환해 브라우저와 같은 ES module을 쓴다. */
const gridmathSource = await source('prototype/js/gridmath.js');
const gridmathUrl = `data:text/javascript;base64,${Buffer.from(gridmathSource).toString('base64')}`;
const contourSource = (await source('prototype/js/contour-math.js'))
  .replace("'./gridmath.js'", `'${gridmathUrl}'`);
const {
  contourPathLength,
  contourPathMidpoint,
  contourSegments,
  stitchSegments,
} = await import(`data:text/javascript;base64,${Buffer.from(contourSource).toString('base64')}`);

const regional = { nx: 3, ny: 3, lon0: 126, lat0: 35, res: 1 };
const ramp = [0, 1, 2, 0, 1, 2, 0, 1, 2];
const result = contourSegments(regional, ramp, 1);
assert.equal(result.cells, 4);
assert.equal(result.missingCells, 0);
assert.ok(result.segments.length >= 2, '경사를 가로지르는 선이 있어야 한다');

const paths = stitchSegments(result.segments);
assert.ok(paths.length < result.segments.length, '짧은 선분을 연결해 엔티티 수를 줄여야 한다');
assert.ok(contourPathLength(paths[0]) > 0);
assert.equal(contourPathMidpoint([[0, 0], [2, 0]])[0], 1);

const missing = [...ramp]; missing[0] = null;
const missingResult = contourSegments(regional, missing, 1);
assert.equal(missingResult.missingCells, 1, '결측 꼭짓점을 가진 칸을 정확히 제외해야 한다');
assert.ok(missingResult.segments.length < result.segments.length,
  '결측 칸을 이웃값으로 채워 가짜 선을 만들면 안 된다');

const globalGrid = { nx: 4, ny: 2, lon0: -180, lat0: 0, res: 90 };
const seam = contourSegments(globalGrid, [0, 0, 0, 2, 0, 0, 0, 2], 1).segments;
assert.ok(seam.some(segment => segment.flat().some(value => value > 90)),
  '전지구 마지막 칸은 +180° 쪽 경계 좌표를 써야 한다');
assert.ok(seam.every(segment => Math.abs(segment[1][0] - segment[0][0]) <= globalGrid.res),
  '날짜변경선에서 지구를 가로지르는 긴 선을 만들면 안 된다');

const overlay = await source('prototype/js/gridoverlay.js');
const contours = await source('prototype/js/continuous-contours.js');
const isobars = await source('prototype/js/isobars.js');
const registry = await source('prototype/js/layers/registry.js');
const store = await source('prototype/js/store.js');
const readability = await source('prototype/js/readability.js');
const renderQuality = await source('prototype/js/render-quality.js');
const earthViewState = await source('prototype/js/earth-view-state.js');
const main = await source('prototype/js/main.js');
const index = await source('prototype/index.html');

for (const key of ['temp', 'tmax', 'tmin', 'sst', 'wave', 'sstAnom', 'mslp', 'wind']) {
  assert.match(overlay, new RegExp(`${key}:[\\s\\S]{0,240}?stepped: true`),
    `${key} 단계색 계약이 있어야 한다`);
}
assert.match(overlay, /Math\.hypot\(u, V\[index\]\)/,
  '풍속은 u/v 벡터 크기에서 계산해야 한다');
assert.match(overlay, /derivation:[\s\S]*VECTOR_MAGNITUDE[\s\S]*sqrt\(u\^2\+v\^2\)/,
  '계산 풍속에는 식과 입력 필드가 남아야 한다');
assert.match(overlay, /sc\.imageSmoothingEnabled = !scale\.stepped/,
  '단계색 확대에서 중간색을 만들면 안 된다');
assert.match(overlay, /pressureEa:[\s\S]*pressure-ea\.json/,
  '동아시아 기압 색면은 등압선과 같은 1° 전용판을 써야 한다');
assert.match(overlay, /key !== 'sstanom'[\s\S]*marineEa/,
  '0.5° 실황과 5° 평년장을 섞어 수온 편차를 계산하면 안 된다');
assert.match(overlay, /refreshResolution\(\)[\s\S]*desired !== rendered\.sourceName/,
  '카메라가 전용 보강판 경계를 넘을 때만 해상도를 교체해야 한다');
assert.match(contours, /CONTOUR_PROFILES[\s\S]*temp:[\s\S]*wind:[\s\S]*tpw:[\s\S]*sst:[\s\S]*sstanom:[\s\S]*wave:/,
  'PR-06 연속 레이어 등치선 프로필이 모두 있어야 한다');
assert.match(contours, /clampToGround: false/);
assert.doesNotMatch(contours, /setInterval|requestAnimationFrame/,
  '등치선은 유한 렌더여야 한다');
assert.match(isobars, /text: `\$\{lv\}hPa`/,
  'H/L뿐 아니라 등압선 자체 값 라벨이 있어야 한다');
assert.match(isobars, /KMA_SURFACE_CHART_4HPA/,
  '4hPa 간격의 근거 계약이 남아야 한다');
assert.match(registry, /def\.kind === 'grid'[\s\S]*id === 'pressure'[\s\S]*isobars\.set/,
  'grid 분기에 가려졌던 pressure 토글이 등압선을 함께 켜야 한다');
assert.match(registry, /_syncDataSurface\(state\)[\s\S]*state\.layer === 'wind'/,
  '바람 Data View에서만 풍속 색면을 켜야 한다');
assert.match(store, /'current', 'pressure', 'rain'/,
  '기압·비도 모든 연속 색면과 같은 배타 그룹이어야 한다');
assert.match(store, /activeColors\.length > 1[\s\S]*localStorage\.setItem/,
  '옛 저장값의 겹친 색면도 시작할 때 정리해야 한다');
assert.match(store, /continuousColorLayerIds\(\)/,
  '바람 Data View가 이전 연속 색면 상태까지 걷을 수 있어야 한다');
assert.match(earthViewState, /state\.layer === 'wind'[\s\S]*continuousColorLayerIds/,
  '바람 URL 복원에서 이전 기압·온도 색면을 실제 상태에서도 꺼야 한다');
assert.match(earthViewState, /reason !== 'time-preset'[\s\S]*continuousColorLayerIds/,
  '단독 바람 선택은 색면을 정리하되 temp+wind 시간 프리셋은 보존해야 한다');
assert.match(main, /diveParam \|\| oceanRoute \|\| earthRouteRequested \|\| aetherusRoute/,
  'Earth Data 딥링크에서는 아름다운 첫 화면 intro를 시작하면 안 된다');
assert.match(readability, /'wind', 'windfc'/,
  '바람도 공통 범례·도시 원격자값·지점 카드 대상이어야 한다');
assert.match(readability, /rd-contour-meta/,
  '등치선 간격과 결측 규칙을 화면 범례에 밝혀야 한다');
assert.match(renderQuality, /totalRenders\+\+[\s\S]*dataset\.totalRenders/,
  '실제 유휴 렌더 0을 DOM에서 재현 가능하게 계측해야 한다');
assert.match(index, /readabilityPanel[\s\S]*hidden/,
  '첫 Earth View는 수치·등치선 없이 시작해야 한다');

console.log('Continuous layers PR-06: 40/40 passed');
