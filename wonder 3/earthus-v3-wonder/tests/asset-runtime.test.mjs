import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetRuntime } from '../packages/asset-runtime/src/loader.mjs';

const REG = { 'a.webp': { sha256: 'aaaaaaaaaaaa0000', bytes: 10 }, 'b.webp': { sha256: 'bbbbbbbbbbbb0000', bytes: 20 }, 'c.webp': { sha256: 'cccccccccccc0000', bytes: 25 } };
const mk = (opts = {}) => {
  const calls = [];
  const behaviors = opts.behaviors ?? {};
  const load = async (url, { path, signal }) => {
    calls.push(url);
    const b = behaviors[path];
    if (b?.failTimes && (b.failed = (b.failed ?? 0) + 1) <= b.failTimes) throw new Error('boom');
    if (b?.hang) await new Promise(() => {});
    if (b?.delayMs) await new Promise(r => setTimeout(r, b.delayMs));
    return { url, close() { this.closed = true; } };
  };
  let t = 0;
  const rt = createAssetRuntime({ lookup: p => REG[p], load, base: '/x/', budgetBytes: opts.budgetBytes ?? 1e9, maxRetries: opts.maxRetries ?? 2, timeoutMs: opts.timeoutMs ?? 50, backoffMs: 1, sleep: ms => new Promise(r => setTimeout(r, Math.min(ms, 2))), now: () => ++t });
  return { rt, calls };
};

test('URL 은 레지스트리 해시로 버전 표시, 캐시 히트는 다시 받지 않는다', async () => {
  const { rt, calls } = mk();
  const e = await rt.get('a.webp');
  assert.equal(e.value.url, '/x/a.webp?v=aaaaaaaaaaaa');
  await rt.get('a.webp');
  assert.equal(calls.length, 1); assert.equal(rt.status().hits, 1); assert.ok(rt.has('a.webp'));
});

test('동시 요청은 하나로 합친다 (dedupe)', async () => {
  const { rt, calls } = mk({ behaviors: { 'a.webp': { delayMs: 5 } } });
  const [x, y, z] = await Promise.all([rt.get('a.webp'), rt.get('a.webp'), rt.get('a.webp')]);
  assert.equal(calls.length, 1); assert.ok(x === y && y === z);
});

test('실패하면 재시도(2회) 뒤 성공, 재시도 횟수를 센다', async () => {
  const { rt, calls } = mk({ behaviors: { 'a.webp': { failTimes: 2 } } });
  await rt.get('a.webp');
  assert.equal(calls.length, 3); assert.equal(rt.status().retries, 2); assert.equal(rt.status().failures, 0);
});

test('maxRetries 를 넘기면 실패로 끝나고 failures 가 는다 — 호출부가 폴백할 수 있게', async () => {
  const { rt, calls } = mk({ behaviors: { 'a.webp': { failTimes: 99 } } });
  await assert.rejects(rt.get('a.webp'), /load failed after 3 tries/);
  assert.equal(calls.length, 3); assert.equal(rt.status().failures, 1); assert.ok(!rt.has('a.webp'));
});

test('타임아웃은 실패로 취급하고 재시도한다', async () => {
  const { rt } = mk({ behaviors: { 'a.webp': { hang: true } }, maxRetries: 1, timeoutMs: 5 });
  await assert.rejects(rt.get('a.webp'), /load failed/);
  assert.equal(rt.status().timeouts, 2);
});

test('취소: 진행 중 요청을 cancel 하면 결과를 버린다', async () => {
  const { rt } = mk({ behaviors: { 'a.webp': { delayMs: 10 } } });
  const p = rt.get('a.webp');
  assert.ok(rt.cancel('a.webp'));
  await assert.rejects(p, /cancelled/);
  assert.ok(!rt.has('a.webp')); assert.equal(rt.status().cancelled, 1);
});

test('stale: 레지스트리 해시가 바뀌면 옛 사본을 버리고 다시 받는다', async () => {
  const reg = { 'a.webp': { sha256: '111111111111', bytes: 10 } };
  const calls = [];
  const rt = createAssetRuntime({ lookup: p => reg[p], load: async url => { calls.push(url); return { url, close() { this.closed = true; } }; } });
  const first = await rt.get('a.webp');
  reg['a.webp'] = { sha256: '222222222222', bytes: 10 };
  const second = await rt.get('a.webp');
  assert.equal(calls.length, 2); assert.notEqual(first, second); assert.equal(rt.status().stale, 1); assert.ok(first.value.closed);
  assert.equal(second.value.url, 'a.webp?v=222222222222');
});

test('예산: 상주 바이트가 예산을 넘으면 오래된 것부터 비운다(pinned 제외), unload/unloadWhere', async () => {
  const { rt } = mk({ budgetBytes: 40 });
  const a = await rt.get('a.webp', { pin: true });   // 10, pinned
  await rt.get('b.webp');                             // 20 → 30
  await rt.get('c.webp');                             // 25 → 55 > 40 → b 비움(a 는 pinned)
  const s = rt.status();
  assert.equal(s.evictions, 1); assert.ok(!rt.has('b.webp')); assert.ok(rt.has('a.webp') && rt.has('c.webp')); assert.equal(s.residentBytes, 35);
  assert.ok(rt.unload('c.webp')); assert.equal(rt.status().residentBytes, 10);
  rt.pin('a.webp', false);
  assert.equal(rt.unloadWhere(e => e.path.startsWith('a')), 1); assert.equal(rt.status().resident, 0);
  assert.ok(a.value.closed);
});
