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

import { i18n } from './i18n.js';

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

/** 실사진 찾기. 없으면 null. */
export async function satPhoto(name) {
  if (!name) return null;
  if (cache.has(name)) return cache.get(name);

  let entry = WIKI[name];
  if (!entry) {
    const hit = FAMILY.find(([re]) => re.test(name));
    if (hit) entry = hit[1];
  }
  if (!entry) { cache.set(name, null); return null; }

  const lang = (i18n.lang === 'ko' && entry.ko) ? 'ko' : 'en';
  const title = entry[lang] || entry.en;
  try {
    const r = await fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    const src = j.thumbnail?.source;
    const out = src ? {
      url: src.replace(/\/\d+px-/, '/480px-'),   // 조금 큰 판으로
      page: j.content_urls?.desktop?.page,
      title: j.title,
      credit: lang === 'ko' ? '위키백과' : 'Wikipedia',
    } : null;
    cache.set(name, out);
    return out;
  } catch (_) {
    cache.set(name, null);
    return null;
  }
}

/* ── 개념도 ────────────────────────────────────────────────────
   아는 것만 반영한다:
     RCS(레이더 반사면적) → 본체 크기
     궤도 종류            → 태양전지판 형태 (정지궤도는 크고 넓다)
     그룹                 → 색
   모르는 건 그리지 않는다. 안테나 개수 같은 건 지어내지 않는다. */
export function drawSchematic(cv, sat, color) {
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
  const ko = i18n.lang === 'ko';
  g.fillStyle = 'rgba(255,255,255,.45)';
  g.font = '11px ui-monospace, monospace';
  g.textAlign = 'center';
  g.fillText(sat?.rcs ? `RCS ${Number(sat.rcs).toFixed(1)} m²` : (ko ? '크기 미상' : 'size unknown'),
             cx, H - 12);
  return cv;
}
