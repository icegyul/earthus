import test from 'node:test';
import assert from 'node:assert/strict';
import { linkNewsToEarthEvent, clusterNewsByEvent } from '../../prototype/js/earthus2/v06/news/news-event-linker.js';
import { tourismDiscoveryScore, rankTourismDiscoveries } from '../../prototype/js/earthus2/v06/tourism/discovery.js';
import { composeTravelContext } from '../../prototype/js/earthus2/v06/tourism/travel-context.js';
import { normalizePollutionSignal, pollutionTransportGate, compilePollutionLens } from '../../prototype/js/earthus2/v06/environment/pollution-lens.js';

test('news does not auto-link to unrelated Earth Event', () => {
  const r = linkNewsToEarthEvent({ title:'부산 축제 개막', city:'부산', publishedAt:'2026-09-01T00:00:00Z' }, [{ id:'fire', title:'강원 산불', city:'강릉', startsAt:'2026-09-01T00:00:00Z' }]);
  assert.equal(r.autoLinked,false);
});

test('news cluster collapses many articles into one Earth Event cluster', () => {
  const r = clusterNewsByEvent([{earthEventId:'e1',title:'a'},{earthEventId:'e1',title:'b'},{earthEventId:'e2',title:'c'}]);
  assert.equal(r.find(x=>x.key==='e1').count,2);
  assert.equal(r.length,2);
});

test('tourism discovery hard-gates official restriction and hazards', () => {
  assert.equal(tourismDiscoveryScore({officialRestriction:true,demandSignal:1}).excluded,true);
  assert.equal(tourismDiscoveryScore({criticalHazard:true,weatherSuitability:1}).excluded,true);
});

test('tourism discovery uses bounded components and Earthus label only', () => {
  const r = tourismDiscoveryScore({demandSignal:.8,noveltySignal:.9,relationSignal:.7,diversitySignal:.6,dwellSignal:.5,weatherSuitability:.9,accessibilitySignal:.3});
  assert.ok(r.score>0 && r.score<=1);
  assert.equal(r.label,'EARTHUS_DISCOVERY');
  assert.equal('hiddenGem' in r,false);
});

test('travel context explains why without calling it official KTO recommendation', () => {
  const ctx = composeTravelContext({weatherSuitability:.9,relationSignal:.8,noveltySignal:.9,evidenceIds:['kto-1','kma-1']},{score:.8,label:'EARTHUS_DISCOVERY'});
  assert.ok(ctx.reasons.includes('WEATHER_FAVORABLE'));
  assert.match(ctx.disclaimer,/not an official KTO recommendation/i);
});

test('tourism ranking is deterministic by score', () => {
  const r = rankTourismDiscoveries([{id:'a',demandSignal:.2},{id:'b',demandSignal:.9}]);
  assert.equal(r[0].candidate.id,'b');
});

test('pollution evidence classes are explicit', () => {
  assert.equal(normalizePollutionSignal({evidenceKind:'OBSERVED'}).evidenceKind,'OBSERVED');
  assert.equal(normalizePollutionSignal({evidenceKind:'INVALID'}).evidenceKind,'MODELLED');
});

test('pollution transport is blocked without vector proof', () => {
  const blocked = pollutionTransportGate({domain:'AIR',evidenceKind:'MODELLED',transport:{u:1,v:1},vectorProof:false});
  assert.equal(blocked.allowed,false);
  assert.equal(blocked.reason,'VECTOR_PROOF_REQUIRED');
  const allowed = pollutionTransportGate({domain:'AIR',evidenceKind:'MODELLED',transport:{u:1,v:1},vectorProof:true});
  assert.equal(allowed.allowed,true);
  assert.equal(allowed.label,'MODELLED_TRANSPORT');
});

test('pollution lens keeps air fire ocean land separate', () => {
  const r=compilePollutionLens([{domain:'AIR'},{domain:'FIRE'},{domain:'OCEAN'},{domain:'LAND'}]);
  assert.equal(r.air.length,1);assert.equal(r.fire.length,1);assert.equal(r.ocean.length,1);assert.equal(r.land.length,1);
});
