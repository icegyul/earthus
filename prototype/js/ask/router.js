// 질문 → 판단 → 자료 찾기 → 보여주기.  AI API 없이.
//
// 왜 AI 없이 되는가
//   일반 챗봇은 "무슨 말이든" 이해해야 해서 큰 모델이 필요하다.
//   우리는 다르다. 질문의 소재가 태풍·지진·산불·수온·바람·부이… 수십 개로 정해져 있다.
//   그 정도 범위는 키워드 + 유의어 + 패턴으로 덮인다.
//
//   그리고 결정적으로, **우리 답은 문장이 아니어도 된다.** 지구본이 있기 때문이다.
//     "태풍 어디야?"  → 지구본이 그 태풍으로 돌아가고 + 경로가 켜지고 + 수치 카드
//   이건 글로 답하는 것보다 나은 답이면서, 모델이 전혀 필요 없다.
//
// ⚠️ 규칙 기반의 진짜 이점은 비용이 아니라 **환각 불가능**이다.
//    자료에 있는 것만 보여주고 없으면 없다고 한다. 재난 정보에서 지어낸 답은 치명적인데
//    이 방식은 구조적으로 못 지어낸다. 이 성질을 절대 깨지 말 것 —
//    "아마 ~일 것이다" 류의 문장을 여기서 만들어내면 안 된다.
//
// ⚠️ 이건 임시방편이 아니다.
//    나중에 LLM 을 붙이는 날, LLM 이 하는 일은 "질문 이해 → 이 라우터 호출 → 문장화"다.
//    즉 지금 만드는 것이 그때의 하부 구조가 되고, API 가 끊기거나 비쌀 때의 폴백으로 남는다.
//
// 자료 목록은 여기 적지 않는다 — data/catalog.json 이 유일한 출처다.
// 카탈로그의 keywords 가 곧 라우팅 테이블이다.

import { API } from '../config.js';

/* ── 지역 사전 ──────────────────────────────────────────────
   [남, 서, 북, 동] 경계. 질문에 지명이 있으면 그 화면으로 간다.
   ⚠️ 넓게 잡는다. 좁게 잡아 "동해"가 안 걸리는 것보다, 조금 넓어서
      주변이 같이 보이는 편이 낫다. */
