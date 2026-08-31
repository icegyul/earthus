import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalObjectKey, createRevisionManifest, WatermarkRegistry, backfillWindows, ArchiveStateMachine,
  verifyArchiveEvidence, storagePressurePolicy, buildRestorePlan, buildDeltaPackPlan, buildEventCapsule,
  resolveEntitlement, UsageMeter, buildIntelligencePanel, countryReadinessScore, CountryUnlockLedger,
  countryOpenGate, evaluateRights, combineRights, CircuitBreaker, providerHealthState, exponentialBackoff,
  modelPromotionGate, selectChampion, compileCountryDataPassport, estimateDailyCost, costToValueDecision,
  observationGapLens, ARCHIVE_STATE, MODEL_STATUS,
} from '../../prototype/js/earthus2/v02/index.js';

test('canonical object key is deterministic and partitioned', () => assert.ok(canonicalObjectKey({dataset:'cloud',region:'KR',validAt:'2026-08-26T01:00:00Z',resolution:'2km',schemaVersion:'v2'}).includes('2026/08/26/01')));
test('revision manifest creates stable id', () => assert.ok(createRevisionManifest({dataset:'x',businessKey:'a',receivedAt:'2026-08-26T00:00:00Z',schemaVersion:'1',processorVersion:'1',objectKey:'a'}).revisionId.startsWith('rev_')));
test('watermark cannot move backward', () => { const r=new WatermarkRegistry();r.advance('x','20260826');assert.throws(()=>r.advance('x','20260825'),/backwards/); });
test('backfill windows overlap', () => assert.ok(backfillWindows({from:'2026-01-01',to:'2026-02-15',windowDays:30,overlapDays:7}).length>=2));

test('archive state machine follows safe path', () => {
  const m=new ArchiveStateMachine({archiveId:'a'});
  for (const state of [ARCHIVE_STATE.PACKING,ARCHIVE_STATE.COPY_PENDING,ARCHIVE_STATE.COPYING,ARCHIVE_STATE.VERIFYING,ARCHIVE_STATE.NAS_VERIFIED,ARCHIVE_STATE.SNAPSHOT_VERIFIED,ARCHIVE_STATE.GRACE_PERIOD,ARCHIVE_STATE.DELETE_ELIGIBLE,ARCHIVE_STATE.COLD_ARCHIVED]) m.transition(state);
  assert.equal(m.state,ARCHIVE_STATE.COLD_ARCHIVED);
});
test('archive state machine rejects unsafe jump', () => assert.throws(()=>new ArchiveStateMachine({archiveId:'a'}).transition(ARCHIVE_STATE.COLD_ARCHIVED),/invalid archive transition/));
test('archive verification requires 14-day shadow proof', () => assert.ok(verifyArchiveEvidence({nasObjectExists:true,manifestExists:true,objectCountMatch:true,logicalRecordCountMatch:true,timeRangeMatch:true,sizeMatch:true,checksumMatch:true,snapshotVerified:true,gracePeriodElapsed:true,shadowTestPassed:false}).failed.includes('shadowTestPassed')));
test('storage pressure 95 enters safe mode', () => assert.equal(storagePressurePolicy(95).state,'SAFE_MODE'));
test('restore never serves directly from NAS', () => assert.equal(buildRestorePlan({archiveId:'a',requestedChunks:['1'],entitlement:'CONTROL'}).directNasServing,false));
test('delta packing estimates saving', () => assert.ok(buildDeltaPackPlan({frameCount:144,averageFullBytes:1000}).savingRatio>0.5));
test('event capsule is replay ready', () => assert.equal(buildEventCapsule({eventId:'e',type:'TYPHOON',startAt:'2026-08-25T00:00:00Z',endAt:'2026-08-26T00:00:00Z',regionIds:['KR'],datasets:['cloud']}).replayReady,true));

