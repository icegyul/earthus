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

// ── PHASE 4 §9 — 지도 클릭과 메뉴 클릭이 같은 문맥으로 수렴한다 ───────────────
test('지도 비컨도 배열 인덱스가 아니라 사건 id 로 주소를 잡는다', () => {
  const feedSrc = src('intel-feed.js');
  assert.match(feedSrc, /d\.onclick = \(\) => onPick\(it\.id, it\.kind\)/, '비컨이 아직 인덱스를 넘긴다');
  assert.ok(!/onPick\(i\)/.test(feedSrc), 'onPick(i) 가 남아 있다 — 정렬이 바뀌면 엉뚱한 사건이 열린다');
  assert.ok(!/d\._idx/.test(feedSrc), '_idx 캐시가 남아 있다');
});

test('지도 클릭이 사건과 현상을 함께 맞춘다', () => {
  assert.match(mainSrc, /feed\.updateMarkers\(camera, altKm, \(eventId, kind\) =>/);
  assert.match(mainSrc, /feed\.selectById\(eventId, orbit\)/);
  assert.match(mainSrc, /const key = layerForEventKind\(kind\)/);
  assert.match(mainSrc, /shell\.setSelection\(sid, lid\)/, '지도 클릭이 패널 선택을 안 맞춘다');
});

test('사건 종류가 현상으로 해석된다 — 하드코딩이 아니라 레지스트리다', () => {
  assert.equal(reg.EVENT_KIND_PHENOMENON.TC, 'hazards.typhoon');
  assert.equal(reg.EVENT_KIND_PHENOMENON.EQ, 'hazards.earthquake');
  // 대표 레이어는 실제 존재하는 복합키여야 한다.
  for (const kind of Object.keys(reg.EVENT_KIND_PHENOMENON)) {
    const key = reg.layerForEventKind(kind);
    assert.ok(key && reg.LAYER_PHENOMENON[key], `${kind} 의 대표 레이어가 레지스트리에 없다`);
    assert.equal(reg.LAYER_PHENOMENON[key].phenomenon, reg.EVENT_KIND_PHENOMENON[kind]);
  }
  assert.equal(reg.layerForEventKind('없는종류'), null, '모르는 종류에 아무 레이어나 주면 안 된다');
});

// ── PHASE 4 §2 — 1차 메뉴는 도메인만 ─────────────────────────────────────────
test('메뉴가 레이어가 아니라 도메인 → 현상으로 그려진다', () => {
  assert.match(shellSrc, /const DOMAIN_INDEX =/, '도메인 색인이 없다');
  assert.match(shellSrc, /const domainSectionHtml = \(dom\) =>/);
  assert.match(shellSrc, /const phenomenonRowHtml = \(entry\) =>/);
  // 도메인 목록은 레지스트리에서 만든다 — 손으로 쓴 두 번째 현상 목록을 만들지 않는다.
  assert.match(shellSrc, /Object\.entries\(LAYER_PHENOMENON\)/);
  // 1차는 접혀 있어야 한다. 58줄을 펼쳐 두면 '줄였다'가 화면에서 사실이 아니다.
  assert.match(shellSrc, /collapsedSections = new Set\(\['land','weather','ocean','people','travel','hazards','space','__loose'\]\)/);
});

test('현상이 여러 자료를 가지면 펼쳐서 전부 켤 수 있다 — 기능이 사라지지 않는다', () => {
  assert.match(shellSrc, /data-expand="/, '펼치기 버튼이 없다 — 흡수된 레이어에 도달할 수 없다');
  assert.match(shellSrc, /expandedPhenomena/);
  // 배경·조작 9개도 자리가 있어야 한다.
  assert.match(shellSrc, /const looseSectionHtml = \(\) =>/);
  assert.match(shellSrc, /LOOSE_LAYERS/);
});

test('하단 바로 들어와도 그 도메인이 펼쳐진다', () => {
  // 펼침을 먼저 정하고 그린다. 순서가 뒤바뀌면 접힌 채로 그려 놓고 상태만 바꾼다.
  const i = shellSrc.indexOf('const gotoScene');
  const body = shellSrc.slice(i, i + 420);
  assert.ok(body.indexOf('collapsedSections.delete') < body.indexOf('openPanel(brand)'),
    'gotoScene 이 접힘 해제보다 먼저 그린다 — 하단 바가 빈 제목만 연다');
});