const PLACES = [
  { id: 'korea',    ko: ['한국', '대한민국', '우리나라', '남한'], en: ['korea', 'south korea'],
    box: [33, 124, 39, 132] },
  { id: 'eastsea',  ko: ['동해', '동해안'], en: ['east sea', 'sea of japan'], box: [35, 128, 42, 138] },
  { id: 'yellowsea', ko: ['서해', '황해', '서해안'], en: ['yellow sea', 'west sea'], box: [33, 119, 39, 126] },
  { id: 'japan',    ko: ['일본'], en: ['japan'], box: [30, 129, 46, 146] },
  { id: 'china',    ko: ['중국'], en: ['china'], box: [20, 100, 45, 125] },
  { id: 'taiwan',   ko: ['대만', '타이완'], en: ['taiwan'], box: [21, 119, 26, 123] },
  { id: 'philippines', ko: ['필리핀'], en: ['philippines'], box: [5, 117, 20, 127] },
  { id: 'usa',      ko: ['미국'], en: ['usa', 'united states', 'america'], box: [25, -125, 49, -66] },
  { id: 'california', ko: ['캘리포니아'], en: ['california'], box: [32, -125, 42, -114] },
  { id: 'spain',    ko: ['스페인'], en: ['spain'], box: [36, -9, 44, 3] },
  { id: 'europe',   ko: ['유럽'], en: ['europe'], box: [35, -10, 60, 30] },
  { id: 'australia', ko: ['호주', '오스트레일리아'], en: ['australia'], box: [-44, 113, -10, 154] },
  { id: 'pacific',  ko: ['태평양'], en: ['pacific'], box: [-30, 120, 40, -120] },
  { id: 'atlantic', ko: ['대서양'], en: ['atlantic'], box: [-20, -70, 50, -10] },
  { id: 'indian',   ko: ['인도양'], en: ['indian ocean'], box: [-35, 40, 20, 100] },
  { id: 'arctic',   ko: ['북극', '북극해'], en: ['arctic'], box: [66, -180, 90, 180] },
  { id: 'antarctic', ko: ['남극'], en: ['antarctic', 'antarctica'], box: [-90, -180, -60, 180] },

  /* 도시 — 사람들이 실제로 가장 많이 묻는 단위다.
     ⚠️ 도시는 상자를 좁게 잡는다(±1°). 넓게 잡으면 옆 도시 것이 섞인다. */
  { id: 'seoul',    ko: ['서울'], en: ['seoul'], box: [37.0, 126.5, 38.0, 127.5] },
  { id: 'busan',    ko: ['부산'], en: ['busan'], box: [34.7, 128.6, 35.6, 129.4] },
  { id: 'jeju',     ko: ['제주', '제주도'], en: ['jeju'], box: [32.9, 125.9, 34.1, 127.1] },
  { id: 'incheon',  ko: ['인천'], en: ['incheon'], box: [37.0, 126.2, 37.9, 126.9] },
  { id: 'tokyo',    ko: ['도쿄', '동경'], en: ['tokyo'], box: [35.1, 139.1, 36.1, 140.2] },
  { id: 'beijing',  ko: ['베이징', '북경'], en: ['beijing'], box: [39.4, 115.9, 40.4, 117.0] },
  { id: 'shanghai', ko: ['상하이', '상해'], en: ['shanghai'], box: [30.7, 120.9, 31.7, 122.0] },
  { id: 'newyork',  ko: ['뉴욕'], en: ['new york'], box: [40.2, -74.6, 41.2, -73.5] },
  { id: 'london',   ko: ['런던'], en: ['london'], box: [51.0, -0.7, 51.9, 0.4] },
  { id: 'paris',    ko: ['파리'], en: ['paris'], box: [48.4, 1.9, 49.3, 2.9] },
  { id: 'losangeles', ko: ['로스앤젤레스', '엘에이'], en: ['los angeles'], box: [33.5, -118.8, 34.5, -117.7] },
  { id: 'sydney',   ko: ['시드니'], en: ['sydney'], box: [-34.4, 150.6, -33.4, 151.7] },
  { id: 'dubai',    ko: ['두바이'], en: ['dubai'], box: [24.7, 54.7, 25.7, 55.8] },
  { id: 'singapore', ko: ['싱가포르'], en: ['singapore'], box: [1.0, 103.4, 1.7, 104.2] },

  /* 사막 — 황사·먼지를 물을 때 실제로 나오는 이름 */
  { id: 'sahara',   ko: ['사하라'], en: ['sahara'], box: [15, -15, 32, 32] },
  { id: 'gobi',     ko: ['고비', '고비사막'], en: ['gobi'], box: [38, 95, 47, 115] },
  { id: 'taklamakan', ko: ['타클라마칸'], en: ['taklamakan'], box: [36, 76, 42, 90] },

  /* 해역 */
  { id: 'southchinasea', ko: ['남중국해'], en: ['south china sea'], box: [3, 105, 23, 121] },
  { id: 'mediterranean', ko: ['지중해'], en: ['mediterranean'], box: [30, -6, 46, 36] },
  { id: 'northsea', ko: ['북해'], en: ['north sea'], box: [51, -4, 61, 9] },
  { id: 'bengal',   ko: ['벵골만'], en: ['bay of bengal'], box: [5, 80, 23, 95] },
  { id: 'caribbean', ko: ['카리브'], en: ['caribbean'], box: [9, -87, 23, -60] },

  /* 넓은 지역 */
  { id: 'india',    ko: ['인도'], en: ['india'], box: [8, 68, 35, 97] },
  { id: 'seasia',   ko: ['동남아', '동남아시아'], en: ['southeast asia'], box: [-10, 92, 23, 141] },
  { id: 'canada',   ko: ['캐나다'], en: ['canada'], box: [42, -141, 70, -52] },
  { id: 'russia',   ko: ['러시아'], en: ['russia'], box: [42, 27, 72, 180] },
  { id: 'alaska',   ko: ['알래스카'], en: ['alaska'], box: [54, -170, 71, -130] },
  { id: 'hawaii',   ko: ['하와이'], en: ['hawaii'], box: [18, -161, 23, -154] },
  { id: 'brazil',   ko: ['브라질'], en: ['brazil'], box: [-34, -74, 6, -34] },
  { id: 'africa',   ko: ['아프리카'], en: ['africa'], box: [-35, -18, 37, 52] },
  { id: 'greenland', ko: ['그린란드'], en: ['greenland'], box: [59, -73, 84, -11] },
];

