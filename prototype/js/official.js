// 공식 기관 링크 — 화산·지진 등 자연재난
//
// 인수인계 §5-4 의 지침을 그대로 따른다:
//   "자연재난 — 통합 API 없음. 기관 유튜브 채널 화이트리스트 수동 큐레이션 필요
//    (USGS, JMA, 각국 재난당국). 이벤트 발생 시 해당 지역 담당기관 라이브 여부 체크"
//
// ⚠️ 왜 아무 뉴스나 링크하지 않는가 (§5-3, §5-4)
//    · 원문 본문 재현은 저작권 위반이다 → 링크만 준다
//    · 특정 매체를 앱이 골라 임베드하면 "공식 중계"처럼 오인된다
//    → 담당 정부기관·연구기관만 화이트리스트로 둔다. 판단은 사용자에게 맡긴다.
//
// ⚠️ 라이브 영상 링크는 넣지 않았다.
//    유튜브 라이브 URL 은 방송이 끝나면 죽거나 다른 영상으로 바뀐다.
//    죽은 링크를 "라이브"라고 보여주면 신뢰를 잃는다.
//    대신 기관의 채널·공식 페이지로 보낸다 — 거기 라이브가 있으면 사용자가 바로 본다.

import { i18n } from './i18n.js';

/* 화산 → 스미소니언 GVP 번호.
   실측으로 매칭했다 (좌표 오차 0.02° 이내). GVP 는 전 세계 화산의 표준 DB 이고,
   주간 활동 보고서가 올라온다. */
const GVP = {
  '백두산': 305060, '후지산': 283030, '사쿠라지마': 282080, '아소산': 282110,
  '운젠': 282100, '탐보라': 264040, '크라카타우': 262000, '메라피': 263250,
  '피나투보': 273083, '마욘': 273030, '타알': 273070, '에트나': 211060,
  '베수비오': 211020, '스트롬볼리': 211040,
};

/* 나라별 담당 기관. 화산·지진을 실제로 관측·발표하는 곳만 넣는다. */
const AGENCY = {
  JP: {
    name: { ko: '일본 기상청 (JMA)', en: 'Japan Meteorological Agency' },
    volcano: 'https://www.jma.go.jp/bosai/volcano/',
    quake: 'https://www.jma.go.jp/bosai/map.html#5/34.5/137/&elem=int&contents=earthquake_map',
    youtube: 'https://www.youtube.com/@jma_kishou',
  },
  US: {
    name: { ko: '미국 지질조사국 (USGS)', en: 'U.S. Geological Survey' },
    volcano: 'https://www.usgs.gov/programs/volcano-hazards/volcanoes',
    quake: 'https://earthquake.usgs.gov/earthquakes/map/',
    youtube: 'https://www.youtube.com/@usgs',
  },
  ID: {
    name: { ko: '인도네시아 화산지질재해완화센터 (PVMBG)', en: 'PVMBG, Indonesia' },
    volcano: 'https://magma.esdm.go.id/v1',
  },
  PH: {
    name: { ko: '필리핀 화산지진연구소 (PHIVOLCS)', en: 'PHIVOLCS, Philippines' },
    volcano: 'https://www.phivolcs.dost.gov.ph/',
    youtube: 'https://www.youtube.com/@phivolcs_dost',
  },
  IT: {
    name: { ko: '이탈리아 국립지구물리화산연구소 (INGV)', en: 'INGV, Italy' },
    volcano: 'https://www.ingv.it/',
    youtube: 'https://www.youtube.com/@INGVterremoti',
  },
  IS: {
    name: { ko: '아이슬란드 기상청 (IMO)', en: 'Icelandic Met Office' },
    volcano: 'https://en.vedur.is/volcanoes/',
  },
  KR: {
    name: { ko: '기상청', en: 'Korea Meteorological Administration' },
    quake: 'https://www.weather.go.kr/w/eqk-vol/search/korea.do',
  },
};

/* 화산 이름 → 담당 국가. 좌표로 자동 판정하지 않는다 —
   국경 근처 화산에서 엉뚱한 기관이 나오면 신뢰가 깨진다. */
