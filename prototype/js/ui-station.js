// 지상 관측소 시트 — 5일치 자료 · 주변 사진 · 원문 METAR
//
// 왜 부이와 다르게 만드나
//   NDBC 부이는 관측소가 직접 5일치 그래프 PNG 와 카메라 사진을 준다.
//   공항 관측소는 그런 걸 주지 않는다. 그래서 우리가 만든다:
//     5일치 — 그 좌표의 과거 기록을 받아 우리가 그린다 (선 그래프)
//     사진   — 그 좌표 주변에서 찍힌 공개 사진을 찾아 보여준다
//
// ⚠️ 사진에 대해 정직할 것.
//    "그 좌표 반경 안에서 찍힌 사진"이지 "이 관측소를 찍은 사진"이 아니다.
//    실측: 인천공항 좌표로 찾으면 「Sunset At The Airport」 같은 것도 오지만
//    「The Bookstore」 처럼 관측소와 무관한 것도 온다.
//    그래서 제목을 "이 근처에서 찍힌 사진"으로 쓰고, 저작자·라이선스를 반드시 붙인다.
//
// ⚠️ 5일치는 실황이 아니라 **재분석·모델값**이다 (Open-Meteo).
//    관측소가 낸 원자료가 아니므로 출처를 따로 밝힌다. 두 줄을 한 그래프에 겹치면
//    사람들은 전부 그 관측소가 잰 값이라고 읽는다.

import { i18n } from './i18n.js';
import { fetchT } from './net.js';

const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* 5일치로 그릴 값들. 부이 시트와 같은 얼개다. */
const SERIES = [
  { key: 'temperature_2m',      ko: '기온',   en: 'Temperature', unit: '°C',   color: '#ff9f45' },
  { key: 'relative_humidity_2m', ko: '습도',  en: 'Humidity',    unit: '%',    color: '#5ad1e8' },
  { key: 'wind_speed_10m',      ko: '풍속',   en: 'Wind speed',  unit: 'km/h', color: '#9fd8a8' },
  { key: 'pressure_msl',        ko: '기압',   en: 'Pressure',    unit: 'hPa',  color: '#c9a8ff' },
  { key: 'visibility',          ko: '시정',   en: 'Visibility',  unit: 'm',    color: '#ffd166' },
];

/** 작은 선 그래프를 SVG 로. 캔버스보다 가볍고 확대해도 안 깨진다. */
function spark(vals, times, color, unit) {
  const ok = vals.map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (ok.length < 2) return null;
  const W = 300, H = 62, P = 4;
  const ys = ok.map(([, v]) => v);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 1e-6) { hi = lo + 1; }                 // 평평한 값도 그려야 한다
  const x = i => P + (i / (vals.length - 1)) * (W - 2 * P);
  const y = v => H - P - ((v - lo) / (hi - lo)) * (H - 2 * P);
  const d = ok.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');

  /* 하루 경계에 옅은 세로선 — "며칠치인지"가 눈에 보여야 한다 */
  const marks = [];
  times.forEach((t, i) => { if (t.endsWith('T00:00')) marks.push(x(i)); });

  const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="st-spark">
    ${marks.map(mx => `<line x1="${mx.toFixed(1)}" y1="0" x2="${mx.toFixed(1)}" y2="${H}"
      stroke="rgba(255,255,255,.13)" stroke-width="1"/>`).join('')}
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6"
      stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
  const last = ys[ys.length - 1];
  return { svg, lo, hi, last, unit };
}

