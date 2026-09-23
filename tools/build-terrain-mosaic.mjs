/* 전지구 지형 고도맵 한 장 굽기 — AWS Terrain Tiles(Terrarium) z타일을 한 장으로 잇고 **무손실** WebP 로 낸다.
 *
 * 왜 (2026-09-23 PD 승인 · docs/PERF-LTE-PLAN-2026-09-23.md V2-1):
 *   v2 폰 첫 화면이 Terrarium z4 타일 256장(18.54 MB, "지형 데이터 로딩 N/256")을 S3 에서 http/1.1 로 받느라
 *   LTE 에서 로더가 21.5 s 걸렸다. 폰은 z3 한 장(2048×2048)을 우리 CloudFront(v2 번들)에서 받게 한다.
 *
 * 앱과 **같은 것**을 굽는다 — 앱이 이 한 장을 타일 자리에 그대로 그릴 수 있어야 한다:
 *   · 주소: prototype/v2-three/js/main.js TILE_URL(:139) 과 같은 호스트·템플릿
 *   · 배치: main.js loadTerrariumHeightCanvas 의 ctx.drawImage(img, x*256, y*256)(:192) —
 *           XYZ 체계, x = 서→동(180°W 부터), y = 북→남(0행 = 북위 85.0511°), 행 우선
 *   · 해독: h = R*256 + G + B/256 − 32768 (m). 빨강 1 차이 = 256 m 라 **반드시 무손실**.
 *
 * 앱과 **다른 것** (일부러):
 *   · 앱은 실패 타일을 rgb(128,0,0)(=0 m)으로 채운다(살아 있는 화면이라서). 구운 자산은 그러면 안 된다 —
 *     재시도 후에도 한 장이라도 못 받으면 **중단**한다. 0 m 로 칠한 바다·산을 자산에 굳히지 않는다.
 *
 * 검증 (하나라도 어긋나면 파일을 남기지 않고 실패):
 *   1. RIFF 안에 VP8L(무손실) 덩어리가 있고 VP8 (손실)·ICCP(색 변환 유발)가 없다
 *   2. WebP 를 다시 풀어 모든 화소의 RGB 가 이은 원본과 바이트 단위로 같다
 *   3. 높이가 말이 된다 — 전역 최고·최저 범위, 그린란드 정상·에베레스트·마리아나·태평양 한가운데 부호.
 *      (배치를 뒤집으면 그린란드가 남빙양에 가서 여기서 걸린다)
 *
 * 도구: node 24 (전역 fetch) + pngjs(이미 설치됨) 로 받고·풀고·잇는다.
 *       node 에는 WebP 인코더가 없어서 인코딩·재해독만 python Pillow(libwebp)에 맡긴다.
 *       PNG 해독기(pngjs)와 WebP 해독기(libwebp)가 서로 다른 구현이라 비교가 자기 확인이 되지 않는다.
 *
 * 쓰는 법:
 *   node tools/build-terrain-mosaic.mjs                         # z3 → prototype/v2-three/assets/terrain/terrarium-z3.webp
 *   node tools/build-terrain-mosaic.mjs --zoom 4 --out build/perf-investigation/terrarium-z4.webp
 *   --regress <png>   이은 결과를 기존 모자이크 PNG 와 화소 단위로 대조(예: build/perf-investigation/z3-mosaic.png)
 *
 * 받는 쪽은 공개 S3(elevation-tiles-prod) 읽기뿐이다. AWS 에 쓰지 않는다. 배포하지 않는다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- 인자 ------------------------------------------------------------------
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : dflt;
};
const ZOOM = Number(arg('--zoom', '3'));
if (!Number.isInteger(ZOOM) || ZOOM < 0 || ZOOM > 5) {
  console.error('--zoom 은 0~5 정수만 받는다 (5 = 8192², 폰 텍스처 한도를 넘는다)');
  process.exit(2);
}
const OUT = path.resolve(ROOT, arg('--out', `prototype/v2-three/assets/terrain/terrarium-z${ZOOM}.webp`));
const RECEIPT = OUT.replace(/\.webp$/i, '') + '.receipt.json';
const REGRESS = arg('--regress', null);

// ---- 출처 (앱과 같은 것) -----------------------------------------------------
// main.js:139 TILE_URL 과 글자 그대로 같아야 한다. 바꾸면 앱이 그리던 것과 다른 것을 굽게 된다.
const URL_TEMPLATE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const tileUrl = (z, x, y) => URL_TEMPLATE.replace('{z}', z).replace('{x}', x).replace('{y}', y);
const ATTRIBUTION_DOC = 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md';
const ATTRIBUTION_RAW = 'https://raw.githubusercontent.com/tilezen/joerd/master/docs/attribution.md';
const REGISTRY_URL = 'https://registry.opendata.aws/terrain-tiles/';
const REGISTRY_RAW = 'https://raw.githubusercontent.com/awslabs/open-data-registry/main/datasets/terrain-tiles.yaml';

// joerd docs/attribution.md 의 '***Required attribution:***' 첫 블록 — 2026-09-23 원문을 받아 옮긴 사본.
// 실행할 때마다 원문을 다시 받아 그것을 쓰고, 못 받을 때만 이 사본을 쓴다(영수증에 어느 쪽인지 적는다).
// 지어낸 문구가 아니다. 두 번째 블록('Mapzen's hosted service')은 '* Mapzen' 한 줄이 더 붙는 변형이다 —
// 이 자산은 Mapzen 호스팅 서비스(tile.mapzen.com, 종료)가 아니라 AWS 공개 버킷에서 받으므로 첫 블록을 쓴다.
const ATTRIBUTION_EMBEDDED_2026_09_23 = `* ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and
  funded under National Science Foundation awards 1043681, 1559691, and 1542736;
* Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017;
* Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM)
  Österreich;
* Canada terrain data contains information licensed under the Open Government
  Licence – Canada;
* Europe terrain data produced using Copernicus data and information funded by the
  European Union - EU-DEM layers;
* Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration
* Mexico terrain data source: INEGI, Continental relief, 2016;
* New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New
  Zealand and the New Zealand Government (All rights reserved);
* Norway terrain data © Kartverket;
* United Kingdom terrain data © Environment Agency copyright and/or database right
  2015. All rights reserved;
* United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data
  courtesy of the U.S. Geological Survey.`;

// 블록 안의 줄바꿈된 항목을 항목 하나 = 문자열 하나로 편다.
const attributionItems = (block) => block
  .split(/\n(?=\* )/)
  .map((s) => s.replace(/^\* /, '').replace(/\s*\n\s*/g, ' ').trim())
  .filter(Boolean);

