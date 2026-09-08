// PHASE 3 — UI 정보구조 계약 시험 (docs/earthus-v2/phase-3-ui-contract.md 의 불변식).
// initShell 은 실제 DOM 을 요구하므로 배선 계약은 소스에서 확인한다
// (tools/test_v2_badge_parity.mjs 와 같은 방식).
import './v2-test-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const reg = await import('../prototype/v2-three/js/phenomenon-registry.js');
const src = (p) => readFileSync(new URL(`../prototype/v2-three/js/${p}`, import.meta.url), 'utf8');
const shellSrc = src('ui-shell.js');
const mainSrc = src('main.js');
const switchSrc = readFileSync(new URL('../prototype/js/earth-switch.js', import.meta.url), 'utf8');

// ── 불변식 1 — Intelligence 는 최상위 기능 메뉴가 아니다 ─────────────────────
test('우측 손잡이는 현상을 고르면 그 현상의 이름을 단다', () => {
  assert.match(shellSrc, /function applyPanelIdentity/, '패널 정체성 갱신이 없다');
  assert.match(shellSrc, /handle\.textContent = name \|\| PANEL_HOME\(\)/);
  // 선택이 바뀔 때마다 다시 불려야 한다.
  assert.match(shellSrc, /applyPanelIdentity\(ctx\)/);
});

test('제품 이름 Intelligence 는 건드리지 않는다 — 그것은 배포된 주소다', () => {
  // earth-switch.js 의 세 지구 알약은 v1/v2/v3 제품 전환기다. v2 의 공개 이름이 Intelligence 이고
  // /Intelligence 로 배포된다. 이것을 지우면 세 제품 사이 이동이 끊긴다.
  assert.match(switchSrc, /label:\s*'Intelligence'/);
  assert.match(switchSrc, /'\/Intelligence'/);
  assert.match(switchSrc, /label:\s*'EARTHUS'/);
  assert.match(switchSrc, /label:\s*'WONDER'/);
});

