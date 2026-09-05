// 위성 그림 — "어떻게 생겼나"를 보여준다
//
// 두 갈래로 간다.
//   ① 유명한 것 → 위키백과 실사진 (ISS, 허블, 톈궁…)
//   ② 나머지    → 개념도를 코드로 그린다
//
// ⚠️ ②를 사진처럼 보이게 하면 안 된다. 16,000개 위성의 실제 사진은 존재하지 않는다.
//    "개념도"라고 분명히 적고, TLE 와 SATCAT 에서 아는 것(크기·궤도·용도)만 반영한다.
//    모르는 걸 그럴듯하게 지어내면 그게 거짓말이 된다.
//
// ⚠️ 위키백과 이미지는 CC 라이선스다. 출처 표기와 링크가 의무다.
//
// ⚠️ i18n.js 를 import 하지 않는다 — 이 파일은 v1(prototype/)뿐 아니라
//    v3-kids(자체 kids-i18n.js)에서도 그대로 가져다 쓴다. 언어는 호출부가
//    lang 인자로 넘긴다. v1 호출부는 ui.js 에서 i18n.lang 을 넘긴다.

import { fetchT } from './net.js';

/* 실사진이 있는 위성 — 위성 이름 → 위키백과 문서 제목.
   여기 없는 건 개념도로 간다. 늘리려면 한 줄씩 추가하면 된다. */
const WIKI = {
  'ISS (ZARYA)':   { en: 'International_Space_Station', ko: '국제_우주_정거장' },
  'CSS (TIANHE)':  { en: 'Tiangong_space_station', ko: '톈궁_우주정거장' },
  'HST':           { en: 'Hubble_Space_Telescope', ko: '허블_우주_망원경' },
  'NOAA 20':       { en: 'NOAA-20' },
  'NOAA 21':       { en: 'NOAA-21' },
  'SUOMI NPP':     { en: 'Suomi_NPP' },
  'AQUA':          { en: 'Aqua_(satellite)' },
  'TERRA':         { en: 'Terra_(satellite)' },
  'LANDSAT 8':     { en: 'Landsat_8' },
  'LANDSAT 9':     { en: 'Landsat_9' },
  'SENTINEL-1A':   { en: 'Sentinel-1' },
  'SENTINEL-2A':   { en: 'Sentinel-2' },
  'SENTINEL-2B':   { en: 'Sentinel-2' },
  'JPSS-2':        { en: 'NOAA-21' },
  'CALIPSO':       { en: 'CALIPSO' },
  'CLOUDSAT':      { en: 'CloudSat' },
  'GOES 16':       { en: 'GOES-16' },
  'GOES 18':       { en: 'GOES-18' },
  'GOES 19':       { en: 'GOES-19' },
  'CSS (WENTIAN)': { en: 'Wentian_(module)' },
  'CSS (MENGTIAN)':{ en: 'Mengtian_(module)' },
};

