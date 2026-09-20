// EARTHUS v2 — 공용 GFS 프레임 저장소 (DEV-DIRECTIVE 2026-09-20 · W0 마지막 항목 = W1~W4 공통 선행 · 작업 A1)
//
// 무엇이 없어 있었나: GFS 프레임 로더가 구름 전용이었다. main.js 의 CloudManager.loadGfs 가 매니페스트를
// 직접 읽었고 c/w/p 프레임만 알았다 — 구름이 GFS 모드일 때만 프레임 목록이 생겼다. 그래서 타임라인이
// 구름·강수·태풍 경로·서울 혼잡에만 묶여 있었고, W0 이 운영 S3 에 올려 둔 기온(t)·10 m 바람(u)·
// 해면기압(m)·누적강수(a) 프레임을 읽을 길이 어디에도 없었다.
//
// 무엇을 만드나: **매니페스트 하나 · 프레임 캐시 하나 · 시간 하나.**
//   · 매니페스트 — clouds/gfs-fc/manifest.json 을 한 번 읽는다. 다시 부르면 generatedAt 이 바뀌었을 때만
//     갈아 끼운다(같은 런은 3시간마다 같은 폴더에 다시 구워진다 — handler.py).
//   · 프레임 캐시 — GPU 텍스처와 CPU 사본을 한 항목에 둔다. 바이트 상한이 있는 LRU. 같은 프레임을
//     여러 곳이 동시에 청하면 한 번만 받는다.
//   · 시간 — 모든 필드가 **유효 시각(ms)** 하나로 찾는다(bracket). 구름의 '프레임 번호 × stepMs' 가 아니다:
//     필드 프레임은 스텝이 빠질 수 있고(빠진 것은 매니페스트에 없다) 누적강수는 f000 이 아예 없다.
//
// 값은 물리량이다. 8bit 값 하나가 0.5°C · 0.5 hPa 이므로 색 관리·감마·알파 선곱이 끼면 값이 바뀐다.
//   · 디코드 상수(scale · offset · logLo · logSpan)는 **매니페스트 fields{} 에서만** 읽는다. 이 파일에 숫자로
//     박지 않는다 — 기압 눈금은 곧 바뀐다. 표를 바꾸면 값이 따라 바뀌는 것을 시험이 잠근다.
//   · 옛 프레임 3종(cloud · wind700 · precip)은 fields{} 에 없다(encoding{} 의 사람이 읽는 글뿐이다).
//     그래서 sampleAt 은 이 셋을 풀지 않고 **가장 가까운 칸의 바이트를 그대로** 돌려준다(decoded:false).
//     푸는 식은 지금처럼 main.js CloudManager.sampleAt · precip-field.js 에 있다. 매니페스트가 fields{} 에
//     이 id 를 싣는 날에는 코드 수정 없이 풀린다.
//
// 격자: 행 0 = 북위 90 · 열 0 = 서경 180. 칸 (열 c, 행 r) 은 lon0 + c·dLon , lat0 + r·dLat **그 점의 값**이다
//   (GFS 0.5° 는 점 격자 — 720×361 · 361행이라 두 극이 다 들어 있다). 서울(37.5N,127E) = 행 105 · 열 614.
//   운영 프레임으로 확인했다(2026-09-20 00Z t000.png: 그 칸 22.0°C · 위아래를 뒤집어 읽으면 12.5°C).
//   크기는 매니페스트 grid 에서 읽는다. 받은 그림의 크기가 grid 와 다르면(브라우저가 옛 세대 프레임을
//   쥐고 있던 전례 — main.js loadGfs 주석) 값을 읽지 않는다: 엉뚱한 곳의 값을 말하느니 없다고 한다.
//
// GPU 텍스처는 기존 구름 프레임(main.js CloudManager.frameTex)과 **같은 길**로 만든다:
//   ImageLoader(HTMLImageElement) → THREE.Texture · flipY 는 건드리지 않는다(THREE 기본 true = 그림 첫 행(북)이
//   v=1). 구름·강수 셰이더의 uv(v = lat/π + 0.5)와 같은 방향이다. 위아래가 뒤집히면 남반구가 북반구에 그려진다.
//   createImageBitmap(colorSpaceConversion:'none' · premultiplyAlpha:'none')을 검토했고 쓰지 않았다:
//     ① 운영 프레임 7종의 PNG 청크는 IHDR·IDAT·IEND 뿐이다(실측) — gAMA·iCCP·sRGB 가 없으니 브라우저가
//        바꿀 색이 없다. NoColorSpace 텍스처는 three 가 UNPACK_COLORSPACE_CONVERSION 을 NONE 으로 올린다.
//     ② three 는 ImageBitmap 에서 flipY 를 무시한다(imageOrientation 으로 따로 뒤집어야 한다). 구름과 다른
//        방향 규칙이 하나 더 생기고, 이 작업은 화면 없이 시험만으로 합쳐지므로 확인할 길이 없다.
//     ③ 새 필드 넷(gray8 · rgb8)은 알파가 없어 선곱이 값을 깎을 수 없다.
//   CPU 사본은 같은 그림을 willReadFrequently 캔버스에 그려 읽는다(기존 CloudManager.sampleAt 과 같은 방식).
//   ⚠️ 구름 프레임(회색+알파)만은 캔버스의 알파 선곱 때문에 알파가 작은 칸의 회색(운정고도)이 무뎌진다.
//      기존 sampleAt 도 같은 한계를 갖고 있고 여기서 고치지 않았다 — 새 필드에는 해당이 없다.
//
// 이 파일은 DOM · THREE 를 import 하지 않는다. THREE · fetch · 그림 받기 · 픽셀 읽기를 전부 주입받는다 —
// tools/earthus-v53/gfs-frames.test.mjs 가 가짜를 넣어 그대로 부른다. 계산은 순수 함수로 밖에 냈다.

