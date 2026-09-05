// 목적별 관광지 정본. 군구 집계나 이름 유사도로 시설 상세를 추정하지 않는다.
export const TRAVEL_CATALOGS = Object.freeze({
  bf: { service: 'barrierFree', title: '무장애 여행지', file: 'kto-barrier-free.json', operation: 'areaBasedSyncList2', type: 'OFFICIAL_BARRIER_FREE_TOURISM_CONTENT' },
  wl: { service: 'wellness', title: '웰니스 관광지', file: 'kto-wellness.json', operation: 'wellnessTursmSyncList', type: 'OFFICIAL_WELLNESS_CONTENT' },
  en: { service: 'english', title: '영문 관광정보', file: 'kto-english.json', operation: 'areaBasedSyncList2', type: 'OFFICIAL_ENGLISH_TOURISM_CONTENT' },
});

export const ACCESSIBILITY_LABELS = Object.freeze({
  parking: '장애인 주차', route: '접근로', publictransport: '대중교통', ticketoffice: '매표소',
  promotion: '안내 시설', wheelchair: '휠체어 대여', exit: '출입구', elevator: '엘리베이터',
  restroom: '장애인 화장실', auditorium: '관람석', room: '객실', handicapetc: '기타 편의',
  braileblock: '점자 블록', helpdog: '보조견 동반', guidehuman: '안내 인력', audioguide: '음성 안내',
  bigprint: '확대 안내', brailepromotion: '점자 안내', guidesystem: '유도 안내', blindhandicapetc: '시각장애 편의',
  signguide: '수어 안내', videoguide: '영상 안내', hearingroom: '청각장애 객실', hearinghandicapetc: '청각장애 편의',
  stroller: '유모차 대여', lactationroom: '수유실', babysparechair: '유아 의자', infantsfamilyetc: '영유아 편의',
});

export const TRAVEL_INTRO_LABELS = Object.freeze({
  usetime: '이용시간', usetimeculture: '이용시간', usetimeleports: '이용시간', usetimefestival: '행사 이용시간',
  opentime: '운영시간', opentimefood: '영업시간', checkintime: '체크인', checkouttime: '체크아웃',
  restdate: '쉬는 날', restdateculture: '쉬는 날', restdateleports: '쉬는 날', restdatefood: '쉬는 날', restdateshopping: '쉬는 날',
  parking: '주차', parkingculture: '주차', parkingleports: '주차', parkingfood: '주차', parkinglodging: '주차', parkingshopping: '주차',
  usefee: '이용요금', usefeeleports: '이용요금', infocenter: '문의', infocenterculture: '문의', infocenterleports: '문의',
  infocenterfood: '문의', infocenterlodging: '문의', infocentershopping: '문의',
  expguide: '체험 안내', expagerange: '체험 연령', program: '프로그램', theme: '주제', agelimit: '이용 연령',
  reservation: '예약 안내', reservationfood: '예약 안내', reservationlodging: '예약 안내',
});
const DETAIL_OPERATIONS = Object.freeze({
  bf: { common: 'detailCommon2', intro: 'detailIntro2', accessibility: 'detailWithTour2' },
  wl: { common: 'detailCommon', intro: 'detailIntro' },
  en: { common: 'detailCommon2', intro: 'detailIntro2' },
});
const COMMON_DETAIL_FIELDS = ['title', 'overview', 'homepage', 'tel', 'addr1', 'addr2', 'baseAddr', 'detailAddr', 'modifiedtime', 'mdfcnDt', 'cpyrhtDivCd'];

const text = value => typeof value === 'string' ? value.trim() : '';
const finite = (value, limit) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
export function safeSourceUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

export function detailSummaryUrl(mode, id, origin = globalThis.location?.origin || 'https://earthus.net') {
  if (!TRAVEL_CATALOGS[mode] || !/^[0-9]{1,20}$/.test(String(id))) throw new Error('관광지 상세 ID를 확인할 수 없습니다.');
  return new URL(`/tourism/kto/details/${TRAVEL_CATALOGS[mode].service}/${id}/summary.json`, origin).href;
}

export function providerPlainText(value) {
  return String(value || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, '&');
}

