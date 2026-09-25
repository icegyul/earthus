// EARTHUS Pleos — 운전 중 안전 게이트 정본 (단일 게이트)
//
// ⚠️ ui_PLEOS 참고 킷에는 게이트가 두 개(V29 safetyGate, V33 safetyDecision) 있었고,
//    V33 은 목록에 없는 기능을 운전 중에도 ALLOW 로 돌려줬다 (fail-open, 2026-09-25 확인).
//    이 파일이 유일한 판단 지점이다. 규칙:
//    1. 운전 상태는 host 가 준 PARKED 일 때만 주차 중이다. 그 밖의 값·누락·오류는 UNKNOWN 이고,
//       UNKNOWN 은 운전 중과 같게 취급한다 (UNKNOWN ≠ PARKED).
//    2. 등록되지 않은 기능 이름은 어떤 상태에서도 막는다 (fail-closed).
//    3. 재난 안전 규칙은 여가·상업보다 먼저다.
//    4. 버튼 숨김은 안전 경계가 아니다. 실행 함수는 반드시 guardAction() 을 거친다.

import { ACTION_POLICY, canonicalAction } from './actions.js';

export const PLEOS_SAFETY_GATE_VERSION = 'earthus.pleos-safety-gate.v1.0.0';

export const DRIVING_STATE = Object.freeze({
  PARKED: 'PARKED',
  DRIVING: 'DRIVING',
  RESTRICTED: 'RESTRICTED',
  UNKNOWN: 'UNKNOWN',
});

export const DECISION = Object.freeze({ ALLOW: 'ALLOW', BLOCK: 'BLOCK' });

const OVERRIDDEN_BY_SAFETY = new Set(['LOCAL_DISCOVERY', 'COMMERCIAL']);

/** host 값 정규화. 정확히 아는 값이 아니면 UNKNOWN. */
export function normalizeDrivingState(value) {
  return Object.prototype.hasOwnProperty.call(DRIVING_STATE, value) ? value : DRIVING_STATE.UNKNOWN;
}

/** PARKED 가 아니면 모두 운전 중 안전 모드다. */
export function isDrivingSafeMode(drivingState) {
  return normalizeDrivingState(drivingState) !== DRIVING_STATE.PARKED;
}

/**
 * 기능 하나를 지금 실행해도 되는지 판단한다.
 * @param {object} input
 * @param {string} input.action 기능 이름 (정본 또는 등록된 옛 이름)
 * @param {string} [input.drivingState] host 가 준 운전 상태
 * @param {boolean} [input.criticalDisaster] 현재 위치에 유효한 공식 특보·재난이 있는가
 * @param {object} [input.capabilities] 실제로 연결된 기능 { transactions: boolean }
 */
export function decideAction({ action, drivingState, criticalDisaster = false, capabilities = {} } = {}) {
  const state = normalizeDrivingState(drivingState);
  const mode = state === DRIVING_STATE.PARKED ? 'PARKED' : 'DRIVING_SAFE';
  const canonical = canonicalAction(action);
  const base = { requested: action ?? null, action: canonical, drivingState: state, mode };

  if (!canonical) return { ...base, decision: DECISION.BLOCK, reason: 'UNREGISTERED_ACTION', tier: null };

  const rule = ACTION_POLICY[canonical];
  const out = { ...base, tier: rule.tier };

  if (criticalDisaster === true && OVERRIDDEN_BY_SAFETY.has(rule.tier)) {
    return { ...out, decision: DECISION.BLOCK, reason: 'CRITICAL_DISASTER_OVERRIDE' };
  }
  if (mode === 'DRIVING_SAFE' && !rule.drivingAllowed) {
    return { ...out, decision: DECISION.BLOCK, reason: `DRIVING_SAFE_${state}` };
  }
  if (rule.requiresCapability && capabilities?.[rule.requiresCapability] !== true) {
    return { ...out, decision: DECISION.BLOCK, reason: 'CAPABILITY_ABSENT' };
  }
  return { ...out, decision: DECISION.ALLOW, reason: mode === 'PARKED' ? 'PARKED' : 'DRIVING_ALLOWED' };
}

export function isActionAllowed(input) {
  return decideAction(input).decision === DECISION.ALLOW;
}

/**
 * 실행 경로용. 판단을 실행 순간에 다시 하고, 허용될 때만 run() 을 부른다.
 * getContext 는 실행 순간의 운전 상태·재난 여부를 돌려주는 함수여야 한다 (화면을 그릴 때의 값을 재사용하지 않는다).
 */
export function guardAction(action, getContext, run) {
  let ctx;
  try { ctx = typeof getContext === 'function' ? getContext() : {}; } catch { ctx = {}; }
  const decision = decideAction({ ...ctx, action });
  if (decision.decision !== DECISION.ALLOW) return { executed: false, decision };
  return { executed: true, decision, result: run() };
}