/* ── 시간 표현 ────────────────────────────────────────────── */
const TIMES = [
  { id: 'now',       ko: ['지금', '현재', '오늘'], en: ['now', 'today', 'current'], days: 0 },
  { id: 'yesterday', ko: ['어제'], en: ['yesterday'], days: 1 },
  { id: 'week',      ko: ['이번주', '일주일', '최근'], en: ['this week', 'past week', 'recent'], days: 7 },
  { id: 'tomorrow',  ko: ['내일'], en: ['tomorrow'], days: -1 },
];

/* ── 의도(무엇을 묻는가) ────────────────────────────────────
   소재(태풍/지진…)와 별개로 "어떤 종류의 답"을 원하는지. */
const INTENTS = [
  { id: 'where',   ko: ['어디', '위치', '어느곳'], en: ['where', 'location'] },
  { id: 'compare', ko: ['평년', '평소', '보다', '이상', '비교', '작년'], en: ['compared', 'normal', 'anomaly', 'than'] },
  { id: 'count',   ko: ['몇개', '몇건', '얼마나', '개수'], en: ['how many', 'count'] },
  { id: 'status',  ko: ['어때', '어떄', '상태', '괜찮', '있어', '있나', '뭐야'], en: ['how is', 'status', 'any'] },
  { id: 'explain', ko: ['왜', '이유', '원인', '뭐지'], en: ['why', 'reason', 'cause'] },
];

/* 소재 → 앱에서 무엇을 할 것인가.
   ⚠️ layer 는 config.js 의 레이어 id 와 정확히 맞아야 한다. */
const ACTIONS = {
  /* ⚠️ 자료 id 로 먼저 찾고, 없으면 분야(domain)로 찾는다.
     분야만 쓰면 "파고"가 open-meteo-marine(domain[0]='ocean')에 걸려서
     부이 레이어가 켜진다 — 물어본 건 파고인데 엉뚱한 게 켜진다. */
  'open-meteo-marine': { layer: 'wave',    source: 'open-meteo-marine' },
  'open-meteo-air':    { layer: 'aqi',     source: 'open-meteo-air' },
  'metar-stations':    { layer: 'landobs', source: 'metar-stations' },
  'oisst-daily':       { layer: 'sst',     source: 'oisst-daily' },
  'oisst-climatology': { layer: 'sst',     source: 'oisst-climatology' },
  'ndbc-osmc':         { layer: 'buoy',    source: 'ndbc-osmc' },
  'noaa-gfs-tpw':      { layer: 'tpw',     source: 'noaa-gfs-tpw' },

  air:      { layer: 'aqi',      source: 'open-meteo-air' },
  dust:     { layer: 'dust',     source: 'open-meteo-air' },
  ozone:    { layer: 'ozone',    source: 'open-meteo-air' },
  wave:     { layer: 'wave',     source: 'open-meteo-marine' },
  station:  { layer: 'landobs',  source: 'metar-stations' },
  baseline: { layer: 'sst',      source: 'oisst-climatology' },
  cyclone:  { layer: 'cyclone',  source: 'earthus-cyclone-tracks' },
  quake:    { layer: 'quake',    source: 'usgs-quakes' },
  wildfire: { layer: 'wildfire', source: 'earthus-fire-lifecycle' },
  ocean:    { layer: 'buoy',     source: 'ndbc-osmc' },
  buoy:     { layer: 'buoy',     source: 'ndbc-osmc' },
  wind:     { layer: 'wind',     source: 'open-meteo' },
  temperature: { layer: 'temp',  source: 'open-meteo' },
  clouds:   { layer: 'clouds',   source: 'gmgsi-clouds' },
  precipitation: { layer: null,  source: 'imerg' },
  tsunami:  { layer: 'tsunami',  source: 'nws-tsunami' },
  aurora:   { layer: 'aurora',   source: 'noaa-swpc' },
  solar:    { layer: 'aurora',   source: 'noaa-swpc' },
  volcano:  { layer: 'volcano',  source: 'gvp-volcano' },
  astronomy: { layer: 'eclipse', source: 'nasa-eclipse' },
  imagery:  { layer: 'truecolor', source: 'nasa-gibs' },
  space:    { layer: 'orbits',   source: 'celestrak' },   // ⚠️ 레이어 id 는 'orbits' 다
  news:     { layer: 'news',     source: 'gdelt' },
  forecast: { layer: 'tmax',     source: 'earthus-forecast-snapshots' },
  aviation: { layer: 'flight',   source: 'adsb-lol' },
};