/* 이름 앞부분으로 계열을 알아채는 규칙 (개별 등록이 비현실적인 것들) */
const FAMILY = [
  /* ⚠️ 한국 위성 — 문서 제목을 추정해 넣는다. 틀려도 위험하지 않다:
     satPhoto()가 문서가 없거나 자유 라이선스 이미지가 없으면 그냥 null을 돌려주고
     drawSchematic()으로 넘어간다 (아래 catch에서 이미 그렇게 짜여 있다). */
  /* ⚠️ CelesTrak/SATCAT 실명은 "ARIRANG-3 (KOMPSAT-3)"처럼 KOMPSAT 부분이
     앞이 아니라 괄호 안에 온다(실측 확인). 그래서 앞쪽(^) 고정을 안 쓴다.
     순서가 중요하다 — "KOMPSAT-3"이 "KOMPSAT-3A"의 부분열이라 3A를 먼저 둔다. */
  [/GK-2A|GEO-KOMPSAT-2A|CHOLLIAN-2A/i, { en: 'Chollian-2A', ko: '천리안_2A호' }],
  [/GK-2B|GEO-KOMPSAT-2B|CHOLLIAN-2B/i, { en: 'Chollian-2B' }],
  [/KOMPSAT-3A/i, { en: 'KOMPSAT-3A' }],
  [/KOMPSAT-2/i,  { en: 'KOMPSAT-2' }],
  [/KOMPSAT-3/i,  { en: 'KOMPSAT-3' }],
  [/KOMPSAT-5/i,  { en: 'KOMPSAT-5' }],
  [/KOMPSAT-7/i,  { en: 'KOMPSAT-7' }],
  [/^ANASIS/i,     { en: 'ANASIS-II' }],
  [/^STARLINK/i,   { en: 'Starlink' }],
  [/^ONEWEB/i,     { en: 'OneWeb_satellite_constellation' }],
  [/^IRIDIUM/i,    { en: 'Iridium_satellite_constellation' }],
  [/^GPS|NAVSTAR/i,{ en: 'Global_Positioning_System' }],
  [/^GALILEO/i,    { en: 'Galileo_(satellite_navigation)' }],
  [/^BEIDOU/i,     { en: 'BeiDou' }],
  [/^GLONASS/i,    { en: 'GLONASS' }],
  [/^SOYUZ/i,      { en: 'Soyuz_(spacecraft)' }],
  [/^PROGRESS/i,   { en: 'Progress_(spacecraft)' }],
  [/^CREW DRAGON|^DRAGON/i, { en: 'SpaceX_Dragon_2' }],
  [/^CYGNUS/i,     { en: 'Cygnus_(spacecraft)' }],
  [/^SHENZHOU|^SZ-/i, { en: 'Shenzhou_(spacecraft)' }],
  [/^TIANZHOU/i,   { en: 'Tianzhou_(spacecraft)' }],
];

const cache = new Map();

/* Commons 의 Artist/Credit 값은 링크가 든 HTML 이다. 화면에는 평문만 보여 준다.
   ⚠️ API 문자열을 그대로 innerHTML 에 넣으면 출처 표시가 XSS 통로가 된다. */
function plainMeta(html, max = 120) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const text = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function firstPage(json) {
  return Object.values(json?.query?.pages || {})[0] || null;
}

/** 실사진 찾기. 없으면 null.
 * @param {string} name  CelesTrak OBJECT_NAME
 * @param {'ko'|'en'} [lang] 문서 제목 선택 언어. 기본 'ko' (이 앱은 한국이 기본이다). */
export async function satPhoto(name, lang = 'ko') {
  if (!name) return null;
  const cacheKey = `${name}:${lang}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  let entry = WIKI[name];
  if (!entry) {
    const hit = FAMILY.find(([re]) => re.test(name));
    if (hit) entry = hit[1];
  }
  if (!entry) { cache.set(cacheKey, null); return null; }

  const useLang = (lang === 'ko' && entry.ko) ? 'ko' : 'en';
  const title = entry[useLang] || entry.en;
  try {
    const api = `https://${useLang}.wikipedia.org/w/api.php`;
    const pageParams = new URLSearchParams({
      action: 'query', format: 'json', origin: '*', redirects: '1',
      prop: 'pageimages', piprop: 'name|thumbnail', pithumbsize: '480',
      /* 비자유 이용(fair use) 이미지는 상업 서비스에서 쓰지 않는다. */
      pilicense: 'free', titles: title,
    });
    const pageRes = await fetchT(`${api}?${pageParams}`, { timeout: 12_000 });
    if (!pageRes.ok) throw new Error(String(pageRes.status));
    const article = firstPage(await pageRes.json());
    if (!article?.pageimage) throw new Error('no free page image');

    /* "Wikipedia"라는 뭉뚱그린 표기는 라이선스 의무를 충족하지 못한다.
       파일 원문의 저작자·라이선스·설명 페이지를 별도로 조회한다. */
    const fileParams = new URLSearchParams({
      action: 'query', format: 'json', origin: '*', redirects: '1',
      prop: 'imageinfo', titles: `File:${article.pageimage}`,
      iiprop: 'url|extmetadata', iiurlwidth: '480',
      iiextmetadatafilter: 'Artist|Credit|LicenseShortName|LicenseUrl',
    });
    const fileRes = await fetchT(`${api}?${fileParams}`, { timeout: 12_000 });
    if (!fileRes.ok) throw new Error(String(fileRes.status));
    const info = firstPage(await fileRes.json())?.imageinfo?.[0];
    const meta = info?.extmetadata || {};
    const author = plainMeta(meta.Artist?.value || meta.Credit?.value);
    const license = plainMeta(meta.LicenseShortName?.value, 60);

    /* 파일별 라이선스를 확인하지 못하면 실사진을 쓰지 않고 개념도로 돌아간다. */
    const src = info?.thumburl || article.thumbnail?.source;
    if (!src || !info?.descriptionurl || !license) throw new Error('missing attribution');
    const out = {
      url: src,
      page: info.descriptionurl,
      title: article.title || title.replaceAll('_', ' '),
      credit: [author, license].filter(Boolean).join(' · '),
    };
    cache.set(cacheKey, out);
    return out;
  } catch (_) {
    cache.set(cacheKey, null);
    return null;
  }
}

