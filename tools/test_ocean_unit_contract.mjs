#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(path.join(root, relative), 'utf8');
const [globalCollector, eastAsiaCollector, fishing, beaches, overlay, uiSource, today, stats] = await Promise.all([
  read('aws/marine-grid/handler.py'),
  read('aws/marine-ea/handler.py'),
  read('prototype/js/fishing.js'),
  read('prototype/js/beaches.js'),
  read('prototype/js/gridoverlay.js'),
  read('prototype/js/ui-source.js'),
  read('prototype/js/today.js'),
  read('prototype/js/stats.js'),
]);

assert.match(globalCollector, /OISST_DAILY[\s\S]*sst-global\.json/,
  'global SST must come from a dedicated NOAA OISST observation object');
assert.match(globalCollector, /SST_RES\s*=\s*1\.0/,
  'global SST must be fine enough to preserve narrow seas such as the Mediterranean');
assert.match(globalCollector, /row\[half:\]\s*\+\s*row\[:half\]/,
  'NOAA 0..360 longitude rows must rotate to the -180..180 display seam');
assert.match(globalCollector, /마지막 정상판 유지/,
  'an OISST fetch failure must preserve the previous public observation object');
assert.match(eastAsiaCollector, /"sst": current[\s\S]*"sstAnom": diff/,
  'East Asia must expose the same-date 0.5 degree OISST observation with its anomaly');
assert.match(overlay, /sst:\s*'sstGlobal'/,
  'global SST must use the NOAA observation object instead of the 5 degree wave model');
assert.match(overlay, /sstGlobal:[\s\S]*sst-global\.json/,
  'the NOAA OISST public object must be connected to the renderer');
assert.match(overlay, /Math\.floor\(4096 \/ Math\.max\(W, H\)\)/,
  'the 1 degree global texture must remain within the mobile 4096px limit');
assert.match(overlay, /key === 'sst'[\s\S]*return 'sstAnomEa'/,
  'East Asia zoom must use the same NOAA observation at 0.5 degrees');
assert.match(uiSource, /sst:[\s\S]*NOAA OISST v2\.1 일별 관측[\s\S]*every:\s*1440/,
  'the visible source note must identify SST as a daily NOAA observation');
assert.match(today, /id:\s*'sst'[\s\S]{0,100}?src:\s*'sstGlobal'/,
  'Today cards must not rank the superseded 5 degree model SST');
assert.match(stats, /load\('sstGlobal'\)/,
  'global SST statistics must use the same observation grid as the map');

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