/* 낱말이 곧 레이어인 경우.
   ⚠️ 왜 필요한가 (실측)
     대기질 자료 하나가 PM2.5·PM10·먼지·오존·자외선·대기질지수 여섯을 덮는다.
     자료 단위로만 고르면 "황사 오고 있어?" 에 대기질지수 레이어가 켜진다 —
     물어본 건 먼지인데 다른 게 켜진다. 낱말이 더 구체적이면 낱말을 따른다. */
const KEYWORD_LAYER = [
  [['초미세먼지', 'pm2.5', 'pm25'], 'pm25'],
  [['미세먼지', 'pm10'], 'pm10'],
  /* ⚠️ 단독 '먼지'도 여기다. 가장 긴 낱말이 이기므로 '미세먼지'(pm10)·
     '초미세먼지'(pm25)가 먼저 걸리고, 그냥 '먼지'만 남을 때 이쪽이 된다. */
  [['황사', '모래바람', '사막먼지', '먼지', 'dust', 'sand storm', 'yellow dust'], 'dust'],
  [['자외선', 'uv', 'uvindex'], 'uv'],
  [['오존', 'ozone'], 'ozone'],
  [['대기질', '공기질', 'aqi', 'air quality', '스모그', 'smog'], 'aqi'],
  [['너울', 'swell'], 'swell'],
  [['파고', '파도', '물결', 'wave', 'surf'], 'wave'],
  [['해류', '조류', 'current'], 'current'],
  [['해수면온도', '수온', '해수온', '바닷물온도', 'sst', 'sea surface'], 'sst'],
  [['안개', '시정', 'fog', 'visibility'], 'fog'],
  [['가뭄', '토양수분', '메마', 'drought', 'soil moisture'], 'drought'],
  /* 상대습도와 다르다. '수증기'만으로 천리안 상층 영상까지 뺏지 않도록
     대기 기둥 전체를 뜻하는 구체적인 표현만 TPW 수치 레이어로 보낸다. */
  [['총가강수량', '가강수량', '대기중수증기량', '대기중 수증기량', '수증기통로',
    'total precipitable water', 'total column water vapour', 'tpw', 'tcwv'], 'tpw'],
  /* ⚠️ '서울 기온 평년보다?' 가 수온으로 가던 문제.
     '평년'이 걸려 해수면온도 자료가 뽑히는데, 물어본 건 기온이다.
     '해수면온도'(6자)가 '기온'(2자)보다 길어서 바다 질문은 그대로 수온으로 간다. */
  [['기온', 'air temperature'], 'temp'],
  [['내일최고', '내일기온', '최고기온'], 'tmax'],
  [['최저기온'], 'tmin'],
];

/** 검색용 정규화 — 공백·문장부호를 지우고 소문자로.
    ⚠️ 한국어는 조사가 붙는다("태풍은", "산불이"). 공백을 지운 통짜 문자열에
       부분일치를 걸면 조사가 있어도 걸린다. 형태소 분석 없이 여기까지는 된다. */
