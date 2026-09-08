#!/usr/bin/env node
// EARTHUS EARTH CAPTURE — INTEGRATION-1 §8 · §22 · §31
//
// 리포트에 들어갈 지구 그림을 **실제 EARTHUS V2 런타임**에서 찍는다.
// 서버에서 지구를 다시 그리지 않는다 — 그러면 화면과 다른 지구가 두 개 생긴다
// (aws/distribution/visual.py 의 결정을 그대로 따른다).
//
// 어떻게 그 화면으로 가나
//   main.js 의 linkState()/applyLink() 가 이미 카메라·레이어를 주소로 주고받는다.
//   그 문법을 그대로 쓴다:  #v=1&at=<위도>,<경도>,<거리>,<기울기>&live=<레이어,…>
//   거리는 지구 반경 배수다:  dist = 1 + altKm/6371   (main.js:5857 의 역함수)
//
// ⚠️⚠️ **찍은 뒤 반드시 되읽어 확인한다.**
//    레이어가 실제로 켜졌는지, 카메라가 그 자리인지 확인하지 않으면
//    "아무 지구 사진"에 그럴듯한 메타데이터만 붙는다. 그건 증거가 아니라 장식이다.
//    확인에 실패하면 exit 2 로 끝나고, 그림은 verified:false 로 남는다.
//
// ⚠️ 빈 프레임을 통과시키지 않는다. WebGL 이 소프트웨어 렌더러로 떨어지면 까만 화면이
//    나올 수 있다. 픽셀 분산을 재서 단색이면 실패로 처리한다.
//
// 쓰기
//   node tools/earthus_capture.mjs \
//     --base http://localhost:8777/v2-three/index.html \
//     --link '#v=1&at=20.000,130.000,4.7671,0.000&live=sstfield' \
//     --out build/capture/sst.jpg --meta build/capture/sst.json \
//     --expect-layers sstfield --expect-at 20,130,4.7671

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

const argv = process.argv.slice(2);
const arg = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : dflt;
};
const flag = (name) => argv.includes(`--${name}`);

const BASE = arg('base');
const LINK = arg('link', '');
const OUT = arg('out');
const META = arg('meta');
const W = Number(arg('width', 1280));
const H = Number(arg('height', 720));
const LANG = arg('lang', 'ko');
const SETTLE_MS = Number(arg('settle', 9000));
// ⚠️ 런타임이 프레임률에 따라 pixelRatio 를 0.5 까지 낮춘다(main.js:2395 thermal).
//    헤드리스 소프트웨어 렌더러는 항상 느려서 늘 0.5 로 떨어진다 — 그러면 뷰포트의
//    절반 크기 그림이 나온다. deviceScaleFactor 를 올려 그만큼 되돌린다.
//    화면을 속이는 게 아니라, 같은 화면을 더 촘촘히 그리게 하는 것이다.
const DPR = Number(arg('dpr', 2));
const EXPECT_LAYERS = (arg('expect-layers', '') || '').split(',').filter(Boolean);
const EXPECT_AT = (arg('expect-at', '') || '').split(',').map(Number).filter((n) => !Number.isNaN(n));
const TOL_DEG = Number(arg('tol-deg', 1.5));
const TOL_DIST = Number(arg('tol-dist', 0.05));
// 단색 판정 기준. 실제 지구는 우주(검정)와 지표(밝음)가 섞여 분산이 크다.
const MIN_STDEV = Number(arg('min-stdev', 6));

if (!BASE || !OUT) {
  console.error('필요한 인자: --base <index.html 주소> --out <파일>');
  process.exit(64);
}

const fail = (code, msg, extra = {}) => {
  console.error(`[capture] 실패: ${msg}`);
  if (META) {
    mkdirSync(dirname(META), { recursive: true });
    writeFileSync(META, JSON.stringify({ verified: false, problems: [msg], ...extra }, null, 1), 'utf8');
  }
  process.exit(code);
};

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 200)));

