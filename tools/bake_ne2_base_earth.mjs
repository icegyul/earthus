/* Natural Earth II SR_W 원판을 EARTHUS 원거리 기본 지구 텍스처로 굽는다.
 * 목적: mapped.earth급 대륙 표현 — 풀해상도 기복 음영·강·호수가 이미 구워진
 * 퍼블릭 도메인 지도 데이터에 어두운 그레이딩과 국경선을 더해 사진 없는
 * 데이터 지구 원판을 만든다 (COMPUTE ONCE, SERVE MANY).
 * 입력은 전부 수록 출처가 있는 실데이터다. 수치·지형을 지어내지 않는다. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import UTIF from 'utif';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_TIF = path.join(root, '.tmp/ne2/NE2_50M_SR_W/NE2_50M_SR_W.tif');
const SRC_BORDERS = path.join(root, '.tmp/ne2/borders_50m.geojson');
const SRC_MASK = path.join(root, 'prototype/v2/assets/physical-earth/ocean-specular-mask.png');
const OUT_DIR = path.join(root, 'prototype/v2/assets/physical-earth');

console.log('decode NE2 tif…');
const tifBuffer = fs.readFileSync(SRC_TIF);
const ifds = UTIF.decode(tifBuffer);
UTIF.decodeImage(tifBuffer, ifds[0]);
const srcW = ifds[0].width, srcH = ifds[0].height;
const src = UTIF.toRGBA8(ifds[0]);
console.log('NE2', srcW, 'x', srcH);

/* NE2 원판 자체의 물 색(균일한 연청)을 지도 가장자리에서 플러드필해
 * 풀해상 '외해' 마스크를 만든다. 내륙 호수·강은 채워지지 않아 원색 유지. */
console.log('flood-fill ocean mask…');
const wSample = (x, y) => { const o = (y * srcW + x) * 4; return [src[o], src[o+1], src[o+2]]; };
const isWater = (o) => { const r = src[o], g = src[o+1], b = src[o+2]; return b > g && g >= r - 2 && (b - r) >= 10; };
const ocean = new Uint8Array(srcW * srcH);
{
  const stack = [];
  const push = (x, y) => { const i = y * srcW + x; if (!ocean[i] && isWater(i * 4)) { ocean[i] = 1; stack.push(i); } };
  for (let x = 0; x < srcW; x++) { push(x, 0); push(x, srcH - 1); }
  for (let y = 0; y < srcH; y++) { push(0, y); push(srcW - 1, y); }
  while (stack.length) {
    const i = stack.pop(); const x = i % srcW, y = (i / srcW) | 0;
    if (x > 0) push(x - 1, y); if (x < srcW - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1); if (y < srcH - 1) push(x, y + 1);
    if (x === 0) push(srcW - 1, y); if (x === srcW - 1) push(0, y);
  }
}
console.log('ocean px:', ocean.reduce((a,b)=>a+b,0));

function bake(W, H) {
  const out = Buffer.alloc(W * H * 4);
  const bx = srcW / W, by = srcH / H;
  for (let y = 0; y < H; y++) {
    const sy0 = Math.floor(y * by), sy1 = Math.min(srcH, Math.ceil((y + 1) * by));

    for (let x = 0; x < W; x++) {
      const sx0 = Math.floor(x * bx), sx1 = Math.min(srcW, Math.ceil((x + 1) * bx));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        let o = (sy * srcW + sx0) * 4;
        for (let sx = sx0; sx < sx1; sx++, o += 4) {
          r += src[o]; g += src[o + 1]; b += src[o + 2]; n++;
        }
      }
      r /= n; g /= n; b /= n;
      let on = 0;
      for (let sy = sy0; sy < sy1; sy++) { const row = sy * srcW; for (let sx = sx0; sx < sx1; sx++) on += ocean[row + sx]; }
      const oceanA = on / n;
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      /* 바다: NE2 밝기로 변조한 짙은 남색 (밝기 정보 = NE2의 수심 음영이 있으면 유지) */
      const or_ = 10 + 18 * lum, og = 24 + 34 * lum, ob = 42 + 52 * lum;
      /* 땅: 어둡게 + 약한 탈채도 + 대비 (mapped 톤) */
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      let lr = luma + (r - luma) * 1.28;
      let lg = luma + (g - luma) * 1.28;
      let lb = luma + (b - luma) * 1.28;
      const grade = v => Math.max(0, Math.min(255, ((v - 128) * 1.12 + 128) * 0.70));
      lr = grade(lr); lg = grade(lg); lb = grade(lb);
      const o = (y * W + x) * 4;
      out[o] = Math.round(lr * (1 - oceanA) + or_ * oceanA);
      out[o + 1] = Math.round(lg * (1 - oceanA) + og * oceanA);
      out[o + 2] = Math.round(lb * (1 - oceanA) + ob * oceanA);
      out[o + 3] = 255;
    }
  }
  return out;
}

