// 태양 활동 — SDO 최신 영상 + X선 플레어 등급 + 오로라 연계
//
// 왜 지구 위에 안 그리는가
//   태양은 지구 위의 위치가 아니다. 격자로 칠할 것도, 핀을 꽂을 곳도 없다.
//   대신 "지금 태양이 이렇게 생겼고, 그래서 오늘 밤 오로라가 이럴 것"을
//   한 화면에서 보여주는 게 사용자에게 의미가 있다.
//
// ⚠️ 인과를 단정하지 않는다.
//    플레어가 났다고 반드시 오로라가 보이는 게 아니다. CME 방향·속도에 달렸고,
//    도달까지 1~3일이 걸린다. 그래서 "지금 Kp"와 "지금 태양"을 나란히 보여줄 뿐,
//    "오늘 밤 오로라가 옵니다" 같은 예보를 우리가 만들어내지 않는다.
//    예보는 NOAA SWPC 가 한다 — 링크로 넘긴다.

import { API } from '../config.js';
import { i18n } from '../i18n.js';

/* X선 플레어 등급. 로그 척도라 자릿수가 곧 등급이다.
   ⚠️ 이 문구는 NOAA SWPC 의 영향 설명을 옮긴 것이다. 우리가 지어내지 않았다. */
const FLARE = {
  A: { ko: '거의 없음',   en: 'Negligible',  color: '#5a7f8c' },
  B: { ko: '거의 없음',   en: 'Negligible',  color: '#5a9f8c' },
  C: { ko: '약함',        en: 'Minor',       color: '#7fc46a' },
  M: { ko: '보통',        en: 'Moderate',    color: '#f2a65a' },
  X: { ko: '강함',        en: 'Strong',      color: '#ff5d5d' },
};

/* Kp 지수 → 오로라를 볼 수 있는 대략적인 최저 위도.
   ⚠️ 이 표는 NOAA SWPC 가 공개한 "Kp 별 오로라 관측 가능 위도"에서 가져온 것이다.
      지자기 위도 기준이라 같은 위도라도 경도에 따라 차이가 난다 — 그래서 "대략"이라고 쓴다. */
const KP_LAT = { 0: 66, 1: 64, 2: 62, 3: 60, 4: 58, 5: 56, 6: 54, 7: 52, 8: 50, 9: 48 };

export const solar = {
  meta: null,
  kp: null,
  at: 0,

  /** 태양 영상 + 플레어 등급 (Lambda 가 30분마다 갱신) */
  async refresh() {
    const [m, k] = await Promise.allSettled([
      fetch(`${API.SOLAR}/meta.json`, { cache: 'no-cache' }).then(r => {
        if (!r.ok) throw new Error('solar ' + r.status);
        return r.json();
      }),
      fetch(API.KP).then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]);

    if (m.status === 'fulfilled') this.meta = m.value;
    /* Kp 는 1분 간격 시계열이다. 마지막 값이 "지금".
       ⚠️ 배열 끝에 아직 확정되지 않은 값이 들어오는 경우가 있어 null 을 걸러낸다. */
    if (k.status === 'fulfilled' && Array.isArray(k.value)) {
      const rows = k.value.filter(r => r.kp_index != null);
      const last = rows[rows.length - 1];
      if (last) this.kp = { value: Number(last.kp_index), time: last.time_tag };
    }
    this.at = Date.now();
    if (!this.meta) throw new Error('solar meta unavailable');
    return this.meta;
  },

  /** 등급 문자 하나 (A/B/C/M/X) — 'B10.0' → 'B' */
  band() {
    const c = this.meta?.flareClass;
    return c ? c[0].toUpperCase() : null;
  },

  /** 지금 이 위도에서 오로라를 볼 가능성이 있는가 (대략) */
  auroraLat() {
    if (this.kp == null) return null;
    const k = Math.max(0, Math.min(9, Math.round(this.kp.value)));
    return KP_LAT[k];
  },

  /** 시트에 넣을 내용 */
  detail() {
    const ko = i18n.lang === 'ko';
    const rows = {};
    const b = this.band();

    if (this.meta?.flareClass) {
      const f = FLARE[b] || FLARE.A;
      rows[ko ? '플레어 등급' : 'Flare class'] =
        `${this.meta.flareClass} · ${ko ? f.ko : f.en}`;
    }
    if (this.meta?.xrayFlux != null) {
      rows[ko ? 'X선 세기' : 'X-ray flux'] =
        `${this.meta.xrayFlux.toExponential(1)} W/m²`;
    }
    if (this.kp) {
      rows[ko ? 'Kp 지수' : 'Kp index'] = this.kp.value.toFixed(2);
      const lat = this.auroraLat();
      if (lat != null) {
        rows[ko ? '오로라 관측 한계' : 'Aurora visible from'] = ko
          ? `대략 위도 ${lat}° 이상`
          : `roughly ${lat}° latitude and poleward`;
      }
    }
    rows[ko ? '관측' : 'Observed'] =
      (this.meta?.generated || '').slice(0, 16).replace('T', ' ') + ' UTC';
    rows[ko ? '출처' : 'Source'] = this.meta?.source || 'NASA SDO · NOAA SWPC';

    return { rows, image: `${API.SOLAR}/latest.jpg?t=${Math.floor(this.at / 600_000)}` };
  },

  /** 색 — 배지에 쓴다 */
  color() {
    const f = FLARE[this.band()];
    return f ? f.color : '#5a7f8c';
  },
};

export { FLARE, KP_LAT };
