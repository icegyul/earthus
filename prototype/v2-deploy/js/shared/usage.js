// EARTHUS 익명 이용 집계 (USAGE COUNTERS) — v1·v2 공용
//
// 2026-09-06: v2-three/js/usage.js 에 있던 것을 여기로 옮겼다. FOR ME 깔때기 계측을
// v1(prototype/js)과 v2(prototype/v2-three/js) 가 같은 허용 목록으로 찍어야 해서다.
// v2 의 옛 경로는 이 파일을 다시 내보내는 껍데기로 남겼다 (import 경로가 안 깨지게).
//
// 왜 이렇게 만들었나: 1.0의 analytics_events는 RLS가 `to authenticated`라 로그인+동의한
// 사용자만 기록된다. v2-three에는 로그인이 없어 그대로 붙이면 0건이 쌓인다.
// 그렇다고 CloudFront 접근 로그를 켜면 IP·User-Agent가 저장되는데, 이 프로젝트는
// DB 트리거로 'ip','userAgent' 키 저장을 금지해 왔다. 자기 원칙과 충돌한다.
//
// 그래서 여기서는 **사람을 식별할 수 있는 것을 아무것도 보내지 않는다**:
//   · 사용자 ID 없음 · 세션 ID 없음 · 좌표 없음 · 자유문구 없음
//   · 보내는 것은 (날짜, 허용된 이벤트 이름, 증가분) 뿐이다
//   · 전환율은 서버에서 개인을 잇지 않고 집계끼리 나눠서 구한다
//     (예: forme.clicked.cyclone / forme.shown.cyclone)
//
// 한계(정직하게): 개인을 안 세므로 "이용자 수"가 아니라 "행동 횟수"다. 카운터를 부풀리는
// 것을 막지 못한다 — 공모전 계량성과·고객 자료로 쓸 때 이 사실을 함께 적어야 한다.

import { formeEventNames } from './for-me-row.js';

const ENDPOINT = 'https://ltpupicvdijxkrxxsfky.supabase.co/rest/v1/rpc/usage_bump';
const ANON_KEY = 'sb_publishable_FMxJz-WSGpr5H7yzjYVyJw_KM5KOsRE';
const FLUSH_MS = 4000;
const MAX_BATCH = 24;

// 허용 목록 — 서버 RPC도 같은 목록으로 막는다. 여기 없는 이름은 보내지 않는다.
// ⚠️ 이름을 더할 땐 supabase/migrations 에 같은 이름을 넣는 마이그레이션이 같이 가야 한다.
//    서버 목록에 없으면 RPC 가 조용히 버려서 0 으로 보인다.
export const USAGE_EVENTS = Object.freeze([
  'app.opened',
  'travel.discover_opened',
  'travel.region_opened',
  'travel.purpose_opened',
  'travel.related_opened',
  'event.room_opened',
  'event.layer_from_room',
  ...formeEventNames(),          // forme.set_location + forme.<step>.<menu> 42개 (2026-09-06)
]);
const ALLOWED = new Set(USAGE_EVENTS);

export const usage = {
  pending: new Map(),   // eventName → count
  timer: null,
  sent: 0,
  failed: 0,
  lastError: null,
  enabled: true,

  track(eventName, n = 1) {
    if (!this.enabled || !ALLOWED.has(eventName)) return false;
    this.pending.set(eventName, (this.pending.get(eventName) || 0) + n);
    if (this.pending.size >= MAX_BATCH) return this.flush();
    if (!this.timer) this.timer = setTimeout(() => this.flush(), FLUSH_MS);
    return true;
  },

  async flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.pending.size) return false;
    const batch = [...this.pending.entries()].map(([event, count]) => ({ event, count }));
    this.pending.clear();
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ p_events: batch }),
        keepalive: true,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.sent += batch.reduce((a, b) => a + b.count, 0);
      return true;
    } catch (e) {
      // 수집이 실패해도 앱은 아무 영향이 없어야 한다. 조용히 접고 기록만 남긴다.
      this.failed += 1;
      this.lastError = String((e && e.message) || e);
      if (this.failed >= 3) this.enabled = false; // 엔드포인트가 없으면(마이그레이션 전) 그만 시도한다
      return false;
    }
  },

  /** @param opened  첫 이벤트 이름. v2 는 'app.opened'(기본). v1 은 아직 부르지 않는다 —
   *                 v1 까지 app.opened 를 찍으면 v2 집계와 섞인다. 필요해지면 v1 전용 이름을 목록에 더한다. */
  init(opened = 'app.opened') {
    if (this._init) return this;
    this._init = true;
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.flush(); });
    window.addEventListener('pagehide', () => this.flush());
    if (opened) this.track(opened);
    return this;
  },

  snapshot() {
    return { enabled: this.enabled, sent: this.sent, failed: this.failed, lastError: this.lastError, pending: [...this.pending] };
  },
};