export const GFS_BASE = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';
export const GFS_PREFIX = 'clouds/gfs-fc';
// 예전 main.js loadGfs 가 읽던 바로 그 주소다(aws/gfs-cloud-forecast/tests 가 이 글자를 찾는다).
const MANIFEST_PATH = 'clouds/gfs-fc/manifest.json';

// 필드 id → 매니페스트 steps[] 의 키. 옛 셋은 키 이름이 id 와 다르다(file · wind · precip) — 개명하지 않는다.
// 새 넷은 fields{}.stepKey 가 말해 주고, 없으면 id 가 곧 키다. 'wind' 는 700hPa 4° 가 이미 쓰고 있어
// 10 m 바람은 'wind10' 이다(handler.py FIELD_FILES 주석).
export const FRAME_STEP_KEY = Object.freeze({
  cloud: 'file', wind700: 'wind', precip: 'precip',
  temp: 'temp', wind10: 'wind10', mslp: 'mslp', apcp: 'apcp',
});
export const GFS_FIELD_IDS = Object.freeze(Object.keys(FRAME_STEP_KEY));

// 런이 이보다 늙으면 '지연'(지시서 W3 범례). GFS 는 6시간마다 돌고 발표 뒤 4~5시간이면 f120 까지 올라온다
// (실측: 00Z 런 → 04:56Z 생성). 정상이면 나이는 11시간을 넘지 않는다 — 12시간을 넘으면 한 런을 걸렀다.
export const RUN_DELAY_HOURS = 12;

// 캐시 상한(바이트). 720×361 한 장은 받은 그림·GPU 에서 RGBA ≈ 1.04 MB, CPU 사본은 쓰는 채널만 남겨
// 회색 0.26 MB · 바람 0.52 MB 다. 41스텝 × 4필드를 다 쥐면 170 MB 가 넘는다 — 폰에서는 탭이 죽는다.
//   데스크톱 128 MB ≈ 기온 + 10 m 바람 5일치(41 × 1.30 + 41 × 1.56 = 117 MB)를 재생 중에 다시 받지 않는 크기.
//   폰 32 MB ≈ 24장 — 지금 시각 앞뒤 하루 반. 그 밖은 다시 받는다(프레임은 immutable 이라 HTTP 캐시에서 온다).
export const GFS_FRAMES_BUDGET = Object.freeze({ desktop: 128 * 1024 * 1024, phone: 32 * 1024 * 1024 });

// 어느 상한을 쓸지. main.js 의 isMobileUA 와 같은 정규식이다 — 기기 판정을 두 벌로 만들지 않으려고.
// deviceMemory 는 크롬 계열만 준다(없으면 UA 만 본다). 4 GB 이하 기기는 데스크톱 UA 여도 폰 상한을 쓴다.
export function budgetFor(nav) {
  const ua = (nav && nav.userAgent) || '';
  const mem = nav && Number(nav.deviceMemory);
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return GFS_FRAMES_BUDGET.phone;
  if (Number.isFinite(mem) && mem > 0 && mem <= 4) return GFS_FRAMES_BUDGET.phone;
  return GFS_FRAMES_BUDGET.desktop;
}

// ---------------------------------------------------------------- 매니페스트 읽기 (순수)

// 프레임 주소. 같은 런은 같은 폴더에 덮어쓴다 — 파일 이름이 그대로라 브라우저가 옛 프레임을 계속 썼다
// (실측: 격자 720 인데 이미지 360). 생성시각을 붙여 세대를 가른다. main.js loadGfs 에 있던 규칙을 그대로
// 옮겼다: 글자 하나라도 다르면 구름 프레임의 HTTP 캐시가 통째로 빗나간다(시험이 옛 식과 같은지 본다).
export function frameUrlOf(base, prefix, token, rel) {
  const gen = encodeURIComponent(token || '');
  return `${base}/${prefix}/${rel}${gen ? `?g=${gen}` : ''}`;
}

const CHANNEL_INDEX = Object.freeze({ R: 0, G: 1, B: 2, A: 3 });

