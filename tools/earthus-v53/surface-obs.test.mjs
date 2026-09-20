// 지상관측 문서 한 벌(js/surface-obs.js) — 같은 파일을 두 번 받지 않는다 (지시서 W1 ⑦ "허브 호출 증가 0")
//
// 지키는 것:
//   ① 결과: 여럿이 동시에 물어도, 잇따라 물어도 파일마다 fetch 는 한 번이다. TTL 이 지나면 다시 받는다(20분 갱신이 실제로 새 파일을 받게).
//   ② 실패를 담아 두지 않는다 — 한 번 실패한 약속이 다음 메뉴까지 실패시키면 안 된다.
//   ③ 배선: v2 에서 이 두 파일을 받던 네 자리(live-layers 바람·평년차 · station-model · main.js 내 동네)가 전부 이 저장소를 쓰고,
//      import URL 이 한 글자도 다르지 않다(URL 이 다르면 저장소가 둘이 되어 다시 두 번 받는다 — time-bus 와 같은 함정).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSurfaceObs, SURFACE_OBS_BASE, SURFACE_OBS_PATH, SURFACE_OBS_TTL_MS } from '../../prototype/v2-three/js/surface-obs.js';

// 워크트리는 core.autocrlf=true 라 CRLF 로 체크아웃된다 — 글자 맞춤 시험은 줄바꿈을 먼저 편다.
const lf = (s) => s.replace(/\r\n/g, '\n');
const src = (rel) => lf(readFileSync(new URL(`../../prototype/v2-three/js/${rel}`, import.meta.url), 'utf8'));

const fakeFetch = (docs = { aws: { stations: [1] }, gts: { stations: [2] } }) => {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, opts });
    const kind = url.endsWith(SURFACE_OBS_PATH.aws) ? 'aws' : 'gts';
    const d = docs[kind];
    if (d instanceof Error) throw d;
    if (d === 404) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => d };
  };
  return { impl, calls, docs };
};

test('여럿이 동시에 물어도 파일마다 한 번만 받는다 — 바람 · 기입 모형 · 관측 숫자가 같은 문서를 나눠 쓴다', async () => {
  const f = fakeFetch();
  const store = createSurfaceObs({ fetchImpl: f.impl });
  const [a, b, c, both] = await Promise.all([store.doc('aws'), store.doc('aws'), store.doc('gts'), store.both()]);
  assert.equal(f.calls.length, 2, `fetch 가 ${f.calls.length}번 나갔다 — 파일은 둘이다`);
  assert.equal(a, b, '같은 문서 객체를 줘야 한다(읽는 쪽이 "같은 문서면 다시 풀지 않는다"를 === 로 판단한다)');
  assert.equal(both.aws, a);
  assert.equal(both.gts, c);
  assert.deepEqual(store.stats().fetches, { aws: 1, gts: 1 });
});

test('S3 를 직접, 캐시 없이 읽는다 — CloudFront 는 /wind/* 에 CORS 를 안 붙인다', async () => {
  const f = fakeFetch();
  await createSurfaceObs({ fetchImpl: f.impl }).both();
  assert.deepEqual(f.calls.map((c) => c.url).sort(), [
    `${SURFACE_OBS_BASE}/wind/gts-global.json`, `${SURFACE_OBS_BASE}/wind/kma-aws.json`,
  ]);
  for (const c of f.calls) assert.equal(c.opts.cache, 'no-store');
});

test('TTL 안에서는 다시 받지 않고, 지나면 다시 받는다', async () => {
  const f = fakeFetch();
  let t = 1_000_000;
  const store = createSurfaceObs({ fetchImpl: f.impl, now: () => t });
  await store.doc('gts');
  t += SURFACE_OBS_TTL_MS - 1;
  await store.doc('gts');
  assert.equal(f.calls.length, 1, 'TTL 안인데 1.1 MB 를 다시 받았다');
  t += 2;
  await store.doc('gts');
  assert.equal(f.calls.length, 2, 'TTL 이 지났는데 옛 문서를 줬다 — 바람 레이어의 20분 갱신이 새 파일을 못 받는다');
  assert.ok(SURFACE_OBS_TTL_MS < 20 * 60 * 1000, 'TTL 은 live-layers REFRESH_MIN.wind(20분)보다 짧아야 한다');
});

