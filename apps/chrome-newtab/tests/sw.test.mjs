// sw.js refreshAll — 알람 조건 · 구름 sha256 짝 맞추기(earthus.net → S3 직접 → 이전 유지) · 받지 못한 자료 유지 · 형식 변경
//   네트워크를 쓰지 않는다: 가짜 fetchers(주소 → 고정 자료)와 메모리 저장소를 넘긴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshAll, sha256Hex } from '../sw.js';
import { ORIGIN, S3_DIRECT, ENDPOINTS } from '../feeds.js';
import { fixture, clone } from './helpers.mjs';

const NOW = Date.parse('2026-09-24T07:20:00Z');
const GOOD = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/webp' });
const STALE_EDGE = new Blob([new Uint8Array([9, 9, 9])], { type: 'image/webp' });

async function setup({ edgeBlob = GOOD, s3Blob = GOOD, metaTime = '2026-09-24T06:00:00Z', failJson = [], jsonOverride = {} } = {}) {
  const meta = clone(fixture('clouds_meta'));
  meta.time = metaTime;
  meta.variants.webp2048.sha256 = await sha256Hex(await GOOD.arrayBuffer());
  const byUrl = {
    [ORIGIN + ENDPOINTS.cloudMeta]: meta,
    [ORIGIN + ENDPOINTS.kmaWarn]: fixture('events_kma-warn'),
    [ORIGIN + ENDPOINTS.quakeAsia]: fixture('events_quake-asia'),
    [ORIGIN + ENDPOINTS.tsunami]: fixture('events_tsunami-intl'),
    [ORIGIN + ENDPOINTS.kmaAws]: fixture('wind_kma-aws'),
    ...jsonOverride,
  };
  const calls = [];
  const fetchers = {
    async json(url) {
      calls.push(url);
      if (failJson.some((k) => url.endsWith(ENDPOINTS[k]))) throw new Error('offline');
      if (!(url in byUrl)) throw new Error('404 ' + url);
      return byUrl[url];
    },
    async blob(url) {
      calls.push(url);
      if (url === `${ORIGIN}/clouds/global-2048.webp`) return edgeBlob;
      if (url === `${S3_DIRECT}/clouds/global-2048.webp`) return s3Blob;
      throw new Error('404 ' + url);
    },
  };
  const mem = { local: {}, cloud: null };
  const store = {
    async get(keys) { const o = {}; for (const k of keys) if (k in mem.local) o[k] = mem.local[k]; return o; },
    async set(obj) { Object.assign(mem.local, clone(obj)); },
    async putCloud(blob, info) { mem.cloud = { blob, info }; },
  };
  return { deps: { fetchers, store, now: () => NOW, digest: sha256Hex }, calls, mem };
}

test('새 탭이 청하면: JSON 다섯 + 구름 WebP 하나를 받고, sha256 이 맞으면 그림과 시각을 같이 저장', async () => {
  const { deps, calls, mem } = await setup();
  const out = await refreshAll(deps, 'newtab');
  assert.equal(out.cloud, 'new:earthus.net');
  assert.equal(calls.length, 6);
  assert.equal(mem.cloud.info.time, '2026-09-24T06:00:00Z');
  assert.equal(mem.local.cloud.time, '2026-09-24T06:00:00Z');
  assert.equal(mem.local.cloud.credit, 'NOAA NESDIS GMGSI');
  assert.equal(mem.local.lastFetchAt, NOW);
  for (const k of ['cloudMeta', 'kmaWarn', 'quakeAsia', 'tsunami', 'kmaAws']) assert.equal(mem.local.feeds[k].ok, true, k);
});

test('meta.time 이 그대로면 구름 WebP 를 다시 받지 않는다', async () => {
  const { deps, calls, mem } = await setup();
  await refreshAll(deps, 'newtab');
  calls.length = 0;
  mem.local.lastNewtabOpenAt = NOW;
  const out = await refreshAll(deps, 'alarm');
  assert.equal(out.cloud, 'unchanged');
  assert.equal(calls.filter((u) => u.endsWith('.webp')).length, 0);
  assert.equal(calls.length, 5);
});

test('엣지가 지난 그림을 주면(sha256 불일치) S3 직접으로 다시 받는다', async () => {
  const { deps, calls, mem } = await setup({ edgeBlob: STALE_EDGE });
  const out = await refreshAll(deps, 'newtab');
  assert.equal(out.cloud, 'new:s3');
  assert.deepEqual(calls.filter((u) => u.endsWith('.webp')), [`${ORIGIN}/clouds/global-2048.webp`, `${S3_DIRECT}/clouds/global-2048.webp`]);
  assert.equal(mem.cloud.info.via, 's3');
});

