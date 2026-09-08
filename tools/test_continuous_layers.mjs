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

for (const key of ['temp', 'tmax', 'tmin', 'sst', 'wave', 'sstAnom', 'mslp']) {
  assert.match(overlay, new RegExp(`${key}:[\\s\\S]{0,240}?stepped: true`),
    `${key} 단계색 계약이 있어야 한다`);
}
/* ⚠️ 바람만 단계색에서 뺐다(2026-09-08). `stepped` 는 확대에 nearest-neighbour 를
   강제하므로 5° 격자가 550km 네모로 드러난다. 기온은 "몇 도 선"이 의미를 갖지만
   풍속은 흐름을 읽는 층이라 세울 경계가 없다 — 부드럽게 보간한다. */
assert.doesNotMatch(overlay, /wind: \{[\s\S]{0,240}?stepped: true/,
  '풍속 색면은 단계색이면 안 된다 — 5° 격자의 네모가 그대로 드러난다');
/* ⚠️ `wind: {` 부터 세면 주석 한 줄에 창이 넘친다. 풍속 눈금의 마지막 단계에
   붙여 잰다 — 팔레트와 알파가 같은 블록임을 확인하면서 주석 길이에 안 흔들린다. */
/* ⚠️⚠️ 색면이 흐리멍텅해 보이던 마지막 원인은 색이 아니라 **아래 판**이었다.
   실측 스택(바람+구름): GMGSI 구름이 alpha 1.00 으로 깔려 있고 그 위에 62% 색을
   칠했다 — 흰 판 위의 반투명 색은 무슨 색이든 파스텔이 된다. 윈디가 선명한 건
   색면이 불투명하고 그 위에 얇은 해안선만 있기 때문이다. 두 가지를 함께 지킨다. */
assert.match(overlay, /\[32, \[150,  58, 182\]\],[\s\S]{0,600}?alpha: 0\.88/,
  '풍속 색면은 거의 불투명해야 한다 — 반투명이면 아래 구름 판에 씻긴다');
assert.doesNotMatch(overlay, /wind: \{[\s\S]{0,400}?mute: 0/,
  '풍속 색면에 투명 경사를 두면 안 된다 — 아래 판을 누른 뒤에는 얼룩만 남는다');
assert.match(overlay, /stops: \[\s*\n\s*\[0, \[ 44,  58, 120\]\]/,
  '풍속 바닥색은 검정이 아니어야 한다 — 아래 판이 눌려 어두워지므로 묻힌다');
/* ⚠️⚠️ 원자료(전지구 5°)의 실측 최대가 23.8m/s 다. 옛 눈금(…30·45·60)은 위 네 칸이
   한 번도 칠해질 수 없는 색이었다 — 화면이 늘 파랑에만 몰렸던 진짜 이유. */
assert.match(overlay, /\[16, \[246, 148,  48\]\], \[20, \[236,  66,  62\]\]/,
  '실제로 부는 세기(16·20m/s)에서 주황·빨강이 나와야 한다 — 눈금이 자료 범위를 넘으면 안 된다');
/* ⚠️ 해안선 판까지 누르면 어두운 바탕 위의 어두운 선이라 통째로 사라진다.
   readability 가 그 판에 표를 붙이고 gridOverlay 가 건너뛴다. */
assert.match(overlay, /syncBaseDim\(\)[\s\S]{0,1400}?__earthusKeepBright/,
  '색면 아래 판을 누를 때 해안선 판은 건너뛰어야 한다');
assert.match(overlay, /_dimmed\.set\(layer,[\s\S]{0,200}?_dimmed\.has\(layer\)|_dimmed\.has\(layer\)[\s\S]{0,200}?_dimmed\.set\(layer,/,
  '이미 눌린 판을 다시 저장하면 안 된다 — 껐다 켤 때마다 지구가 계속 어두워진다');
assert.match(readability, /__earthusKeepBright = true/,
  '해안선 판에는 "누르지 말 것" 표가 있어야 한다');
const windfield = await source('prototype/js/windfield.js');
/* ⚠️ 입자 색 경계도 같은 이유로 m/s 다. kt 경계(…40·60kt)는 위 세 칸이 안 쓰였다. */
assert.match(windfield, /BUCKETS = Object\.freeze\(\[[\s\S]{0,120}?maxMs:/,
  '입자 색 경계는 kt 가 아니라 m/s 여야 한다 — 자료가 닿지 않는 칸을 만들면 안 된다');
/* ⚠️⚠️ 투영이 틱 비용의 79%(2.16ms 중 1.76ms)였다. 입자마다 Cesium 에 물어보면
   메인 스레드가 막혀 지구를 돌리는 조작 자체가 끊긴다. 행렬을 직접 곱한다. */
assert.match(windfield, /_prepareProjection\(\)[\s\S]{0,600}?Matrix4\.multiply\(proj, cam\.viewMatrix/,
  '뷰·투영 행렬은 틱당 한 번만 만들어야 한다');
assert.doesNotMatch(windfield, /for \(const p of this\.parts\)[\s\S]{0,2000}?scene\.cartesianToCanvasCoordinates\(cur/,
  '입자 루프에서 Cesium 투영을 부르면 안 된다 — 틱 비용의 79% 였다');
/* ⚠️ 카메라가 움직인 프레임의 꼬리를 남기면 "선이 옆으로 휘었다가 제자리를 찾는다". */
assert.match(windfield, /if \(moved\) \{\s*\n\s*ctx\.clearRect\(0, 0, W, H\);/,
  '카메라가 움직인 프레임은 통째로 지워야 한다 — 남기면 선이 옆으로 미끄러진다');
assert.match(overlay, /Math\.hypot\(u, V\[index\]\)/,
  '풍속은 u/v 벡터 크기에서 계산해야 한다');
assert.match(overlay, /derivation:[\s\S]*VECTOR_MAGNITUDE[\s\S]*sqrt\(u\^2\+v\^2\)/,
  '계산 풍속에는 식과 입력 필드가 남아야 한다');
assert.match(overlay, /sc\.imageSmoothingEnabled = !scale\.stepped/,
  '단계색 확대에서 중간색을 만들면 안 된다');
assert.match(overlay, /pressureEa:[\s\S]*pressure-ea\.json/,
  '동아시아 기압 색면은 등압선과 같은 1° 전용판을 써야 한다');
/* ⚠️ 5°(550km) 한 칸이 먼지 봉우리를 통째로 삼킨다 — 40°N 104E 의 817µg/m³ 가
   격자 사이로 빠지고 그 자리에 네모가 그려졌다(2026-09-07 실측). */
assert.match(overlay, /airEa: \(\) => `\$\{API\.AIR\}\/air-ea\.json`/,
  '동아시아 대기질 0.5° 보강판 경로가 있어야 한다');
assert.match(overlay, /if \(base === 'air'\) return 'airEa'/,
  '미세먼지·황사·오존·자외선도 동아시아에서는 보강판을 써야 한다');
assert.match(overlay, /srcName === 'sstAnomEa'[\s\S]{0,240}?g\.sstAnom[\s\S]{0,240}?await this\.sstAnomaly\(\)/,
  '0.5° 실황과 5° 평년장을 섞어 수온 편차를 계산하면 안 된다 — 보강판은 서버가 같은 격자에서 뺀 값을 쓴다');
assert.match(overlay, /if \(base === 'marine'\) return 'marineEa'/,
  '파고·너울·해류에는 동아시아 0.5° 보강판이 있어야 한다');
/* ⚠️ 전지구 판을 **대체**하면 상자 밖이 비어 "저기는 바다가 없다"가 된다.
   반대로 전지구 5°만 쓰면 서해·동해가 한 칸에 뭉개진다. 두 장을 겹쳐 그린다. */
assert.match(overlay, /const baseLayer = this\._paint\([\s\S]{0,1600}?this\.fine\[key\] = this\._paint\(/,
  '전지구 판 위에 동아시아 보강판을 덧그려야 한다');
/* ⚠️ 반투명 두 장을 그냥 포개면 alpha 0.62×2 → 실효 0.86 이라 상자 안쪽만 진해진다.
   네모를 없애려고 넣은 판이 새 네모를 만든다 — 겹친 자리는 아래 판을 도려낸다. */
assert.match(overlay, /cutoutRectangle = Cesium\.Rectangle\.fromDegrees\(/,
  '보강판이 덮는 자리에서는 전지구 판을 도려내야 한다');
assert.match(overlay, /FINE_BOX = Object\.freeze\([\s\S]{0,400}?airEa:\s*\{[^}]*west:\s*90/,
  '대기질 보강판 상자는 먼지 발원지(고비·타클라마칸)까지 서쪽으로 넓어야 한다');
/* ⚠️ 네 꼭짓점을 모두 요구하면 5° 격자에서 한반도 주변 12칸 중 1칸만 칠해졌다(실측). */
assert.match(overlay, /const near = tx < 0\.5[\s\S]{0,600}?weight > 0 \? acc \/ weight/,
  '결측 꼭짓점이 있어도 속한 격자점이 살아 있으면 칠해야 한다');
assert.match(overlay, /refreshResolution\(\)[\s\S]*desired !== rendered\.sourceName/,
  '카메라가 전용 보강판 경계를 넘을 때만 해상도를 교체해야 한다');
assert.match(contours, /CONTOUR_PROFILES[\s\S]*temp:[\s\S]*tpw:[\s\S]*sst:[\s\S]*sstanom:[\s\S]*wave:/,
  'PR-06 연속 레이어 등치선 프로필이 모두 있어야 한다');
/* ⚠️ 바람에는 등치선을 그리지 않는다(2026-09-08 제거). 5° 격자에 얹으면 바다에
   각진 다각형 260개가 뜨고, 그 각은 바람이 아니라 격자 칸의 모양이다. */
assert.doesNotMatch(contours, /^\s*wind(fc)?:\s*\{ levels:/m,
  '풍속에는 등치선 프로필이 있으면 안 된다 — 격자 칸 모양이 바람 모양으로 읽힌다');
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
assert.match(main, /diveParam \|\| oceanHubRoute[\s\S]*earthRouteRequested \|\| aetherusRoute/,
  'Earth Data·legacy Ocean Hub 딥링크에서는 아름다운 첫 화면 intro를 시작하면 안 된다');
assert.match(readability, /'wind', 'windfc'/,
  '바람도 공통 범례·도시 원격자값·지점 카드 대상이어야 한다');
assert.match(readability, /rd-contour-meta/,
  '등치선 간격과 결측 규칙을 화면 범례에 밝혀야 한다');
assert.match(renderQuality, /totalRenders\+\+[\s\S]*dataset\.totalRenders/,
  '실제 유휴 렌더 0을 DOM에서 재현 가능하게 계측해야 한다');
assert.match(index, /readabilityPanel[\s\S]*hidden/,
  '첫 Earth View는 수치·등치선 없이 시작해야 한다');

console.log('Continuous layers PR-06: 41/41 passed');
