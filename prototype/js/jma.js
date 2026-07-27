// 일본 기상청(JMA) 지진 대조
//
// 왜 필요한가
//   지금까지 지진은 USGS 하나만 썼다. USGS 는 전 지구를 고르게 보는 대신
//   특정 나라 안에서는 그 나라 관측망보다 진앙이 부정확하다.
//   일본은 관측점이 수백 개라 JMA 해가 훨씬 정밀하다.
//   실제로 "일본 지진 위치가 기상청과 다르다"는 지적을 받았다 — 맞는 지적이다.
//
// 어떻게 하나
//   일본 근해 지진은 JMA 발표를 정본으로 삼고, USGS 를 대조값으로 함께 보여준다.
//   두 기관이 다르면 "다르다"고 그대로 말한다. 하나로 뭉개지 않는다.
//   기관마다 관측망·속도모델이 달라 수십 km 차이는 정상이다 — 그것도 설명한다.
//
// 덤으로 얻는 것: 진도(震度).
//   일본에서 실제로 중요한 건 규모(M)보다 진도다. "M5.0"보다 "震度5弱"이
//   그 자리에서 무엇을 겪었는지를 말해준다. USGS 피드에는 이 값이 없다.
//
// 출처: https://www.jma.go.jp/bosai/quake/data/list.json  (CORS 개방 확인)

const LIST = 'https://www.jma.go.jp/bosai/quake/data/list.json';
const TTL = 120_000;

/** 일본 기상청이 진앙을 발표하는 대략적 범위 (넉넉히 잡는다) */
export const JAPAN = { latMin: 20, latMax: 50, lonMin: 122, lonMax: 154 };

export function inJapan(lat, lon) {
  return lat >= JAPAN.latMin && lat <= JAPAN.latMax
      && lon >= JAPAN.lonMin && lon <= JAPAN.lonMax;
}

/* JMA 진도 계급. 5·6 은 약(-)/강(+)으로 나뉜다 — 우리가 등급을 만들지 않고 그대로 옮긴다. */
const SHINDO = {
  '1':  { ko: '진도 1',    en: 'Shindo 1',  desc: { ko: '일부 사람만 느낌', en: 'Felt by few' } },
  '2':  { ko: '진도 2',    en: 'Shindo 2',  desc: { ko: '실내의 많은 사람이 느낌', en: 'Felt by many indoors' } },
  '3':  { ko: '진도 3',    en: 'Shindo 3',  desc: { ko: '건물이 흔들리는 것을 느낌', en: 'Buildings shake noticeably' } },
  '4':  { ko: '진도 4',    en: 'Shindo 4',  desc: { ko: '매달린 물건이 크게 흔들림', en: 'Hanging objects swing hard' } },
  '5-': { ko: '진도 5약',  en: 'Shindo 5-', desc: { ko: '가구가 움직이고 놀라는 사람이 많음', en: 'Furniture moves; most are alarmed' } },
  '5+': { ko: '진도 5강',  en: 'Shindo 5+', desc: { ko: '고정 안 된 가구가 넘어짐', en: 'Unsecured furniture topples' } },
  '6-': { ko: '진도 6약',  en: 'Shindo 6-', desc: { ko: '서 있기 어려움, 벽 타일 파손', en: 'Hard to stand; wall tiles fall' } },
  '6+': { ko: '진도 6강',  en: 'Shindo 6+', desc: { ko: '서 있을 수 없음, 건물 손상', en: 'Cannot stand; buildings damaged' } },
  '7':  { ko: '진도 7',    en: 'Shindo 7',  desc: { ko: '내진 건물도 손상 가능', en: 'Even quake-resistant buildings may be damaged' } },
};

/**
 * ISO 6709 좌표 문자열을 푼다.
 *   '+41.6+141.5-120000/'      → 십진도 + 깊이(m)
 *   '+3130.5+13120.4-30000/'   → 도분(DDMM.M) 형식 — 실제 피드에 둘 다 나온다
 * 못 읽으면 null. 억지로 해석하지 않는다 — 지진 위치를 추측하면 안 된다.
 */
