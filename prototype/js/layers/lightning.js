// 낙뢰 — 방금 어디에 떨어졌나 (한국 기상청 + 일본 기상청)
//
// ⚠️ **낙뢰(G)와 번개(C)를 같은 색으로 찍지 않는다.**
//      G = cloud-to-ground : 땅에 떨어졌다. 사람이 맞을 수 있다.
//      C = cloud-to-cloud  : 구름 사이에서만 쳤다. 하늘에서 번쩍였을 뿐이다.
//    둘을 한 덩어리로 그리면 "여기 벼락이 떨어졌다"는 거짓말이 된다.
//    G 는 밝은 노랑으로 크게, C 는 옅은 보라로 작게 그린다.
//
// ⚠️⚠️ **일본 자료에는 그 구분이 없다.**
//    JMA 는 type 0/1/4 를 주는데 **무엇인지 문서로 밝히지 않았다.**
//    대지/구름 방전으로 짐작은 되지만, 짐작을 색으로 바꾸면 그 순간 거짓말이 된다.
//    → 일본 점은 **한 가지 색(청록)** 으로만 찍고, 말풍선에 "종류 미공개"라고 적는다.
//    한국 점과 색이 다른 것은 자료가 다르기 때문이지 위험도가 다르기 때문이 아니다.
//
// ⚠️ 강도(kA)는 **음수가 정상**이다 (대지방전 대부분이 부극성).
//    크기를 정할 때 반드시 절댓값을 쓴다. 음수를 그대로 쓰면 센 낙뢰가 제일 작아진다.
//    ⚠️ 일본 자료에는 kA 가 없다 → 크기를 세기로 읽으면 안 된다. 고정 크기로 찍는다.
//
// ⚠️ 낙뢰는 지진과 달리 **지나간 것이 금방 무의미해진다.**
//    5분 전 낙뢰와 55분 전 낙뢰를 같은 밝기로 찍으면 "지금 위험한 곳"이 안 읽힌다.
//    나이에 따라 흐려지게 한다. (윈디가 하는 방식이 이것이다)
//
// ⚠️ 파문(맥동)은 **최근 3분 이내 낙뢰에만** 붙인다.
//    pointLayer 주석에 적힌 대로 파문은 매 프레임 지오메트리를 다시 만든다.
//    수십 개에 붙이면 폰이 뜨거워진다. 상한은 pointLayer 가 다시 한 번 막는다.
//
// ⚠️⚠️ **범위가 한국과 일본뿐이다.**
//    동아시아 정지위성(히마와리·천리안2A)에는 낙뢰 관측기가 없다. 미국 GOES 에만 있다.
//    그래서 이 지역은 지상 관측망이 유일한 길이고, 각 나라가 자기 나라만 공개한다.
//    → 화면이 비어 있는 것과 낙뢰가 없는 것은 **다르다.** 반드시 그렇게 적는다.

import { PointLayer } from './pointLayer.js';
import { API } from '../config.js';
import { i18n } from '../i18n.js';

const MAX_AGE_MIN = 60;      // 이보다 오래된 것은 그리지 않는다
const PULSE_MIN = 3;         // 이보다 최근이면 파문을 붙인다

/** 시각 문자열 → epoch ms.
 *  ⚠️ 두 기관이 형식이 다르다. 한쪽만 맞추면 다른 쪽이 통째로 사라진다.
 *     기상청  "20260803233045"          (KST)
 *     JMA     "2026/08/03 23:25:11.660" (JST)
 *  ⚠️ 둘 다 UTC+9 라서 시간대 보정은 같다. 그래도 **파싱은 따로** 한다 —
 *     new Date(문자열) 은 브라우저마다 다르게 해석해서 사파리에서만 NaN 이 되곤 한다. */