const VOLCANO_COUNTRY = {
  '백두산': 'KR', '후지산': 'JP', '사쿠라지마': 'JP', '아소산': 'JP', '운젠': 'JP',
  '탐보라': 'ID', '크라카타우': 'ID', '메라피': 'ID',
  '피나투보': 'PH', '마욘': 'PH', '타알': 'PH',
  '에트나': 'IT', '베수비오': 'IT', '스트롬볼리': 'IT',
};

/**
 * 화산의 공식 링크 목록
 * @returns [{ label, url, note }]
 */
export function volcanoLinks(name) {
  const ko = i18n.lang === 'ko';
  const out = [];

  const gid = GVP[name];
  if (gid) {
    out.push({
      label: ko ? '스미소니언 화산 정보' : 'Smithsonian volcano profile',
      url: `https://volcano.si.edu/volcano.cfm?vn=${gid}`,
      note: ko ? '분화 이력·최근 활동 보고' : 'Eruption history and recent activity',
    });
    out.push({
      label: ko ? '이번 주 전 세계 화산 활동' : 'This week’s global volcanic activity',
      url: 'https://volcano.si.edu/reports_weekly.cfm',
      note: ko ? '스미소니언 주간 보고서' : 'Smithsonian weekly report',
    });
  }

  const cc = VOLCANO_COUNTRY[name];
  const ag = cc && AGENCY[cc];
  if (ag?.volcano) {
    out.push({
      label: ko ? `${ag.name.ko} 화산 정보` : `${ag.name.en} — volcano info`,
      url: ag.volcano,
      note: ko ? '담당 기관 공식 발표' : 'Official agency bulletin',
    });
  }
  if (ag?.youtube) {
    out.push({
      label: ko ? `${ag.name.ko} 공식 채널` : `${ag.name.en} — official channel`,
      url: ag.youtube,
      note: ko ? '기관이 직접 올리는 영상·라이브' : 'Agency video and live streams',
    });
  }
  return out;
}

/** 분화 중인 화산의 담당 기관 라이브.
    ⚠️ 특정 라이브 영상 URL 은 방송이 끝나면 죽는다. 그래서 채널 주소를 준다 —
       livevideo.js 가 "임베드 가능한 영상"인지 판단해서 임베드할지 링크로 둘지 정한다. */
export function agencyLive(volcanoName) {
  const ko = i18n.lang === 'ko';
  const cc = VOLCANO_COUNTRY[volcanoName];
  const ag = cc && AGENCY[cc];
  if (!ag?.youtube) return null;
  return {
    url: ag.youtube,
    label: ko ? `${ag.name.ko} 라이브` : `${ag.name.en} live`,
  };
}

/** 지진의 공식 링크. USGS 는 지진마다 고유 페이지가 있다. */
export function quakeLinks(usgsUrl, lat, lon) {
  const ko = i18n.lang === 'ko';
  const out = [];
  if (usgsUrl) out.push({
    label: ko ? 'USGS 이 지진 상세' : 'USGS event page',
    url: usgsUrl,
    note: ko ? '진원·단층·체감 보고' : 'Origin, mechanism, felt reports',
  });
  // 일본 근해면 JMA 도 같이 (동일 지진을 다른 기관이 어떻게 보는지 비교할 수 있다)
  if (lat > 24 && lat < 46 && lon > 122 && lon < 150 && AGENCY.JP.quake) {
    out.push({ label: ko ? '일본 기상청 지진 정보' : 'JMA earthquake info',
               url: AGENCY.JP.quake, note: ko ? '일본 기준 진도' : 'JMA intensity scale' });
  }
  if (lat > 33 && lat < 39 && lon > 124 && lon < 132 && AGENCY.KR.quake) {
    out.push({ label: ko ? '기상청 국내지진 조회' : 'KMA domestic earthquakes',
               url: AGENCY.KR.quake, note: ko ? '국내 관측값' : 'Korean observations' });
  }
  return out;
}