test('실패는 담아 두지 않는다 — 다음에 묻는 쪽이 다시 받는다 · both() 는 실패한 쪽만 null', async () => {
  const f = fakeFetch({ aws: { stations: [] }, gts: new Error('net down') });
  const store = createSurfaceObs({ fetchImpl: f.impl });
  await assert.rejects(store.doc('gts'), /net down/);
  const both = await store.both();
  assert.equal(both.gts, null);
  assert.ok(both.aws, '한쪽이 실패했다고 다른 쪽까지 버리면 안 된다');
  f.docs.gts = { stations: [9] };
  assert.deepEqual(await store.doc('gts'), { stations: [9] }, '실패한 약속을 들고 있었다');
  assert.equal(store.stats().fetches.gts, 3);
});

test('HTTP 오류와 시간 초과는 던진다 — 빈 문서를 지어내지 않는다', async () => {
  const f = fakeFetch({ aws: 404, gts: { stations: [] } });
  await assert.rejects(createSurfaceObs({ fetchImpl: f.impl }).doc('aws'), /HTTP 404/);
  const hang = createSurfaceObs({ fetchImpl: () => new Promise(() => {}), timeoutMs: 20 });
  await assert.rejects(hang.doc('aws'), /timeout/);
  await assert.rejects(createSurfaceObs({ fetchImpl: f.impl }).doc('radar'), /unknown/);
});

test('v2 에서 이 두 파일을 받던 네 자리가 전부 공용 저장소를 쓴다 — import URL 도 글자까지 같다', () => {
  const IMPORT = "import { surfaceObs } from './surface-obs.js?v=1';";
  const live = src('live-layers.js');
  const synop = src('station-model.js');
  const main = src('main.js');
  for (const [name, text] of [['live-layers.js', live], ['station-model.js', synop], ['main.js', main]]) {
    assert.ok(text.includes(IMPORT), `${name} 이 공용 저장소를 같은 URL 로 import 하지 않는다`);
    // 코드 줄(주석 아님)에 두 파일의 주소가 남아 있으면 누군가 따로 받고 있다는 뜻이다.
    const code = text.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    const own = code.filter((l) => /fetch\w*\(\s*['"`][^'"`]*\/wind\/(kma-aws|gts-global)\.json/.test(l)
      || /_URL\s*=\s*['"]\/wind\/(kma-aws|gts-global)\.json/.test(l));
    assert.deepEqual(own, [], `${name} 이 관측 문서를 아직 따로 받는다`);
  }
  // 바람('wind')은 같은 묶음에서 관측소 JSON 을 아예 안 받게 됐다 — GFS 10 m 프레임의 입자 층이다(js/wind-layer.js).
  // 두 작업을 합친 뒤에는 '바람이 저장소를 쓴다'가 아니라 '바람이 관측 문서를 따로 받지 않는다'가 지킬 것이다(위 own 검사가 본다).
  assert.doesNotMatch(live, /case 'wind':[\s\S]{0,200}surfaceObs\.doc\(/, "바람이 다시 관측소 JSON 을 받는다 — 막대기로 돌아가는 길이다");
  assert.match(live, /case 'tempanom':[\s\S]{0,80}surfaceObs\.doc\('aws'\)/);
  assert.match(synop, /await surfaceObs\.both\(\)/);
});

test('저장소는 아무것도 import 하지 않는다 — v1(prototype/js)도 THREE 도 모른다', () => {
  const code = src('surface-obs.js').split('\n').filter((l) => !l.trim().startsWith('//'));
  assert.equal(code.filter((l) => /^\s*import\s/.test(l)).length, 0);
});