export function parseCod(cod) {
  if (!cod) return null;
  const m = cod.match(/^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)(?:([+-]\d+(?:\.\d+)?))?\//);
  if (!m) return null;

  const conv = (s, degDigits) => {
    const sign = s[0] === '-' ? -1 : 1;
    const body = s.slice(1);
    const intLen = (body.split('.')[0] || '').length;
    // 도분 형식은 정수부가 (도자리+2) 자리다: 위도 4자리(DDMM), 경도 5자리(DDDMM)
    if (intLen > degDigits) {
      const deg = parseFloat(body.slice(0, intLen - 2));
      const min = parseFloat(body.slice(intLen - 2));
      return sign * (deg + min / 60);
    }
    return sign * parseFloat(body);
  };

  const lat = conv(m[1], 2);
  const lon = conv(m[2], 3);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  // 깊이는 m 단위 음수로 온다 (지하). km 양수로 바꾼다.
  const depth = m[3] != null ? Math.abs(parseFloat(m[3])) / 1000 : null;
  return { lat, lon, depth };
}

/** 두 지점 사이 거리 (km) */
export function distKm(a, b) {
  const R = 6371, d2r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * d2r, dLon = (b.lon - a.lon) * d2r;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * d2r) * Math.cos(b.lat * d2r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export const jma = {
  list: [],
  at: 0,

  async load() {
    if (Date.now() - this.at < TTL && this.list.length) return this.list;
    const r = await fetch(LIST, { cache: 'no-cache' });
    if (!r.ok) throw new Error('jma ' + r.status);
    const raw = await r.json();

    this.list = raw.map(x => {
      const pos = parseCod(x.cod);
      /* ⚠️ 좌표가 없는 발표가 실제로 17건 있었다.
         '震度速報'(진도 속보)는 흔들림만 먼저 알리고 진앙은 아직 없는 단계다.
         좌표를 못 읽으면 대조에 쓰지 않는다 — 없는 값을 지어내지 않는다. */
      if (!pos) return null;
      return {
        id: x.eid,
        time: Date.parse(x.at),          // JST 오프셋이 문자열에 들어 있어 그대로 파싱된다
        lat: pos.lat, lon: pos.lon, depth: pos.depth,
        mag: x.mag ? parseFloat(x.mag) : null,
        shindo: x.maxi || null,
        placeJa: x.anm || null,
        placeEn: x.en_anm || null,
        title: x.ttl || null,
      };
    }).filter(Boolean);

    this.at = Date.now();
    return this.list;
  },

  /**
   * USGS 지진 하나에 대응하는 JMA 발표를 찾는다.
   *
   * 판정: 발생 시각 ±120초 + 진앙 300 km 이내.
   * ⚠️ 느슨하게 잡으면 다른 지진을 같은 것으로 붙여버린다.
   *    시각을 좁게(±2분) 두는 게 핵심이다 — 같은 지역에서 2분 안에
   *    서로 다른 지진이 두 번 나는 일은 여진 군발을 빼면 드물다.
   *    여러 개가 걸리면 시각이 가장 가까운 것을 고른다.
   */
  match(q) {
    if (!inJapan(q.lat, q.lon)) return null;
    const T = 120_000, D = 300;
    let best = null;
    for (const e of this.list) {
      const dt = Math.abs(e.time - q.time);
      if (dt > T) continue;
      const dk = distKm(q, e);
      if (dk > D) continue;
      if (!best || dt < best.dt) best = { ...e, dt, distKm: dk };
    }
    return best;
  },

  shindoText(code, ko) {
    const s = SHINDO[code];
    if (!s) return null;
    return `${ko ? s.ko : s.en} — ${ko ? s.desc.ko : s.desc.en}`;
  },
};
