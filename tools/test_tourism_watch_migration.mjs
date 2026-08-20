import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../prototype/supabase/migrations/20260820090000_tourism_flow_watch.sql', import.meta.url), 'utf8');
assert.match(sql, /add column if not exists tourism boolean/);
assert.match(sql, /tourism_place_code ~ '\^POI\[0-9\]\{3\}\$'/);
assert.match(sql, /tourism_min_rank between 1 and 4/);
assert.match(sql, /if n >= 20/);
assert.doesNotMatch(sql, /tier = 'paid'|then 20 else 1/);
assert.match(sql, /drop function if exists public\.push_targets\(\)/);
assert.match(sql, /tourism boolean, tourism_place_code text, tourism_min_rank integer/);
for (const event of ['tourism.place_viewed', 'tourism.forecast_selected', 'tourism.watch_changed']) {
  assert.match(sql, new RegExp(event.replace('.', '\\.')));
}
assert.match(sql, /'placeClass','forecastClass'/);
console.log('tourism watch database migration: PASS');