// ── 불변식 2 — 현상은 정본 레지스트리에서만 온다 ─────────────────────────────
test('UI 는 자체 현상 목록을 만들지 않는다', () => {
  assert.equal(Object.keys(reg.PHENOMENA).length, 66);
  assert.equal(Object.keys(reg.LAYER_PHENOMENON).length, 109);
  // ui-shell 이 현상을 얻는 경로는 레지스트리 함수뿐이어야 한다.
  assert.match(shellSrc, /from '\.\/phenomenon-registry\.js/);
  assert.ok(!/const PHENOMENA\s*=/.test(shellSrc), 'ui-shell 이 현상 표를 따로 들고 있다');
});

// ── 불변식 4 — 능력이 없으면 진입점이 없다 ───────────────────────────────────
test('능력 없는 행동은 렌더하지 않는다 (준비 중 금지)', () => {
  assert.match(shellSrc, /CAP_TAB = \{ scenario: 'simulation', next: 'forecast' \}/);
  assert.match(shellSrc, /btn\.hidden = hide/);
});

test('시뮬레이션 능력은 정확히 2개다', () => {
  const sim = Object.entries(reg.PHENOMENA)
    .filter(([, p]) => p.capabilities.simulation).map(([id]) => id).sort();
  assert.deepEqual(sim, ['hazards.tsunami', 'ocean.wave']);
});

// ── 불변식 9 — 능력이 약속한 것과 내용이 같아야 한다 ─────────────────────────
test('쓰나미 시나리오 탭이 더 이상 태풍 카드를 그리지 않는다', () => {
  const i = mainSrc.indexOf('getScenario: () => {');
  assert.ok(i > 0);
  const head = mainSrc.slice(i, i + 1600);
  assert.match(head, /hazards\.tsunami/, '쓰나미 분기가 없다 — 태풍 카드가 나온다');
  assert.match(head, /도달시간/);
  // 파도 물리를 쓰나미인 척 돌리지 않는다.
  assert.ok(!/sim-scenario"/.test(head.slice(0, head.indexOf('}'))), '쓰나미 분기가 태풍 시뮬레이터를 부른다');
});

// ── 불변식 8 · §15 — 리포트 능력에는 갈 곳이 있어야 한다 ─────────────────────
test('report:true 인 현상은 실제 생성기가 있는 종류로 이어진다', () => {
  const withReport = Object.entries(reg.PHENOMENA)
    .filter(([, p]) => p.capabilities.report).map(([id]) => id);
  assert.equal(withReport.length, 7);
  for (const id of withReport) {
    const kinds = reg.reportKindsForPhenomenon(id);
    assert.ok(kinds.length > 0, `${id} 가 report:true 인데 리포트 종류가 없다`);
  }
  // 없는 보고서를 걸지 않는다 — 대응 현상 없는 종류는 링크 대상이 아니다.
  const unmapped = Object.entries(reg.REPORT_KIND_PHENOMENON)
    .filter(([, v]) => !v.phenomenon).map(([k]) => k).sort();
  assert.deepEqual(unmapped, ['marine-bloom', 'ocean-drift']);
});

test('리포트 진입점이 UI 에 실제로 있다', () => {
  assert.match(shellSrc, /reportKindsForPhenomenon/, '리포트 종류를 조회하지 않는다');
  assert.match(shellSrc, /lab-reports\.html\?kind=/, '리포트로 가는 링크가 없다');
  // 기존 1.0 화면으로 보낸다 — v2 전용 렌더러를 새로 만들지 않는다(계약: 새 계보 금지).
  assert.ok(!/report-engine/.test(shellSrc), 'v2 가 자체 리포트 엔진을 부르고 있다');
});

// ── 불변식 6 — 질문은 현상 문맥을 상속한다 ───────────────────────────────────
test('질문 페이로드가 현재 현상과 사건을 함께 보낸다', () => {
  assert.match(mainSrc, /phenomenon: askPhenomenon\(\)/, '질문에 현상이 안 실린다');
  assert.match(mainSrc, /const askPhenomenon = \(\) =>/);
  // 복합키로 보낸다 — bare id 를 보내면 받는 쪽이 다시 충돌한다.
  assert.match(mainSrc, /id: ctx\.layerKey/);
  assert.match(mainSrc, /event: feed && feed\.selected/, '질문에 사건이 안 실린다');
});

// ── 불변식 5 — 사건 신원 ─────────────────────────────────────────────────────
test('사건 주소는 여전히 정본 id 다 (UI 개편으로 안 깨진다)', () => {
  const feedSrc = src('intel-feed.js');
  assert.ok(!/data-idx=/.test(feedSrc), '배열 인덱스 주소가 되살아났다');
  assert.match(feedSrc, /data-event-id="\$\{attr\(it\.id\)\}"/);
  assert.match(mainSrc, /feed\.selectById\(ds\.eventId, orbit\)/);
});

// ── 불변식 10 · §0.5 — 내부 구조를 사용자 문구에 노출하지 않는다 ─────────────
test('현상 이름과 질문에 내부 키가 섞여 있지 않다', () => {
  for (const [id, p] of Object.entries(reg.PHENOMENA)) {
    for (const s of [p.label.ko, p.label.en, p.question.ko, p.question.en]) {
      assert.ok(!/[a-z]+\/[a-z0-9-]+/.test(s), `${id} 의 사용자 문구에 복합키가 있다: ${s}`);
      assert.ok(!/^(current|forecast|simulation|evidence|intelligence)$/i.test(String(s).trim()),
        `${id} 의 사용자 문구가 내부 능력 키 그대로다: ${s}`);
    }
  }
});

// ── 불변식 3 · 10 — 기능은 하나도 사라지지 않는다 ────────────────────────────
test('109 레이어가 전부 자리를 갖는다 — 단순화로 기능이 사라지지 않는다', () => {
  const keys = Object.keys(reg.LAYER_PHENOMENON);
  assert.equal(keys.length, 109);
  const noPhen = keys.filter((k) => !reg.LAYER_PHENOMENON[k].phenomenon);
  // 현상이 아닌 것은 9개이고, 전부 역할이 명시돼 있어야 한다(배경·조작·진입점).
  assert.equal(noPhen.length, 9);
  for (const k of noPhen) {
    assert.ok(['basemap', 'control', 'entrypoint', 'tool'].includes(reg.LAYER_PHENOMENON[k].role),
      `${k} 가 현상도 아니고 역할도 불명이다`);
  }
});
