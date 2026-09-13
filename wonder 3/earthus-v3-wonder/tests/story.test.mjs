import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEnvironmentFlow } from '../packages/wonder-environment/src/environment-state.mjs';
import { resolveTap, resolveLongPress, resolveFart, profileOf, expandSpecial } from '../packages/interaction-runtime/src/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const read = p => JSON.parse(fs.readFileSync(path.join(CONTENT, p), 'utf8'));

test('스토리 데이터: 3지역 × 대표 캐릭터, §14 필드, 장면은 manifest 의 scene, 미디어 필드는 null', () => {
  const { stories } = read('stories/stories.json');
  const { environments } = read('environments/environments.json');
  const man = new Map(read('characters/manifest-124.json').map(m => [m.slug, m]));
  const reg = read('registry/asset-registry.json');
  assert.equal(stories.length, 3);
  for (const env of environments) {
    const s = stories.find(x => x.locationId === env.id && x.characterId === env.characters[0]);
    assert.ok(s, `${env.id}: 대표 캐릭터 이야기`);
    for (const k of ['storyId', 'characterId', 'locationId', 'title', 'body', 'heroImage', 'sceneImages', 'narrationScript', 'audioUrl', 'videoUrl']) assert.ok(k in s, `${s.storyId}: ${k}`);
    assert.ok(s.title.length >= 2 && s.body.length >= 40 && s.body.length <= 400, `${s.storyId}: 본문 길이 ${s.body.length}`);
    assert.ok(['folklore', 'nature-fact'].includes(s.basis));
    assert.ok(Array.isArray(s.sources) && s.sources.length >= 1);
    assert.equal(s.narrationScript, null); assert.equal(s.audioUrl, null); assert.equal(s.videoUrl, null);
    const c = man.get(s.characterId);
    assert.equal(s.heroImage, c.art.character); assert.deepEqual(s.sceneImages, [c.art.scene]);
    assert.ok(reg.assets.some(a => a.path === c.art.scene && a.kind === 'character-scene' && a.load === 'on-demand'), `${s.storyId}: 장면은 on-demand`);
    if (s.basis === 'folklore') assert.equal(c.category, 'folklore'); else assert.equal(c.category, 'animal');
    assert.ok(!/\d{3,}/.test(s.body), `${s.storyId}: 본문에 구체 수치 없음(출처 확정 전)`);
  }
});

test('인터랙션 자격: 대표 3종의 tap/longPress/special/fart 는 manifest 정의를 따른다', () => {
  const man = new Map(read('characters/manifest-124.json').map(m => [m.slug, m]));
  const expect = { yeti: { special: 'wave', fart: true }, lion: { special: 'jump', fart: false }, 'electric-eel': { special: 'wiggle', fart: false } };
  for (const [slug, e] of Object.entries(expect)) {
    const row = man.get(slug); const p = profileOf(row);
    assert.equal(p.special, e.special, `${slug} special`); assert.ok(row.moves.includes(e.special), `${slug}: special ∈ moves`);
    assert.deepEqual(expandSpecial(resolveTap(p), p), ['greet', e.special], `${slug} tap`);
    assert.deepEqual(resolveTap(p, { reducedMotion: true }), ['greet', 'reaction']);
    assert.deepEqual(resolveLongPress(p), ['focus', 'point'], `${slug} longPress`);
    assert.deepEqual(resolveFart(p), e.fart ? ['fart'] : ['reaction'], `${slug} fart 자격`);
    assert.equal(p.fartEnabled, e.fart);
  }
  const all = read('characters/manifest-124.json');
  assert.equal(all.filter(r => r.interaction.fart).length, 20, 'fart 자격은 manifest 의 20종뿐 — 기본 행동이 아니다');
});

test('흐름 상태기: Story Card 는 active 에서만 열리고, 접히면 닫힌다', () => {
  const f = createEnvironmentFlow();
  assert.equal(f.openStory(), false, 'earth 에서 불가');
  f.enter('himalaya'); f.approached();
  assert.equal(f.openStory(), false, 'unfolding 중 불가');
  f.unfolded();
  assert.ok(f.openStory()); assert.equal(f.story, 'open');
  assert.equal(f.openStory(), false, '이미 열림');
  assert.ok(f.closeStory()); assert.equal(f.story, 'closed'); assert.equal(f.closeStory(), false);
  assert.ok(f.openStory());
  assert.ok(f.exit().ok); assert.equal(f.story, 'closed', 'Story → Environment → fold: 카드는 닫힌다');
  f.folded(); f.zoomedOut(); assert.equal(f.state, 'earth');
  f.enter('savanna'); f.approached(); f.unfolded(); f.openStory(); f.abort(); assert.equal(f.story, 'closed');
});
