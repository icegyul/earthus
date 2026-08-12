import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../prototype/js/safety-engine.js', import.meta.url), 'utf8');
const engine = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const [warningResponse, zoneResponse] = await Promise.all([
  fetch('https://earthus.net/events/kma-warn.json', { cache: 'no-store' }),
  fetch('https://earthus.net/events/kma-warn-stations.json', { cache: 'no-store' }),
]);
assert.equal(warningResponse.ok, true, `warning HTTP ${warningResponse.status}`);
assert.equal(zoneResponse.ok, true, `zones HTTP ${zoneResponse.status}`);
const snapshot = await warningResponse.json();
const zones = await zoneResponse.json();

assert.match(snapshot.source || '', /기상청/);
assert.match(snapshot.license || '', /공공누리 제1유형/);
assert.ok(snapshot.observedKst);
assert.equal(snapshot.activeCount, snapshot.active.length);
assert.equal(zones.count, zones.stations.length);

const stationByZone = new Map();
for (const station of zones.stations) if (!stationByZone.has(station.zone)) stationByZone.set(station.zone, station);
const warning = snapshot.active.find(item => stationByZone.has(item.regionId));
assert.ok(warning, '현재 발효 특보 중 공식 station-zone exact match fixture가 1개 이상 필요하다');
const station = stationByZone.get(warning.regionId);
const gate = engine.evaluateWarningSafety({
  snapshot,
  zones,
  coords: { lat: station.lat, lon: station.lon },
  nowMs: Date.now(),
});
assert.equal(gate.gate, 'OFFICIAL_WARNING_ACTIVE');
assert.equal(gate.activityAllowed, false);
assert.equal(gate.safeClaimAllowed, false);
assert.equal(gate.evidence.n, snapshot.activeCount);
assert.equal(gate.zone.id, warning.regionId);

console.log(`Safety live: KMA ${snapshot.activeCount} active · exact ${warning.region} ${warning.kind}${warning.level} · ${gate.freshness.status}`);