// 채널 하나의 디코드 식이 우리가 아는 꼴인가. 모르는 꼴이면 풀지 않는다(값을 지어내지 않는다).
function readChannel(name, c) {
  if (!c || !(name in CHANNEL_INDEX)) return null;
  if (c.transfer === 'linear' && Number.isFinite(c.scale) && Number.isFinite(c.offset)) {
    return { name, idx: CHANNEL_INDEX[name], transfer: 'linear', scale: c.scale, offset: c.offset,
      min: c.min, max: c.max, clamped: !!c.clamped, component: c.component || null };
  }
  if (c.transfer === 'log10' && Number.isFinite(c.logLo) && Number.isFinite(c.logSpan)) {
    return { name, idx: CHANNEL_INDEX[name], transfer: 'log10', logLo: c.logLo, logSpan: c.logSpan,
      zeroByte: Number.isFinite(c.zeroByte) ? c.zeroByte : 0, min: c.min, max: c.max, component: c.component || null };
  }
  return null;
}

// 바이트 → 물리량. linear: byte × scale + offset · log10: zeroByte 는 0, 아니면 10^(byte/255 × logSpan + logLo).
// handler.py field_specs() 의 풀이 그대로다.
export function decodeByte(ch, byte) {
  if (ch.transfer === 'linear') return byte * ch.scale + ch.offset;
  if (byte === ch.zeroByte) return 0;
  return 10 ** ((byte / 255) * ch.logSpan + ch.logLo);
}

function readGrid(g, inherit) {
  if (!g || !(g.ni > 0) || !(g.nj > 0)) return null;
  const lon0 = Number.isFinite(g.lon0) ? g.lon0 : (inherit ? inherit.lon0 : NaN);
  const lat0 = Number.isFinite(g.lat0) ? g.lat0 : (inherit ? inherit.lat0 : NaN);
  const dLon = Number(g.dLon);
  // 위도는 북→남이다. 본 격자는 dLat 을 음수(−0.5)로, windGrid 는 양수(4)로 적는다 — 크기만 쓴다.
  const dLat = Math.abs(Number(g.dLat));
  if (![lon0, lat0, dLon, dLat].every(Number.isFinite) || !(dLon > 0) || !(dLat > 0)) return null;
  return { ni: g.ni, nj: g.nj, lon0, lat0, dLon, dLat, wraps: Math.abs(g.ni * dLon - 360) < 1e-6 };
}

// 매니페스트 → 저장소가 쓰는 모양. schema 가 없는 옛 매니페스트(W0 이전)도 읽힌다 — 그때 새 필드는 '없음'이고
// runs[] 는 빈 목록이다(그 런 폴더에는 매니페스트 사본이 없다 — handler.py merge_runs).
export function readManifest(mf, opts = {}) {
  if (!mf || !Array.isArray(mf.steps)) return null;
  const base = opts.base || GFS_BASE;
  const prefix = opts.prefix || GFS_PREFIX;
  // 세대를 가르는 글자. generatedAt 이 없으면(아주 옛 매니페스트) run 으로 가른다 — 옛 loadGfs 와 같은 순서.
  const token = mf.generatedAt || mf.run || '';
  const grid = readGrid(mf.grid, null);
  const specs = (mf.fields && typeof mf.fields === 'object') ? mf.fields : {};
  const ids = [...new Set([...GFS_FIELD_IDS, ...Object.keys(specs)])];
  const fields = {};
  const frames = {};
  for (const id of ids) {
    const spec = specs[id] || null;
    const stepKey = (spec && spec.stepKey) || FRAME_STEP_KEY[id] || id;
    // 격자: 새 필드는 fields{}.grid 가 '본 격자와 같다'(sameAs:'grid')고 말한다. 700hPa 바람만 따로
    // 4° 묶음 평균 파일이다(windGrid · 90×46) — 시작점은 본 격자와 같고 한 칸이 8×8 점의 평균이다.
    let g = grid;
    let cell = 'point';
    if (spec && spec.grid && grid) {
      g = (spec.grid.ni === grid.ni && spec.grid.nj === grid.nj) ? grid : readGrid(spec.grid, grid);
    } else if (!spec && id === 'wind700' && mf.windGrid) {
      g = readGrid(mf.windGrid, grid);
      cell = 'block';
    }
    let channels = null;
    if (spec && spec.channels && typeof spec.channels === 'object') {
      const read = Object.keys(spec.channels).map((name) => readChannel(name, spec.channels[name]));
      channels = read.every(Boolean) && read.length ? read : null;
    }
    const list = [];
    for (const st of mf.steps) {
      const rel = st && st[stepKey];
      const t = Date.parse(st && st.valid);
      if (typeof rel !== 'string' || !rel || !Number.isFinite(t)) continue;   // 없는 스텝은 빠진 채로
      const fr = { h: st.h, t, url: frameUrlOf(base, prefix, token, rel) };
      // 누적강수의 구간(GRIB 이 말한 fromH~toH). 키는 handler.py 가 '이름 + Window' 로 적는다.
      const win = st[`${stepKey}Window`];
      if (win && Number.isFinite(win.fromH) && Number.isFinite(win.toH)) fr.window = { fromH: win.fromH, toH: win.toH };
      list.push(Object.freeze(fr));
    }
    list.sort((a, b) => a.t - b.t);
    frames[id] = Object.freeze(list);
    fields[id] = Object.freeze({
      id, stepKey, grid: g, cell,
      channels,                                   // null = 풀 줄 모른다 → 바이트 그대로
      decodable: !!(channels && g),
      windowed: list.some((f) => f.window),       // 구간 누적 — 두 프레임을 시간으로 섞지 않는다
      unit: (spec && spec.unit) || null,
      variable: (spec && spec.variable) || null,
      level: (spec && spec.level) || null,
      note: (spec && spec.note) || null,
    });
  }
  const runs = (Array.isArray(mf.runs) ? mf.runs : [])
    .filter((r) => r && typeof r.tag === 'string' && typeof r.manifest === 'string')
    .map((r) => Object.freeze({
      tag: r.tag, run: r.run || null, runMs: Date.parse(r.run),
      manifestUrl: `${base}/${prefix}/${r.manifest}`,
      generatedAt: r.generatedAt || null, frames: r.frames != null ? r.frames : null,
      current: r.tag === mf.runTag,
    }));
  return Object.freeze({
    manifest: mf, token, base, prefix,
    schema: Number.isFinite(mf.schema) ? mf.schema : 1,
    model: mf.model || 'GFS',
    run: mf.run || null, runMs: Date.parse(mf.run), runTag: mf.runTag || null,
    generatedAt: mf.generatedAt || null,
    stepMs: (mf.stepHours || 3) * 3.6e6,
    resolutionDeg: Number.isFinite(mf.resolutionDeg) ? mf.resolutionDeg : (grid ? grid.dLon : null),
    grid, fields: Object.freeze(fields), frames: Object.freeze(frames), runs: Object.freeze(runs),
  });
}

