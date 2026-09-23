// v2 자료를 같은 출처(earthus.net)로 받는다 — 2026-09-23 PD 승인(build/perf-investigation/v2-data-origin.md ②).
//
// 지키는 것(결과로):
//   ① 운영(earthus.net)에서는 v2 자료 주소가 **같은 출처 경로**('/wind/…' '/events/…')로 나간다 — 오하이오 S3 주소가 아니다.
//      그리고 그 경로는 CloudFront 에 동작이 있는 접두사다(/wind /events /ocean /solar /clouds /celestrak — 없으면 서울 /app 으로 가서 403).
//   ② 그 밖(localhost 개발 · node 시험)에서는 예전처럼 S3 직접이다 — CloudFront 는 Origin 을 캐시 키에 넣지 않아
//      CORS 헤더가 붙었다 안 붙었다 한다. 개발 화면이 자료를 못 받게 되면 안 된다.
//   ③ 같은 출처로 받은 자료도 신선도(Last-Modified)와 제공자 건강이 **기록된다** — 예전 관찰자는 S3 주소만 봐서
//      같은 출처로 바꾸는 순간 소리 없이 '미확인'이 될 자리였다(engine-bridge.js observeFetch).
//   ④ 보고서(reports/published/)는 CloudFront 동작이 없어 S3 직접으로 남는다.
//   ⑤ v2-three/js 에 S3 직접 주소가 새로 생기면 같은 규칙(endsWith('earthus.net'))을 거쳐야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const S3 = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';
const JS = new URL('../../prototype/v2-three/js/', import.meta.url);
const lf = (s) => s.replace(/\r\n/g, '\n');
// CloudFront E193CZEBLWEB56 의 자료 동작(오하이오 s3-data). 이 밖의 경로는 기본 동작(서울 /app)으로 간다.
const CF_DATA = ['wind', 'events', 'ocean', 'solar', 'clouds', 'celestrak'];
const servedByCf = (p) => typeof p === 'string' && p.startsWith('/') && CF_DATA.includes(p.split('/')[1]);

// 운영 주소를 흉내 낸다. 모듈은 URL 전체가 키라 질의문자열을 달리해 **새 사본**을 읽는다(위 상수가 모듈을 읽을 때 정해진다).
let seq = 0;
async function importAs(hostname, rel) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'location');
  const saved = globalThis.location;
  globalThis.location = { hostname, host: hostname, origin: `https://${hostname}`, href: `https://${hostname}/v2/` };
  try {
    seq += 1;
    return await import(new URL(`${rel}?as=${encodeURIComponent(hostname)}&n=${seq}`, JS).href);
  } finally {
    if (had) globalThis.location = saved; else delete globalThis.location;
  }
}

test('운영(earthus.net)에서는 자료를 같은 출처 경로로 받는다 — 지상관측 두 파일이 /wind/… 로 나간다', async () => {
  const m = await importAs('earthus.net', 'surface-obs.js');
  assert.equal(m.SURFACE_OBS_BASE, '');
  const calls = [];
  const store = m.createSurfaceObs({ fetchImpl: async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => ({ stations: [] }) }; } });
  await store.both();
  assert.deepEqual(calls.sort(), ['/wind/gts-global.json', '/wind/kma-aws.json']);
  assert.ok(calls.every(servedByCf), 'CloudFront 동작이 있는 경로여야 한다');
});

test('운영에서는 GFS 프레임 · 격자 · 지점 판독 · 취미 모듈의 기준 주소가 같은 출처다', async () => {
  const gfs = await importAs('earthus.net', 'gfs-frames.js');
  assert.equal(gfs.GFS_BASE, '');
  const url = gfs.frameUrlOf(gfs.GFS_BASE, gfs.GFS_PREFIX, '2026-09-23T13:12:17Z', '2026092306/c000.png');
  assert.equal(url, '/clouds/gfs-fc/2026092306/c000.png?g=2026-09-23T13%3A12%3A17Z');
  assert.ok(servedByCf(url));

  const grid = await importAs('earthus.net', 'grid-frames.js');
  assert.equal(grid.GRID_BASE, '');
  for (const s of Object.values(grid.GRID_SOURCES)) assert.ok(servedByCf(`${grid.GRID_BASE}${s.path}`), `${s.id}: ${s.path}`);

  const pr = await importAs('earthus.net', 'point-readout.js');
  assert.equal(pr.POINT_BASE, '');
  // www 도 같은 배포다
  assert.equal((await importAs('www.earthus.net', 'point-readout.js')).POINT_BASE, '');
});

test('운영의 제공자 건강 탐침(HEAD)도 같은 출처 경로다 — CloudFront 가 Last-Modified 를 그대로 준다', async () => {
  const eb = await importAs('earthus.net', 'engine-bridge.js');
  const probes = eb.PROVIDERS.filter((p) => p.probe).map((p) => p.probe);
  assert.ok(probes.length >= 10);
  for (const p of probes) assert.ok(servedByCf(p), `탐침 ${p}`);
});

