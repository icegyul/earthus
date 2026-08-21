import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [layerbar, html, i18n] = await Promise.all([
  read('prototype/js/layerbar.js'), read('prototype/index.html'), read('prototype/js/i18n.js'),
]);

assert.match(layerbar, /id:\s*'human',[\s\S]{0,100}ko:\s*'사람·도시'[\s\S]{0,160}ids:\s*\['tourism',\s*'poi',\s*'coverage'\]/);
assert.doesNotMatch(layerbar, /id:\s*'station'[\s\S]{0,160}ids:[^\]]*'coverage'/,
  'observation coverage belongs to the human/city Earth layer group');
assert.match(layerbar, /const TRAVEL_CATEGORIES[\s\S]{0,180}ids:\s*\['tourism',\s*'poi'\]/);
assert.match(layerbar, /const isTravel = kind === 'travel'/);
assert.match(layerbar, /isTravel \? TRAVEL_CATEGORIES/);
assert.match(layerbar, /여행에서 켠 레이어는 지구 레이어와 같은 상태를 사용합니다/);

assert.match(html, /data-open="travel"/);
assert.match(html, /data-i18n="m\.travel"/);
assert.match(html, /data-i18n="m\.travelSub"/);
assert.match(i18n, /'m\.travel':\s*\{\s*ko:\s*'여행'/);
assert.match(i18n, /'m\.travelSub':\s*\{\s*ko:\s*'관광 흐름 · 명소'/);

console.log('EARTHUS v8 menu information architecture: PASS');