// ---------------------------------------------------------------- 시간 (순수)

// 유효 시각 tMs 를 끼고 있는 두 프레임. 범위 밖이면 **끝 프레임**을 주고 outOfRange 로 밝힌다 —
// 지어내 연장하지 않는다. 빠진 스텝이 있으면 a·b 사이가 3시간보다 넓다(gapH) — 그 사이 보간은 더 무디다.
export function bracketFrames(frames, tMs) {
  if (!frames || !frames.length || !Number.isFinite(tMs)) return null;
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (tMs < first.t) return { a: first, b: first, mix: 0, exact: false, outOfRange: 'before', gapH: 0 };
  if (tMs > last.t) return { a: last, b: last, mix: 0, exact: false, outOfRange: 'after', gapH: 0 };
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {                       // t <= tMs 인 마지막 프레임
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= tMs) lo = mid; else hi = mid - 1;
  }
  const a = frames[lo];
  if (a.t === tMs || lo === frames.length - 1) return { a, b: a, mix: 0, exact: true, outOfRange: null, gapH: 0 };
  const b = frames[lo + 1];
  return { a, b, mix: (tMs - a.t) / (b.t - a.t), exact: false, outOfRange: null, gapH: b.h - a.h };
}

// 런 나이. 시계는 받는다(시험이 고정한다). 못 읽는 run 은 null — '지연 아님'으로 읽히면 안 된다.
export function runAgeOf(runIso, nowMs, limitH = RUN_DELAY_HOURS) {
  const runMs = Date.parse(runIso);
  if (!Number.isFinite(runMs) || !Number.isFinite(nowMs)) return null;
  const ageH = (nowMs - runMs) / 3.6e6;
  return { runMs, ageH, limitH, delayed: ageH > limitH };
}

// ---------------------------------------------------------------- 격자에서 값 읽기 (순수)

// RGBA 그림에서 쓰는 채널만 남긴다. 회색 필드는 R 하나면 된다 — 사본이 1/4 로 준다(LRU 가 네 배 더 담는다).
export function compactPixels(rgba, w, h, idxs) {
  const n = idxs.length;
  const out = new Uint8Array(w * h * n);
  for (let p = 0, o = 0, s = 0; p < w * h; p += 1, s += 4) {
    for (let k = 0; k < n; k += 1) { out[o] = rgba[s + idxs[k]]; o += 1; }
  }
  return out;
}

