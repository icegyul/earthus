import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { QUESTION_ENTRIES, EXPERT_SATELLITE_IDS, matchesLayerQuery, partitionLayerItems, clearSelectedLayers, openQuestionEntry } from '../prototype/js/menu-information.js';

test('layer searches match all words across the existing Korean and English description', () => {
  const channel = '천리안2A 야간 하층운 Chollian-2A night low cloud 아시아·태평양 전체 밤에만 8km';
  assert.equal(matchesLayerQuery(channel, '천리안 밤'), true);
  assert.equal(matchesLayerQuery(channel, 'NIGHT   8KM'), true);
  assert.equal(matchesLayerQuery(channel, 'ｎｉｇｈｔ'), true);
  assert.equal(matchesLayerQuery(channel, '천리안 낮'), false);
  assert.equal(matchesLayerQuery(channel, '   '), true);
});

test('expert grouping preserves every layer once and never hides future regular additions', () => {
  const items = [{ id: 'clouds' }, { id: 'gk2aIR' }, { id: 'temp' }, { id: 'new-observation' }, { id: 'clouds' }, { id: 'gk2aAuto' }];
  const saved = JSON.stringify(items);
  const result = partitionLayerItems(items, ['clouds', 'gk2aAuto']);
  assert.deepEqual(result.quick.map(x => x.id), ['clouds', 'gk2aAuto']);
  assert.deepEqual(result.expert.map(x => x.id), ['gk2aIR']);
  assert.deepEqual(result.regular.map(x => x.id), ['temp', 'new-observation']);
  assert.equal(Object.values(result).flat().length, 5);
  assert.equal(JSON.stringify(items), saved);
});

test('every existing v1 menu item survives the new grouping including the 8 expert channels', async () => {
  const code = await readFile(new URL('../prototype/js/layerbar.js', import.meta.url), 'utf8');
  const source = code.slice(code.indexOf('export const ITEMS = ['), code.indexOf('];', code.indexOf('export const ITEMS = [')));
  const items = [...source.matchAll(/\{\s*id:\s*'([^']+)'/g)].map(match => ({ id: match[1] }));
  assert.ok(items.length >= 49);
  const partition = partitionLayerItems(items, ['clouds', 'truecolor', 'gk2aAuto', 'himawari']);
  assert.equal(new Set(Object.values(partition).flat().map(x => x.id)).size, new Set(items.map(x => x.id)).size);
  assert.deepEqual(partition.expert.map(x => x.id).sort(), [...EXPERT_SATELLITE_IDS].sort());
});

test('clear all follows individual teardown calls for active layers including background imagery', () => {
  const active = new Set(['clouds', 'wind', 'quake']);
  const events = [];
  const state = {
    isOn: id => active.has(id),
    setLayer: (id, on) => { events.push([id, on]); if (!on) active.delete(id); },
  };
  const definitions = ['clouds', 'temp', 'wind', 'quake'].map(id => ({ id }));
  assert.equal(clearSelectedLayers(definitions, state), 3);
  assert.deepEqual(events, [['clouds', false], ['wind', false], ['quake', false]]);
  assert.equal(active.size, 0);
  assert.equal(clearSelectedLayers(definitions, state), 0);
});

test('question buttons dispatch each intended existing screen once and reject unknown routes', async () => {
  const calls = [];
  const handlers = Object.fromEntries(QUESTION_ENTRIES.map(({ id }) => [id, async () => calls.push(id)]));
  for (const { id } of QUESTION_ENTRIES) assert.equal(await openQuestionEntry(id, handlers), true);
  assert.deepEqual(calls, ['weather', 'alerts', 'ocean', 'travel', 'sky']);
  assert.equal(await openQuestionEntry('not-a-screen', handlers), false);
  assert.equal(await openQuestionEntry('weather', {}), false);
  await assert.rejects(() => openQuestionEntry('weather', { weather: async () => { throw new Error('source unavailable'); } }), /source unavailable/);
});
