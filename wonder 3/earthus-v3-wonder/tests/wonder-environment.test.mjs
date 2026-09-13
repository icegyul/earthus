import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEnvironmentFlow, STATES, TIMINGS } from '../packages/wonder-environment/src/environment-state.mjs';
import { environmentAt, environmentAssets } from '../packages/wonder-environment/src/environments.mjs';
import { REGIONS } from '../packages/globe-engine/src/regions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const read = p => JSON.parse(fs.readFileSync(path.join(CONTENT, p), 'utf8'));

test('환경 흐름: earth → approaching → unfolding → active → folding → zooming-out → earth, 첫 방문/재방문 타이밍', () => {
  const f = createEnvironmentFlow();
  assert.equal(f.state, 'earth');
  const r = f.enter('himalaya');
  assert.ok(r.ok); assert.equal(f.state, 'approaching'); assert.equal(r.plan.mode, 'first');
  assert.ok(r.plan.unfoldMs >= 700 && r.plan.unfoldMs <= 1000, `첫 unfold ${r.plan.unfoldMs}ms`);
  assert.ok(f.approached() && f.state === 'unfolding');
  assert.ok(f.unfolded() && f.state === 'active' && f.discoveryReady);
  assert.equal(f.visitsOf('himalaya'), 1);
  const x = f.exit(); assert.ok(x.ok && f.state === 'folding');
  assert.ok(f.folded() && f.state === 'zooming-out');
  assert.ok(f.zoomedOut() && f.state === 'earth' && f.current === null);
  const r2 = f.enter('himalaya');
  assert.equal(r2.plan.mode, 'revisit');
  assert.ok(r2.plan.unfoldMs >= 150 && r2.plan.unfoldMs <= 250, `재방문 unfold ${r2.plan.unfoldMs}ms`);
  assert.ok(r2.plan.foldMs < TIMINGS.first.foldMs);
});

test('환경 흐름: reduced motion 은 전환 최소', () => {
  let reduced = true;
  const f = createEnvironmentFlow({ reducedMotion: () => reduced });
  const r = f.enter('savanna');
  assert.equal(r.plan.mode, 'reduced'); assert.ok(r.plan.unfoldMs <= 100 && r.plan.approachMs === 0 && r.plan.zoomOutMs === 0);
  reduced = false;
  f.approached(); f.unfolded(); f.exit(); f.folded(); f.zoomedOut();
  assert.equal(f.enter('savanna').plan.mode, 'revisit');
});

test('환경 흐름: 전환 중 재진입 거부, active 아닐 때 exit 거부, 20회 반복 뒤 상태 일관', () => {
  const f = createEnvironmentFlow();
  f.enter('amazon');
  assert.deepEqual(f.enter('himalaya'), { ok: false, reason: 'busy:approaching' });
  assert.equal(f.exit().ok, false);
  f.approached();
  assert.equal(f.exit().ok, false, 'unfolding 중 exit 불가');
  f.unfolded();
  assert.equal(f.enter('himalaya').ok, false, 'active 에서 다른 환경 직접 진입 불가 — 먼저 지구로');
  f.exit(); f.folded(); f.zoomedOut();
  for (let i = 0; i < 20; i++) {
    const id = ['himalaya', 'savanna', 'amazon'][i % 3];
    assert.ok(f.enter(id).ok, `${i}: enter`); f.approached(); f.unfolded(); assert.ok(f.exit().ok); f.folded(); f.zoomedOut();
  }
  assert.equal(f.state, 'earth');
  assert.equal(f.visitsOf('himalaya') + f.visitsOf('savanna') + f.visitsOf('amazon'), 21);
  f.enter('amazon'); f.abort(); assert.equal(f.state, 'earth'); assert.ok(f.enter('amazon').ok);
  assert.deepEqual(STATES.length, 6);
});

test('환경 카탈로그: 3곳, 지역·랜드마크·캐릭터·레지스트리와 맞고, descriptor 와 fact 가 분리돼 있다', () => {
  const cat = read('environments/environments.json');
  const landmarks = read('landmarks/landmarks.json');
  const reg = read('registry/asset-registry.json');
  const man = read('characters/manifest-124.json');
  const bySlug = new Map(man.map(m => [m.slug, m]));
  assert.equal(cat.environments.length, 3);
  assert.deepEqual(cat.environments.map(e => e.id), ['himalaya', 'savanna', 'amazon']);
  for (const e of cat.environments) {
    assert.ok(REGIONS.some(r => r.id === e.regionId), `${e.id}: regionId ${e.regionId}`);
    assert.ok(typeof e.descriptorKo === 'string' && e.descriptorKo.length >= 4);
    assert.equal(e.fact.verified, false, `${e.id}: fact 는 출처 확정 전 verified=false`);
    assert.notEqual(e.descriptorKo, e.fact.text);
    const lm = landmarks.items[e.landmark]; assert.ok(lm, `${e.id}: 랜드마크 ${e.landmark}`);
    const lmAsset = reg.assets.find(a => a.path === lm.path); assert.ok(lmAsset && lmAsset.kind === 'landmark' && lmAsset.load === 'region-lazy', `${e.id}: 랜드마크 레지스트리`);
    assert.ok(e.characters.length >= 1 && e.characters.length <= 2, `${e.id}: 대표 캐릭터는 1~2`);
    for (const slug of e.characters) {
      const c = bySlug.get(slug); assert.ok(c, slug);
      assert.ok(c.art.thumb && c.art.character && c.art.scene, `${slug}: thumb·runtime·scene 전부`);
      const th = reg.assets.find(a => a.path === c.art.thumb); assert.ok(th && th.kind === 'character-thumb' && th.load === 'lod1');
      assert.ok(Math.abs(c.lat - e.anchor.lat) < 0.01 && Math.abs(c.lon - e.anchor.lon) < 0.01, `${e.id}: anchor = 대표 캐릭터 좌표(자료)`);
    }
    const a = environmentAssets(e, bySlug, landmarks);
    assert.equal(a.thumbs.length, e.characters.length); assert.equal(a.runtimes.length, e.characters.length); assert.ok(a.landmark);
  }
  const thumbs = reg.assets.filter(a => a.kind === 'character-thumb');
  assert.ok(thumbs.length <= 3, `PHASE 1-B 썸네일은 대표 3종만 (${thumbs.length})`);
});

test('environmentAt: 반경 안 최근접, 밖이면 null', () => {
  const { environments } = read('environments/environments.json');
  assert.equal(environmentAt(27.99, 86.93, environments)?.environment.id, 'himalaya');
  assert.equal(environmentAt(27.1, 88, environments)?.environment.id, 'himalaya', '레서판다(싱갈릴라)');
  assert.equal(environmentAt(-2.2, 34.6, environments)?.environment.id, 'savanna', '얼룩말');
  assert.equal(environmentAt(-3.4, -62, environments)?.environment.id, 'amazon');
  assert.equal(environmentAt(-17.5, -57, environments), null, '재규어(판타나우)는 아마존 환경 밖');
  assert.equal(environmentAt(37.57, 126.98, environments), null, '서울 — 환경 없음(지역 포커스만)');
});