// ---- 받기 ------------------------------------------------------------------
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBytes(url, { tries = 4, timeoutMs = 30000 } = {}) {
  let lastErr = null;
  for (let t = 0; t < tries; t += 1) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      clearTimeout(timer);
      return {
        buf,
        etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'),
        contentType: res.headers.get('content-type'),
      };
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      await sleep(500 * 2 ** t);   // 0.5 · 1 · 2 · 4 s
    }
  }
  throw new Error(`${url} — ${tries}회 모두 실패: ${lastErr && lastErr.message}`);
}

async function fetchAttribution() {
  try {
    const { buf } = await fetchBytes(ATTRIBUTION_RAW, { tries: 2, timeoutMs: 20000 });
    const md = buf.toString('utf8');
    const at = md.indexOf('***Required attribution:***');
    const m = at >= 0 ? /```\s*\n([\s\S]*?)\n```/.exec(md.slice(at)) : null;
    if (!m) throw new Error('Required attribution 블록을 찾지 못함');
    return { text: m[1].trim(), from: 'live', docSha256: sha256(buf) };
  } catch (e) {
    console.warn(`[attribution] 원문을 못 받아 2026-09-23 사본을 쓴다: ${e.message}`);
    return { text: ATTRIBUTION_EMBEDDED_2026_09_23, from: 'embedded-copy-2026-09-23', docSha256: null };
  }
}

async function fetchManagedBy() {
  try {
    const { buf } = await fetchBytes(REGISTRY_RAW, { tries: 2, timeoutMs: 20000 });
    const m = /^ManagedBy:\s*"?([^"\n]+)"?\s*$/m.exec(buf.toString('utf8'));
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

// PNG IHDR: 비트 깊이(24)·색 형식(25). Terrarium 은 8비트 RGB(2) 여야 한다.
function pngHeader(buf) {
  const sig = buf.subarray(0, 8).toString('hex');
  if (sig !== '89504e470d0a1a0a') throw new Error('PNG 서명이 아니다');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), depth: buf[24], colorType: buf[25] };
}

