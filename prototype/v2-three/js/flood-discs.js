// 연안 침수 예상도(국립해양조사원)의 **전국 색인** — 시군구마다 원반 하나.
//
// 왜 따로 있나: 여기 있기 전에는 live-layers.js 의 buildFloodIndex 가 시군구마다 점 하나를 찍었다.
// 그 점은 ① 무엇을 뜻하는지 화면 어디에도 없었고 ② 색이 `count`(침수면 폴리곤 **개수**)의 로그였다.
// 개수는 면적도 위험도도 아니다 — 기관이 면을 어떻게 잘랐나의 부산물이다. 그것을 심각도로 칠하면 거짓이다.
//
// ── 원반의 색이 무엇인가 (2026-09-20 실측으로 고른 것) ──────────────────────────
// 색인이 시군구마다 주는 것은 `count` 와 `classes{}`(깊이 구간별 폴리곤 **개수**)뿐이다.
// 여기서 만들 수 있는 지표는 셋이었고, 69곳 전부와 폴리곤 61,776개를 실제로 내려받아 재 봤다:
//
//   ① 깊은 구간의 **개수 비율**(예: 1.5 m 이상이 몇 %)  → **버렸다.**
//      개수 비율은 면적 비율을 **69곳 중 61곳에서 부풀린다**(평균 +13.9 %p).
//      부산 부산진구는 개수로는 60.0% 가 1.5 m 이상인데 면적으로는 2.7% 다 — 깊은 면은 잘게 쪼개진 조각이라
//      개수만 많다. 폴리곤 하나의 넓이는 중앙값 대비 최대 9,462배까지 벌어진다(거제시 실측).
//      "1.5 m 이상이 60%" 라고 칠해 놓고 각주로 "개수 기준입니다" 라고 적는 것은 화면이 거짓말을 한 뒤에 변명하는 것이다.
//   ② 개수 기준 **중앙 구간** → 같은 이유로 버렸다(면적 기준보다 한 칸 깊게 나온다).
//   ③ 그 시군구에 있는 **가장 깊은 구간** → **골랐다.**
//      한 시군구에 3 m 이상 면이 있나 없나는 면을 어떻게 잘라도 변하지 않는다 — 개수/면적 어느 쪽으로 세어도 같다.
//      실측으로 확인: 69곳 모두, 가장 깊은 구간의 **면적이 0 이 아니다**(조각 하나짜리 허깨비가 아니다).
//      분포는 3 m↑ 43곳 · 2 m대 13곳 · 1.5 m대 7곳 · 1 m대 3곳 · 0.5 m 이하 3곳.
//      43곳이 같은 색인 것은 지표의 흠이 아니라 **자료가 말하는 것**이다(남·서해안 대부분에 3 m 이상 구간이 있다).
//
// 한 줄로 쓸 수 있나 — "이 시군구 침수 예상도에 나타나는 **가장 깊은 구간**(그 구간의 위 끝값)."  쓸 수 있다.
//
// ── 색은 어디서 오나 ────────────────────────────────────────────────────────────
// 깊이→색 함수는 앱 전체에 **하나**다. live-layers.js 의 FLOOD_RAMP 를 `ramp` 로 받아 쓴다(여기서 표를 베끼지 않는다).
// 그래서 원반의 색과, 눌렀을 때 뜨는 그 시군구 면의 색이 어긋날 자리가 없다 — 둘 다 **구간 하한**을 같은 함수에 넣는다.
//
// ── 자리 ────────────────────────────────────────────────────────────────────────
// 색인의 `bbox` 중점에 찍으면 다도해에서 바다 한가운데에 놓인다(여수시 35.2 km · 신안군 29.0 km 어긋남 — 실측).
// data/khoa-flood-anchors.json 의 면적가중 중심점을 쓰고, 없으면 bbox 중점으로 돌아간다.

import { projectPx, thinPoints } from './obs-labels.js?v=1';

/** 기관 자료가 쓰는 깊이 구간 키 → [하한, 위 끝값]. 실측: 색인 69곳에 8종이 나온다
 *  (`2.0-2.5`·`2.5-3.0` 은 6곳에만 있는 변종 구간이다 — 기관 산출물이 그렇게 돼 있다). */