export const stationSheet = {
  _cache: new Map(),          // icao → { hourly, photos }

  /** 시트 본문에 붙인다. @param s landobs 의 관측소 레코드 */
  async render(host, s) {
    const ko = i18n.lang === 'ko';
    const wrap = el('div', 'st-block');
    host.appendChild(wrap);

    // ── 원문 METAR ──
    // ⚠️ 우리 해석이 틀려도 원문에서 다시 읽을 수 있어야 한다. 항상 보여준다.
    if (s.raw) {
      const d = el('details', 'st-raw');
      d.appendChild(el('summary', null, ko ? '원문 METAR' : 'Raw METAR'));
      d.appendChild(el('code', null, esc(s.raw)));
      wrap.appendChild(d);
    }

    wrap.appendChild(el('div', 'st-loading', ko ? '5일치 자료를 불러오는 중…' : 'Loading 5 days…'));

    let data = this._cache.get(s.id);
    if (!data) {
      data = await this._fetch(s);
      this._cache.set(s.id, data);
    }
    wrap.querySelector('.st-loading')?.remove();

    // ── 5일치 ──
    if (data.hourly) {
      const h = data.hourly;
      wrap.appendChild(el('div', 'st-h', ko ? '지난 5일' : 'Past 5 days'));
      SERIES.forEach(sr => {
        const g = spark(h[sr.key] || [], h.time || [], sr.color, sr.unit);
        if (!g) return;
        const row = el('div', 'st-row');
        row.appendChild(el('div', 'st-lab',
          `<span>${esc(ko ? sr.ko : sr.en)}</span>`
          + `<b style="color:${sr.color}">${g.last?.toFixed?.(g.unit === '%' || g.unit === 'm' ? 0 : 1) ?? '—'} ${esc(g.unit)}</b>`));
        row.appendChild(el('div', 'st-chart', g.svg
          + `<div class="st-mm"><span>${g.hi.toFixed(0)}</span><span>${g.lo.toFixed(0)}</span></div>`));
        wrap.appendChild(row);
      });
      wrap.appendChild(el('p', 'st-note', ko
        ? '⚠️ 위 5일치 그래프는 이 관측소가 잰 값이 아니라, **이 좌표에 대한 기상 모델 재구성값**(Open-Meteo)입니다. 위쪽 실황은 관측소 계기 값입니다. 둘의 출처가 다릅니다.'
        : '⚠️ The five-day charts are **a weather-model reconstruction for this coordinate** (Open-Meteo), not readings from this station. The live values above come from the station instrument. Different sources.'));
    } else if (data.err) {
      wrap.appendChild(el('p', 'st-note', ko
        ? `5일치를 불러오지 못했습니다 (${esc(data.err)}). 없는 값을 지어내지 않습니다.`
        : `Could not load the five-day history (${esc(data.err)}). We do not fabricate missing values.`));
    }

    // ── 주변 사진 ──
    if (data.photos?.length) {
      wrap.appendChild(el('div', 'st-h', ko ? '이 근처에서 찍힌 사진' : 'Photos taken near here'));
      const grid = el('div', 'st-photos');
      data.photos.forEach(p => {
        const a = el('a', 'st-photo');
        a.href = p.page; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.innerHTML = `<img src="${esc(p.thumb)}" alt="" loading="lazy">`
          + `<span>${esc(p.license || '')}${p.author ? ' · ' + esc(p.author) : ''}</span>`;
        grid.appendChild(a);
      });
      wrap.appendChild(grid);
      /* ⚠️ 이 문장을 빼면 안 된다. 사진이 관측소를 찍은 것이라고 오해하게 된다. */
      wrap.appendChild(el('p', 'st-note', ko
        ? '⚠️ 관측소를 찍은 사진이 아니라 **이 좌표 반경 3km 안에서 찍힌 공개 사진**입니다 (Wikimedia Commons). 저작자와 라이선스는 각 사진에 표시했습니다.'
        : '⚠️ These are **public photos taken within 3 km of this coordinate** (Wikimedia Commons) — not photographs of the station itself. Author and licence are shown on each.'));
    }
  },

  async _fetch(s) {
    const out = {};
    const [hist, pics] = await Promise.allSettled([
      this._history(s.lat, s.lon),
      this._photos(s.lat, s.lon),
    ]);
    if (hist.status === 'fulfilled') out.hourly = hist.value;
    else out.err = String(hist.reason?.message || hist.reason).slice(0, 60);
    if (pics.status === 'fulfilled') out.photos = pics.value;
    return out;
  },

  async _history(lat, lon) {
    const u = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}`
      + `&hourly=${SERIES.map(s => s.key).join(',')}`
      + '&past_days=5&forecast_days=1&wind_speed_unit=kmh&timezone=auto';
    /* ⚠️ Open-Meteo 는 분당 한도가 있다. 사람이 여러 관측소를 연달아 누르면
       429 가 난다 (실측). 한 번은 조용히 기다렸다 다시 시도한다.
       그래도 안 되면 "못 받았다"고 말한다 — 지어내지 않는다. */
    for (let a = 0; a < 2; a++) {
      const r = await fetchT(u, { timeout: 12_000 });
      if (r.ok) return (await r.json()).hourly || null;
      if (r.status !== 429 || a === 1) throw new Error(`HTTP ${r.status}`);
      await new Promise(res => setTimeout(res, 1400));
    }
    return null;
  },

  /** Wikimedia Commons 지리 검색. CORS 가 열려 있어 브라우저가 직접 부를 수 있다. */
  async _photos(lat, lon) {
    const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*'
      + `&generator=geosearch&ggscoord=${lat.toFixed(4)}%7C${lon.toFixed(4)}`
      + '&ggsradius=3000&ggslimit=6&ggsnamespace=6'
      + '&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=420';
    /* Commons가 답을 안 하면 사진만 포기하고 5일치 그래프는 살린다.
       제한 시간이 없으면 Promise.allSettled 자체가 끝나지 않아 시트가 영원히 로딩이다. */
    const r = await fetchT(u, { timeout: 15_000 });
    if (!r.ok) return [];
    const j = await r.json();
    const pages = j.query?.pages || {};
    return Object.values(pages).map(p => {
      const ii = (p.imageinfo || [])[0] || {};
      const em = ii.extmetadata || {};
      /* ⚠️ Commons 의 Artist 는 HTML 이 들어 있다. 태그를 지우고 글자만 쓴다.
         그대로 innerHTML 에 넣으면 남의 마크업이 우리 화면에서 실행된다. */
      const author = String(em.Artist?.value || '').replace(/<[^>]*>/g, '').trim().slice(0, 40);
      return {
        thumb: ii.thumburl || ii.url,
        page: ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title || '')}`,
        license: em.LicenseShortName?.value || '',
        author,
      };
    /* 파일 설명 페이지의 최소 귀속 정보를 못 받으면 사진을 보이지 않는다.
       Commons 전체를 하나의 라이선스로 간주하면 안 된다. */
    }).filter(p => p.thumb && p.page && p.license && p.author).slice(0, 6);
  },
};