/* ── 개념도 ────────────────────────────────────────────────────
   아는 것만 반영한다:
     RCS(레이더 반사면적) → 본체 크기
     궤도 종류            → 태양전지판 형태 (정지궤도는 크고 넓다)
     그룹                 → 색
   모르는 건 그리지 않는다. 안테나 개수 같은 건 지어내지 않는다. */
export function drawSchematic(cv, sat, color, lang = 'ko') {
  const W = 420, H = 240;
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const c = color || '#7ec8e3';

  g.clearRect(0, 0, W, H);

  // 크기 — RCS 가 있으면 반영, 없으면 중간
  const rcs = Number(sat?.rcs) || 5;
  const scale = Math.max(0.55, Math.min(1.5, Math.cbrt(rcs / 8)));
  const bw = 54 * scale, bh = 40 * scale;
  const cx = W / 2, cy = H / 2;

  // 태양전지판 — 고궤도일수록 길다 (전력을 더 써서 실제로 그렇다)
  const alt = sat?._alt ?? 700;
  const wing = alt > 20000 ? 130 : alt > 2000 ? 105 : 88;

  g.strokeStyle = c; g.lineWidth = 2; g.lineJoin = 'round';
  g.fillStyle = 'rgba(255,255,255,.06)';

  // 지지대
  g.beginPath();
  g.moveTo(cx - bw / 2 - wing, cy); g.lineTo(cx + bw / 2 + wing, cy);
  g.stroke();

  // 좌우 태양전지판 (격자무늬)
  [-1, 1].forEach(side => {
    const x0 = cx + side * (bw / 2 + 8), x1 = cx + side * (bw / 2 + wing);
    const yTop = cy - 26, yBot = cy + 26;
    const L = Math.min(x0, x1), R = Math.max(x0, x1);
    g.fillStyle = 'rgba(90,150,220,.20)';
    g.fillRect(L, yTop, R - L, yBot - yTop);
    g.strokeRect(L, yTop, R - L, yBot - yTop);
    g.strokeStyle = c.replace(')', ',.35)').replace('rgb', 'rgba');
    g.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const x = L + (R - L) * i / 5;
      g.beginPath(); g.moveTo(x, yTop); g.lineTo(x, yBot); g.stroke();
    }
    g.beginPath(); g.moveTo(L, cy); g.lineTo(R, cy); g.stroke();
    g.strokeStyle = c; g.lineWidth = 2;
  });

  // 본체
  g.fillStyle = 'rgba(255,255,255,.10)';
  g.beginPath();
  g.roundRect ? g.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 5)
              : g.rect(cx - bw / 2, cy - bh / 2, bw, bh);
  g.fill(); g.stroke();

  // 지구를 향한 안테나/센서 — 지구관측·통신 위성의 공통 특징
  g.beginPath();
  g.moveTo(cx, cy + bh / 2); g.lineTo(cx, cy + bh / 2 + 16);
  g.stroke();
  g.beginPath();
  g.ellipse(cx, cy + bh / 2 + 22, 13 * scale, 7 * scale, 0, 0, Math.PI * 2);
  g.stroke();

  // 크기 눈금
  const ko = lang === 'ko';
  g.fillStyle = 'rgba(255,255,255,.45)';
  g.font = '11px ui-monospace, monospace';
  g.textAlign = 'center';
  g.fillText(sat?.rcs ? `RCS ${Number(sat.rcs).toFixed(1)} m²` : (ko ? '크기 미상' : 'size unknown'),
             cx, H - 12);
  return cv;
}