export const FLOOD_CLASS_BOUNDS = Object.freeze({
  '0.0-0.5': Object.freeze([0.0, 0.5]),
  '0.5-1.0': Object.freeze([0.5, 1.0]),
  '1.0-1.5': Object.freeze([1.0, 1.5]),
  '1.5-2.0': Object.freeze([1.5, 2.0]),
  '2.0-2.5': Object.freeze([2.0, 2.5]),
  '2.0-3.0': Object.freeze([2.0, 3.0]),
  '2.5-3.0': Object.freeze([2.5, 3.0]),
  '3.0': Object.freeze([3.0, Infinity]),
});

/** 지표의 이름. 범례·카드·원반이 **같은 글자**를 쓴다 — 세 곳에 따로 적으면 셋이 갈라진다. */
export const FLOOD_METRIC_KO = '그 시군구에 있는 가장 깊은 침수 구간';
export const FLOOD_METRIC_EN = 'deepest inundation depth class present in the district';

/** 화면 고정 크기(화면 높이 대비) — 뉴스 네모칸(0.030)과 같은 셈법. */
export const FLOOD_DISC_SCALE = 0.026;
export const FLOOD_DISC_PX = 26;
/** 한 화면에 놓을 원반의 최대 개수. 폰은 좁아 더 적게. */
export const FLOOD_DISC_MAX_DESKTOP = 18;
export const FLOOD_DISC_MAX_PHONE = 9;
/** 원반 바깥으로 얼마까지 눌러도 그 원반으로 볼까(화면 px). 판 자체의 크기에 **더하는** 여유다 —
 *  판은 원반 + 이름이라 가로로 길다. 원 하나로 판정하면 이름 쪽을 눌렀을 때 빗나간다. */
export const FLOOD_PICK_SLOP_PX = 6;
/** 다시 솎기 전에 원반이 화면에서 이만큼은 움직여야 한다(화면 px).
 *  ⚠️ 버킷 격자는 화면에 고정돼 있다 — 지구가 돌면 겹치지도 않는 두 원반이 같은 버킷에 들어가는 순간
 *  하나가 떨어진다. obs-labels.js(OBS_RECULL_PX)가 같은 이유로 같은 가드를 둔다:
 *  자동 회전만으로 라벨이 깜빡이는 것을 실측했다(120초에 등장 67 · 퇴장 80회). */
export const FLOOD_RECULL_PX = 20;
/**
 * 이 크기를 넘는 시군구는 **누르기 전에** 용량을 알려 준다.
 * ⚠️ 2026-09-21 자료가 바뀌어 문턱도 다시 잡았다: 수집기가 gzip 으로 올리기 시작하면서 가장 큰 곳이
 *    고흥군 34.6 MB → **4.82 MB** 가 됐다. 옛 문턱 8 MB 를 그대로 두면 **경고가 한 곳도 안 뜬다** —
 *    자료를 고쳤더니 고지가 조용해지는 자리다. 지금 분포(중앙값 0.28 MB · 상위 4.82 · 3.48 · 2.85 · 2.51)에서
 *    2 MB 를 넘는 4곳만 경고한다. 느린 이동통신망에서 2 MB 는 눈에 띄게 걸린다.
 */
export const FLOOD_HEAVY_BYTES = 2 * 1024 * 1024;
/** 시군구 하나를 받는 데 주는 시간. 33 MB 를 이동통신망에서 받는 데 30초는 모자란다(실측 근거는 live-layers.js). */
export const FLOOD_DISTRICT_TIMEOUT_MS = 120000;

/** 구간 키 하나를 사람이 읽는 글자로. 가장 깊은 구간은 **위 끝값**으로 말한다 —
 *  '최대 3 m 이상' 은 맞지만 '최대 0 m' 는 틀리기 때문이다(0.0-0.5 구간의 하한은 0 이다). */
export function floodClassLabel(key) {
  const b = FLOOD_CLASS_BOUNDS[key];
  if (!b) return '';
  const n = (x) => (Number.isInteger(x) ? String(x) : String(x));
  return b[1] === Infinity ? `${n(b[0])} m 이상` : `${n(b[1])} m`;
}

/** classes{} → 그 시군구에서 **가장 깊은 구간**. 없으면 null.
 *  개수가 0 인 칸은 없는 것으로 본다(기관 자료에 0 칸이 들어오는 날을 대비한다). */
export function floodDeepestClass(classes) {
  let best = null;
  for (const key of Object.keys(classes || {})) {
    const b = FLOOD_CLASS_BOUNDS[key];
    if (!b) continue;                       // 모르는 구간 키는 지어내지 않는다 — 건너뛴다
    if (!(Number(classes[key]) > 0)) continue;
    if (!best || b[0] > best.low) best = { key, low: b[0], top: b[1] };
  }
  return best;
}

