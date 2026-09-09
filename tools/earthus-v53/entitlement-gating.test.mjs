// 지시서 §36·§41.26 — 과금 준비 상태 계약 시험.
// 결제 시스템을 이번 작업에서 재작성하지 않는다(§36). 대신 이미 있는 사다리
// (prototype/js/access-mode.js — 정본 v5.3 §1.4)가 실제로 지키는지 잠근다:
//   - 판매 스위치는 기본 닫혀 있다(FREE_OPEN·SALES_OPEN=false).
//   - 모르는 티어 값은 권한을 열지 않고 무료로 떨어진다(오타가 권한을 열면 안 된다).
//   - 능력이 없으면 티어가 높아도 막힌다 — UI lock 은 보안이 아니라 사다리다.
// 서버의 진짜 권한 판정(supabase checkout/payment-confirm + forecast-v8-policy)은
// tools/test_v8_entitlement_contract.mjs 와 tools/test_free_access_mode.mjs 가 잠근다.
import test from 'node:test';
import assert from 'node:assert/strict';

const am = await import('../../prototype/js/access-mode.js');

test('판매 스위치는 FREE_OPEN 에서 절대 열리지 않는다', () => {
  assert.equal(am.salesAllowed({ mode: 'FREE_OPEN', salesOpen: true }), false);
  assert.equal(am.salesAllowed({ mode: 'PAID', salesOpen: false }), false);
  assert.equal(am.salesAllowed({ mode: 'PAID' }), false);
  assert.equal(am.salesAllowed({ mode: 'PAID', salesOpen: true }), true);
  // 오타 모드는 무료로 fail-safe 한다.
  assert.equal(am.salesAllowed({ mode: 'PAID '.trim() + 'X', salesOpen: true }), false);
});

test('티어 사다리 — 위 티어는 아래를 포함하고, 레거시 paid 는 explorer 다', () => {
  assert.equal(am.tierAtLeast('free', 'explorer'), false);
  assert.equal(am.tierAtLeast('explorer', 'explorer'), true);
  assert.equal(am.tierAtLeast('explorer', 'free'), true);
  assert.equal(am.tierAtLeast('intelligence', 'explorer'), true);
  // ⚠️ 서버가 지금까지 준 값이 'paid' 하나다 — 이 별칭이 깨지면 구독자가 무료로 떨어진다.
  assert.equal(am.tierAtLeast('paid', 'explorer'), true);
});

test('모르는 티어 값은 권한을 열지 않는다', () => {
  assert.equal(am.tierRank('explrorer'), 0, '오타가 1로 읽힌다');
  assert.equal(am.tierRank(''), 0);
  assert.equal(am.tierRank(null), 0);
  assert.equal(am.normalizeTier('paid'), 'explorer', '레거시 표시 버그 회귀');
  assert.equal(am.normalizeTier('무엇가이상한값'), 'free');
});

test('능력 판정 — 없는 능력은 티어가 높아도 막고, 열려 있는 건 이유를 붙인다', () => {
  const blocked = am.decideCapabilityAccess({ mode: 'FREE_OPEN', available: false });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'CAPABILITY_NOT_AVAILABLE');

  const free = am.decideCapabilityAccess({ mode: 'FREE_OPEN', available: true, userTier: 'free' });
  assert.equal(free.allowed, true);
  assert.equal(free.reason, 'FREE_OPEN_UNTIL_PAID_LAUNCH');

  // 유료 전환 뒤에는 사다리가 판정한다 — free 는 explorer 능력에 막힌다.
  const gated = am.decideCapabilityAccess({
    mode: 'PAID', available: true, userTier: 'free', requiredTier: 'explorer',
  });
  assert.equal(gated.allowed, false);
  assert.equal(gated.reason, 'REQUIRES_EXPLORER');

  const legacyOk = am.decideCapabilityAccess({
    mode: 'PAID', available: true, userTier: 'paid', requiredTier: 'explorer',
  });
  assert.equal(legacyOk.allowed, true, '레거시 paid 구독자가 막히면 안 된다');
});
