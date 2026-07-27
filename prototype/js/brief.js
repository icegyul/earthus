// AI 뉴스 브리핑 — 자료 읽기
//
// 무엇인가
//   news-brief Lambda 가 확정 이벤트를 골라 Claude 로 사실을 정리해 둔 것.
//   항목마다 근거 기사 링크가 붙어 있다. 앱은 S3 파일만 읽는다.
//
// 왜 앱이 AI 를 직접 부르지 않나
//   API 키를 브라우저에 두면 소스에서 그대로 보인다 — 남이 우리 요금으로 쓴다.
//   그래서 서버가 미리 만들어 두고 여기서는 파일만 읽는다.
//   (같은 이유로 구름·바람·산불도 다 이 구조다.)
//
// ⚠️ 없으면 없다고 한다. 브리핑이 아직 없는 이벤트에 대해
//    앱이 자체적으로 무언가를 지어내지 않는다.

import { API } from './config.js';

export const briefs = {
  list: [],
  meta: {},
  loaded: false,
  error: null,
  _byEvent: new Map(),

  async load() {
    try {
      const r = await fetch(`${API.EVENTS}/briefs.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      this.list = j.briefs || [];
      this.meta = {
        generated: j.generated, model: j.model, notice: j.notice,
        counts: j.counts, ttlHours: j.ttlHours,
      };
      this._byEvent = new Map(this.list.map(b => [String(b.id), b]));
      this.loaded = true;
      this.error = null;
    } catch (e) {
      /* ⚠️ 파일이 아직 없는 것과 통신 실패를 구분한다.
         "아직 안 만들어졌다"는 정상 상태다 — 오류로 겁주지 않는다.
         ⚠️ S3 는 없는 객체에 **404가 아니라 403** 을 준다 (목록 권한이 없을 때
            객체 존재 여부를 알려주지 않기 위해서다 — 실측으로 403 을 확인했다).
            404 만 보고 판단하면 "아직 없음"이 통신 오류로 표시된다. */
      this.list = [];
      this._byEvent = new Map();
      this.loaded = true;
      this.error = /\b(403|404)\b/.test(e.message) ? 'none' : e.message;
    }
    return this.list;
  },

  /** 이 이벤트에 브리핑이 있나 */
  forEvent(id) { return this._byEvent.get(String(id)) || null; },
};