/** 색인의 districts[] → 원반 명세. 자리는 anchors 가 있으면 그것, 없으면 bbox 중점.
 *  자료가 비어 있는 시군구(count 0)는 **그리지 않는다** — 없는 것을 그리지 않는다. */
export function floodDiscSpecs(districts, anchors = null) {
  const out = [];
  for (const r of districts || []) {
    if (!r || !(r.count > 0) || !Array.isArray(r.bbox) || r.bbox.length < 4) continue;
    const deep = floodDeepestClass(r.classes);
    if (!deep) continue;                    // 깊이 구간을 하나도 못 읽으면 색을 지어낼 수 없다
    const a = anchors && anchors[r.sggCd];
    const anchored = Array.isArray(a) && Number.isFinite(a[0]) && Number.isFinite(a[1]);
    out.push({
      sggCd: r.sggCd,
      name: r.name,
      lon: anchored ? a[0] : (r.bbox[0] + r.bbox[2]) / 2,
      lat: anchored ? a[1] : (r.bbox[1] + r.bbox[3]) / 2,
      anchored,
      /* 누르기 전에 고지하는 **내려받는 양**. 색인(r.bytes)이 있으면 그것이 먼저다 — 수집기가 다시 돌 때마다
         저절로 맞는다. 앵커 파일의 수는 앱에 박힌 **스냅샷**이라 압축·정밀도를 바꾼 날 거짓이 된다
         (2026-09-21 실측: gzip 전환으로 고흥군 34.6 MB → 5.06 MB 인데 카드는 한동안 '약 33 MB'라 적었다). */
      bytes: Number.isFinite(r.bytes) ? r.bytes
        : (anchored && Number.isFinite(a[2]) ? a[2] : null),
      depthLow: deep.low,                   // 색은 이 값으로 — 면을 칠할 때와 같은 하한이다
      depthKey: deep.key,
      count: r.count,
      text: `${r.name} 최대 ${floodClassLabel(deep.key)}`,
    });
  }
  // 깊은 곳이 먼저 자리를 갖는다. 같으면 침수면이 많은 쪽 — 지표가 아니라 **자리 다툼의 순서**일 뿐이다.
  out.sort((a, b) => b.depthLow - a.depthLow || b.count - a.count || String(a.sggCd).localeCompare(String(b.sggCd)));
  return out;
}

/** 범례에 실을 줄 — **지금 화면에 실제로 있는 구간만**, 얕은 쪽부터.
 *  구간을 미리 적어 두지 않는다: 기관 자료에 변종 구간(2.0-2.5 등)이 있고, 없는 칸을 그리면 거짓이 된다. */
export function floodLegendRows(specs) {
  const by = new Map();
  for (const s of specs || []) {
    const cur = by.get(s.depthKey);
    if (cur) cur.n += 1;
    else by.set(s.depthKey, { key: s.depthKey, low: s.depthLow, label: floodClassLabel(s.depthKey), n: 1 });
  }
  return [...by.values()].sort((a, b) => a.low - b.low);
}

