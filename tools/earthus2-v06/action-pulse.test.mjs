import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestPublicActionRecord } from '../../prototype/js/earthus2/v06/action/ingestion.js';
import { resolveActionStatus } from '../../prototype/js/earthus2/v06/action/status-resolver.js';
import { publicMapLocator } from '../../prototype/js/earthus2/v06/action/location-precision.js';
import { compileEarthPulse, pulsePriority } from '../../prototype/js/earthus2/v06/pulse/earth-pulse-orchestrator.js';
import { pulseBudget, selectPulseBeacons } from '../../prototype/js/earthus2/v06/pulse/pulse-scene-budget.js';

const now = Date.parse('2026-09-05T05:00:00Z');

test('official public action may be ACTIVE and live-labelled only from official source', () => {
  const r = ingestPublicActionRecord({ title:'부산 해변 정화 활동', city:'부산', country:'KR', startsAt:'2026-09-05T04:00:00Z', endsAt:'2026-09-05T07:00:00Z' }, { id:'ngo1', organization:'Example NGO', type:'OFFICIAL_RSS', url:'https://example.org' }, { now });
  assert.equal(r.status, 'ACTIVE');
  assert.equal(r.truthClass, 'OFFICIAL_ACTION');
  assert.equal(r.liveLabelAllowed, true);
});

test('news-only action cannot be labelled live official action', () => {
  const r = ingestPublicActionRecord({ title:'환경 캠페인', city:'서울', startsAt:'2026-09-05T04:00:00Z', endsAt:'2026-09-05T07:00:00Z' }, { id:'n1', organization:'News', type:'NEWS_REPORT' }, { now });
  assert.equal(r.liveLabelAllowed, false);
  assert.equal(r.truthClass, 'NEWS_REPORTED');
});

test('action status state machine handles scheduled active completed cancelled', () => {
  assert.equal(resolveActionStatus({ startsAt:'2026-09-06T00:00:00Z' }, now), 'SCHEDULED');
  assert.equal(resolveActionStatus({ startsAt:'2026-09-05T04:00:00Z', endsAt:'2026-09-05T07:00:00Z' }, now), 'ACTIVE');
  assert.equal(resolveActionStatus({ endsAt:'2026-09-05T04:30:00Z' }, now), 'COMPLETED');
  assert.equal(resolveActionStatus({ cancelled:true }, now), 'CANCELLED');
});

test('location precision never invents exact coordinates', () => {
  assert.deepEqual(publicMapLocator({ city:'서울', country:'KR' }), { precision:'CITY', label:'서울', disambig:'KR' });
  const guessed = publicMapLocator({ lat:37.5, lon:127.0, city:'서울' });
  assert.equal(guessed.precision, 'CITY');
  const exact = publicMapLocator({ lat:37.5, lon:127.0, coordinatesExplicitlyPublished:true });
  assert.equal(exact.precision, 'EXACT_PUBLIC');
});

test('official safety always outranks news and NGO actions', () => {
  const hazard = pulsePriority({ eventType:'WILDFIRE', officialSafety:true, severity:4 });
  const news = pulsePriority({ kind:'NEWS', freshness:1, confidence:1, geographicRelevance:1, publicInterest:1 });
  const action = pulsePriority({ kind:'ACTION', freshness:1, confidence:1, geographicRelevance:1, publicInterest:1 });
  assert.ok(hazard > news && hazard > action);
});

test('pulse orchestrator merges event news and action without changing truth', () => {
  const out = compileEarthPulse({ events:[{id:'e', officialSafety:true, eventType:'FLOOD'}], news:[{id:'n'}], actions:[{id:'a'}] });
  assert.equal(out.length, 3);
  assert.equal(out[0].id, 'e');
});

test('pulse scene budget is bounded and lower on mobile safe mode', () => {
  assert.equal(pulseBudget({device:'desktop',scope:'global',thermal:'NORMAL'}),12);
  assert.ok(pulseBudget({device:'mobile',scope:'global',thermal:'SAFE'}) < 7);
  const picked = selectPulseBeacons(Array.from({length:30},(_,i)=>({id:String(i),priorityScore:i})), {device:'mobile',scope:'global'});
  assert.equal(picked.length,7);
  assert.equal(picked[0].priorityScore,29);
});