test('둘 다 안 맞으면 이전 그림과 이전 시각을 그대로 둔다', async () => {
  const { deps, mem } = await setup();
  await refreshAll(deps, 'newtab');
  const prev = mem.cloud;
  const s2 = await setup({ edgeBlob: STALE_EDGE, s3Blob: STALE_EDGE, metaTime: '2026-09-24T07:00:00Z' });
  s2.mem.local = clone(mem.local); s2.mem.cloud = prev;
  const out = await refreshAll(s2.deps, 'newtab');
  assert.equal(out.cloud, 'mismatch-kept-previous');
  assert.equal(s2.mem.cloud, prev);
  assert.equal(s2.mem.local.cloud.time, '2026-09-24T06:00:00Z', '라벨 시각도 이전 그대로');
});

test('알람: 새 탭이 2시간 넘게 안 열렸으면 아무것도 받지 않는다(요청 0건)', async () => {
  const { deps, calls, mem } = await setup();
  mem.local.lastNewtabOpenAt = NOW - 2 * 3600 * 1000 - 60000;
  const out = await refreshAll(deps, 'alarm');
  assert.deepEqual(out, { skipped: 'no-recent-newtab' });
  assert.equal(calls.length, 0);
  const never = await setup();
  assert.deepEqual(await refreshAll(never.deps, 'alarm'), { skipped: 'no-recent-newtab' });
  assert.equal(never.calls.length, 0);
});

test('받지 못한 자료는 지난 값을 둔다 · 형식이 바뀐 자료는 형식 변경으로 저장', async () => {
  const { deps, mem } = await setup();
  await refreshAll(deps, 'newtab');
  const warnBefore = clone(mem.local.feeds.kmaWarn);
  const broken = clone(fixture('wind_kma-aws')); delete broken.stations;
  const s2 = await setup({ failJson: ['kmaWarn'], jsonOverride: { [ORIGIN + ENDPOINTS.kmaAws]: broken } });
  s2.mem.local = clone(mem.local);
  const out = await refreshAll(s2.deps, 'newtab');
  assert.deepEqual(out.kept, ['kmaWarn']);
  assert.deepEqual(s2.mem.local.feeds.kmaWarn, warnBefore);
  assert.equal(s2.mem.local.feeds.kmaAws.ok, false);
  assert.equal(s2.mem.local.feeds.kmaAws.reason, 'format');
});

// (2026-09-24 검수 추가) gmgsi-clouds Lambda 는 매시 meta.json 을 variants 없이 한 번(①) 쓰고, 변형을 올린 뒤 다시(③) 쓴다.
//   ①~③ 사이에 받은 meta 는 '형식 변경'이 아니다 — 이전 그림·이전 시각·이전 meta 를 그대로 두고 WebP 를 받지 않아야 통과.
test('구름 meta 에 variants 가 아직 없으면(Lambda ①~③ 사이): 이전 그림·시각 유지, 형식 변경으로 저장하지 않는다', async () => {
  const { deps, mem } = await setup();
  await refreshAll(deps, 'newtab');
  const prevCloud = mem.cloud;
  const prevMetaFeed = clone(mem.local.feeds.cloudMeta);
  const half = clone(fixture('clouds_meta'));
  half.time = '2026-09-24T07:00:00Z';
  delete half.variants;
  const s2 = await setup({ jsonOverride: { [ORIGIN + ENDPOINTS.cloudMeta]: half } });
  s2.mem.local = clone(mem.local); s2.mem.cloud = prevCloud;
  const out = await refreshAll(s2.deps, 'newtab');
  assert.ok(out.kept.includes('cloudMeta'));
  assert.ok(!out.format.includes('cloudMeta'));
  assert.equal(out.cloud, 'unchanged');
  assert.equal(s2.calls.filter((u) => u.endsWith('.webp')).length, 0, '변형이 적히기 전 그림을 받지 않는다');
  assert.equal(s2.mem.cloud, prevCloud);
  assert.equal(s2.mem.local.cloud.time, '2026-09-24T06:00:00Z');
  assert.deepEqual(s2.mem.local.feeds.cloudMeta, prevMetaFeed);
  // 결과로도 본다: 지구 아래 상태 줄에 '형식 변경' 이 뜨지 않는다
  const { cloudStatus } = await import('../feeds.js');
  const { tKo } = await import('./helpers.mjs');
  const st = cloudStatus({ online: true, shownCloud: { timeMs: Date.parse(s2.mem.local.cloud.time) }, metaFeed: s2.mem.local.feeds.cloudMeta, nowMs: NOW, t: tKo });
  assert.equal(st, null);
});