/** 범례 HTML. 글자는 전부 이 파일의 상수에서 오므로 밖에서 온 글자가 섞이지 않는다(이스케이프할 것이 없다). */
export function floodLegendHtml(specs, ramp) {
  const rows = floodLegendRows(specs);
  if (!rows.length || typeof ramp !== 'function') return '';
  const chips = rows.map((r) => {
    const c = ramp(r.low);
    const col = `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
    return `<span style="display:inline-flex;align-items:center;gap:5px;margin:2px 10px 2px 0;white-space:nowrap">`
      + `<i style="width:11px;height:11px;border-radius:50%;background:${col};display:inline-block"></i>`
      + `최대 ${r.label} <b style="opacity:.55;font-weight:400">${r.n}곳</b></span>`;
  }).join('');
  return `<div style="margin:6px 0 4px">${chips}</div>`;
}

/** 카메라(cam)에서 판(p)까지 **지구가 가로막고 있나**. 둘 다 지구 중심 기준 좌표다.
 *  지평선 판정(newsChipOpacity)은 "카메라가 그 점의 접평면 위에 있나"를 보는데,
 *  카메라가 판보다 **낮으면**(|P| ≥ |C|) 그 물음 자체가 성립하지 않아 늘 '안 보인다'가 된다.
 *  실제로 그랬다: 시군구를 누르면 카메라가 지표 14 km 까지 내려가는데(main.js flood-district),
 *  판은 지표 위 0.004 반경(약 25 km)에 있어 부산 중구 같은 작은 시군구에서는 도착하자마자
 *  이름표가 사라졌다 — 면이 떠 있는데 그것이 어디 것인지 화면이 말하지 못했다.
 *  그 자리에서 옳은 물음은 '가려졌나'다: 카메라→판 선분이 단위구를 파고드나.
 *  돌려주는 것: true 면 막힌 것이 없다(그려도 된다). */
export function floodDiscClear(p, cam) {
  const dx = p.x - cam.x;
  const dy = p.y - cam.y;
  const dz = p.z - cam.z;
  const dd = dx * dx + dy * dy + dz * dz;
  if (!(dd > 0)) return true;
  // 선분 위에서 지구 중심에 가장 가까운 점
  const t = -(cam.x * dx + cam.y * dy + cam.z * dz) / dd;
  if (t <= 0 || t >= 1) return true;            // 가장 가까운 지점이 선분 밖 — 사이에 지구가 없다
  const cx = cam.x + t * dx;
  const cy = cam.y + t * dy;
  const cz = cam.z + t * dz;
  return cx * cx + cy * cy + cz * cz >= 1;      // 단위구를 파고들지 않으면 보인다
}

/**
 * 숨긴 곳이 있으면 그 사실을 말하는 한 줄. 없으면 빈 글자.
 * 숫자를 박지 않는다 — 지금 화면에 몇 개가 떠 있는지를 받아서 적는다.
 *
 * ⚠️ 2026-09-21 반박 검증으로 고친 것: 옛 글은 `total − shown` 을 **전부** '겹치는 N곳은 가렸습니다'로 적었다.
 *    그런데 total 은 색인 69곳 전부이고, 그 차이의 대부분은 겹침이 아니라 **화면 밖·지구 뒤편**이다
 *    (전지구 줌에서는 한국이 화면 구석의 점이라 대부분이 아예 후보도 못 된다 — tick 의 지평선 판정에서 걸러진다).
 *    '겹쳐서 가렸다'는 화면이 **제가 한 일**을 말하는 자리인데, 하지도 않은 일을 적고 있었다.
 *    그래서 이제 세 수를 받는다:
 *      shown     솎기에서 뽑혀 지금 떠 있는 수
 *      onScreen  이번 tick 의 **화면 안 후보** 수(지평선 너머·투영 밖을 뺀 것)
 *      total     색인이 들고 온 전부
 *    겹쳐서 가린 것 = onScreen − shown · 화면 밖·지구 뒤편 = total − onScreen. 둘을 갈라 적는다.
 * ⚠️ **그림이 한 번이라도 돈 뒤에만** 부른다. 레이어를 세우는 순간에는 아직 0 이라
 *    "0곳만 붙어 있습니다"라는 거짓말이 카드에 굳는다(그 자리에는 floodThinRuleNote 를 쓴다).
 */
export function floodHiddenNote(shown, onScreen, total) {
  const s = Math.max(0, Number(shown) || 0);
  const c = Math.max(s, Number(onScreen) || 0);        // 후보가 뽑힌 것보다 적을 수는 없다
  const t = Math.max(c, Number(total) || 0);
  const overlapped = c - s;
  const away = t - c;
  if (!overlapped && !away) return '';
  const why = [];
  if (overlapped) why.push(`겹쳐서 가린 ${overlapped}곳`);
  if (away) why.push(`화면 밖·지구 뒤편 ${away}곳`);
  // 권유는 **할 수 있는 일**만 적는다: 화면 밖은 그쪽으로 가야 들어오고, 겹친 것은 확대해야 갈라진다.
  const how = away
    ? ' 한국 쪽으로 확대하면 나머지가 나타납니다.'
    : ' 확대하면 겹친 이름표가 갈라집니다.';
  return `지금 화면에는 ${s}곳만 이름이 붙어 있습니다 — ${why.join(' · ')}입니다.${how}`;
}

/** 솎는 **규칙**. 아직 한 번도 안 그린 카드(레이어 카드)는 지금 개수를 모른다 — 규칙을 적는다.
 *  상한은 상수에서 읽는다(여기에 숫자를 적지 않는다). */
export function floodThinRuleNote(total) {
  const n = Number.isFinite(total) ? total : 0;
  return `연안 시군구 ${n}곳 가운데, 겹치는 원반은 가립니다`
    + `(한 화면에 폰 ${FLOOD_DISC_MAX_PHONE}곳 · 큰 화면 ${FLOOD_DISC_MAX_DESKTOP}곳까지). `
    + `깊은 곳이 먼저 남고, 한국 쪽으로 확대하면 나머지가 나타납니다.`;
}

/**
 * 시군구 하나를 받기 시작할 때 카드에 적는 한 줄. **민글자**를 돌려준다 — 넣는 쪽이 이스케이프한다
 * (이름은 기관 자료에서 온다).
 *
 * ⚠️ 2026-09-21 반박 검증: 이 글이 없어서, **지구에서 원반을 누르는 주 경로**가 시군구 코드('46770')를
 *    그대로 찍고 용량도 말하지 않았다. 카드 안 단추로 들어가는 길에는 단추 글자에 '· 약 33 MB' 고지가
 *    붙어 있었으니, 이번 개편의 주 경로가 오히려 더 불친절했다. 두 길이 **이 함수 하나**를 쓴다.
 */
export function floodDistrictLoadingNote({ name, bytes } = {}) {
  const who = name == null || name === '' ? '' : `${String(name)} `;
  const size = floodSizeNote(bytes);
  return `${who}침수 예상도를 불러오는 중…${size ? ` · ${size}` : ''}`;
}

/** 못 받았을 때의 한 줄. '자료가 없다'와 '못 받았다' 두 갈래가 **같은 말**을 쓰게 한 자리에 둔다. */
export const FLOOD_DISTRICT_FAIL_NOTE = '침수 자료를 불러오지 못했습니다 — 그리지 않습니다.';

/** 내려받을 용량을 미리 말한다(실측 크기가 있을 때만). */
export function floodSizeNote(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  const t = mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
  return bytes >= FLOOD_HEAVY_BYTES ? `약 ${t} — 이동통신망에서는 오래 걸립니다` : `약 ${t}`;
}

/* ── 그리기 ──────────────────────────────────────────────────────────────────── */

const _p = new (globalThis.Float64Array)(2);

/**
 * createFloodDiscs({ THREE, surfR, ramp, horizonOpacity, llToV3, ... })
 *   surfR(lat, lon, lift)   그 자리의 지표 반지름. LiveLayers.surfR 을 그대로 받는다.
 *   ramp(m)                 깊이(m) → [r,g,b] 0~255. live-layers.js 의 FLOOD_RAMP 를 **그대로** 받는다.
 *   horizonOpacity(p, cam)  지평선 흐림. live-layers.js 의 newsChipOpacity 를 그대로 받는다(식을 베끼지 않는다).
 *   llToV3(lat, lon, r)     경위도 → 장면 좌표. live-layers.js 의 것을 그대로 받는다 —
 *                           식을 베껴 두면 한쪽이 바뀌는 날 원반만 엉뚱한 자리에 남는다.
 * 돌려주는 것: { object, tick(camera), pick({x,y}), shown(), total(), dispose() }
 */
export function createFloodDiscs({
  THREE, specs, surfR, ramp, horizonOpacity, llToV3,
  doc = globalThis.document,
  // 폰은 화면이 좁아 원반을 더 적게 놓는다. 화면 폭으로 본다 — UA 문자열을 여기까지 끌고 오지 않는다.
  isPhone = () => (globalThis.innerWidth > 0 && globalThis.innerWidth < 768),
  getViewport = (out) => {
    out.w = globalThis.innerWidth > 0 ? globalThis.innerWidth : 0;
    out.h = globalThis.innerHeight > 0 ? globalThis.innerHeight : 0;
  },
} = {}) {
  if (!THREE || typeof surfR !== 'function' || typeof ramp !== 'function'
      || typeof horizonOpacity !== 'function' || typeof llToV3 !== 'function') {
    throw new Error('[flood-discs] THREE · surfR · ramp · horizonOpacity · llToV3 가 모두 있어야 한다');
  }
  const list = Array.isArray(specs) ? specs : [];
  const group = new THREE.Group();
  group.name = 'khoa-flood-discs';
  const sprites = [];
  const texes = [];
  const view = { w: 0, h: 0 };
  const _wp = new THREE.Vector3();
  const _cp = new THREE.Vector3();
  // 화면 자리 — tick 이 적고 pick 이 읽는다(obs-labels 와 같은 얼개).
  const px = new Float32Array(list.length);
  const py = new Float32Array(list.length);
  const onScreen = new Uint8Array(list.length);
  // 지난번에 솎을 때의 화면 자리 — 이만큼도 안 움직였으면 다시 솎지 않는다(깜빡임 가드).
  const lastX = new Float32Array(list.length);
  const lastY = new Float32Array(list.length);
  let haveLast = false;
  let lastW = 0;
  let lastH = 0;
  let shownCount = 0;
  // 이번 tick 의 **화면 안 후보** 수 — 지평선 너머·투영 밖을 걸러낸 뒤 솎기에 들어간 수다.
  // 카드가 '겹쳐서 가렸다'와 '화면 밖이다'를 가르려면 이 수가 있어야 한다(floodHiddenNote).
  let onScreenCount = 0;
  // 지금 면이 떠 있는 시군구. 화면은 그 면이 **어디 것인지** 계속 말해야 한다 —
  // 카드는 다음 클릭에 덮이지만 지구 위 이름표는 안 덮인다. 그래서 이것만은 솎아 내지 않는다.
  let selectedCode = null;

  for (const spec of list) {
    const { tex, w, h } = discTexture(doc, THREE, spec, ramp);
    texes.push(tex);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, sizeAttenuation: false,
      // 뉴스 네모칸과 같은 이유로 깊이 검사를 끈다(live-layers.js makeNewsChip 주석) —
      // 지구 전체 축척에서는 화면과 나란한 판의 절반이 구면 안쪽으로 들어가 잘린다.
      // 지구 뒤편은 horizonOpacity 로 직접 감춘다.
      depthTest: false,
    }));
    spr.userData.baseAspect = w / h;
    spr.scale.set((w / h) * FLOOD_DISC_SCALE, FLOOD_DISC_SCALE, 1);
    spr.position.copy(llToV3(spec.lat, spec.lon, surfR(spec.lat, spec.lon, 0.004)));
    spr.renderOrder = 8;
    spr.frustumCulled = false;
    spr.visible = false;              // 첫 tick 이 자리를 정하기 전에는 그리지 않는다
    spr.userData.floodDisc = spec;
    group.add(spr);
    sprites.push(spr);
  }

  /** 매 프레임: 겹치는 원반을 솎고(화면 좌표), 지평선 너머를 흐린다. */
  function tick(camera) {
    if (!camera || !sprites.length) return;
    getViewport(view);
    if (!(view.w > 0) || !(view.h > 0)) return;
    camera.updateMatrixWorld();
    // ⚠️ 판의 자리는 matrixWorld 에서 읽는다. 그런데 이 tick 은 **그리기 전에** 불린다 —
    //    렌더러가 장면의 행렬을 갱신하기 전이라, 갓 세운 원반의 matrixWorld 는 아직 단위행렬이다.
    //    그대로 읽으면 전부 (0,0,0) 이 되고 지평선 판정에서 모조리 떨어져 **하나도 안 뜬다**(시험이 잡았다).
    //    뉴스 네모칸은 onBeforeRender(그리는 중)라서 이 문제가 없었다.
    group.updateMatrixWorld(true);
    const e = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse).elements;
    _cp.setFromMatrixPosition(camera.matrixWorld);
    const cand = [];
    const facing = new Uint8Array(sprites.length);
    let moved = view.w !== lastW || view.h !== lastH;   // 화면 크기가 바뀌면 버킷 격자가 통째로 달라진다
    for (let i = 0; i < sprites.length; i += 1) {
      const spr = sprites[i];
      _wp.setFromMatrixPosition(spr.matrixWorld);
      // 멀리서 볼 때(카메라가 판보다 높다)는 지평선 흐림 그대로 — 가장자리가 부드럽게 사라진다.
      // 가까이 내려와 카메라가 판보다 낮아지면 그 식은 늘 0 을 낸다. 그때는 '가려졌나'만 본다.
      const pl = Math.hypot(_wp.x, _wp.y, _wp.z);
      const cl = Math.hypot(_cp.x, _cp.y, _cp.z);
      const alpha = (cl > 0 && pl < cl) ? horizonOpacity(_wp, _cp) : (floodDiscClear(_wp, _cp) ? 1 : 0);
      if (alpha <= 0.02 || !projectPx(e, _wp.x, _wp.y, _wp.z, view.w, view.h, _p)) {
        // 지구 뒤편 — 솎기 후보도 아니다. 이번에 사라진 것이 있으면 다시 솎아야 한다.
        if (onScreen[i]) moved = true;
        onScreen[i] = 0;
        spr.visible = false;
        continue;
      }
      px[i] = _p[0]; py[i] = _p[1];
      facing[i] = 1;
      spr.material.opacity = alpha;
      // 자리 다툼의 순서: 깊은 곳이 먼저(specs 가 이미 그 순서다). 같은 깊이면 앞에 온 쪽.
      // 면이 떠 있는 시군구는 −1 — 무엇보다 먼저 자리를 갖는다.
      const sel = selectedCode != null && list[i].sggCd === selectedCode;
      cand.push({ x: _p[0], y: _p[1], key: sel ? -1 : i, _i: i });
      spr.scale.setX((spr.userData.baseAspect) * FLOOD_DISC_SCALE * (sel ? 1.12 : 1));
      spr.scale.setY(FLOOD_DISC_SCALE * (sel ? 1.12 : 1));
      // ⚠️ 지난번에 안 보이던 판은 lastX 가 NaN 이다 — 비교가 전부 false 라 제 힘으로는 '움직였다'가 못 된다.
      //    막 돌아 들어온 판이 자기 자리를 못 얻는 일이 없도록 먼저 본다.
      if (!moved && (!Number.isFinite(lastX[i])
        || Math.abs(_p[0] - lastX[i]) > FLOOD_RECULL_PX || Math.abs(_p[1] - lastY[i]) > FLOOD_RECULL_PX)) {
        moved = true;
      }
    }
    // 화면 안 후보 수는 **솎기 전에** 정해진다. 아래의 깜빡임 가드로 일찍 돌아가더라도 이 수는 이번 tick 의 것이다.
    onScreenCount = cand.length;
    // 아무 원반도 문턱만큼 안 움직였으면 지난번에 뽑은 것을 그대로 쓴다 —
    // 버킷 격자는 화면에 고정돼 있어, 다시 솎을 때마다 겹치지도 않는 이름표가 깜빡인다(obs-labels 의 교훈).
    if (!moved && haveLast) {
      for (let i = 0; i < sprites.length; i += 1) sprites[i].visible = onScreen[i] === 1;
      return;
    }
    for (const c of cand) sprites[c._i].visible = false;       // 일단 끄고, 뽑힌 것만 켠다
    const max = isPhone() ? FLOOD_DISC_MAX_PHONE : FLOOD_DISC_MAX_DESKTOP;
    const cellW = FLOOD_DISC_PX * 3.4;      // 원반 + 이름의 실제 폭에 맞춘 버킷(글자가 길어 가로로 넓다)
    const cellH = FLOOD_DISC_PX * 1.5;
    const got = thinPoints(cand, {
      w: view.w, h: view.h, max,
      cell: { w: cellW, h: cellH },
      box: { w: cellW * 0.92, h: cellH * 0.9 },
    });
    onScreen.fill(0);
    shownCount = 0;
    for (const k of got.picked) {
      const i = cand[k]._i;
      sprites[i].visible = true;
      onScreen[i] = 1;
      shownCount += 1;
    }
    // 솎기에서 떨어졌더라도, 면이 떠 있는 시군구의 이름표는 남긴다.
    if (selectedCode != null) {
      for (const c of cand) {
        if (list[c._i].sggCd !== selectedCode || onScreen[c._i]) continue;
        sprites[c._i].visible = true;
        onScreen[c._i] = 1;
        shownCount += 1;
      }
    }
    for (let i = 0; i < sprites.length; i += 1) { lastX[i] = facing[i] ? px[i] : NaN; lastY[i] = facing[i] ? py[i] : NaN; }
    lastW = view.w; lastH = view.h; haveLast = true;
  }

  /** 화면 좌표로 원반 하나를 잡는다. 지금 **떠 있는** 것만 잡힌다 — 안 보이는 것을 누를 수는 없다.
   *  ⚠️ 원 하나로 판정하지 않는다. 판은 '원반 + 시군구 이름'이라 가로로 길다(고흥군이면 100px 넘는다) —
   *     원으로 재면 이름 쪽을 누른 사람이 빗나간다. 판 자체의 네모에 여유를 더해 잰다. */
  function pick({ x, y } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (!(lastH > 0)) return null;                    // 아직 한 번도 안 그렸다 — 판의 크기를 모른다
    const halfH = (FLOOD_DISC_SCALE * lastH) / 2;     // sizeAttenuation:false → 화면 높이 대비 비율이 곧 CSS px
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < sprites.length; i += 1) {
      if (!onScreen[i] || !sprites[i].visible) continue;
      const sel = selectedCode != null && list[i].sggCd === selectedCode;
      const hh = halfH * (sel ? 1.12 : 1);
      const hw = hh * sprites[i].userData.baseAspect;
      const dx = Math.abs(px[i] - x);
      const dy = Math.abs(py[i] - y);
      if (dx > hw + FLOOD_PICK_SLOP_PX || dy > hh + FLOOD_PICK_SLOP_PX) continue;
      // 여러 판이 겹치면 가운데에 가까운 쪽 — 화면 폭이 다른 판끼리도 견줄 수 있게 반폭으로 나눈다
      const d = (dx / hw) ** 2 + (dy / hh) ** 2;
      if (d < bestD) { bestD = d; best = list[i]; }
    }
    return best;
  }

  return {
    object: group,
    tick,
    pick,
    /** 지금 면이 떠 있는 시군구를 표시해 둔다(null 이면 해제).
     *  ⚠️ 깜빡임 가드(haveLast)를 함께 푼다 — 안 그러면 카메라가 멈춰 있는 동안 고른 시군구의
     *  이름표가 영영 안 뜬다. 누르면 카메라가 날아가지만, 이미 그 자리에 있으면 안 움직인다(시험이 잡았다). */
    setSelected(code) {
      const next = code == null ? null : String(code);
      if (next !== selectedCode) haveLast = false;
      selectedCode = next;
    },
    selected: () => selectedCode,
    shown: () => shownCount,
    /** 이번 tick 의 화면 안 후보 수 — 카드가 '겹쳐서 가린 것'과 '화면 밖'을 가르는 데 쓴다. */
    onScreen: () => onScreenCount,
    total: () => list.length,
    specs: () => list,
    dispose() {
      for (const t of texes) t.dispose();
      for (const s of sprites) s.material.dispose();
    },
  };
}

/** 원반 하나의 텍스처 — 어두운 판 + 구간색 원반 + 시군구 이름. (makeNewsChip 의 몸통과 같은 문법) */
function discTexture(doc, THREE, spec, ramp) {
  const S = 2;                       // 레티나에서 또렷하게 — 2배로 그리고 절반 크기로 보인다
  // ⚠️ 한글 폰트를 반드시 지정한다 — 안 하면 안드로이드·윈도우에서 대체 폰트로 떨어진다
  const font = `600 ${12 * S}px "Noto Sans KR", -apple-system, "Apple SD Gothic Neo", system-ui, sans-serif`;
  const probe = doc.createElement('canvas').getContext('2d');
  probe.font = font;
  const rgb = ramp(spec.depthLow);
  const fill = `rgb(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])})`;
  const dotR = 6 * S;
  const padL = 9 * S;
  const gap = 7 * S;
  const padR = 11 * S;
  const lw = 1.5 * S;
  const c = doc.createElement('canvas');
  c.width = Math.ceil(padL + dotR * 2 + gap + probe.measureText(spec.text).width + padR);
  c.height = FLOOD_DISC_PX * S;
  const x = c.getContext('2d');
  const r = 9 * S;
  const bw = c.width - lw;
  const bh = c.height - lw;
  x.beginPath();
  x.moveTo(lw / 2 + r, lw / 2);
  x.arcTo(lw / 2 + bw, lw / 2, lw / 2 + bw, lw / 2 + bh, r);
  x.arcTo(lw / 2 + bw, lw / 2 + bh, lw / 2, lw / 2 + bh, r);
  x.arcTo(lw / 2, lw / 2 + bh, lw / 2, lw / 2, r);
  x.arcTo(lw / 2, lw / 2, lw / 2 + bw, lw / 2, r);
  x.closePath();
  x.fillStyle = 'rgba(10,14,20,0.86)';
  x.fill();
  x.lineWidth = lw;
  x.strokeStyle = fill;              // 테두리도 구간색 — 작게 보일 때 색이 먼저 읽힌다
  x.stroke();
  // 구간색 원반
  x.beginPath();
  x.arc(padL + dotR, c.height / 2, dotR, 0, Math.PI * 2);
  x.closePath();
  x.fillStyle = fill;
  x.fill();
  x.font = font;                     // 캔버스 크기를 바꾸면 컨텍스트가 초기화된다 — 폰트를 다시 준다
  x.textBaseline = 'middle';
  x.fillStyle = '#eef3f8';
  x.fillText(spec.text, padL + dotR * 2 + gap, c.height / 2 + S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return { tex, w: c.width, h: c.height };
}
