#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(path.join(root, relative), 'utf8');
const [globalCollector, eastAsiaCollector, fishing, beaches] = await Promise.all([
  read('aws/marine-grid/handler.py'),
  read('aws/marine-ea/handler.py'),
  read('prototype/js/fishing.js'),
  read('prototype/js/beaches.js'),
]);

for (const [name, source] of [['marine-grid', globalCollector], ['marine-ea', eastAsiaCollector]]) {
  assert.match(source, /"wind_speed_unit":\s*"ms"/, `${name} does not request m/s`);
  assert.match(source, /"cell_selection":\s*"sea"/, `${name} does not prefer sea cells`);
  assert.match(source, /unit == "km\/h"[\s\S]*value \/ 3\.6/, `${name} lacks km/h fallback conversion`);
  assert.match(source, /unit != "m\/s"[\s\S]*raise ValueError/, `${name} accepts unknown current units`);
  assert.match(source, /"cur": "m\/s"/, `${name} output contract is not m/s`);
}

assert.match(fishing, /wind_speed_unit:\s*'ms'/);
assert.match(fishing, /currentVelocityMs\(c\.ocean_current_velocity/);
assert.match(fishing, /sourceUnit === 'km\/h'[\s\S]*Number\(value\) \/ 3\.6/);
assert.match(fishing, /timezone:\s*'GMT'/);
assert.match(fishing, /cell_selection:\s*'sea'/);
assert.doesNotMatch(fishing, /timezone:\s*'auto'/);
assert.match(beaches, /timezone:\s*'GMT'/);
assert.match(beaches, /cell_selection:\s*'sea'/);
assert.doesNotMatch(beaches, /timezone:\s*'auto'/);

console.log('PASS: Open-Meteo current velocity is requested/validated as m/s and marine time is offset-explicit');
