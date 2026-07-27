// 강수 안내 — 확률로만 말한다
//
// 🅿️ 아직 어디서도 import 하지 않는다. 출시 후에 붙이기로 미뤄둔 기능이다.
//    지금 남겨두는 이유는 "확률로만 말한다"는 결정을 잊지 않기 위해서다.
//    붙일 때는 ui.js 의 banner 에 연결하고, 위치는 locateUser() 결과를 넘기면 된다.
//
// ⚠️ 설계 원칙: "몇 분 뒤 비가 옵니다" 같은 단정을 절대 하지 않는다.
//    강수는 본래 확률적이라 시점을 맞히기 어렵고, 한 번만 틀려도 신뢰를 잃는다.
//    "오후 3시 92%" 처럼 시각과 확률만 주고 판단은 사용자에게 맡긴다.
//
//    나쁜 예: "20분 뒤 비가 시작됩니다"       ← 안 오면 앱을 못 믿게 된다
//    좋은 예: "오후 3시 강수확률 92%"          ← 틀려도 확률은 거짓말이 아니다
//
// 강수량(mm)도 같이 본다. 확률이 높아도 0.1mm 면 "우산 챙길 정도는 아님"이라
// 말해줄 수 있어야 한다.

import { API } from './config.js';
import { i18n } from './i18n.js';

/* 안내를 띄우는 기준.
   확률만 높고 양이 0 인 경우가 잦아서(이슬비도 확률에 잡힌다) 둘 다 본다. */
const NOTIFY_PROB = 60;      // 이 확률 이상이면 알린다
const WET_MM = 1.0;          // 이 이상이면 "우산" 단계
const HOURS_AHEAD = 12;      // 앞으로 이만큼만 본다

export const rain = {
  data: null,        // { hours: [{t, prob, mm}], peak, first }
  place: null,

  /** 위치가 정해진 뒤 호출 */
  async load(lat, lon) {
    const u = `${API.WEATHER}?latitude=${lat}&longitude=${lon}`
            + `&hourly=precipitation_probability,precipitation`
            + `&forecast_hours=${HOURS_AHEAD + 1}&timezone=auto`;
    const r = await fetch(u);
    if (!r.ok) throw new Error('rain ' + r.status);
    const j = await r.json();
    const H = j.hourly || {};

    const now = Date.now();
    const hours = (H.time || []).map((t, i) => ({
      t,
      at: new Date(t).getTime(),
      prob: H.precipitation_probability?.[i] ?? 0,
      mm: H.precipitation?.[i] ?? 0,
    })).filter(h => h.at >= now - 3600_000);

    this.data = {
      hours,
      // 가장 확률이 높은 시각 — 안내의 주인공
      peak: hours.reduce((a, b) => (b.prob > (a?.prob ?? -1) ? b : a), null),
      // 기준을 처음 넘는 시각 — "언제부터"
      first: hours.find(h => h.prob >= NOTIFY_PROB) || null,
    };
    return this.data;
  },

  /** 안내가 필요한 상황인가 */
  shouldNotify() {
    return !!(this.data?.first);
  },

  /** 배너 한 줄. ⚠️ 단정하는 표현을 쓰지 말 것. */
  line() {
    const d = this.data;
    if (!d?.first) return null;
    const ko = i18n.lang === 'ko';
    const f = d.first, p = d.peak;

    const when = this._clock(f.at);
    // 앞으로 12시간 중 가장 많이 오는 양
    const maxMm = Math.max(...d.hours.map(h => h.mm));
    const heavy = maxMm >= WET_MM;

    if (ko) {
      const tail = heavy ? ' · 우산 챙기세요' : ' · 약한 비';
      return p && p.at !== f.at
        ? `${when}부터 강수확률 ${f.prob}% · 최고 ${this._clock(p.at)} ${p.prob}%${tail}`
        : `${when} 강수확률 ${f.prob}%${tail}`;
    }
    const tail = heavy ? ' · take an umbrella' : ' · light rain';
    return p && p.at !== f.at
      ? `${when} ${f.prob}% chance · peak ${this._clock(p.at)} ${p.prob}%${tail}`
      : `${when} ${f.prob}% chance of rain${tail}`;
  },

  /** 시간별 확률 막대 — 시트에 넣을 용도 */
  bars(n = 12) {
    const d = this.data;
    if (!d) return '';
    return d.hours.slice(0, n).map(h => {
      const hi = h.prob >= NOTIFY_PROB;
      return `<div class="rb" title="${h.prob}%">
        <div class="rb-bar${hi ? ' hi' : ''}" style="height:${Math.max(3, h.prob)}%"></div>
        <div class="rb-p">${h.prob}</div>
        <div class="rb-t">${this._hour(h.at)}</div>
      </div>`;
    }).join('');
  },

  _clock(ms) {
    const d = new Date(ms);
    return d.toLocaleTimeString(i18n.lang === 'ko' ? 'ko-KR' : 'en-US',
      { hour: 'numeric', minute: undefined, hour12: true }).replace(':00', '');
  },
  _hour(ms) { return new Date(ms).getHours(); },
};
