import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bulletinContext, bulletinRecords, bulletinTimesHtml, sourceInstant, sourceTimeLabel, seaLevelFractionCm } from '../prototype/v2-three/js/source-context.js';
import { LiveLayers } from '../prototype/v2-three/js/live-layers.js';

const NOW = Date.parse('2026-09-05T00:00:00Z');
const COLLECTION = { generated: '2026-09-05T00:00:00Z' };

test('fresh collection never makes an old or recent Warning an active warning', () => {
  for (const updated of ['2026-08-22T12:00:00Z', '2026-09-04T23:59:00Z']) {
    const c = bulletinContext({ category: 'Warning', updated }, COLLECTION, NOW);
    assert.equal(c.state, 'unknown');
    assert.equal(c.retrievedAt, new Date(COLLECTION.generated).toISOString());
    assert.equal(c.publishedAt, new Date(updated).toISOString());
  }
});

test('validity is determined only from explicit dates or cancellation metadata', () => {
  const base = { category: 'Warning', validFrom: '2026-09-04T23:00:00Z', validUntil: '2026-09-05T01:00:00Z' };
  assert.equal(bulletinContext(base, {}, NOW).state, 'active');
  assert.equal(bulletinContext({ ...base, validUntil: '2026-09-05T00:00:00Z' }, {}, NOW).state, 'expired');
  assert.equal(bulletinContext({ ...base, validFrom: '2026-09-05T00:30:00Z' }, {}, NOW).state, 'scheduled');
  assert.equal(bulletinContext({ ...base, msgType: 'Cancel' }, {}, NOW).state, 'cancelled');
  assert.equal(bulletinContext({ ...base, validUntil: '2026-09-04T22:00:00Z' }, {}, NOW).state, 'unknown');
  assert.equal(bulletinContext({ category: 'Information', updated: '2026-09-04T23:00:00Z' }, {}, NOW).state, 'information');
  assert.equal(bulletinContext({ category: 'Unknown' }, {}, NOW).state, 'unknown');
});

test('unknown source timezone stays unknown rather than acquiring the device timezone', () => {
  assert.equal(sourceInstant('2026-09-05T00:00:00'), null);
  assert.equal(bulletinContext({ category: 'Warning', validFrom: '2026-09-04T23:00:00', validUntil: '2026-09-05T01:00:00' }, {}, NOW).state, 'unknown');
  assert.equal(sourceTimeLabel('2026-09-05T00:00:00Z'), '2026-09-05 09:00 KST');
  assert.equal(sourceTimeLabel('2026-09-05T09:00:00+09:00'), '2026-09-05 09:00 KST');
  assert.equal(sourceTimeLabel(null), '미제공');
});

test('bulletin order uses publication dates, preserving source rows and missing metadata', () => {
  const alerts = [{ id: 'old', category: 'Warning', updated: '2026-08-22T12:00:00Z' }, { id: 'new', category: 'Information', updated: '2026-09-04T12:00:00Z' }, { id: 'missing' }];
  const saved = JSON.stringify(alerts);
  const result = bulletinRecords({ ...COLLECTION, alerts }, NOW);
  assert.deepEqual(result.map((r) => r.bulletin.id), ['new', 'old', 'missing']);
  assert.equal(JSON.stringify(alerts), saved);
  const html = bulletinTimesHtml(bulletinContext({ issued: '<img src=x>', updated: '2026-09-04T12:00:00Z' }, {}, NOW));
  assert.match(html, /게시 갱신/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /유효 시작 미제공/);
});

test('sea-level display uses a fixed cm scale and does not convert missing data to zero', () => {
  assert.equal(seaLevelFractionCm(25), .25);
  assert.equal(seaLevelFractionCm(100), 1);
  assert.equal(seaLevelFractionCm(125), 1);
  assert.equal(seaLevelFractionCm(-5), 0);
  for (const v of [null, undefined, NaN, Infinity, '25']) assert.equal(seaLevelFractionCm(v), null);
});

