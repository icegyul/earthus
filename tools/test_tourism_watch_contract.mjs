import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [push, ui, tick, tourismUi] = await Promise.all([
  read('prototype/js/push.js'), read('prototype/js/ui-alerts.js'),
  read('prototype/supabase/functions/push-tick/index.ts'), read('prototype/js/ui-tourism.js'),
]);

assert.match(push, /'tourism'/);
assert.match(push, /tourism_place_code/);
assert.match(push, /tourism_min_rank/);
assert.match(tourismUi, /tourism_min_rank:\s*3/);
assert.match(ui, /관광 혼잡/);
assert.match(ui, /const max = 20/);
assert.doesNotMatch(ui, /무료 1곳|구독하면 20곳|paid \? 20 : 1/);
assert.match(tick, /grab\('tourism\/seoul-flow\.json'\)/);
assert.match(tick, /place\?\.state === 'LIVE'/);
assert.match(tick, /Date\.now\(\) - observed <= 20 \* 60_000/);
assert.match(tick, /3 \* 3600_000/);
assert.match(tick, /운영시간·입장 가능·안전을 뜻하지 않습니다/);
assert.match(tick, /\?view=data&layer=tourism/);
assert.doesNotMatch(tick, /tourism[\s\S]{0,600}urgent:\s*true/);

console.log('tourism watch and push evidence contract: PASS');
