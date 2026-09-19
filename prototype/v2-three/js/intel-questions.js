// EARTHUS — Intelligence 질문 레지스트리 (INTELLIGENCE-LAYER-PLAN §2.2 · 계약 §C-0)
//
// sim-questions.js 의 자매다. 시뮬은 "계산을 부를 수 있나", 이쪽은 "패킷이 이 질문에 답할 재료를
// 갖고 있나"를 말한다. 답은 **패킷(intel/{phenomenonId}.json)** 에서만 나온다 — 이 파일은 값을
// 만들지 않고, 눌렀을 때 새로 계산하지도 않는다(계약 §C-0: SELECT·INFORMATION 은 이미 만든 패킷을
// 읽을 뿐. 실시간 계산은 LLM 서술 호출과 Simulation RUN 둘뿐).
//
// 5절 — WHY / WHAT / NEXT / IMPACT / EVIDENCE (계약 §C-0).
//   LAYER-PLAN §2.2 의 질문 5종(why·next·impact·related·report)을 재편한 것이다. REPORT 는
//   EXPLORER 발행물(P5)이라 여기 없고, WHAT(지금 무슨 일)이 들어왔다.
//
// 상태 규칙 (LAYER-PLAN §2.2 · aws/_shared/intel_contract.py section_status 와 같다)
//   패킷이 없다                               → not_evaluable
//   그 절의 재료가 패킷에 하나라도 있다         → available
//   재료가 전부 coverage.missing 에 있다        → not_available (이유 동봉)
// ⚠️ 빈 NEXT 카드를 만들지 않는다 — not_available 이면 화면이 절을 숨긴다(§C-0 표).
//
// 어휘 정본은 aws/_shared/contracts/intel-vocab.json 이다. 브라우저가 JSON import 를 못 하는 기기가
// 있어서 여기에는 절 대응표만 옮겨 두고, 시험(tools/earthus-v53/intel-questions.test.mjs)이
// 정본과 한 글자라도 다르면 깨진다.

import { PHENOMENA } from './phenomenon-registry.js?v=5';

export const INTEL_STATUS = Object.freeze({
  AVAILABLE: 'available',
  NOT_AVAILABLE: 'not_available',
  NOT_EVALUABLE: 'not_evaluable',
});

// 5절 → 패킷 절 (정본: intel-vocab.json INTEL_SECTIONS)
export const INTEL_SECTIONS = Object.freeze({
  WHY: Object.freeze(['conditions']),
  WHAT: Object.freeze(['current', 'change', 'anomaly', 'pattern']),
  NEXT: Object.freeze(['next']),
  IMPACT: Object.freeze(['related']),
  EVIDENCE: Object.freeze(['sources', 'confidence', 'coverage']),
});

// 질문 문장 — 현상마다 따로 지어내지 않는다. 절이 같으면 묻는 것도 같다.
// ⚠️ WHY 는 "원인"을 묻지 않는다. 함께 나타난 조건을 묻는다(LAYER-PLAN §1).
export const INTEL_QUESTIONS = Object.freeze([
  Object.freeze({ section: 'WHAT', id: 'intel-what', ko: '지금 무슨 일이 일어나고 있나', en: 'What is happening now?' }),
  Object.freeze({ section: 'WHY', id: 'intel-why', ko: '어떤 조건이 함께 나타났나', en: 'What conditions appeared alongside it?' }),
  Object.freeze({ section: 'NEXT', id: 'intel-next', ko: '앞으로 어떻게 되나', en: 'What happens next?' }),
  Object.freeze({ section: 'IMPACT', id: 'intel-impact', ko: '무엇과 이어져 있나', en: 'What is it connected to?' }),
  Object.freeze({ section: 'EVIDENCE', id: 'intel-evidence', ko: '무엇으로 알 수 있나', en: 'How do we know?' }),
]);

// 액션 이름 — main.js onAction 의 'intel-q' 분기가 받는다(P1). 이름을 바꾸면 연결이 조용히 끊긴다.
export const INTEL_ACTION = 'intel-q';

// 패킷 주소 (LAYER-PLAN §2.1). 사건형은 사건 id 를 하나 더 단다.
export const intelPacketKey = (phenomenonId, eventId = null) => (eventId
  ? `intel/${phenomenonId}/${encodeURIComponent(eventId)}.json`
  : `intel/${phenomenonId}.json`);

// 이 현상이 Intelligence 띠를 가질 수 있는가 — 정본 레지스트리의 intelligence 능력만 본다.
// (2026-09-20 재감사: LAYER_TRUTH 등급이 있는 자료가 하나도 없으면 false — docs/INTEL-REAUDIT-2026-09-20.md)
export const hasIntel = (phenomenonId) => !!(phenomenonId && PHENOMENA[phenomenonId]
  && PHENOMENA[phenomenonId].capabilities.intelligence);

const missingReasons = (packet, parts) => ((packet && packet.coverage && packet.coverage.missing) || [])
  .filter((m) => m && parts.includes(m.section) && m.reason)
  .map((m) => m.reason);

// 한 절의 상태 — intel_contract.section_status 와 같은 규칙.
export const sectionStatus = (packet, section) => {
  const parts = INTEL_SECTIONS[section];
  if (!parts) throw new Error(`모르는 절: ${section}`);
  if (!packet || typeof packet !== 'object') return { status: INTEL_STATUS.NOT_EVALUABLE, reason: null };
  if (section === 'EVIDENCE') {
    return Array.isArray(packet.sources) && packet.sources.length
      ? { status: INTEL_STATUS.AVAILABLE, reason: null }
      : { status: INTEL_STATUS.NOT_EVALUABLE, reason: null };
  }
  if (parts.some((p) => p in packet)) return { status: INTEL_STATUS.AVAILABLE, reason: null };
  const reasons = missingReasons(packet, parts);
  return { status: INTEL_STATUS.NOT_AVAILABLE, reason: reasons.join('; ') || null };
};

// 화면용 질문 목록. 현상에 Intelligence 능력이 없으면 빈 목록 — 진입점이 능력보다 앞서지 않는다.
export const intelQuestionsFor = (phenomenonId, packet, i18n) => {
  if (!hasIntel(phenomenonId)) return [];
  const ko = !!(i18n && i18n.ko);
  return INTEL_QUESTIONS.map((q) => {
    const st = sectionStatus(packet, q.section);
    return {
      id: q.id,
      section: q.section,
      action: INTEL_ACTION,
      text: ko ? q.ko : q.en,
      status: st.status,
      runnable: st.status === INTEL_STATUS.AVAILABLE,
      reason: st.status === INTEL_STATUS.AVAILABLE ? null
        : (st.reason || (st.status === INTEL_STATUS.NOT_EVALUABLE
          ? (ko ? '이 현상의 분석 패킷이 아직 없습니다' : 'No analysis packet for this phenomenon yet')
          : (ko ? '이 절은 지금 만들 재료가 없습니다' : 'There is no material to build this section right now'))),
    };
  });
};
