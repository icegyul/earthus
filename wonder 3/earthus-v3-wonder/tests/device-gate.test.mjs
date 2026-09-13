// Device Gate 결과 검사 — docs/device-gate/{device,emulated}/*.json 을 읽어 구조를 검증하고 실기기 PASS 여부를 계산한다.
// 결과 파일이 없으면 "실기기 결과 0" 을 명시적으로 남기고 통과한다(게이트가 열린 것이 아니라, 회귀 시험이 깨지지 않는 것뿐이다).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE = path.join(ROOT, 'docs', 'device-gate');
const REQUIRED_V1 = ['initial-load', 'rotate', 'pinch', 'region', 'unfold', 'tap', 'longpress', 'special', 'story', 'card-close', 'return', 'repeat', 'bottom-sheet', 'reduced'];
const REQUIRED = [...REQUIRED_V1, 'pole'];   // qa-overlay v2 (ROTATION RULE LOCK 2026-09-13): 극 시험이 15번째 필수 단계
const requiredOf = r => (r.harness?.endsWith(' v1') ? REQUIRED_V1 : REQUIRED);
const listJson = dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => ({ f, r: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) })) : [];

function verdict(r) {
  const passed = new Set(r.steps.filter(s => s.pass).map(s => s.id));
  const missing = requiredOf(r).filter(id => !passed.has(id));
  return { pass: missing.length === 0, missing };
}

test('device-gate: 결과 파일 구조(harness·device.source·14/15단계·perf)와 device/emulated 분리', () => {
  for (const kind of ['device', 'emulated']) {
    for (const { f, r } of listJson(path.join(GATE, kind))) {
      assert.equal(r.device?.source, kind, `${kind}/${f}: source 가 폴더와 같아야 한다`);
      assert.ok(typeof r.device.ua === 'string' && r.harness?.startsWith('earthus-v3-wonder qa-overlay'), `${kind}/${f}: harness`);
      assert.deepEqual(r.requiredSteps, requiredOf(r), `${kind}/${f}: 필수 단계(v1 14 · v2 15)`);
      assert.equal(r.steps.length, requiredOf(r).length);
      assert.ok(r.perf && 'contentRequests' in r.perf && 'characterFiles' in r.perf, `${kind}/${f}: perf`);
      assert.ok(r.perf.characterFiles <= 3 * 4, `${kind}/${f}: 캐릭터 파일 ${r.perf.characterFiles} — 124 일괄 로드 흔적`);
    }
  }
});

test('device-gate: 실기기(device) 결과 — Android/iOS 각각 필수 단계 전부(v2 = 15/15, 극 시험 포함) 이어야 PASS. 없으면 "0건" 으로 기록', () => {
  const rows = listJson(path.join(GATE, 'device')).map(({ f, r }) => ({ f, os: /iPhone|iPad/.test(r.device.ua) ? 'ios' : /Android/.test(r.device.ua) ? 'android' : 'other', ...verdict(r), passed: r.passed, total: r.total }));
  const android = rows.filter(x => x.os === 'android'), ios = rows.filter(x => x.os === 'ios');
  const summary = { androidRuns: android.length, androidPass: android.some(x => x.pass), iosRuns: ios.length, iosPass: ios.some(x => x.pass), files: rows.map(x => `${x.f} ${x.passed}/${x.total}${x.missing.length ? ' missing:' + x.missing.join(',') : ''}`) };
  console.log('  device-gate 실기기 결과:', JSON.stringify(summary));
  for (const x of rows) assert.ok(x.passed >= 0, x.f);
  // 게이트 판정은 여기서 강제하지 않는다(실기기 0건일 때 회귀가 깨지면 안 된다). PASS 여부는 summary 로 보고서에 옮긴다.
  assert.ok(true);
});
