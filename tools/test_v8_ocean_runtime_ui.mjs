import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [ui, css] = await Promise.all([
  read('prototype/js/ui-ocean.js'), read('prototype/css/v8-shell.css'),
]);

assert.match(ui, /const OCEAN_V8_RUNTIME = Object\.freeze/);
assert.match(ui, /surfaceScalar:\s*'AVAILABLE'/);
assert.match(ui, /vectorField:\s*'UNAVAILABLE'/);
assert.match(ui, /rightsState:\s*'DRAFT'/);
assert.match(ui, /value:\s*0,\s*native:\s*true,\s*available:\s*true/);
assert.match(ui, /value:\s*-100,\s*native:\s*false,\s*available:\s*false/);
assert.match(ui, /value:\s*-500,\s*native:\s*false,\s*available:\s*false/);
assert.match(ui, /class="ocean-engine-state"/);
assert.match(ui, /data-ocean-follow[^>]*disabled/);
assert.match(ui, /data-ocean-cinema[^>]*disabled/);
assert.match(ui, /방향 벡터가 없어 Follow를 시작하지 않습니다/);
assert.match(ui, /권리 검토 중/);
assert.doesNotMatch(ui, /예측 항로|predicted trajectory/i);
assert.match(css, /\.ocean-engine-state/);
assert.match(css, /\.ocean-depth-levels/);

console.log('EARTHUS v8 ocean runtime UI: PASS');