export function providerHomepage(value) {
  const raw = String(value || '').trim();
  const href = raw.match(/href\s*=\s*["']([^"']+)["']/i)?.[1] || raw;
  return /(?:servicekey|api[_-]?key|token|password|secret)\s*=/i.test(href) ? null : safeSourceUrl(href);
}

export function validateTravelDetailSummary(document, mode, id) {
  if (!TRAVEL_CATALOGS[mode] || document?.schemaVersion !== 'earthus.kto-place-detail.v1' || document.provider !== 'KTO'
      || document.service !== TRAVEL_CATALOGS[mode].service || document.contentId !== String(id)
      || !Number.isFinite(Date.parse(document.catalogFetchedAt))) throw new Error('선택한 관광지와 상세 자료가 일치하지 않습니다.');
  if (['HIDDEN', 'NOT_IN_CATALOG'].includes(document.state)) return { state: document.state, sections: {}, contentId: String(id) };
  if (document.sourceType !== 'OFFICIAL_INFORMATION' || document.showFlag !== '1'
      || !['AVAILABLE', 'PARTIAL', 'UNAVAILABLE'].includes(document.state) || !document.sections) throw new Error('상세 자료의 공개 상태를 확인할 수 없습니다.');
  const sections = {};
  for (const [name, operation] of Object.entries(DETAIL_OPERATIONS[mode])) {
    const section = document.sections[name];
    if (!section) continue;
    if (section.operation !== operation || !['AVAILABLE', 'STALE', 'UNAVAILABLE', 'NOT_FETCHED'].includes(section.state)) throw new Error('상세 항목의 종류를 확인할 수 없습니다.');
    const allowed = name === 'accessibility' ? Object.keys(ACCESSIBILITY_LABELS) : name === 'intro' ? Object.keys(TRAVEL_INTRO_LABELS) : COMMON_DETAIL_FIELDS;
    const fields = {};
    for (const key of allowed) {
      const value = section.fields?.[key];
      if (typeof value === 'string' && value.trim() && !/(?:servicekey|api[_-]?key|token|password|secret)\s*[=:]/i.test(value)) fields[key] = value;
    }
    if (Object.keys(fields).length && (!Number.isFinite(Date.parse(section.fetchedAt)) || !safeSourceUrl(section.provenance?.sourceUrl))) throw new Error('상세 정보의 출처 또는 수집시각을 확인할 수 없습니다.');
    if (Object.keys(fields).length && !['AVAILABLE', 'STALE'].includes(section.state)) throw new Error('미수집 항목에 상세 값이 포함되어 있습니다.');
    sections[name] = { state: section.state, fields, fetchedAt: section.fetchedAt || null, sourceName: section.provenance?.sourceName || '한국관광공사',
      sourceUrl: safeSourceUrl(section.provenance?.sourceUrl), modifiedAtRaw: section.catalogModifiedAtRaw || document.catalogModifiedAtRaw || null };
  }
  return { state: document.state, sections, contentId: String(id), catalogFetchedAt: document.catalogFetchedAt };
}

