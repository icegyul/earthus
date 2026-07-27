// 낙뢰 — 방금 어디에 떨어졌나 (한국)
//
// ⚠️ **낙뢰(G)와 번개(C)를 같은 색으로 찍지 않는다.**
//      G = cloud-to-ground : 땅에 떨어졌다. 사람이 맞을 수 있다.
//      C = cloud-to-cloud  : 구름 사이에서만 쳤다. 하늘에서 번쩍였을 뿐이다.
//    둘을 한 덩어리로 그리면 "여기 벼락이 떨어졌다"는 거짓말이 된다.
//    G 는 밝은 노랑으로 크게, C 는 옅은 보라로 작게 그린다.
//
// ⚠️ 강도(kA)는 **음수가 정상**이다 (대지방전 대부분이 부극성).
//    크기를 정할 때 반드시 절댓값을 쓴다. 음수를 그대로 쓰면 센 낙뢰가 제일 작아진다.
//
// ⚠️ 낙뢰는 지진과 달리 **지나간 것이 금방 무의미해진다.**
//    5분 전 낙뢰와 55분 전 낙뢰를 같은 밝기로 찍으면 "지금 위험한 곳"이 안 읽힌다.
//    나이에 따라 흐려지게 한다.
//
// ⚠️ 파문(맥동)은 **최근 3분 이내 낙뢰에만** 붙인다.
//    pointLayer 주석에 적힌 대로 파문은 매 프레임 지오메트리를 다시 만든다.
//    수십 개에 붙이면 폰이 뜨거워진다. 상한은 pointLayer 가 다시 한 번 막는다.

import { PointLayer } from './pointLayer.js';
import { API } from '../config.js';
import { i18n } from '../i18n.js';

const MAX_AGE_MIN = 60;      // 수집기 창과 같다
const PULSE_MIN = 3;         // 이보다 최근이면 파문을 붙인다

/** 20260727193013 (KST) → epoch ms */
function kstToMs(tm) {
  const s = String(tm || '');
  if (s.length < 12) return null;
  const [y, mo, d, H, M] = [s.slice(0, 4), s.slice(4, 6), s.slice(6, 8),
                            s.slice(8, 10), s.slice(10, 12)].map(Number);
  const S = s.length >= 14 ? Number(s.slice(12, 14)) : 0;
  // ⚠️ KST(+9) 다. Date.UTC 로 만든 뒤 9시간을 빼야 실제 시각이 된다.
  return Date.UTC(y, mo - 1, d, H, M, S) - 9 * 3600_000;
}

/** rgba 문자열 — PointLayer 는 css 색을 받는다 */
const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${a.toFixed(2)})`;

export const lightning = {
  layer: null,
  meta: null,

  init() {
    this.layer = new PointLayer({
      id: 'lightning',
      color: '#ffd54a',
      radius: 4,
      // ⚠️ 묶지 않는다. 뇌우는 원래 한곳에 모여 친다 —
      //    묶어버리면 "여기 집중적으로 친다"는 정보가 사라진다.
      cluster: false,
    });
    return this.layer;
  },

  async refresh() {
    const r = await fetch(`${API.EVENTS}/kma-lightning.json`, { cache: 'no-cache' });
    // ⚠️ S3 는 없는 객체에 403 을 준다(404 아님).
    if (!r.ok) throw new Error('lightning ' + r.status);
    const j = await r.json();
    this.meta = {
      generated: j.generated, source: j.source, note: j.note,
      count: j.count, ground: j.groundCount, cloud: j.cloudCount,
      strongestKA: j.strongestKA, truncated: j.truncated,
      windowMinutes: j.windowMinutes,
    };

    const ko = i18n.lang === 'ko';
    const now = Date.now();
    const items = [];

    (j.strikes || []).forEach((s, i) => {
      const at = kstToMs(s.tm);
      if (at == null) return;
      const ageMin = (now - at) / 60_000;
      // 미래로 나온 것(시계 차이)은 0으로 본다. 음수 나이를 그대로 쓰면 밝기가 1을 넘는다.
      const age = Math.max(0, Math.min(ageMin, MAX_AGE_MIN));
      const fresh = 1 - age / MAX_AGE_MIN;              // 1=방금, 0=한 시간 전
      const kA = Math.abs(s.kA ?? 0);
      const ground = s.type === 'G';

      items.push({
        id: `${s.tm}-${i}`,
        lon: s.lon, lat: s.lat,
        // 라벨은 달지 않는다. 수십~수백 개에 글자를 붙이면 화면이 덮인다.
        name: '',
        at,
        // 밝기는 최신일수록 강하게. 바닥을 0.18 로 둬서 완전히 사라지진 않게 한다.
        color: ground
          ? rgba(255, 213, 74, 0.18 + 0.82 * fresh)
          : rgba(150, 170, 255, 0.12 + 0.5 * fresh),
        // 세기에 따라 커진다. ⚠️ 절댓값을 쓴다.
        radius: ground ? 3 + Math.min(6, kA / 22) : 2.2 + Math.min(2.5, kA / 40),
        // 파문은 아주 최근 대지방전에만
        pulse: ground && ageMin <= PULSE_MIN,
        data: {
          [ko ? '종류' : 'Type']: ground
            ? (ko ? '낙뢰 — 땅에 떨어짐' : 'Cloud-to-ground')
            : (ko ? '번개 — 구름 사이' : 'Cloud-to-cloud'),
          [ko ? '세기' : 'Current']: `${kA.toFixed(1)} kA`,
          [ko ? '시각(KST)' : 'Time (KST)']:
            `${s.tm.slice(8, 10)}:${s.tm.slice(10, 12)}:${s.tm.slice(12, 14) || '00'}`,
          ...(s.ht ? { [ko ? '고도' : 'Altitude']: `${s.ht} km` } : {}),
        },
        _time: at,
      });
    });

    this.layer.setData(items);
    return items.length;
  },
};