function norm(s) {
  return (s || '').toLowerCase().replace(/[\s.,!?~·'"()[\]]/g, '');
}

function hits(text, words) {
  return (words || []).filter(w => text.includes(norm(w)));
}

export const router = {
  catalog: null,
  _log: [],          // 못 알아들은 질문 — 무엇을 더 만들지 알려주는 자료

  async load() {
    if (this.catalog) return this.catalog;
    const r = await fetch('data/catalog.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`catalog HTTP ${r.status}`);
    this.catalog = await r.json();
    return this.catalog;
  },

  /**
   * 질문을 뜯어본다. **여기서 답을 만들지 않는다** — 무엇을 보여줄지만 정한다.
   * @returns {{ok, datasets, place, time, intent, action, why}}
   */
  parse(q, lang = 'ko') {
    const t = norm(q);
    if (!t) return { ok: false, reason: 'empty' };
    const cat = this.catalog;
    if (!cat) return { ok: false, reason: 'no-catalog' };

    // ── 소재: 카탈로그의 keywords 로 찾는다 ──
    const scored = [];
    cat.datasets.forEach(d => {
      const kw = [...(d.keywords?.ko || []), ...(d.keywords?.en || [])];
      const m = hits(t, kw);
      if (!m.length) return;
      // 긴 낱말이 걸리면 더 확실한 신호다 ("해수면온도" > "수온" > "온")
      const score = m.reduce((a, w) => a + norm(w).length, 0);
      scored.push({ d, score, matched: m });
    });
    scored.sort((a, b) => b.score - a.score);

    const place = PLACES.find(p => hits(t, [...p.ko, ...p.en]).length) || null;
    const time = TIMES.find(x => hits(t, [...x.ko, ...x.en]).length) || null;
    const intent = INTENTS.find(x => hits(t, [...x.ko, ...x.en]).length) || null;

    if (!scored.length) {
      this._log.push({ q, at: new Date().toISOString(), miss: 'no-topic' });
      return { ok: false, reason: 'no-topic', place, time, intent };
    }

    const top = scored[0];
    const domain = (top.d.domain || [])[0];
    let action = ACTIONS[top.d.id] || ACTIONS[domain] || null;

    /* 더 구체적인 낱말이 있으면 그쪽 레이어로 바꾼다.
       ⚠️ 가장 긴 낱말이 이긴다 — "초미세먼지"가 "미세먼지"보다 구체적이다. */
    let best = null;
    KEYWORD_LAYER.forEach(([words, layer]) => {
      words.forEach(w => {
        const nw = norm(w);
        if (t.includes(nw) && (!best || nw.length > best.len)) best = { layer, len: nw.length };
      });
    });
    if (best) action = { ...(action || {}), layer: best.layer };

    return {
      ok: true,
      datasets: scored.slice(0, 3).map(x => x.d),
      matched: top.matched,
      place, time,
      intent: intent?.id || 'status',
      action,
      /* ⚠️ 왜 이 답이 나왔는지 사람이 확인할 수 있어야 한다.
         근거를 못 대는 답은 규칙 기반이든 AI 든 믿을 수 없다. */
      why: { keyword: top.matched, dataset: top.d.id, place: place?.id, time: time?.id },
    };
  },

  /** 못 알아들은 질문들 — 나중에 무엇을 더 만들지 알려준다 (기기 안에만 둔다) */
  misses() { return this._log.slice(-50); },

  /** 이 자료를 어떻게 인용해야 하나 — 카탈로그가 그대로 답한다 */
  citation(datasetId) {
    const d = this.catalog?.datasets.find(x => x.id === datasetId);
    if (!d) return null;
    return {
      title: d.title, org: d.org, doi: d.doi || null,
      citation: d.citation || null,
      license: d.license,
      /* ⚠️ 인용문이 없으면 "없다"고 말한다. 지어내면 논문에 그대로 실린다. */
      note: d.citation ? null : '이 자료는 정식 인용문이 등록돼 있지 않습니다. 기관 표기를 직접 확인하세요.',
    };
  },
};

export { PLACES, TIMES, ACTIONS };
