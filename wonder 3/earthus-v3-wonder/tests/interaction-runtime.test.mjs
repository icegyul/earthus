import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACTIONS, MOVES, resolveTap, resolveLongPress, resolveFart, getFx,
  normalizeEntry, validateManifest, profileOf, expandSpecial, contextFromEnvironment,
} from '../packages/interaction-runtime/src/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK_JSON = path.join(ROOT, 'content', 'pack-1.8', 'characters-124-interactions.json');
const CONTRACT = path.join(ROOT, 'packages', 'interaction-runtime', 'contract', 'wonder-interaction-engine.ts');

const yeti = { id: 'yeti', actions: ['greet', 'wave', 'focus', 'point'], fartEnabled: true, special: 'wave', fallback: 'sprite-reaction' };
const nessie = { id: 'nessie', actions: ['greet', 'wiggle', 'focus', 'point'], fartEnabled: false, special: 'wiggle', fallback: 'sprite-reaction' };
const pointer = { id: 'x', actions: ['greet', 'point'], fartEnabled: false, special: 'point', fallback: 'sprite-reaction' };

test('계약 원본(TS)이 팩 1.8 그대로 동봉되어 있다', () => {
  const ts = fs.readFileSync(CONTRACT, 'utf8');
  assert.equal(ts.length, 1573, '팩 1.8 실측 1,573 B');
  for (const fn of ['resolveTap', 'resolveLongPress', 'resolveFart', 'getFx']) assert.match(ts, new RegExp(`export function ${fn}\\(`));
});

test('resolveTap: greet → special, reducedMotion 이면 greet → reaction', () => {
  assert.deepEqual(resolveTap(yeti), ['greet', 'wave']);
  assert.deepEqual(resolveTap(nessie), ['greet', 'wiggle']);
  assert.deepEqual(resolveTap(yeti, { reducedMotion: true }), ['greet', 'reaction']);
});

test('resolveLongPress: focus → point (special 이 point 면 look), reducedMotion 이면 focus 만', () => {
  assert.deepEqual(resolveLongPress(yeti), ['focus', 'point']);
  assert.deepEqual(resolveLongPress(pointer), ['focus', 'look']);
  assert.deepEqual(resolveLongPress(yeti, { reducedMotion: true }), ['focus']);
});

test('resolveFart: fartEnabled 만 fart, 아니면 reaction', () => {
  assert.deepEqual(resolveFart(yeti), ['fart']);
  assert.deepEqual(resolveFart(nessie), ['reaction']);
});

test('getFx: 계약과 같은 매핑, 파일 이름만 돌려준다', () => {
  assert.equal(getFx('wave'), 'wave-lines.svg');
  assert.equal(getFx('point'), 'point-glow.svg');
  assert.equal(getFx('fart'), 'fart-cloud.svg');
  for (const a of ['special', 'reaction', 'greet']) assert.equal(getFx(a), 'sparkle.svg');
  for (const a of ['focus', 'look', 'jump', 'nod', 'wiggle']) assert.equal(getFx(a), null);
  assert.equal(getFx('nope'), null);
});

test('normalizeEntry: 문자열 lat/lon·쉼표 moves 를 숫자·배열로', () => {
  const r = normalizeEntry({ slug: 'a', name: 'A', lat: '27.99', lon: '-4.44', moves: 'stomp, wave,nod', interaction: { fart: false, fartStyle: 'x' } });
  assert.equal(r.lat, 27.99); assert.equal(r.lon, -4.44);
  assert.deepEqual(r.moves, ['stomp', 'wave', 'nod']);
  assert.equal(r.interaction.fartStyle, null, 'fart:false 면 style 을 버린다');
  assert.equal(r.interaction.fallback, 'sprite-reaction');
});

test('validateManifest: 잘못된 항목은 그것만 뺀다', () => {
  const good = { slug: 'ok', name: 'OK', category: 'animal', league: 'BIPED_PAPER', lat: 1, lon: 2, moves: ['jump', 'nod', 'wave'], interaction: { tap: ['greet', 'jump', 'special'], longPress: ['focus', 'point', 'special'], special: 'jump', fart: false, fartStyle: null, fallback: 'sprite-reaction' } };
  const bad = { ...good, slug: 'bad', name: 'BAD', interaction: { ...good.interaction, special: 'spin' } }; // special 이 moves 에 없음
  const dup = { ...good };
  const { rows, errors } = validateManifest([good, bad, dup]);
  assert.equal(rows.length, 1);
  assert.deepEqual(errors.map(e => e.slug), ['bad', 'ok']);
  assert.match(errors[0].reason, /special/);
  assert.match(errors[1].reason, /중복/);
});

test('팩 1.8 의 124종 manifest: 오류 0, 분포 43/40/41, fart 20, special ∈ moves', () => {
  const list = JSON.parse(fs.readFileSync(PACK_JSON, 'utf8'));
  const { rows, errors, counts } = validateManifest(list);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 124);
  assert.deepEqual(counts, { folklore: 43, prehistoric: 40, animal: 41 });
  assert.equal(rows.filter(r => r.interaction.fart).length, 20);
  for (const r of rows) {
    assert.ok(r.moves.includes(r.interaction.special), r.slug);
    assert.deepEqual(r.interaction.longPress, ['focus', 'point', 'special'], r.slug);
    assert.equal(r.interaction.tap[0], 'greet', r.slug);
  }
  const specials = new Set(rows.map(r => r.interaction.special));
  assert.deepEqual([...specials].sort(), ['flap', 'jump', 'wave', 'wiggle']);
});

test('profileOf + expandSpecial: 124종 전부 계약 프로필이 되고 special 이 실제 동작으로 풀린다', () => {
  const list = JSON.parse(fs.readFileSync(PACK_JSON, 'utf8'));
  const { rows } = validateManifest(list);
  for (const r of rows) {
    const p = profileOf(r);
    assert.equal(p.id, r.slug);
    assert.equal(p.fallback, 'sprite-reaction');
    assert.ok(p.actions.includes('greet') && p.actions.includes('focus'));
    assert.equal(p.actions.includes('fart'), r.interaction.fart);
    const tap = expandSpecial(resolveTap(p), p);
    assert.equal(tap[1], r.interaction.special);
    assert.ok(!tap.includes('special'));
    for (const a of p.actions) assert.ok(ACTIONS.includes(a) || MOVES.includes(a), `${r.slug}: ${a}`);
  }
  const y = profileOf(rows.find(r => r.slug === 'yeti'));
  assert.deepEqual(resolveFart(y), ['fart']);
  const h = profileOf(rows.find(r => r.slug === 'haetae'));
  assert.deepEqual(resolveFart(h), ['reaction']);
});

test('contextFromEnvironment: Node 에서는 reducedMotion=false, matchMedia 가 있으면 그 값', () => {
  assert.deepEqual(contextFromEnvironment({}), { reducedMotion: false });
  assert.deepEqual(contextFromEnvironment({ matchMedia: () => ({ matches: true }) }), { reducedMotion: true });
});