test('real layer builder gives equal values identical colours across scenarios', () => {
  const layer = Object.create(LiveLayers.prototype);
  layer.makePoints = (items) => items;
  const data = { n: 3, lat: [30, 31, 32], lon: [124, 125, 126], scenarios: {
    SSP126: { val: [25, 50, null], min: 25, max: 50 },
    SSP585: { val: [50, 125, null], min: 50, max: 125 },
  } };
  const saved = JSON.stringify(data);
  const low = layer.buildKhoaSl(data, 'SSP126');
  const high = layer.buildKhoaSl(data, 'SSP585');
  assert.deepEqual(low[1].c, high[0].c);
  assert.notDeepEqual(low[0].c, high[0].c);
  assert.equal(high.length, 2);
  assert.equal(layer._khoaSlStat.max, 125);
  assert.equal(JSON.stringify(data), saved);
  const html = layer.metaKhoaSl(data, 'SSP585').cardHtml;
  assert.match(html, /25 ~ 50cm|50 ~ 125cm/);
  assert.match(html, /모든 시나리오 공통 눈금/);
});

test('bulletin UI separates validity, collection and official links without LIVE or alert count inference', () => {
  const layer = Object.create(LiveLayers.prototype);
  const meta = layer.metaTsunami({ ...COLLECTION, alerts: [{ category: 'Warning', region: '<script>bad</script>', updated: '2026-08-22T00:00:00Z', bulletin: 'javascript:bad()' }] });
  assert.equal(meta.badge, 'OFFICIAL_WARNING');
  assert.match(meta.cardHtml, /발효 여부 미확인/);
  assert.match(meta.cardHtml, /목록 수집/);
  assert.match(meta.cardHtml, /유효 시작 미제공/);
  assert.doesNotMatch(meta.cardHtml, /<script>|javascript:|LIVE|1건 경보/);
});

test('coastal flood cards and all registry declarations retain the scenario data kind', async () => {
  const layer = Object.create(LiveLayers.prototype);
  layer._floodDistricts = [];
  assert.equal(layer.metaFloodIndex({ districts: [] }).badge, 'PROVIDER_FORECAST');
  const bridge = await readFile(new URL('../prototype/v2-three/js/engine-bridge.js', import.meta.url), 'utf8');
  const entries = [...bridge.matchAll(/'ocean\/khoaflood':\s*\{ kind: K\.(\w+)/g)];
  assert.ok(entries.length > 0);
  assert.ok(entries.every((entry) => entry[1] === 'PROVIDER_FORECAST'));
  const room = await readFile(new URL('../prototype/v2-three/js/event-room.js', import.meta.url), 'utf8');
  assert.doesNotMatch(room, /kind: 'OFFICIAL_OBSERVATION', layerKey: 'ocean\/khoaflood'/);
});

test('fetch observation never substitutes request time for a missing source modification time', async () => {
  const { installFetchObserver, getSourceTime, layerBadge, layerTruthLine } = await import('../prototype/v2-three/js/engine-bridge.js');
  const savedWindow = globalThis.window;
  let modified = null;
  globalThis.window = { fetch: async () => ({ ok: true, headers: { get: () => modified } }) };
  try {
    installFetchObserver();
    const url = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com/events/tsunami-intl.json';
    await window.fetch(url);
    assert.equal(getSourceTime('hazards/tsunami'), null);
    assert.match(layerBadge('hazards/tsunami'), /갱신 시각 미확인/);
    modified = 'Fri, 04 Sep 2026 00:00:00 GMT';
    await window.fetch(url);
    assert.equal(getSourceTime('hazards/tsunami'), '2026-09-04T00:00:00.000Z');
    assert.match(layerTruthLine('hazards/tsunami'), /자료 파일 갱신 2026-09-04 09:00 KST/);
    assert.match(layerTruthLine('hazards/tsunami'), /<details/);
  } finally {
    if (savedWindow === undefined) delete globalThis.window;
    else globalThis.window = savedWindow;
  }
});
