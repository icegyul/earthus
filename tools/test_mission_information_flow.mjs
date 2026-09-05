import test from 'node:test';
import assert from 'node:assert/strict';
import { createLaunchScheduleClient, normalizeLaunches, launchListUrl } from '../prototype/js/launch-schedule.js';
import { normalizeObserver, parseObserverInput, parseNoaaTimestamp, latestNoaaKp } from '../prototype/js/space/mission-observer.js';
import { selectedLaunch } from '../prototype/js/space/mission-readability.js';
import { worldPlaces } from '../prototype/js/geoname.js';

const endpoint = 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/';
const fixture = (id = 'launch-a', net = '2026-09-06T01:00:00Z') => ({
  id, name: `Fixture ${id}`, net, window_start: '2026-09-06T00:00:00Z',
  status: { name: 'To Be Confirmed' }, launch_service_provider: { name: 'Fixture provider' },
  pad: { name: 'Fixture pad', latitude: 1, longitude: 2 },
});
const success = results => ({ ok: true, status: 200, json: async () => ({ results }) });
const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('normalization preserves NET, uncertainty, provider and safe top-level LL2 webcast links', () => {
  const launch = fixture(); launch.webcast_live = true;
  launch.vid_urls = [{ url: 'https://example.com/watch', title: 'Official webcast' }, { url: 'javascript:alert(1)' }];
  launch.mission = { name: 'Payload A', type: 'Science', vid_urls: [{ url: 'https://example.com/watch' }] };
  const result = normalizeLaunches({ results: [fixture('later', '2026-09-07T00:00:00Z'), launch, { id: 'broken' }] });
  assert.equal(result.length, 2);
  assert.equal(result[0].scheduledAt, launch.net);
  assert.equal(result[0].windowStart, launch.window_start);
  assert.equal(result[0].status, 'To Be Confirmed');
  assert.equal(result[0].webcastLive, true);
  assert.deepEqual(result[0].videoUrls, [{ url: 'https://example.com/watch', title: 'Official webcast' }]);
  assert.equal(result[0].missionName, 'Payload A');
  assert.doesNotThrow(() => normalizeLaunches({ results: [{ ...fixture(), vid_urls: {} }] }));
  const url = new URL(launchListUrl(endpoint));
  assert.equal(url.searchParams.get('limit'), '30');
  assert.equal(url.searchParams.get('mode'), 'normal');
});

test('simultaneous v1 and Mission Control requests share one call and a five-minute cache', async () => {
  let clock = Date.parse('2026-09-05T00:00:00Z'), calls = 0;
  const get = createLaunchScheduleClient({ now: () => clock, storage: memoryStorage() });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const fetcher = async () => { calls++; await gate; return success([fixture()]); };
  const first = get({ url: endpoint, fetcher });
  const second = get({ url: endpoint, fetcher });
  assert.equal(calls, 1); release();
  const [v1, mission] = await Promise.all([first, second]);
  assert.equal(v1.rawResults[0].id, mission.launches[0].id);
  assert.equal(v1.retrievedAt, mission.retrievedAt);
  clock += 4 * 60_000;
  await get({ url: endpoint, fetcher }); assert.equal(calls, 1);
  clock += 60_000;
  await get({ url: endpoint, fetcher }); assert.equal(calls, 2);
});

test('429 retains original retrieval time and prevents force-refresh storms until Retry-After', async () => {
  let clock = Date.parse('2026-09-05T00:00:00Z'), calls = 0;
  const get = createLaunchScheduleClient({ now: () => clock, storage: memoryStorage() });
  const original = await get({ url: endpoint, fetcher: async () => success([fixture()]) });
  clock += 6 * 60_000;
  const throttled = async () => { calls++; return { ok: false, status: 429, headers: { get: () => '120' } }; };
  const cached = await get({ url: endpoint, fetcher: throttled });
  assert.equal(cached.mode, 'cached');
  assert.equal(cached.retrievedAt, original.retrievedAt);
  assert.equal(Date.parse(cached.retryAt), clock + 120_000);
  await get({ url: endpoint, fetcher: throttled, force: true }); assert.equal(calls, 1);
  clock += 120_001;
  await get({ url: endpoint, fetcher: throttled, force: true }); assert.equal(calls, 2);
});