// ---- 높이 --------------------------------------------------------------------
const hAt = (rgb, W, x, y) => {
  const i = (y * W + x) * 3;
  return rgb[i] * 256 + rgb[i + 1] + rgb[i + 2] / 256 - 32768;
};
// main.js heightAtJs(:2579-2585) 와 같은 투영: u = (lon+180)/360, v = 0.5 − ln(tan(π/4 + lat/2)) / 2π
const pixOf = (W, latDeg, lonDeg) => {
  const u = (((lonDeg + 180) / 360) % 1 + 1) % 1;
  const latC = (Math.max(-85.0511, Math.min(85.0511, latDeg)) * Math.PI) / 180;
  const v = 0.5 - Math.log(Math.tan(Math.PI / 4 + latC / 2)) / (2 * Math.PI);
  return { x: Math.min(W - 1, Math.floor(u * W)), y: Math.min(W - 1, Math.max(0, Math.floor(v * W))) };
};
const around = (rgb, W, latDeg, lonDeg, r, pick) => {
  const { x, y } = pixOf(W, latDeg, lonDeg);
  let best = pick === 'max' ? -Infinity : Infinity;
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      const yy = Math.min(W - 1, Math.max(0, y + dy));
      const xx = ((x + dx) % W + W) % W;
      const h = hAt(rgb, W, xx, yy);
      best = pick === 'max' ? Math.max(best, h) : Math.min(best, h);
    }
  }
  return best;
};

// ---- python (Pillow/libwebp) 인코딩·재해독 --------------------------------------
const PY = String.raw`
import sys, json, hashlib, struct
import numpy as np
from PIL import Image, features
raw_path, W, out_path = sys.argv[1], int(sys.argv[2]), sys.argv[3]
import PIL
res = {'pillow': PIL.__version__}
res['webpSupported'] = bool(features.check('webp'))
res['libwebp'] = features.version('webp') if res['webpSupported'] else None
if not res['webpSupported']:
    print(json.dumps(res)); sys.exit(0)
src = np.fromfile(raw_path, dtype=np.uint8)
assert src.size == W * W * 3, ('raw size', src.size)
src = src.reshape(W, W, 3)
im = Image.fromarray(src, 'RGB')
params = dict(lossless=True, quality=100, method=6, exact=True)
im.save(out_path, 'WEBP', **params)
res['params'] = params
# RIFF 덩어리 목록 — VP8L 이 있어야 무손실이다. 'VP8 ' 은 손실, ICCP 가 있으면 브라우저가 색을 바꿀 수 있다.
b = open(out_path, 'rb').read()
assert b[:4] == b'RIFF' and b[8:12] == b'WEBP', 'not RIFF/WEBP'
chunks, i = [], 12
while i + 8 <= len(b):
    cc = b[i:i+4].decode('latin1'); n = struct.unpack('<I', b[i+4:i+8])[0]
    chunks.append(cc); i += 8 + n + (n & 1)
res['riffChunks'] = chunks
dec_im = Image.open(out_path)
res['decodedFormat'] = dec_im.format
res['decodedMode'] = dec_im.mode
res['decodedSize'] = list(dec_im.size)
dec = np.asarray(dec_im.convert('RGB'))
eq = dec.shape == src.shape and bool(np.array_equal(dec, src))
res['pixelsEqual'] = eq
res['mismatchedPixels'] = int(np.any(dec != src, axis=-1).sum()) if dec.shape == src.shape else None
res['rgbSha256'] = hashlib.sha256(dec.tobytes()).hexdigest()
rgba = np.concatenate([dec, np.full(dec.shape[:2] + (1,), 255, np.uint8)], axis=-1)
res['rgbaSha256'] = hashlib.sha256(rgba.tobytes()).hexdigest()
print(json.dumps(res))
`;

function findPython() {
  for (const exe of ['python', 'python3', 'py']) {
    const r = spawnSync(exe, ['-c', 'import PIL, numpy; print(PIL.__version__)'], { encoding: 'utf8' });
    if (r.status === 0) return exe;
  }
  return null;
}

