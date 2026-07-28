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

/* ── 일본 지명을 한국어로 ────────────────────────────────────────
   ⚠️ 예전에는 한국어 설정일 때 **일본어 원문을 그대로** 보여줬다.
      화면에 「熊本県熊本地方」이 떴다 — 대부분의 한국 사용자가 못 읽는다.
      영문(placeEn)으로 떨어뜨리는 것도 답이 아니다. 한국어 설정인데 영어가 나온다.

   JMA 지명은 규칙적이다: <도도부현><방위/지역><접미>
      熊本県熊本地方 · 福島県沖 · 茨城県北部 · 三陸沖 · 石垣島近海
   그래서 **도도부현 47개 + 방위·접미어**만 옮기면 대부분이 자연스럽게 풀린다.

   ⚠️ 표에 없는 조각은 **원문을 그대로 남긴다.** 억지로 음차하지 않는다 —
      틀린 지명을 지어내느니 원문이 낫다. (예: 잘 안 쓰이는 낙도 이름)  */
const JP_PREF = {
  '北海道':'홋카이도','青森県':'아오모리현','岩手県':'이와테현','宮城県':'미야기현',
  '秋田県':'아키타현','山形県':'야마가타현','福島県':'후쿠시마현','茨城県':'이바라키현',
  '栃木県':'도치기현','群馬県':'군마현','埼玉県':'사이타마현','千葉県':'지바현',
  '東京都':'도쿄도','神奈川県':'가나가와현','新潟県':'니가타현','富山県':'도야마현',
  '石川県':'이시카와현','福井県':'후쿠이현','山梨県':'야마나시현','長野県':'나가노현',
  '岐阜県':'기후현','静岡県':'시즈오카현','愛知県':'아이치현','三重県':'미에현',
  '滋賀県':'시가현','京都府':'교토부','大阪府':'오사카부','兵庫県':'효고현',
  '奈良県':'나라현','和歌山県':'와카야마현','鳥取県':'돗토리현','島根県':'시마네현',
  '岡山県':'오카야마현','広島県':'히로시마현','山口県':'야마구치현','徳島県':'도쿠시마현',
  '香川県':'가가와현','愛媛県':'에히메현','高知県':'고치현','福岡県':'후쿠오카현',
  '佐賀県':'사가현','長崎県':'나가사키현','熊本県':'구마모토현','大分県':'오이타현',
  '宮崎県':'미야자키현','鹿児島県':'가고시마현','沖縄県':'오키나와현',
  // 현이 아닌 해역·지역 이름 중 자주 나오는 것
  '三陸沖':'산리쿠 앞바다','日本海':'일본해','東シナ海':'동중국해','伊豆諸島':'이즈제도',
  '小笠原諸島':'오가사와라제도','奄美大島':'아마미오섬','種子島':'다네가섬','石垣島':'이시가키섬',
  '宮古島':'미야코섬','与那国島':'요나구니섬','父島':'지치섬','八丈島':'하치조섬',
};
/* 접미·방위. ⚠️ 긴 것부터 지운다 — '北部' 를 '北'+'部' 로 쪼개면 엉뚱해진다. */
const JP_SUFFIX = [
  ['地方',''], ['付近','부근'], ['近海','근해'], ['沿岸',' 연안'],
  ['北西部',' 북서부'], ['南西部',' 남서부'], ['北東部',' 북동부'], ['南東部',' 남동부'],
  ['中越',' 주에쓰'], ['下越',' 시모에쓰'], ['上越',' 조에쓰'],
  ['北部',' 북부'], ['南部',' 남부'], ['東部',' 동부'], ['西部',' 서부'], ['中部',' 중부'],
  ['内陸',' 내륙'], ['沖',' 앞바다'],
];

/* 자주 나오는 하위 지역·반도 이름.
   ⚠️ 전부 담으려 하지 않는다. JMA 세부구역은 수백 개고, 억지로 음차하면 틀린다.
      여기 없는 것은 아래에서 영문으로 떨어진다. */
const JP_AREA = {
  '薩摩':'사쓰마','大隅':'오스미','能登半島':'노토반도','紀伊水道':'기이수도',
  '豊後水道':'분고수도','日向灘':'휴가나다','若狭湾':'와카사만','駿河湾':'스루가만',
  '相模湾':'사가미만','東京湾':'도쿄만','伊勢湾':'이세만','大阪湾':'오사카만',
  '瀬戸内海':'세토내해','有明海':'아리아케해','八代海':'야쓰시로해','根室':'네무로',
  '釧路':'구시로','十勝':'도카치','日高':'히다카','胆振':'이부리','石狩':'이시카리',
  '渡島':'오시마','檜山':'히야마','宗谷':'소야','上川':'가미카와','留萌':'루모이',
  '網走':'아바시리','北見':'기타미','紋別':'몬베쓰','庄内':'쇼나이','会津':'아이즈',
  '浜通り':'하마도리','中通り':'나카도리','飛騨':'히다','美濃':'미노','伊豆':'이즈',
};

/** 일본 지명 → 한국어. 못 옮기면 null (호출부가 영문으로 떨어뜨린다). */
export function jaPlaceKo(ja) {
  if (!ja) return null;
  let s = String(ja);
  // 1) 도도부현·해역 이름을 먼저 치환 (긴 이름부터 — '鹿児島県' 이 '島' 보다 앞서야 한다)
  let head = '';
  let prefBase = '';
  for (const k of Object.keys(JP_PREF).sort((a, b) => b.length - a.length)) {
    if (s.startsWith(k)) {
      head = JP_PREF[k];
      prefBase = k.replace(/[県府都]$/, '');   // 熊本県 → 熊本
      s = s.slice(k.length);
      break;
    }
  }
  /* ⚠️ JMA 는 「熊本県熊本地方」처럼 **현 이름을 한 번 더 쓴다.**
     그대로 옮기면 "구마모토현 구마모토"가 되어 군더더기다. 앞이 같으면 뗀다. */
  if (prefBase && s.startsWith(prefBase)) s = s.slice(prefBase.length);
  // 하위 지역명 치환 (긴 것부터)
  for (const k of Object.keys(JP_AREA).sort((a, b) => b.length - a.length)) {
    if (s.includes(k)) { s = s.split(k).join(JP_AREA[k]); }
  }
  // 2) 남은 꼬리에서 접미·방위를 옮긴다
  let tail = s;
  for (const [k, v] of JP_SUFFIX) {
    if (tail.includes(k)) { tail = tail.split(k).join(v); }
  }
  const out = (head + (tail ? (head ? ' ' : '') + tail : '')).replace(/\s+/g, ' ').trim();
  /* ⚠️ 한자가 그대로 남아 있으면 옮기지 못한 것이다.
     반쯤 번역된 어색한 이름을 내놓느니 원문을 준다 — 최소한 검색은 된다. */
  return /[一-鿿]/.test(out) ? null : (out || null);
}