// 점 격자의 경도 랩 bilinear. 입자 이류가 프레임마다 수천 번 부른다 — 객체를 만들지 않고 out 에 쓴다.
//   경도: 360° 를 덮는 격자는 열 ni−1 과 열 0 사이를 잇는다(날짜변경선에서 입자가 끊기지 않는다).
//   위도: 행 0(북극)·행 nj−1(남극)에서 멈춘다. 극 너머를 지어내지 않는다.
function bilinearInto(out, px, grid, channels, lat, lon, weight, add) {
  const { ni, nj } = grid;
  let gx = (lon - grid.lon0) / grid.dLon;
  let x0;
  let x1;
  if (grid.wraps) {
    gx -= Math.floor(gx / ni) * ni;                    // [0, ni)
    x0 = Math.floor(gx) % ni;
    x1 = (x0 + 1) % ni;
  } else {
    gx = Math.max(0, Math.min(ni - 1, gx));
    x0 = Math.floor(gx);
    x1 = Math.min(ni - 1, x0 + 1);
  }
  const fx = gx - Math.floor(gx);
  const gy = Math.max(0, Math.min(nj - 1, (grid.lat0 - lat) / grid.dLat));
  const y0 = Math.floor(gy);
  const y1 = Math.min(nj - 1, y0 + 1);
  const fy = gy - y0;
  const n = px.channels;
  const d = px.data;
  const o00 = (y0 * ni + x0) * n;
  const o10 = (y0 * ni + x1) * n;
  const o01 = (y1 * ni + x0) * n;
  const o11 = (y1 * ni + x1) * n;
  for (let k = 0; k < channels.length; k += 1) {
    const ch = channels[k];
    // 풀고 나서 섞는다. 선형 식은 어느 쪽이든 같지만 log 식은 다르다 — 0 mm 와 8 mm 의 가운데는 4 mm 다.
    const v = (decodeByte(ch, d[o00 + k]) * (1 - fx) + decodeByte(ch, d[o10 + k]) * fx) * (1 - fy)
            + (decodeByte(ch, d[o01 + k]) * (1 - fx) + decodeByte(ch, d[o11 + k]) * fx) * fy;
    out[k] = add ? out[k] + v * weight : v * weight;
  }
}

// 풀 줄 모르는 프레임: 가장 가까운 칸. 점 격자는 반올림, 묶음 평균(700hPa 4°)은 그 점이 든 묶음이다.
function nearestOffset(px, grid, cell, lat, lon) {
  const { ni, nj } = grid;
  const gx = (lon - grid.lon0) / grid.dLon;
  const gy = (grid.lat0 - lat) / grid.dLat;
  let x = cell === 'block' ? Math.floor(gx) : Math.round(gx);
  let y = cell === 'block' ? Math.floor(gy) : Math.round(gy);
  x = grid.wraps ? ((x % ni) + ni) % ni : Math.max(0, Math.min(ni - 1, x));
  y = Math.max(0, Math.min(nj - 1, y));
  return (y * ni + x) * px.channels;
}

// ---------------------------------------------------------------- LRU (순수)

// 바이트 상한이 있는 LRU. Map 의 넣은 순서가 곧 쓰인 순서다(만질 때마다 뺐다 다시 넣는다).
// 방금 넣거나 만진 항목은 상한을 넘어도 남긴다 — 한 장이 상한보다 크다고 아무것도 못 쥐면 안 된다.
export class ByteLru {
  constructor(maxBytes, onEvict) {
    this.maxBytes = maxBytes;
    this.onEvict = onEvict || null;
    this.map = new Map();
    this.bytes = 0;
    this.evictions = 0;
  }

  get size() { return this.map.size; }

  has(key) { return this.map.has(key); }

  get(key) {
    const e = this.map.get(key);
    if (!e) return undefined;
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key, value, bytes) {
    const old = this.map.get(key);
    if (old) { this.bytes -= old.bytes; this.map.delete(key); }
    this.map.set(key, { value, bytes });
    this.bytes += bytes;
    this.trim();
  }

  // 같은 항목이 커졌다(CPU 사본이 뒤늦게 붙었다).
  resize(key, bytes) {
    const e = this.map.get(key);
    if (!e) return;
    this.bytes += bytes - e.bytes;
    e.bytes = bytes;
    this.map.delete(key);
    this.map.set(key, e);
    this.trim();
  }

  trim() {
    while (this.bytes > this.maxBytes && this.map.size > 1) {
      const [key, e] = this.map.entries().next().value;   // 가장 오래 안 쓰인 것
      this.map.delete(key);
      this.bytes -= e.bytes;
      this.evictions += 1;
      if (this.onEvict) this.onEvict(e.value, key);
    }
  }

  clear() {
    for (const [key, e] of this.map) if (this.onEvict) this.onEvict(e.value, key);
    this.map.clear();
    this.bytes = 0;
  }
}

// ---------------------------------------------------------------- 텍스처 설정