export function buildTravelCatalog(document, mode, { detailDocument = null, compiledAt = new Date().toISOString() } = {}) {
  const config = TRAVEL_CATALOGS[mode];
  if (!config || document?.provider !== 'KTO' || document?.schemaVersion !== 'earthus.kto-normalized.v1'
      || document?.service !== config.service || document?.semanticType !== config.type
      || !Array.isArray(document.items) || !Number.isFinite(Date.parse(document.fetchedAt))) {
    throw new Error('관광지 원본의 종류 또는 시각을 확인할 수 없습니다.');
  }
  if (document.state !== 'AVAILABLE' && document.state !== 'PARTIAL') throw new Error('관광지 원본을 현재 사용할 수 없습니다.');
  // 접근성 자료는 KTO의 같은 서비스·콘텐츠 ID로만 연결한다. 명칭·좌표 근접 연결 금지.
  const facts = new Map();
  const detailValid = mode === 'bf' && detailDocument?.provider === 'KTO'
    && detailDocument?.service === 'barrierFree' && detailDocument?.operation === 'detailWithTour2'
    && detailDocument?.state === 'AVAILABLE' && Number.isFinite(Date.parse(detailDocument?.fetchedAt));
  if (detailValid) for (const row of detailDocument.items || []) {
    const values = Object.fromEntries(Object.keys(ACCESSIBILITY_LABELS)
      .filter(key => text(row.officialFacts?.[key])).map(key => [key, text(row.officialFacts[key])]));
    if (row.externalContentId && Object.keys(values).length) facts.set(String(row.externalContentId), values);
  }
  const items = [], seen = new Set();
  for (const row of document.items) {
    const fields = row.officialFields || {}, id = text(row.externalContentId), title = text(row.title);
    if (!id || !title || seen.has(id) || String(row.showFlag ?? fields.showflag ?? '1') === '0') continue;
    seen.add(id);
    const position = row.position;
    const location = finite(position?.lat, 90) && finite(position?.lon, 180)
      && (position.lat !== 0 || position.lon !== 0) ? [position.lat, position.lon] : null;
    items.push({
      id, title, address: text(row.address) || [text(fields.addr1 || fields.baseAddr), text(fields.addr2 || fields.dtlAddr)].filter(Boolean).join(' '),
      location, modifiedAtRaw: text(row.modifiedAtRaw || fields.modifiedtime || fields.mdfcnDt),
      phone: text(fields.tel), language: text(row.language || row.officialLanguageCode),
      theme: text(row.wellnessThemeCode), copyrightCode: text(row.copyrightDivisionCode || fields.cpyrhtDivCd),
      ...(facts.has(id) ? { accessibility: facts.get(id), accessibilityFetchedAt: detailDocument.fetchedAt } : {}),
    });
  }
  return {
    schemaVersion: 'earthus.travel-catalog.v1', mode, provider: 'KTO', sourceType: 'OFFICIAL_INFORMATION',
    sourceName: text(document.provenance?.sourceName) || '한국관광공사', sourceUrl: safeSourceUrl(document.provenance?.sourceUrl),
    sourceDataUrl: `https://earthus.net/tourism/kto/${config.service}/${config.operation}.json`,
    fetchedAt: document.fetchedAt, compiledAt, sourceState: document.state, sourceItemCount: document.items.length,
    detailState: mode === 'bf' ? (facts.size ? 'PARTIAL' : 'NOT_FETCHED') : 'LIST_FIELDS_ONLY',
    rights: { attribution: '한국관광공사 제공 관광정보', mediaIncluded: false, itemCopyrightCodePreserved: true }, items,
  };
}

export function validateTravelCatalog(document, mode) {
  if (document?.schemaVersion !== 'earthus.travel-catalog.v1' || document.mode !== mode || document.provider !== 'KTO'
      || document.sourceType !== 'OFFICIAL_INFORMATION' || !Number.isFinite(Date.parse(document.fetchedAt))
      || !Array.isArray(document.items) || !document.items.every(row => row && typeof row.id === 'string' && typeof row.title === 'string'
        && (row.location === null || (Array.isArray(row.location) && finite(row.location[0], 90) && finite(row.location[1], 180))))
      || new Set(document.items.map(row => row.id)).size !== document.items.length) {
    throw new Error('관광지 목록의 출처 또는 형식을 확인할 수 없습니다.');
  }
  return document;
}

export function searchTravelCatalog(document, query = '', page = 0, pageSize = 24) {
  const terms = String(query).normalize('NFKC').toLocaleLowerCase('ko-KR').trim().split(/\s+/).filter(Boolean);
  const matches = terms.length ? document.items.filter(row => {
    const hay = `${row.title} ${row.address}`.normalize('NFKC').toLocaleLowerCase('ko-KR');
    return terms.every(term => hay.includes(term));
  }) : document.items;
  const size = Math.min(100, Math.max(1, Math.floor(pageSize) || 24));
  const pages = Math.max(1, Math.ceil(matches.length / size));
  const currentPage = Math.min(pages - 1, Math.max(0, Math.floor(page) || 0));
  return { items: matches.slice(currentPage * size, (currentPage + 1) * size), total: matches.length, page: currentPage, pages, pageSize: size };
}