try {
  const url = BASE + (LINK || '');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // 런타임이 뜰 때까지 기다린다. __earthus 는 main() 이 끝나야 생긴다.
  await page.waitForFunction(() => !!window.__earthus, null, { timeout: 90000 });

  // 첫 방문 안내를 닫는다 — 닫지 않으면 지구 위에 판이 덮인다.
  await page.evaluate(() => {
    const ov = [...document.querySelectorAll('div')].find(
      (e) => e.classList.contains('show') && getComputedStyle(e).position === 'fixed'
        && e.getBoundingClientRect().width > 250);
    if (ov) { const b = [...ov.querySelectorAll('button')].pop(); if (b) b.click(); }
  });

  if (LANG === 'en') {
    await page.evaluate(() => document.querySelector('[data-lang="en"]')?.click());
  }

  // 타일·레이어가 실제로 올라올 시간을 준다. 지구가 아직 회색일 때 찍으면 의미가 없다.
  await page.waitForTimeout(SETTLE_MS);

  // 되읽기 — 요청한 화면이 맞는지 실제 런타임 상태에서 확인한다.
  const observed = await page.evaluate(() => {
    const E = window.__earthus;
    return {
      ready: true,
      activeIds: E.liveLayers.activeIds(),
      lat: +(E.orbit.targetPitch * 180 / Math.PI).toFixed(3),
      lon: +((((E.orbit.targetYaw * 180 / Math.PI) + 540) % 360) - 180).toFixed(3),
      dist: +E.orbit.targetDist.toFixed(4),
      // §11 — 카메라 상태를 통째로 되읽는다. 링크가 실어 나르는 것은 tilt 뿐이지만
      // 실제 화면이 어디를 보고 있었는지는 전부 남긴다. 없는 축은 null 로 둔다.
      tilt: +(E.orbit.targetTilt ?? 0).toFixed(4),
      heading: 0,
      pitch: -90,
      roll: null,
      hash: location.hash,
      thermal: (window.__earthusThermal && window.__earthusThermal.state) || null,
      devicePixelRatio: window.devicePixelRatio,
    };
  });

  const problems = [];
  for (const id of EXPECT_LAYERS) {
    if (!observed.activeIds.includes(id)) problems.push(`요청한 레이어가 켜지지 않았다: ${id}`);
  }
  if (EXPECT_AT.length === 3) {
    const [wlat, wlon, wdist] = EXPECT_AT;
    let dlon = Math.abs(wlon - observed.lon); dlon = Math.min(dlon, 360 - dlon);
    if (Math.abs(wlat - observed.lat) > TOL_DEG) problems.push(`위도가 다르다: 요청 ${wlat} · 실제 ${observed.lat}`);
    if (dlon > TOL_DEG) problems.push(`경도가 다르다: 요청 ${wlon} · 실제 ${observed.lon}`);
    if (Math.abs(wdist - observed.dist) > TOL_DIST) problems.push(`거리가 다르다: 요청 ${wdist} · 실제 ${observed.dist}`);
  }

  // 그림을 가져온다. 내려받기가 아니라 data URL 로 받는다(main.js captureImage 의 dataUrl 모드).
  const shot = await page.evaluate(() => window.__earthus.captureImage({ dataUrl: true }));
  if (!shot || !shot.dataUrl) fail(3, 'captureImage 가 그림을 돌려주지 않았다', { observed });

  // 빈 프레임 검사 — 단색이면 렌더가 안 된 것이다.
  const stats = await page.evaluate(async (dataUrl) => {
    const img = new Image(); img.src = dataUrl; await img.decode();
    const c = document.createElement('canvas'); c.width = 160; c.height = 90;
    const cx = c.getContext('2d'); cx.drawImage(img, 0, 0, 160, 90);
    const d = cx.getImageData(0, 0, 160, 90).data;
    let sum = 0, sum2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += v; sum2 += v * v; n++;
    }
    const mean = sum / n;
    return { mean: +mean.toFixed(2), stdev: +Math.sqrt(sum2 / n - mean * mean).toFixed(2) };
  }, shot.dataUrl);

  if (stats.stdev < MIN_STDEV) {
    problems.push(`빈 프레임으로 보인다 (표준편차 ${stats.stdev} < ${MIN_STDEV}) — 렌더가 안 됐을 수 있다`);
  }

  const b64 = shot.dataUrl.split(',', 2)[1];
  const bytes = Buffer.from(b64, 'base64');
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, bytes);

  // §1-5 — **디스크에서 다시 읽어** 확인한다. 쓰기가 성공했다는 것과
  // 파일이 실제로 그 그림이라는 것은 다르다. 잘린 파일·0바이트를 통과시키지 않는다.
  const readBack = readFileSync(OUT);
  const fileHash = 'sha256:' + createHash('sha256').update(readBack).digest('hex');
  const hashMatches = fileHash === 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  if (!hashMatches || readBack.length !== bytes.length) {
    problems.push(`파일 되읽기가 어긋난다: 쓴 것 ${bytes.length}바이트 · 읽은 것 ${readBack.length}바이트`);
  }
  // 읽어 온 바이트가 정말 디코딩되는 그림인지 브라우저에게 물어본다.
  const decoded = await page.evaluate(async (durl) => {
    try {
      const img = new Image(); img.src = durl; await img.decode();
      return { ok: true, w: img.naturalWidth, h: img.naturalHeight };
    } catch (e) { return { ok: false, error: String(e).slice(0, 120) }; }
  }, 'data:image/jpeg;base64,' + readBack.toString('base64'));
  if (!decoded.ok || decoded.w !== shot.w || decoded.h !== shot.h) {
    problems.push(`저장된 파일이 요청한 그림과 다르다: ${JSON.stringify(decoded)}`);
  }

  const meta = {
    verified: problems.length === 0,
    problems,
    observed,
    expected: { layers: EXPECT_LAYERS, at: EXPECT_AT },
    canvas: { w: shot.w, h: shot.h },
    viewport: { w: W, h: H, deviceScaleFactor: DPR },
    // §1 — 픽셀 검사 결과를 판정과 함께 남긴다. 통과 여부를 나중에 되짚을 수 있어야 한다.
    pixelCheck: { ...stats, minStdev: MIN_STDEV, passed: stats.stdev >= MIN_STDEV },
    pixelStats: stats,
    // §1 — 어느 화면에서 왔는가. 주소 그 자체가 재현 경로다.
    sourceRoute: url,
    fileHash,
    readBack: { bytes: readBack.length, decoded, hashMatches },
    language: LANG,
    link: LINK,
    url,
    fileRef: OUT,
    bytes: bytes.length,
    capturedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    consoleErrors,
  };
  if (META) { mkdirSync(dirname(META), { recursive: true }); writeFileSync(META, JSON.stringify(meta, null, 1), 'utf8'); }

  console.log(`[capture] ${OUT} · ${shot.w}x${shot.h} · ${meta.bytes} bytes · `
    + `레이어 ${observed.activeIds.join(',') || '없음'} · 분산 ${stats.stdev} · `
    + (meta.verified ? '확인됨' : `확인실패(${problems.length})`));
  if (!meta.verified) { problems.forEach((p) => console.error('   - ' + p)); }
  await browser.close();
  process.exit(meta.verified || flag('allow-unverified') ? 0 : 2);
} catch (e) {
  await browser.close().catch(() => {});
  fail(1, String(e).slice(0, 300));
}