// 값 텍스처의 설정. 기존 구름 프레임(main.js CloudManager.texDefaults + frameTex)과 같은 값이다:
//   NoColorSpace(값이지 색이 아니다) · LinearFilter(하드웨어 보간 = 값 보간, 8bit 1채널 선형이라 성립한다) ·
//   밉맵 없음(확대해서만 쓴다 — 업로드 비용과 메모리 34% 만 낸다) · 경도 Repeat / 위도 Clamp.
// ⚠️ flipY · premultiplyAlpha 는 **건드리지 않는다**. THREE 기본(flipY true · 선곱 false)이 기존 프레임과 같은
//    방향·같은 값이다. 여기서 flipY=false 를 주면 남반구가 북반구에 그려진다(main.js 의 flipY=false 들은
//    DataTexture · 캔버스 타일이라 행 순서가 다른 경우다 — 베껴 오지 말 것).
export function applyValueTextureDefaults(THREE, tex) {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- 저장소

// deps: { THREE, fetch, loadImage(url)→Promise<image>, readPixels(image)→{w,h,data(RGBA)}, now()→ms,
//         maxBytes, base, prefix, manifestUrl }
//   전부 선택이다. 브라우저에서는 THREE 만 주면 된다. fetch 는 부를 때마다 globalThis.fetch 를 찾는다 —
//   main.js 가 뒤늦게 installFetchObserver 로 fetch 를 감싸도 그 감싼 것을 탄다(공급자 건강 집계에 잡힌다).
export function createGfsFrames(deps = {}) {
  const base = deps.base || GFS_BASE;
  const prefix = deps.prefix || GFS_PREFIX;
  const manifestUrl = deps.manifestUrl || `${base}/${MANIFEST_PATH}`;
  const now = deps.now || (() => Date.now());
  const doFetch = deps.fetch || ((url, init) => globalThis.fetch(url, init));
  let THREE = deps.THREE || null;

  const loadImage = deps.loadImage || ((url) => new Promise((resolve, reject) => {
    if (!THREE) { reject(new Error('GFS_FRAMES_NEEDS_THREE')); return; }
    // 구름 프레임과 같은 길(TextureLoader 의 속이 ImageLoader 다). anonymous 여야 캔버스로 되읽을 수 있다.
    const loader = new THREE.ImageLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(url, resolve, undefined, reject);
  }));

  let scratch = null;
  const readPixels = deps.readPixels || ((image) => {
    const w = image.naturalWidth || image.width;
    const h = image.naturalHeight || image.height;
    if (!scratch) {
      scratch = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h) : document.createElement('canvas');
    }
    if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h; }
    const g = scratch.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, w, h);
    g.drawImage(image, 0, 0);
    return { w, h, data: g.getImageData(0, 0, w, h).data };
  });

  let model = null;
  let loading = null;
  const inflight = new Map();
  const listeners = new Set();
  const counters = { manifestFetches: 0, frameFetches: 0, swaps: 0 };
  const lru = new ByteLru(deps.maxBytes || budgetFor(globalThis.navigator), (entry) => {
    // 쫓겨난 텍스처를 아직 쥔 렌더러가 있어도 화면은 산다 — three 는 dispose 된 텍스처를 다시 쓰면
    // 그림에서 다시 올린다. 다만 그 장은 더는 이 저장소의 셈에 들지 않는다.
    if (entry.tex && entry.tex.dispose) entry.tex.dispose();
    entry.px = null;
  });

  const need = () => { if (!model) throw new Error('GFS_FRAMES_NOT_LOADED'); return model; };
  const fieldOf = (id) => {
    const f = need().fields[id];
    if (!f) throw new RangeError(`GFS_FRAMES_UNKNOWN_FIELD:${id}`);   // 오타를 '자료 없음'으로 읽지 않게
    return f;
  };
  const frameOf = (id, h) => { fieldOf(id); return model.frames[id].find((f) => f.h === h) || null; };
  const keyOf = (id, h) => `${id}|${h}`;

  // 매니페스트를 읽는다. 돌려주는 것은 **원본 매니페스트**(없으면 null) — 던지지 않는다.
  //   · 동시에 여럿이 불러도 요청은 하나다.
  //   · generatedAt(없으면 run)이 같으면 아무것도 갈아 끼우지 않는다: 프레임 캐시도, 돌려주는 객체도 그대로.
  //   · 바뀌었으면 새 세대로 갈고 캐시를 비운다(주소의 ?g= 가 바뀌어 옛 장은 다시 쓰이지 않는다).
  //   · 다시 읽다 실패하면 쥐고 있던 것을 그대로 둔다 — 한 번의 네트워크 탈로 멀쩡한 5일치를 버리지 않는다.
  function load() {
    if (loading) return loading;
    loading = (async () => {
      let mf = null;
      try {
        counters.manifestFetches += 1;
        const r = await doFetch(manifestUrl, { cache: 'no-cache' });
        if (r && r.ok) mf = await r.json();
      } catch (e) { mf = null; }
      const next = readManifest(mf, { base, prefix });
      if (next && (!model || model.token !== next.token)) {
        const prev = model;
        model = next;
        inflight.clear();
        lru.clear();
        if (prev) {
          counters.swaps += 1;
          for (const fn of listeners) { try { fn(model, prev); } catch (e) { /* 듣는 쪽의 탈이 저장소를 죽이면 안 된다 */ } }
        }
      }
      return model ? model.manifest : null;
    })().finally(() => { loading = null; });
    return loading;
  }

  // 한 프레임 = 그림 한 번 받기. 텍스처와 CPU 사본이 같은 항목을 나눠 쓴다.
  function entryOf(id, h) {
    const fr = frameOf(id, h);
    if (!fr) return Promise.resolve(null);              // 없는 스텝(apcp f000 등)은 오류가 아니다
    const key = keyOf(id, h);
    const hit = lru.get(key);
    if (hit) return Promise.resolve(hit);
    const waiting = inflight.get(key);
    if (waiting) return waiting;
    const born = model;
    counters.frameFetches += 1;
    const pr = Promise.resolve().then(() => loadImage(fr.url)).then((image) => {
      if (inflight.get(key) === pr) inflight.delete(key);
      if (!image || model !== born) return null;        // 받는 사이 세대가 바뀌었다 — 옛 장을 새 캐시에 넣지 않는다
      if (!THREE) throw new Error('GFS_FRAMES_NEEDS_THREE');
      const tex = applyValueTextureDefaults(THREE, new THREE.Texture(image));
      // 받은 그림은 브라우저 메모리에서도 GPU 에서도 RGBA 다(회색 PNG 여도). 상한은 이 크기로 센다.
      const iw = image.naturalWidth || image.width || 0;
      const ih = image.naturalHeight || image.height || 0;
      const entry = { id, h, url: fr.url, tex, px: null, gpuBytes: iw * ih * 4 };
      lru.set(key, entry, entry.gpuBytes);
      return entry;
    }).catch((err) => {
      if (inflight.get(key) === pr) inflight.delete(key);
      // 실패는 캐시하지 않는다 — 다음에 다시 청하면 다시 받는다(기존 frameTexAt 과 같다).
      if (err && err.message === 'GFS_FRAMES_NEEDS_THREE') throw err;
      return null;
    });
    inflight.set(key, pr);
    return pr;
  }

  function attachPixels(entry) {
    if (entry.px) return entry.px;
    const field = model.fields[entry.id];
    let raw;
    try { raw = readPixels(entry.tex.image); } catch (e) { return null; }   // 오염된 캔버스 등 — 없다고 한다
    if (!raw || !raw.data) return null;
    // 풀 줄 아는 필드는 매니페스트가 말한 채널만, 모르는 필드는 RGBA 를 그대로 둔다.
    const names = field.channels ? field.channels.map((c) => c.name) : ['R', 'G', 'B', 'A'];
    const idxs = names.map((nm) => CHANNEL_INDEX[nm]);
    const data = compactPixels(raw.data, raw.w, raw.h, idxs);
    entry.px = Object.freeze({ w: raw.w, h: raw.h, channels: names.length, names: Object.freeze(names), data });
    lru.resize(keyOf(entry.id, entry.h), entry.gpuBytes + data.byteLength);
    return entry.px;
  }

  const gridMatches = (field, px) => !!(field.grid && px && px.w === field.grid.ni && px.h === field.grid.nj);

  // 시간 tMs 의 값을 읽는 함수를 만든다. **동기 · 네트워크 0건** — 두 프레임의 CPU 사본이 이미 캐시에 있을 때만
  // 나온다(없으면 null: ensure() 로 먼저 받는다). 프레임당 한 번 만들고 sample() 을 수천 번 부르는 용도다.
  function sampler(id, tMs) {
    const field = fieldOf(id);
    const br = bracketFrames(model.frames[id], tMs);
    if (!br) return null;
    // 구간 누적(apcp)은 두 프레임을 시간으로 섞지 않는다. a[h] 는 'h 에 끝나는 구간의 양'이라 a 와 b 의
    // 가운데 값은 어느 구간의 양도 아니다. 시각 t 를 덮는 구간은 b 의 것이다(정시면 a = b). W4 가 3시간 양을
    // 따로 셈할 때(a[h] − a[h−3], h%6==0)는 pixels() 두 장으로 직접 한다 — 여기서 지어내지 않는다.
    const timeMix = !field.windowed && br.mix > 0;
    const fa = (field.windowed && br.mix > 0) ? br.b : br.a;
    const ea = lru.get(keyOf(id, fa.h));
    const eb = timeMix ? lru.get(keyOf(id, br.b.h)) : ea;
    const pa = ea && ea.px;
    const pb = eb && eb.px;
    if (!pa || !pb || !gridMatches(field, pa) || !gridMatches(field, pb)) return null;
    const info = {
      id, a: br.a, b: br.b, mix: br.mix, exact: br.exact, outOfRange: br.outOfRange, gapH: br.gapH,
      interpolated: timeMix, window: fa.window || null, decoded: field.decodable,
      unit: field.unit, names: pa.names,
    };
    if (!field.decodable) {
      // 풀 줄 모른다 — 시간도 공간도 섞지 않는다(log 로 눌린 값·종류 부호를 섞으면 없는 값이 된다).
      const p = (timeMix && br.mix >= 0.5) ? pb : pa;
      info.interpolated = false;
      info.sample = (lat, lon, out = []) => {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const o = nearestOffset(p, field.grid, field.cell, lat, lon);
        for (let k = 0; k < p.channels; k += 1) out[k] = p.data[o + k];
        return out;
      };
      return info;
    }
    const chans = field.channels;
    const wa = timeMix ? 1 - br.mix : 1;
    info.sample = (lat, lon, out = []) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      bilinearInto(out, pa, field.grid, chans, lat, lon, wa, false);
      if (timeMix) bilinearInto(out, pb, field.grid, chans, lat, lon, br.mix, true);
      return out;
    };
    return info;
  }

  const api = {
    load,
    get manifest() { return model ? model.manifest : null; },
    get loaded() { return !!model; },
    // 런·격자·세대 — Inspector 의 'GFS 18Z · 5 h ago' 가 읽는다.
    info() {
      if (!model) return null;
      const { schema, model: name, run, runMs, runTag, generatedAt, stepMs, resolutionDeg, grid } = model;
      return { schema, model: name, run, runMs, runTag, generatedAt, stepMs, resolutionDeg, grid };
    },
    fields() { return Object.keys(need().fields); },
    has(id) { return !!(model && model.frames[id] && model.frames[id].length); },
    fieldSpec(id) { return fieldOf(id); },
    // [{h, t(ms), url, window?}] 시간순. 없는 스텝은 빠진 채로 — apcp 는 f000 이 없다.
    framesFor(id) { fieldOf(id); return model.frames[id]; },
    // 매니페스트의 상대 경로 → 받을 주소(?g= 세대 포함). CloudManager.loadGfs 가 구름 프레임 주소를 여기서 만든다.
    frameUrl(rel) { const m = need(); return frameUrlOf(m.base, m.prefix, m.token, rel); },
    // → {a, b, mix, exact, outOfRange:null|'before'|'after', gapH} | null(프레임이 하나도 없다)
    bracket(id, tMs) { fieldOf(id); return bracketFrames(model.frames[id], tMs); },
    // 타임라인 오프셋(지금 + ms) → 유효 시각. 모든 필드가 이 한 시각으로 bracket 을 부른다.
    timeAt(offsetMs = 0) { return now() + offsetMs; },

    // GPU 값 텍스처. 없는 스텝·받기 실패는 null.
    texture(id, h) { return entryOf(id, h).then((e) => (e ? e.tex : null)); },
    textureNow(id, h) { fieldOf(id); const e = lru.get(keyOf(id, h)); return e ? e.tex : null; },
    // CPU 사본 {w, h, channels, names, data(Uint8Array)} — 행 0 = 북, 열 0 = 서경 180.
    pixels(id, h) { return entryOf(id, h).then((e) => (e ? attachPixels(e) : null)); },
    pixelsNow(id, h) { fieldOf(id); const e = lru.get(keyOf(id, h)); return e ? e.px : null; },
    // tMs 를 낀 두 프레임을 받아 둔다(기본은 CPU 사본까지). 그 뒤의 sampler · sampleAt 은 네트워크 0건이다.
    async ensure(id, tMs, opts = {}) {
      fieldOf(id);
      const br = bracketFrames(model.frames[id], tMs);
      if (!br) return null;
      const get = opts.pixels === false ? api.texture : api.pixels;
      await Promise.all(br.a === br.b ? [get(id, br.a.h)] : [get(id, br.a.h), get(id, br.b.h)]);
      return br;
    },
    sampler,
    // 한 점의 값(클릭 판독용). → { value, values[], unit, names, a, b, mix, exact, outOfRange, interpolated,
    //   window, decoded } | null(프레임이 아직 캐시에 없다 · 격자가 안 맞는다). decoded:false 면 values 는 바이트다.
    sampleAt(id, tMs, lat, lon) {
      const s = sampler(id, tMs);
      if (!s) return null;
      const values = s.sample(lat, lon, []);
      if (!values) return null;
      const { sample, ...rest } = s;
      return { ...rest, values, value: values[0] };
    },

    // 최근 런(새 런이 앞 · 최대 4) — Compare '최신 런 | 이전 런'의 재료. schema 1 이면 빈 목록.
    runs() { return need().runs; },
    // 그 런만 읽는 저장소를 따로 연다(캐시도 따로 — 기본은 이 저장소 상한의 절반).
    openRun(tag, opts = {}) {
      const r = need().runs.find((x) => x.tag === tag);
      if (!r) return null;
      return createGfsFrames({ ...deps, THREE, maxBytes: Math.floor(lru.maxBytes / 2), ...opts, manifestUrl: r.manifestUrl });
    },
    // {runMs, ageH, limitH, delayed} | null. 12시간 넘으면 '지연'.
    runAge(nowMs = now()) { return model ? runAgeOf(model.run, nowMs) : null; },

    // 세대가 바뀌면 알린다(fn(새 model, 옛 model)). 쥐고 있던 텍스처는 그때 다시 청해야 한다. 돌려주는 것은 해지 함수.
    onSwap(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    provide(more) { if (more && more.THREE && !THREE) THREE = more.THREE; return api; },
    stats() {
      return { entries: lru.size, bytes: lru.bytes, maxBytes: lru.maxBytes, evictions: lru.evictions,
        inflight: inflight.size, ...counters };
    },
    dispose() { inflight.clear(); lru.clear(); listeners.clear(); },
  };
  return api;
}

// 앱 전체가 나눠 쓰는 하나. 구름(main.js)·색면·입자·클릭 판독이 같은 매니페스트와 같은 캐시를 본다.
// 처음 부르는 쪽이 THREE 를 준다. 나중에 부르는 쪽은 인자 없이 받아도 된다.
let shared = null;
export function sharedGfsFrames(deps) {
  if (!shared) shared = createGfsFrames(deps || {});
  else if (deps) shared.provide(deps);
  return shared;
}
