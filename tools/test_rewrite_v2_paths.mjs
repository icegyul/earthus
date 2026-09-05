import test from 'node:test';
import assert from 'node:assert/strict';
import { rewriteV2Paths, relativeModuleSpecifiers } from './rewrite_v2_paths.mjs';

test('module vendor and engine paths follow the existing self-contained v2 deployment layout', () => {
  const source = [
    "import * as THREE from '../../vendor/three-r184.module.min.js';",
    "import { K } from '../../js/earthus2/v02/core/constants.js';",
    "const extra = await import('../../js/earthus2/v11/event/event-fusion.js');",
    "const aetherus = import('../../js/aetherus/layer-three.js');",
    "const root = '../../js/earthus2/v02';",
  ].join('\n');
  const result = rewriteV2Paths(source);
  assert.match(result.code, /from '\.\.\/vendor\/three-r184/);
  assert.match(result.code, /from '\.\.\/engine\/core\/constants.js'/);
  assert.match(result.code, /import\('\.\.\/engine-v11\/event\/event-fusion.js'\)/);
  assert.match(result.code, /import\('\.\/aetherus\/layer-three.js'\)/);
  assert.match(result.code, /const root = '\.\.\/engine'/);
  assert.equal(result.rewrites.length, 5);
});

test('document fetch paths change but module URL data, imports and arbitrary data strings stay relative to their owner', () => {
  const source = [
    "fetch('../data/country-reference.json');",
    'fetch("../data/tourism/kto-discovery.json");',
    'fetch(`../data/tourism/${mode}.json`);',
    "fetch(new URL('../data/tourism/kto-barrier-free.json', import.meta.url));",
    'fetch(new URL(`../data/tourism/${TRAVEL_CATALOGS[mode].file}`, import.meta.url));',
    "import record from '../data/record.json';",
    "const moduleData = '../data/catalog.json';",
    'const art = `../v2/assets/physical-earth/ne2-base-${px}.jpg`;',
  ].join('\n');
  const result = rewriteV2Paths(source);
  assert.match(result.code, /fetch\('\.\/data\/country-reference.json'\)/);
  assert.match(result.code, /fetch\(`\.\/data\/tourism\/\$\{mode\}.json`\)/);
  assert.match(result.code, /new URL\('\.\.\/data\/tourism\/kto-barrier-free.json', import.meta.url\)/);
  assert.ok(result.code.includes('new URL(`../data/tourism/${TRAVEL_CATALOGS[mode].file}`, import.meta.url)'));
  assert.match(result.code, /import record from '\.\.\/data\/record.json'/);
  assert.match(result.code, /const moduleData = '\.\.\/data\/catalog.json'/);
  assert.ok(result.code.includes('`./assets/physical-earth/ne2-base-${px}.jpg`'));
  assert.equal(result.rewrites.length, 4);
});

test('comments and regex evidence remain byte-identical; real imports inside expressions are found', () => {
  const comment = "// import x from '../../vendor/keep.js';\n/* fetch('../data/keep.json') */\n";
  const regex = "const pattern = /fetch\\('..\\/data\\/keep.json'\\)/;\n";
  const source = comment + regex + "const result = { value: import('../../vendor/real.js') };";
  const result = rewriteV2Paths(source);
  assert.ok(result.code.startsWith(comment + regex));
  assert.deepEqual(relativeModuleSpecifiers(result.code), ['../vendor/real.js']);
});

test('template expressions can contain real fetches and nested module-relative URLs', () => {
  const source = 'const html = `text ${await fetch(`../data/${name}.json`)} ${new URL(`../data/${name}.json`, import.meta.url)}`;';
  const result = rewriteV2Paths(source);
  assert.ok(result.code.includes('fetch(`./data/${name}.json`)'));
  assert.ok(result.code.includes('new URL(`../data/${name}.json`, import.meta.url)'));
  assert.equal(result.rewrites.length, 1);
});

test('rewriting is idempotent and preserves third-party, absolute and current v2 paths', () => {
  const source = "fetch('https://earthus.net/data/a.json'); import x from './source-context.js'; fetch('/data/a.json'); fetch('./data/a.json');";
  assert.equal(rewriteV2Paths(source).code, source);
  const changed = rewriteV2Paths("import x from '../../vendor/a.js'; fetch('../data/b.json');").code;
  assert.equal(rewriteV2Paths(changed).code, changed);
});