function toMs(at) {
  const s = String(at || '');
  let y, mo, d, H, M, S = 0;
  if (/^\d{12,14}$/.test(s)) {                       // 기상청
    [y, mo, d, H, M] = [s.slice(0, 4), s.slice(4, 6), s.slice(6, 8),
                        s.slice(8, 10), s.slice(10, 12)].map(Number);
    S = s.length >= 14 ? Number(s.slice(12, 14)) : 0;
  } else {                                            // JMA
    const m = s.match(/^(\d{4})[/-](\d{2})[/-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    [y, mo, d, H, M, S] = m.slice(1).map(Number);
  }
  if (!y) return null;
  // ⚠️ +9 다. Date.UTC 로 만든 뒤 9시간을 빼야 실제 시각이 된다.
  return Date.UTC(y, mo - 1, d, H, M, S) - 9 * 3600_000;
}

/** epoch ms → "HH:MM:SS" (KST/JST 같은 값) */
function hhmmss(ms) {
  const d = new Date(ms + 9 * 3600_000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

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
    // ⚠️ 두 나라를 합친 것을 먼저 본다. 그게 없으면(수집기가 죽었으면)
    //    **한국만이라도** 나오게 옛 경로로 물러난다 — 화면이 통째로 비는 것보다 낫다.
    let j = null, only = null;
    try {
      const r = await fetch(`${API.EVENTS}/lightning.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(String(r.status));
      j = await r.json();
    } catch (_) {
      // ⚠️ S3 는 없는 객체에 403 을 준다(404 아님).
      const r2 = await fetch(`${API.EVENTS}/kma-lightning.json`, { cache: 'no-cache' });
      if (!r2.ok) throw new Error('lightning ' + r2.status);
      const k = await r2.json();
      only = 'KMA';
      j = {
        generated: k.generated, windowMinutes: k.windowMinutes,
        count: k.count, korea: k.count, japan: 0,
        strikes: (k.strikes || []).map((s) => ({
          lon: s.lon, lat: s.lat, at: s.tm, src: 'KMA', kA: s.kA, t: s.type,
        })),
      };
    }

    const ko = i18n.lang === 'ko';
    const now = Date.now();
    const items = [];
    let oldest = 0;

    (j.strikes || []).forEach((s, i) => {
      const at = toMs(s.at);
      if (at == null || s.lat == null || s.lon == null) return;
      const ageMin = (now - at) / 60_000;
      // ⚠️ 창보다 오래된 것은 버린다. 수집기가 멈춰 있으면 옛 점이 계속 떠서
      //    "지금 치고 있다"로 읽힌다 — 그게 제일 위험한 오해다.
      if (ageMin > MAX_AGE_MIN) return;
      oldest = Math.max(oldest, ageMin);
      // 미래로 나온 것(시계 차이)은 0으로 본다. 음수 나이를 그대로 쓰면 밝기가 1을 넘는다.
      const age = Math.max(0, Math.min(ageMin, MAX_AGE_MIN));
      const fresh = 1 - age / MAX_AGE_MIN;              // 1=방금, 0=한 시간 전

      const jp = s.src === 'JMA';
      const kA = Math.abs(s.kA ?? 0);
      const ground = !jp && s.t === 'G';

      let color, radius;
      if (jp) {
        // ⚠️ 종류도 세기도 모른다 → 색 하나, 크기 하나. 아는 것(시각)만 밝기로 쓴다.
        color = rgba(90, 230, 220, 0.16 + 0.74 * fresh);
        radius = 3;
      } else if (ground) {
        color = rgba(255, 213, 74, 0.18 + 0.82 * fresh);
        radius = 3 + Math.min(6, kA / 22);              // ⚠️ 절댓값을 쓴다
      } else {
        color = rgba(150, 170, 255, 0.12 + 0.5 * fresh);
        radius = 2.2 + Math.min(2.5, kA / 40);
      }

      items.push({
        id: `${s.src}-${s.at}-${i}`,
        lon: s.lon, lat: s.lat,
        // 라벨은 달지 않는다. 수십~수백 개에 글자를 붙이면 화면이 덮인다.
        name: '',
        at,
        color,
        radius,
        // 파문은 아주 최근 **대지방전**에만. 일본 점은 종류를 모르므로 붙이지 않는다.
        pulse: ground && ageMin <= PULSE_MIN,
        data: {
          [ko ? '관측' : 'Source']: jp
            ? (ko ? '일본 기상청' : 'JMA (Japan)')
            : (ko ? '기상청' : 'KMA (Korea)'),
          [ko ? '종류' : 'Type']: jp
            // ⚠️⚠️ 여기서 짐작을 쓰지 않는다. 모른다고 적는 것이 정확한 정보다.
            ? (ko ? '공개되지 않음' : 'Not published')
            : ground
              ? (ko ? '낙뢰 — 땅에 떨어짐' : 'Cloud-to-ground')
              : (ko ? '번개 — 구름 사이' : 'Cloud-to-cloud'),
          ...(jp || !s.kA ? {} : { [ko ? '세기' : 'Current']: `${kA.toFixed(1)} kA` }),
          [ko ? '시각' : 'Time']: `${hhmmss(at)} ${jp ? 'JST' : 'KST'}`,
          [ko ? '몇 분 전' : 'Age']: ko
            ? (ageMin < 1 ? '방금' : `${Math.round(ageMin)}분 전`)
            : (ageMin < 1 ? 'just now' : `${Math.round(ageMin)} min ago`),
        },
        _time: at,
      });
    });

    const nk = items.filter((x) => x.data[ko ? '관측' : 'Source'].includes(ko ? '기상청' : 'KMA')
                                 && !x.data[ko ? '관측' : 'Source'].includes(ko ? '일본' : 'JMA')).length;
    const nj = items.length - nk;

    this.meta = {
      generated: j.generated,
      windowMinutes: j.windowMinutes ?? MAX_AGE_MIN,
      count: items.length, korea: nk, japan: nj,
      // ⚠️ 종류를 아는 것은 한국 자료뿐이다. 전체 수로 말하면 안 된다.
      ground: items.filter((x) => x.pulse !== undefined
        && x.data[ko ? '종류' : 'Type'] === (ko ? '낙뢰 — 땅에 떨어짐' : 'Cloud-to-ground')).length,
      oldestMin: Math.round(oldest),
      sources: j.sources || [{ id: 'KMA', ko: '기상청' }],
      degraded: only === 'KMA',
      note: j.note || {
        ko: '최근 낙뢰입니다.  지금은 한국 자료만 들어오고 있습니다.',
        en: 'Recent lightning. Korea only at the moment.',
      },
    };

    this.layer.setData(items);
    return items.length;
  },
};