// ---- 본체 --------------------------------------------------------------------
async function main() {
  const t0 = Date.now();
  const n = 1 << ZOOM;
  const W = n * 256;
  const total = n * n;
  console.log(`z${ZOOM}: 타일 ${total}장 → ${W}×${W}  (${URL_TEMPLATE})`);

  const py = findPython();
  if (!py) throw new Error('python + Pillow + numpy 가 필요하다 (WebP 인코딩·재해독)');

  // 1. 받기 — 동시 8개, 재시도 4회. 한 장이라도 끝내 못 받으면 중단한다(0 m 로 채우지 않는다).
  const fetchedAt = new Date().toISOString();
  const coords = [];
  for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) coords.push([x, y]);
  const tiles = new Array(coords.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < coords.length) {
      const k = next; next += 1;
      const [x, y] = coords[k];
      const url = tileUrl(ZOOM, x, y);
      const r = await fetchBytes(url);
      tiles[k] = { x, y, url, ...r };
      done += 1;
      if (done % 16 === 0 || done === total) process.stdout.write(`  받음 ${done}/${total}\r`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, coords.length) }, worker));
  process.stdout.write('\n');

  // 2. 풀고 잇기 — main.js:192 ctx.drawImage(img, x*256, y*256) 와 같은 자리
  const rgb = Buffer.alloc(W * W * 3);
  for (const t of tiles) {
    const hdr = pngHeader(t.buf);
    if (hdr.width !== 256 || hdr.height !== 256 || hdr.depth !== 8 || (hdr.colorType !== 2 && hdr.colorType !== 6)) {
      throw new Error(`${t.url}: 256×256 8비트 RGB 가 아니다 ${JSON.stringify(hdr)}`);
    }
    const png = PNG.sync.read(t.buf);            // 항상 RGBA 로 나온다
    const d = png.data;
    for (let py0 = 0; py0 < 256; py0 += 1) {
      let s = py0 * 256 * 4;
      let o = ((t.y * 256 + py0) * W + t.x * 256) * 3;
      for (let px = 0; px < 256; px += 1, s += 4, o += 3) {
        if (d[s + 3] !== 255) throw new Error(`${t.url}: 투명 화소가 있다 (${px},${py0}) — 높이로 쓸 수 없다`);
        rgb[o] = d[s]; rgb[o + 1] = d[s + 1]; rgb[o + 2] = d[s + 2];
      }
    }
    t.png = hdr;
    t.sha256 = sha256(t.buf);
  }

  // 2b. (선택) 기존 모자이크 PNG 와 대조 — 계획서의 3.79 MB 가 잰 바로 그 그림인지
  let regression = null;
  if (REGRESS) {
    const refPath = path.resolve(ROOT, REGRESS);
    const ref = PNG.sync.read(fs.readFileSync(refPath));
    let diff = 0;
    if (ref.width !== W || ref.height !== W) diff = -1;
    else {
      for (let i = 0, j = 0; i < W * W; i += 1, j += 4) {
        const o = i * 3;
        if (ref.data[j] !== rgb[o] || ref.data[j + 1] !== rgb[o + 1] || ref.data[j + 2] !== rgb[o + 2]) diff += 1;
      }
    }
    regression = {
      against: path.relative(ROOT, refPath).replace(/\\/g, '/'),
      mismatchedPixels: diff,
      result: diff === 0 ? 'PASS' : 'FAIL',
      note: diff === 0 ? '오늘 받은 타일로 이은 그림이 기존 모자이크와 화소 단위로 같다'
        : '다르다 — 원본 타일이 그 사이 바뀌었거나 배치가 다르다. 배치 먼저 의심',
    };
    console.log(`회귀 대조(${regression.against}): ${regression.result} · 다른 화소 ${diff}`);
  }

  // 3. 높이 검사 — 배치·해독이 맞는지 (앱의 heightAtJs 투영 그대로)
  // ⚠️ 원본 타일에 에베레스트(8,849 m)보다 높은 화소가 있다 — 2026-09-23 실측: z4 에 11,500 m · 9,727 m
  //    (72.38N 78.79W, 배핀섬 북부. 실제 최고봉은 약 2,100 m), z3 에 7,796 m(68.17N 66.71W, 배핀섬).
  //    원본 자료의 가짜 봉우리다. 값을 바꾸지 않는다(굽는 도구가 자료를 고치면 출처가 거짓이 된다) —
  //    대신 위치를 영수증에 남긴다. 그래서 전역 최고값에 상한을 두지 않는다(두면 z4 가 실패한다).
  const EVEREST_M = 8849;
  const latOfRow = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / W))) * 180) / Math.PI;
  const lonOfCol = (x) => ((x + 0.5) / W) * 360 - 180;
  const at = (i) => ({ lat: +latOfRow(Math.floor(i / W)).toFixed(3), lon: +lonOfCol(i % W).toFixed(3) });
  let hMin = Infinity; let hMax = -Infinity; let land = 0; let iMin = 0; let iMax = 0; let bNonZero = 0;
  const aboveEverest = [];
  for (let i = 0; i < W * W; i += 1) {
    const o = i * 3;
    const h = rgb[o] * 256 + rgb[o + 1] + rgb[o + 2] / 256 - 32768;
    if (h < hMin) { hMin = h; iMin = i; }
    if (h > hMax) { hMax = h; iMax = i; }
    if (h > 0) land += 1;
    if (rgb[o + 2] !== 0) bNonZero += 1;
    if (h > EVEREST_M && aboveEverest.length < 50) aboveEverest.push({ heightM: h, ...at(i) });
  }
  const r = ZOOM >= 4 ? 3 : 2;
  const probes = [
    { name: '그린란드 빙상 정상 부근 72.58N 38.46W', h: around(rgb, W, 72.58, -38.46, r, 'max'), want: '> 2000', ok: (h) => h > 2000 },
    { name: '에베레스트 부근 27.99N 86.93E', h: around(rgb, W, 27.99, 86.93, r, 'max'), want: '> 4500', ok: (h) => h > 4500 },
    { name: '마리아나 해구 11.37N 142.59E', h: around(rgb, W, 11.37, 142.59, r, 'min'), want: '< -5500', ok: (h) => h < -5500 },
    { name: '태평양 한가운데 0N 140W', h: around(rgb, W, 0, -140, 0, 'min'), want: '< -3000', ok: (h) => h < -3000 },
    { name: '남극 내륙 80S 0E', h: around(rgb, W, -80, 0, 0, 'max'), want: '> 1500', ok: (h) => h > 1500 },
  ].map((p) => ({ name: p.name, heightM: Math.round(p.h), want: p.want, pass: p.ok(p.h) }));
  // 배치 검사는 위 지점들이 한다. 전역 범위는 '높은 산과 깊은 해구가 둘 다 있다'만 본다(최저는 해구보다 깊을 수 없다).
  const globalOk = hMax >= 5000 && hMin <= -7000 && hMin >= -11100;
  console.log(`높이 범위 ${hMin.toFixed(1)} (${JSON.stringify(at(iMin))}) ~ ${hMax.toFixed(1)} m (${JSON.stringify(at(iMax))}) · 육지 ${(land / (W * W) * 100).toFixed(2)} %`);
  if (aboveEverest.length) console.log(`  ⚠ 에베레스트보다 높은 화소 ${aboveEverest.length}개(원본 자료의 가짜 봉우리): ${JSON.stringify(aboveEverest.slice(0, 5))}`);
  for (const p of probes) console.log(`  ${p.pass ? 'PASS' : 'FAIL'} ${p.name}: ${p.heightM} m (${p.want})`);
  if (!globalOk || probes.some((p) => !p.pass)) throw new Error('높이 검사 실패 — 배치(행 순서·x 방향)나 해독이 틀렸다. 파일을 남기지 않는다');

  // 4. 인코딩·재해독 (python Pillow/libwebp)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'earthus-terrain-'));
  const rawPath = path.join(tmp, `z${ZOOM}.rgb`);
  const pyPath = path.join(tmp, 'enc.py');
  const tmpOut = path.join(tmp, `z${ZOOM}.webp`);
  fs.writeFileSync(rawPath, rgb);
  fs.writeFileSync(pyPath, PY);
  console.log('WebP 무손실 인코딩(method 6 · quality 100 · exact)…');
  const pr = spawnSync(py, [pyPath, rawPath, String(W), tmpOut], { encoding: 'utf8', maxBuffer: 1 << 20 });
  if (pr.status !== 0) throw new Error(`python 실패: ${pr.stderr}`);
  const enc = JSON.parse(pr.stdout.trim().split('\n').pop());
  if (!enc.webpSupported) {
    // WebP 무손실이 불가능한 환경일 때만 PNG 로 떨어진다(요청 사양). 지금은 여기서 멈추고 알린다.
    throw new Error('이 Pillow 는 WebP 를 못 쓴다 — PNG 대체본이 필요하면 따로 결정할 것');
  }
  const riffOk = enc.riffChunks.includes('VP8L') && !enc.riffChunks.includes('VP8 ') && !enc.riffChunks.includes('ICCP');
  console.log(`  RIFF 덩어리 ${enc.riffChunks.join(',')} → ${riffOk ? 'PASS (VP8L 무손실 · ICCP 없음)' : 'FAIL'}`);
  console.log(`  재해독 RGB 전 화소 일치: ${enc.pixelsEqual ? 'PASS' : 'FAIL'} (다른 화소 ${enc.mismatchedPixels})`);
  const srcRgbSha = sha256(rgb);
  const shaOk = enc.rgbSha256 === srcRgbSha;
  if (!riffOk || !enc.pixelsEqual || !shaOk) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error('무손실 검사 실패 — 파일을 남기지 않는다');
  }

  // 5. 내보내기 + 영수증
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.copyFileSync(tmpOut, OUT);
  fs.rmSync(tmp, { recursive: true, force: true });
  const outBuf = fs.readFileSync(OUT);
  const [attr, managedBy] = await Promise.all([fetchAttribution(), fetchManagedBy()]);

  const lastMods = tiles.map((t) => t.lastModified).filter(Boolean).map((s) => new Date(s)).sort((a, b) => a - b);
  const srcBytes = tiles.reduce((a, t) => a + t.buf.length, 0);
  const receipt = {
    schemaVersion: 'earthus.provider-receipt.v1',
    product: `EARTHUS v2 전지구 지형 고도맵 한 장 (AWS Terrain Tiles · Terrarium z${ZOOM} · 무손실 WebP)`,
    generatedAt: new Date().toISOString(),
    generator: 'tools/build-terrain-mosaic.mjs',
    synthetic: false,
    meaning: `Terrarium z${ZOOM} 타일 ${total}장을 앱 캔버스와 같은 배치로 이은 ${W}×${W} 웹메르카토르 고도맵. 값은 바꾸지 않았다.`,
    source: {
      name: 'AWS Terrain Tiles (Terrarium)',
      bucket: 's3://elevation-tiles-prod (us-east-1)',
      urlTemplate: URL_TEMPLATE,
      sameAsApp: 'prototype/v2-three/js/main.js TILE_URL (:139)',
      registry: REGISTRY_URL,
      managedBy: managedBy || null,
      license: ATTRIBUTION_DOC,
      zoom: ZOOM,
      tileCount: total,
      tileSizePx: 256,
      sourceBytesTotal: srcBytes,
      fetchedAt,
      tileLastModified: lastMods.length ? { oldest: lastMods[0].toISOString(), newest: lastMods[lastMods.length - 1].toISOString() } : null,
      tiles: tiles.map((t) => ({ x: t.x, y: t.y, bytes: t.buf.length, sha256: t.sha256, etag: t.etag, lastModified: t.lastModified })),
    },
    encoding: {
      scheme: 'Terrarium RGB',
      decode: 'h = R*256 + G + B/256 - 32768 (m)',
      step: 'R 1 = 256 m · G 1 = 1 m · B 1 = 1/256 m — 손실 압축 금지',
      channels: 'RGB 8bit, alpha 없음',
    },
    projection: {
      crs: 'EPSG:3857 Web Mercator (XYZ 타일 체계)',
      lonRangeDeg: [-180, 180],
      latRangeDeg: [-85.0511287798, 85.0511287798],
      uv: 'u = (lon+180)/360 · v = 0.5 − ln(tan(π/4 + lat/2)) / 2π (main.js mercatorUV :238-242, heightAtJs :2579-2581)',
      rowOrder: '0행 = 북쪽 끝(85.0511°N), 아래로 갈수록 남쪽. 텍스처 flipY=false 로 그대로 올린다(main.js :2313)',
      equatorGroundKmPerPx: +(40075.016686 / W).toFixed(2),
    },
    layout: {
      width: W,
      height: W,
      rule: `타일 (x,y) → 화소 (x*256, y*256). x 0..${n - 1} = 180°W 부터 동쪽, y 0..${n - 1} = 북→남. 행 우선.`,
      sameAsApp: 'prototype/v2-three/js/main.js loadTerrariumHeightCanvas: ctx.drawImage(img, x * 256, y * 256) (:192)',
    },
    heights: {
      minM: +hMin.toFixed(3),
      minAt: at(iMin),
      maxM: +hMax.toFixed(3),
      maxAt: at(iMax),
      aboveEverestPx: aboveEverest,
      aboveEverestNote: aboveEverest.length
        ? '에베레스트(8,849 m)보다 높은 화소 = 원본 타일의 가짜 봉우리. 값은 고치지 않고 그대로 담았다(출처 그대로).'
        : null,
      landPixelPct: +(land / (W * W) * 100).toFixed(3),
      landPixelPctNote: '메르카토르 화소 수 기준이라 고위도(남극·그린란드)가 부풀려진 값이다. 면적 비율이 아니다.',
      bChannelNonZeroPx: bNonZero,
      precisionNote: bNonZero === 0 ? '이 단계 타일은 B 채널이 전부 0 — 값이 정수 m 다.' : null,
      probes,
      note: `z${ZOOM} 화소 하나가 적도에서 약 ${(40075.016686 / W).toFixed(1)} km 라 봉우리·해구는 원 DEM 보다 얕게 나온다(타일 자체의 값이다).`,
    },
    output: {
      file: path.relative(ROOT, OUT).replace(/\\/g, '/'),
      format: 'WebP lossless (VP8L)',
      bytes: outBuf.length,
      sha256: sha256(outBuf),
      riffChunks: enc.riffChunks,
      encoder: { pillow: enc.pillow, libwebp: enc.libwebp, params: enc.params },
    },
    losslessCheck: {
      result: 'PASS',
      method: 'libwebp 로 다시 풀어(Pillow) pngjs 로 이은 원본과 전 화소 RGB 바이트 비교 + RGB sha256 대조 + RIFF 에 VP8L 존재·VP8 /ICCP 부재',
      mismatchedPixels: enc.mismatchedPixels,
      rgbSha256: enc.rgbSha256,
      rgbaSha256: enc.rgbaSha256,
      browserCheck: '앱에서 캔버스에 1:1 로 그린 뒤 getImageData(0,0,W,W).data 의 sha256 이 rgbaSha256 과 같아야 한다(알파 255)',
    },
    regression,
    modifications: `값 변경 없음. 원본 PNG 타일 ${total}장을 한 장으로 이어 무손실 WebP 로 다시 담았다. 모든 화소의 RGB 바이트가 원본과 같음을 확인했다. (GMTED2010 이용 조건 '수정했다면 그 종류를 밝힌다'에 대한 기재)`,
    attribution: {
      required: attributionItems(attr.text),
      textSource: attr.from,
      doc: ATTRIBUTION_DOC,
      docSha256: attr.docSha256,
      fetchedAt: new Date().toISOString(),
      note: "joerd attribution.md 의 'Required attribution' 첫 블록. 두 번째 블록(Mapzen 호스팅 서비스용)은 '* Mapzen' 한 줄이 더 붙는다 — 이 자산은 AWS 공개 버킷에서 받았다. 앱의 현재 표기는 index.html:1859 'AWS Terrain Tiles (Terrarium)' 한 줄뿐이다.",
    },
    buildSeconds: +((Date.now() - t0) / 1000).toFixed(1),
  };
  fs.writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2) + '\n');
  console.log(`\n${path.relative(ROOT, OUT)}  ${outBuf.length.toLocaleString()} B  sha256 ${receipt.output.sha256}`);
  console.log(`${path.relative(ROOT, RECEIPT)}`);
  console.log(`원본 타일 합계 ${srcBytes.toLocaleString()} B → ${outBuf.length.toLocaleString()} B (${(outBuf.length / srcBytes * 100).toFixed(1)} %) · ${receipt.buildSeconds} s`);
}

main().catch((e) => {
  console.error(`\n실패: ${e.message}`);
  process.exit(1);
});