function drawBorders(buffer, W, H) {
  const geo = JSON.parse(fs.readFileSync(SRC_BORDERS, 'utf8'));
  const put = (x, y, alpha) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    buffer[o] = Math.round(buffer[o] * (1 - alpha) + 236 * alpha);
    buffer[o + 1] = Math.round(buffer[o + 1] * (1 - alpha) + 150 * alpha);
    buffer[o + 2] = Math.round(buffer[o + 2] * (1 - alpha) + 84 * alpha);
  };
  const px = (lon, lat) => [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];
  const line = (a, c) => {
    let [x0, y0] = px(a[0], a[1]).map(Math.round);
    const [x1, y1] = px(c[0], c[1]).map(Math.round);
    if (Math.abs(x1 - x0) > W / 2) return; // 날짜변경선 래핑 스킵
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      put(x0, y0, 0.62);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  for (const f of geo.features) {
    const geom = f.geometry;
    const lines = geom.type === 'LineString' ? [geom.coordinates]
      : geom.type === 'MultiLineString' ? geom.coordinates : [];
    for (const coords of lines)
      for (let i = 1; i < coords.length; i++) line(coords[i - 1], coords[i]);
  }
}

const receipts = {};
/* 타일 피라미드: 단일 대형 텍스처는 비스듬 원거리에서 밉맵 평균색으로 washes.
 * geographic scheme z0=2x1 … z4=32x16 (256px), 총 8192 해상 유지. */
function halve(rgba, W, H) {
  const w = W >> 1, h = H >> 1, out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = ((2 * y) * W + 2 * x) * 4, b = a + 4, c = a + W * 4, d = c + 4, o = (y * w + x) * 4;
    for (let k = 0; k < 3; k++) out[o + k] = (rgba[a + k] + rgba[b + k] + rgba[c + k] + rgba[d + k] + 2) >> 2;
    out[o + 3] = 255;
  }
  return out;
}
function emitTiles(rgba8192) {
  const dir = path.join(OUT_DIR, 'ne2-tiles');
  let level = rgba8192, W = 8192, H = 4096;
  const pyramid = [];
  pyramid[4] = { data: level, W, H };
  for (let z = 3; z >= 0; z--) { level = halve(level, W, H); W >>= 1; H >>= 1; pyramid[z] = { data: level, W, H }; }
  let count = 0;
  for (let z = 0; z <= 4; z++) {
    const { data, W: LW } = pyramid[z];
    const tilesX = 2 << z, tilesY = 1 << z;
    for (let ty = 0; ty < tilesY; ty++) for (let tx = 0; tx < tilesX; tx++) {
      const tile = Buffer.alloc(256 * 256 * 4);
      for (let y = 0; y < 256; y++) {
        const srcO = ((ty * 256 + y) * LW + tx * 256) * 4;
        data.copy(tile, y * 256 * 4, srcO, srcO + 256 * 4);
      }
      const enc = jpeg.encode({ data: tile, width: 256, height: 256 }, 85);
      const tdir = path.join(dir, String(z), String(tx));
      fs.mkdirSync(tdir, { recursive: true });
      fs.writeFileSync(path.join(tdir, ty + '.jpg'), enc.data);
      count++;
    }
  }
  console.log('tiles written:', count);
  return count;
}
let rgba8192 = null;
for (const W of [8192, 4096, 2048]) {
  const H = W / 2;
  console.log('bake', W, 'x', H);
  const rgba = bake(W, H);
  drawBorders(rgba, W, H);
  if (W === 8192) rgba8192 = rgba;
  const encoded = jpeg.encode({ data: rgba, width: W, height: H }, 88);
  const file = `ne2-base-${W}.jpg`;
  fs.writeFileSync(path.join(OUT_DIR, file), encoded.data);
  receipts[file] = {
    sha256: crypto.createHash('sha256').update(encoded.data).digest('hex'),
    bytes: encoded.data.length,
    width: W,
    height: H,
  };
  console.log(file, encoded.data.length, 'bytes');
}
receipts['ne2-tiles'] = { tiles: emitTiles(rgba8192), scheme: 'geographic 256px z0-z4' };
fs.writeFileSync(path.join(OUT_DIR, 'ne2-base.receipt.json'), JSON.stringify({
  schemaVersion: 'earthus.provider-receipt.v1',
  product: 'EARTHUS far-scope data base Earth (baked)',
  generatedAt: new Date().toISOString(),
  synthetic: false,
  meaning: 'NE2 cross-blended hypsometric colors + baked shaded relief + rivers/lakes, dark grade, Natural Earth borders burned in; ocean recolored deep navy via Natural Earth land mask',
  sources: [
    { name: 'Natural Earth II with Shaded Relief and Water 1:50m v2.0', url: 'https://naciscdn.org/naturalearth/50m/raster/NE2_50M_SR_W.zip', license: 'Public domain' },
    { name: 'Natural Earth admin_0 boundary lines land 1:50m', url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_boundary_lines_land.geojson', license: 'Public domain' },
    { name: 'ocean-specular-mask.png (repo asset, Natural Earth polygons)', license: 'Public domain' },
  ],
  outputs: receipts,
}, null, 2));
console.log('receipt written');