test('a fresh persistent cache does not claim a current webcast before this session verifies the provider', async () => {
  const clock = Date.parse('2026-09-05T00:00:00Z');
  const storage = memoryStorage();
  const first = createLaunchScheduleClient({ now: () => clock, storage });
  await first({ url: endpoint, fetcher: async () => success([{ ...fixture(), webcast_live: true }]) });
  const reopened = createLaunchScheduleClient({ now: () => clock + 60_000, storage });
  const result = await reopened({ url: endpoint, fetcher: async () => { throw new Error('not requested'); } });
  assert.equal(result.mode, 'cached');
  assert.equal(result.launches[0].webcastLive, true);
});

test('malformed responses never overwrite last success, valid empty results do, cache expires after 24 hours', async () => {
  let clock = Date.parse('2026-09-05T00:00:00Z');
  const storage = memoryStorage();
  const get = createLaunchScheduleClient({ now: () => clock, storage });
  const first = await get({ url: endpoint, fetcher: async () => success([fixture()]) });
  clock += 6 * 60_000;
  const malformed = await get({ url: endpoint, fetcher: async () => success([{ broken: true }]) });
  assert.equal(malformed.mode, 'cached'); assert.equal(malformed.retrievedAt, first.retrievedAt);
  clock += 61_000;
  const empty = await get({ url: endpoint, fetcher: async () => success([]), force: true });
  assert.deepEqual(empty.launches, []); assert.equal(empty.mode, 'live');
  clock += 25 * 3600_000;
  const reload = createLaunchScheduleClient({ now: () => clock, storage });
  await assert.rejects(reload({ url: endpoint, fetcher: async () => { throw new Error('offline'); } }), /offline/);
});

test('NOAA offset-free timestamps are UTC and produce the correct KST day across midnight', () => {
  const iso = parseNoaaTimestamp('2026-09-04 23:24:00');
  assert.equal(iso, '2026-09-04T23:24:00.000Z');
  assert.equal(parseNoaaTimestamp('2026-09-05T08:24:00+09:00'), iso);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  assert.match(parts, /2026-09-05/); assert.match(parts, /08:24/);
  assert.equal(parseNoaaTimestamp(''), null); assert.equal(parseNoaaTimestamp('not-a-date'), null);
});

test('Kp picks newest valid evidence independently of array order and excludes missing or out-of-range values', () => {
  const result = latestNoaaKp([
    { kp_index: '2.33', time_tag: '2026-09-04T23:24:00' },
    { kp_index: '1.00', time_tag: '2026-09-04T23:20:00Z' },
    { kp_index: null, time_tag: '2026-09-04T23:30:00' },
    { kp_index: 12, time_tag: '2026-09-04T23:31:00' },
  ]);
  assert.deepEqual(result, { value: 2.33, observedAt: '2026-09-04T23:24:00.000Z' });
  assert.equal(latestNoaaKp([{ kp_index: null, time_tag: '2026-09-04T23:24:00' }]), null);
  assert.equal(latestNoaaKp([{ kp_index: 0, time_tag: '2026-09-04T23:24:00' }]).value, 0);
});

test('manual observers accept exact catalogue cities and bounded coordinates without guessing nearest cities', () => {
  const seoul = parseObserverInput('서울', worldPlaces());
  assert.equal(seoul.lat, 37.57); assert.equal(seoul.lon, 126.98);
  assert.equal(seoul.source, '지명표 대표 좌표');
  assert.deepEqual(parseObserverInput('Seoul', worldPlaces()), seoul);
  assert.equal(parseObserverInput('서울특별시 어딘가', worldPlaces()), null);
  assert.equal(parseObserverInput('91, 128'), null);
  assert.equal(parseObserverInput('37, -181'), null);
  assert.equal(parseObserverInput('37,'), null);
  assert.equal(parseObserverInput('0, 0').lat, 0);
  assert.equal(parseObserverInput('-90, 180').lon, 180);
  assert.equal(normalizeObserver({ lat: null, lon: null }), null);
});

test('launch detail selection is independent of following and recovers when selected launch leaves the feed', () => {
  const launches = normalizeLaunches({ results: [fixture('a'), fixture('b', '2026-09-07T00:00:00Z')] });
  const state = { followingLaunchId: 'a', selectedLaunchId: 'b' };
  assert.equal(selectedLaunch(launches, state.selectedLaunchId).id, 'b');
  assert.equal(state.followingLaunchId, 'a');
  assert.equal(selectedLaunch(launches, 'removed').id, 'a');
  assert.equal(selectedLaunch([], 'removed'), null);
});