test('localhost 개발과 node 시험에서는 예전처럼 S3 직접이다 — 개발 화면이 CORS 로 막히지 않는다', async () => {
  assert.equal((await importAs('localhost', 'surface-obs.js')).SURFACE_OBS_BASE, S3);
  assert.equal((await importAs('127.0.0.1', 'gfs-frames.js')).GFS_BASE, S3);
  // location 이 없는 node 그대로
  const plain = await import(new URL('point-readout.js?plain-node', JS).href);
  assert.equal(plain.POINT_BASE, S3);
  const eb = await import(new URL('engine-bridge.js?plain-node', JS).href);
  assert.ok(eb.PROVIDERS.filter((p) => p.probe).every((p) => p.probe.startsWith(`${S3}/`)));
});

test('같은 출처로 받은 자료도 신선도와 제공자 건강이 Last-Modified 로 기록된다(미확인으로 떨어지지 않는다)', async () => {
  const eb = await import(new URL('engine-bridge.js?observer-same-origin', JS).href);
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const savedWindow = globalThis.window;
  const LM = { '/events/tsunami-intl.json': 'Wed, 23 Sep 2026 13:26:56 GMT', '/ocean/buoys.json': 'Wed, 23 Sep 2026 13:11:18 GMT' };
  globalThis.window = {
    fetch: async (url) => {
      const p = String(url).replace(/^https:\/\/(www\.)?earthus\.net/, '').split('?')[0];
      return { ok: true, headers: { get: (k) => (k.toLowerCase() === 'last-modified' ? (LM[p] || null) : null) } };
    },
  };
  try {
    eb.installFetchObserver();
    assert.equal(eb.getSourceTime('hazards/tsunami'), null);
    await window.fetch('/events/tsunami-intl.json');                           // 운영 v2 가 실제로 부르는 꼴
    await window.fetch('https://earthus.net/ocean/buoys.json?t=1');              // 절대 주소 · 질의문자열
    await window.fetch('./data/khoa-flood-anchors.json');                        // 앱 번들 파일 — 기록하지 않는다
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(eb.getSourceTime('hazards/tsunami'), '2026-09-23T13:26:56.000Z');
    assert.equal(eb.getSourceTime('ocean/buoys'), '2026-09-23T13:11:18.000Z');
    const snap = Object.fromEntries(eb.providerSnapshot().map((p) => [p.id, p]));
    assert.equal(snap.tsunami.lastSuccessAt, '2026-09-23T13:26:56.000Z');
    assert.equal(snap.buoys.lastSuccessAt, '2026-09-23T13:11:18.000Z');
    assert.doesNotMatch(eb.layerBadge('hazards/tsunami'), /갱신 시각 미확인/);
  } finally {
    if (had) globalThis.window = savedWindow; else delete globalThis.window;
  }
});

test('v2-three/js 의 S3 직접 주소는 전부 같은 규칙을 거친다 — 보고서만 예외(CloudFront 동작 없음)', () => {
  const files = [
    ...readdirSync(JS).filter((f) => f.endsWith('.js')),
    ...readdirSync(new URL('ext/', JS)).filter((f) => f.endsWith('.js')).map((f) => `ext/${f}`),
  ];
  const offenders = [];
  let guarded = 0;
  for (const f of files) {
    const lines = lf(readFileSync(new URL(f, JS), 'utf8')).split('\n');
    lines.forEach((line, i) => {
      if (!line.includes('https://earthus-cache-kr.s3')) return;                   // 주소 글자만 — 호스트를 알아보는 조건(observeFetch)은 제외
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;                                 // 주석
      const near = lines.slice(Math.max(0, i - 2), i + 1).join('\n');
      if (near.includes("endsWith('earthus.net')")) { guarded += 1; return; }      // 운영 '' · 그 밖 S3
      if (f === 'main.js' && /^const S3_DIRECT = /.test(line)) { guarded += 1; return; }   // DATA_BASE 의 그 밖 갈래 · 짝 어긋남의 되받기
      if (f === 'ui-shell.js' && /\|\| 'https:\/\/earthus-cache-kr\.s3/.test(line)) return;  // reports/published/ — CloudFront 동작 없음(④)
      offenders.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(offenders, [], `S3 직접 주소가 규칙 없이 박혀 있다:\n${offenders.join('\n')}`);
  assert.ok(guarded >= 12, `규칙을 거친 자리가 ${guarded}곳뿐이다 — 모듈마다 있어야 한다`);
  const ui = lf(readFileSync(new URL('ui-shell.js', JS), 'utf8'));
  assert.match(ui, /reportBase = \(\) => \(typeof window !== 'undefined' && window\.EARTHUS_REPORT_BASE\)\n\s+\|\| 'https:\/\/earthus-cache-kr\.s3\.us-east-2\.amazonaws\.com'/, '보고서는 S3 직접으로 남는다(④)');
});