test('official safety bypasses paywall', () => assert.equal(resolveEntitlement({tier:'FREE',tab:'EVIDENCE',officialSafety:true}).decision,'ALLOW'));
test('free user sees preview for WHY', () => assert.equal(resolveEntitlement({tier:'FREE',tab:'WHY'}).decision,'PREVIEW'));
test('usage meter enforces quota', () => { const m=new UsageMeter({restore:2});m.consume({subjectId:'u',feature:'restore',periodKey:'2026-08'});m.consume({subjectId:'u',feature:'restore',periodKey:'2026-08'});assert.equal(m.consume({subjectId:'u',feature:'restore',periodKey:'2026-08'}).allowed,false); });
test('intelligence panel does not hide locked tabs', () => { const p=buildIntelligencePanel({tier:'FREE',domain:'WEATHER',results:{WHY:{preview:'원인 미리보기'}}});assert.equal(p.tabs.WHY.state,'PREVIEW');assert.equal(p.tabs.WHY.preview,'원인 미리보기'); });
test('country readiness exposes incomplete visual gate', () => assert.ok(countryReadinessScore({data:1,license:1,visual:0.5,performance:1,qa:1,terrain:1,localization:1}).blockers.includes('visual')));
test('country unlock ledger counts unique supporters', () => { const l=new CountryUnlockLedger();l.contribute({contributionId:'1',countryId:'FR',supporterId:'u'});l.contribute({contributionId:'2',countryId:'FR',supporterId:'u'});assert.equal(l.summary('FR').supporters,1); });
test('country gate requires readiness', () => assert.equal(countryOpenGate({fundingMet:true,demandMet:true,readiness:{score:0.8,blockers:['data']}}).open,false));
test('rights gate blocks one blocked source', () => assert.equal(combineRights([{sourceId:'a',rights:{paidExport:true}},{sourceId:'b',rights:{paidExport:false}}],'paidExport').state,'BLOCKED'));

test('circuit breaker opens after threshold', () => { const b=new CircuitBreaker({failureThreshold:2,resetAfterMs:100});b.failure(0);b.failure(1);assert.equal(b.snapshot().state,'OPEN'); });
test('provider health detects stale', () => assert.equal(providerHealthState({lastSuccessAt:'2026-08-26T00:00:00Z',nowAt:'2026-08-26T00:30:00Z',freshnessSlaMinutes:15}),'STALE'));
test('exponential backoff doubles', () => assert.equal(exponentialBackoff({attempt:2,baseMs:1000,jitter:0}),4000));
test('model promotion gate requires enough metrics', () => assert.equal(modelPromotionGate({status:MODEL_STATUS.SHADOW,metrics:{mae:1,count:2},dataQualityPass:true,calibrationPass:true,rollbackReady:true}).pass,false));
test('champion selection compares MAE and calibration', () => assert.equal(selectChampion({champion:{modelVersion:'a',metrics:{mae:10}},challenger:{modelVersion:'b',metrics:{mae:8},calibrationImproved:true}}).promote,true));

test('country passport compiles provider/layer readiness', () => { const p=compileCountryDataPassport({countryId:'KR',providers:[{state:'READY'}],layers:[{state:'READY',visualPass:true}],terrain:{ready:true},localization:{ready:true},licenses:[{display:true,derivative:true}],performance:{pass:true},qa:{pass:true}});assert.equal(p.readiness.percent,100); });
test('daily cost sums components', () => assert.ok(estimateDailyCost({storageGbDays:30,egressGb:10,requests:1000000,computeSeconds:100,rates:{storagePerGbMonth:1,egressPerGb:1,requestsPerMillion:1,computePerSecond:0.01}}).total>12));
test('safety-critical job runs over budget', () => assert.equal(costToValueDecision({estimatedCost:100,activeUsers:1,valueScore:0,budget:1,safetyCritical:true}).decision,'RUN'));
test('observation gap lens can show model dependence', () => assert.equal(observationGapLens({observedCoverage:0.05,modelCoverage:0.9,stationDensity:0,sourceAgeMinutes:200,spatialResolutionM:50000}).state,'MODEL_DEPENDENT'));
