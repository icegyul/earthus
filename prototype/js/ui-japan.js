// 일본 탭 — 일본 기상청(JMA)이 실제로 재고 있는 것
//
// 받은 요청
//   "일본도 한국처럼 api로 데이터 받는 곳 있을까?" → "일본 전용 메뉴가 생성될 수 있겠지?"
//   "일본어는 한국인 유저 디바이스 언어가 한국어면 한글로, 영어면 영어로,
//    일본어면 당연히 일본어"
//
// ⚠️⚠️ **한국 탭을 그대로 베끼지 않는다.** 두 나라가 공개하는 것이 다르다.
//    한국 탭의 '산' 화면은 값어치가 **기상청 산악예보 − AWS 실측의 차이**인데,
//    일본에는 그 짝이 없다. 없는 것을 억지로 채우면 빈 표만 남는다.
//    → 일본은 **일본이 실제로 가진 것**으로 만든다.
//
// ⚠️⚠️ **기상특보(경보·주의보)를 넣지 않았다.**
//    JMA 방재 사이트의 특보 경로가 **2026-05-28 이후 갱신이 멈춰 있다.**
//    전체(map.json)도, 지역별(도쿄 130000 · 오키나와 471000)도 전부 같은 날짜다.
//    지진·낙뢰 경로는 오늘 자료가 살아 있는데 특보만 그렇다.
//    → 살아 있는지 확인 못 한 자료로 "지금 경보 없음"이라고 말하면
//      **없는 안전을 알리는 것**이 된다. 넣지 않고, 화면에 그 사실을 적는다.
//    ⚠️ 나중에 되살아나면 그때 넣는다. 되살아났는지는 사람이 확인해야 한다.
//
// ⚠️ 이 경로들은 JMA 가 방재 사이트용으로 공개한 JSON 이고 **정식 API 가 아니다.**
//    널리 쓰이지만 구조가 바뀌어도 공지가 없을 수 있다. health 감시에 넣어 두었다.

import { i18n } from './i18n.js';
import { myLocation } from './mylocation.js';
import { nearest, distKm } from './korea.js';
import { jpName } from './jpname.js';
import { API } from './config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n1 = (v) => (v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1));

const TABS = [
  { id: 'now',   ko: '지금',  en: 'Now',    ja: '現在' },
  { id: 'quake', ko: '지진',  en: 'Quakes', ja: '地震' },
  { id: 'sky',   ko: '하늘',  en: 'Sky',    ja: '空' },
  { id: 'coast', ko: '바다',  en: 'Coast',  ja: '海' },
  { id: 'peak',  ko: '산',    en: 'Peaks',  ja: '山' },
];

/* 일본 안인가 — ⚠️ 대략적인 사각형이다. 정확한 국경이 아니다.
   여기서 필요한 건 "일본 자료를 보여줄 만한 위치인가"뿐이라 이 정도면 된다.
   ⚠️ 남쪽 오키나와(24°N)와 북쪽 홋카이도(45.6°N)를 다 담아야 한다. */
export const inJapan = (lat, lon) =>
  lat != null && lon != null && lat >= 24 && lat <= 46 && lon >= 122 && lon <= 154;

const SRC = {
  amedas: `${API.WIND}/jp-amedas.json`,
  quake:  `${API.EVENTS}/quake-asia.json`,
  light:  `${API.EVENTS}/lightning.json`,
};
const LOCAL = { beach: 'data/jp/beaches.json', peak: 'data/jp/peaks.json' };

const _cache = {};
async function load(url) {
  const c = _cache[url];
  if (c && Date.now() - c.at < 5 * 60_000) return c.data;
  const r = await fetch(url, { cache: 'no-cache' });
  // ⚠️ S3 는 없는 객체에 403 을 준다(404 아님).
  if (!r.ok) throw new Error(`${url.split('/').pop()} ${r.status}`);
  const data = await r.json();
  _cache[url] = { data, at: Date.now() };
  return data;
}

/** 기기 언어에 맞는 지명 + 그 이름이 **어디서 왔는지**.
 *  ⚠️ 규칙으로 옮긴 표기(tr)를 공식 한국어 표기인 척하지 않는다. */
function nameOf(o) {
  const { text, mark } = jpName(o, i18n.lang);
  return { text, mark, tr: mark === 'tr' };
}

/** 몇 분 전인가. ⚠️ JST 문자열을 new Date() 로 바로 읽지 않는다 (사파리에서 NaN). */
function ageMin(s) {
  const m = String(s || '').match(/^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  const [y, mo, d, H, M] = m.slice(1).map(Number);
  return (Date.now() - (Date.UTC(y, mo - 1, d, H, M) - 9 * 3600_000)) / 60_000;
}

export const japanPanel = {
  tab: 'now',

  init() {
    i18n.onChange(() => { this.renderTabs(); this.render(); });
    return this;
  },

  _bind() {
    this.tabsEl = this.tabsEl || document.getElementById('jpTabs');
    this.body = this.body || document.getElementById('jpBody');
    return !!(this.tabsEl && this.body);
  },

  open() {
    if (!this._bind()) { console.warn('[일본탭] 화면 요소를 못 찾았다'); return; }
    this.renderTabs();
    document.getElementById('jpSheet')?.classList.add('up');
    this.render();
  },
  close() { document.getElementById('jpSheet')?.classList.remove('up'); },

  renderTabs() {
    if (!this.tabsEl) return;
    const L = i18n.lang;
    this.tabsEl.innerHTML = TABS.map((t) =>
      `<button class="kr-tab${t.id === this.tab ? ' on' : ''}" data-jtab="${t.id}" role="tab">`
      + `${esc(L === 'ja' ? t.ja : L === 'ko' ? t.ko : t.en)}</button>`).join('');
    this.tabsEl.querySelectorAll('[data-jtab]').forEach((b) => {
      b.onclick = () => { this.tab = b.dataset.jtab; this.renderTabs(); this.render(); };
    });
  },

  async render() {
    if (!this.body) return;
    const ko = i18n.lang === 'ko';
    this.body.innerHTML = `<p class="kr-note">${ko ? '불러오는 중…' : 'Loading…'}</p>`;
    try {
      this.body.innerHTML = await this[`_${this.tab}`]();
    } catch (e) {
      /* ⚠️ 무엇이 실패했는지 적는다. "불러오지 못했습니다"만 뜨면
         자료가 없는 건지 우리가 고장난 건지 알 수 없다. */
      this.body.innerHTML = `<p class="kr-note">${ko ? '자료를 불러오지 못했습니다' : 'Could not load'} — ${esc(e.message)}</p>`;
    }
  },

  /** 출처 한 줄 — ⚠️ **정식 API 가 아니라는 것까지** 적는다. */
  _src(extra) {
    const ko = i18n.lang === 'ko';
    return `<p class="kr-note">${ko ? '일본 기상청 (JMA)' : 'Japan Meteorological Agency'}`
      + (extra ? ` · ${esc(extra)}` : '')
      + `<br>${ko
        ? '⚠️ 이 경로는 JMA 방재 사이트가 쓰는 공개 JSON 이고 <b>정식 API 로 규격을 보장한 것은 아닙니다.</b> 구조가 바뀌면 공지 없이 끊길 수 있습니다.'
        : '⚠️ These are the public JSON feeds behind JMA’s disaster-prevention site, not a guaranteed API.'}</p>`;
  },

  /* ── 지금 — AMeDAS 실측 ────────────────────────────────── */
  async _now() {
    const ko = i18n.lang === 'ko';
    const d = await load(SRC.amedas);
    const c = myLocation.coords;
    let h = '';

    const st = (d.stations || []).filter((x) => x.lat != null);
    /* ⚠️⚠️ **가장 가까운 관측소가 기온을 안 잴 수 있다.**
       AMeDAS 1,280곳 중 기온을 재는 곳은 907곳뿐이다(비만 재는 곳이 많다).
       그냥 가장 가까운 곳을 쓰면 큰 숫자가 **—°C** 로 비고,
       "왜 기온이 없지"만 남는다. → 큰 숫자는 **기온을 재는 가장 가까운 곳**으로 하고,
       그게 더 멀면 얼마나 먼지 밝힌다. 비·바람은 더 가까운 곳이 있으면 그쪽을 쓴다. */
    const me = (c && inJapan(c.lat, c.lon)) ? c : null;
    const any = me ? nearest(st, me.lat, me.lon, 60) : null;
    const near = me
      ? (nearest(st.filter((x) => x.temp != null), me.lat, me.lon, 60) || any)
      : null;

    if (near) {
      const nm = nameOf(near);
      h += `<div class="kr-big"><b>${n1(near.temp)}<i>°C</i></b>`
        + `<span>${esc(nm.text)}${near.km >= 1 ? ` · ${Math.round(near.km)}km` : ''}</span>`
        + `<em>${[
            near.wind != null ? `${ko ? '바람' : 'Wind'} ${n1(near.wind)}m/s` : null,
            near.hum != null ? `${ko ? '습도' : 'RH'} ${n1(near.hum)}%` : null,
            near.rain1h != null ? `${ko ? '1시간 비' : 'Rain 1h'} ${n1(near.rain1h)}mm` : null,
          ].filter(Boolean).join(' · ')}</em></div>`;
      /* ⚠️ 기온 관측소가 멀리 있고 더 가까운 관측소가 따로 있으면 **그 사실을 적는다.**
         6km 옆 관측소를 두고 40km 밖 값을 말하면서 조용히 있으면 안 된다. */
      if (any && any !== near && any.km + 3 < near.km) {
        const an = nameOf(any);
        h += `<p class="kr-note">⚠️ ${ko
          ? `더 가까운 관측소(${esc(an.text)} · ${Math.round(any.km)}km)가 있지만 <b>기온을 재지 않아</b> `
            + `${Math.round(near.km)}km 떨어진 곳의 값을 보여드립니다.`
          : `A closer station (${esc(an.text)}, ${Math.round(any.km)} km) does not measure temperature, `
            + `so this is from ${Math.round(near.km)} km away.`}</p>`;
      }
      if (nm.tr) h += this._trNote();
      /* ⚠️ **없는 항목을 0 으로 읽지 않게** 그 지점이 무엇을 안 재는지 적는다. */
      const missing = [
        near.temp == null ? (ko ? '기온' : 'temperature') : null,
        near.wind == null ? (ko ? '바람' : 'wind') : null,
        near.pres == null ? (ko ? '기압' : 'pressure') : null,
      ].filter(Boolean);
      if (missing.length) {
        h += `<p class="kr-note">⚠️ ${ko
          ? `이 관측소는 ${missing.join('·')}을(를) 재지 않습니다 — 값이 0 인 것이 아니라 없는 것입니다.`
          : `This station does not measure ${missing.join(', ')} — absent, not zero.`}</p>`;
      }
    } else {
      h += `<p class="kr-note">${ko
        ? (c ? '지금 위치가 일본에서 60km 밖이라 가까운 관측소를 고르지 않았습니다. 아래는 전국에서 지금 두드러진 곳입니다.'
             : '위치를 몰라 전국에서 지금 두드러진 곳을 보여드립니다.')
        : 'Showing the national extremes.'}</p>`;
    }

    /* 전국에서 지금 두드러진 곳 — ⚠️ **평균을 내지 않는다.**
       일본은 남북으로 2,000km 가 넘어 전국 평균 기온은 아무 데도 설명하지 못한다. */
    const withT = st.filter((x) => x.temp != null);
    if (withT.length) {
      const hot = withT.reduce((a, b) => (b.temp > a.temp ? b : a));
      const cold = withT.reduce((a, b) => (b.temp < a.temp ? b : a));
      const rain = st.filter((x) => x.rain1h != null)
        .reduce((a, b) => (a && a.rain1h >= b.rain1h ? a : b), null);
      const gust = st.filter((x) => x.wind != null)
        .reduce((a, b) => (a && a.wind >= b.wind ? a : b), null);
      const row = (label, o, val) => o
        ? `<div class="kr-row"><span>${esc(label)}</span><b>${val} <i style="font-style:normal;opacity:.55">${esc(nameOf(o).text)}</i></b></div>`
        : '';
      h += `<h4>${ko ? '지금 전국에서' : 'Right now, nationwide'}</h4>`
        + row(ko ? '가장 더운 곳' : 'Hottest', hot, `${n1(hot.temp)}°C`)
        + row(ko ? '가장 서늘한 곳' : 'Coolest', cold, `${n1(cold.temp)}°C`)
        + (rain && rain.rain1h > 0 ? row(ko ? '비가 가장 센 곳' : 'Heaviest rain', rain, `${n1(rain.rain1h)}mm/h`) : '')
        + (gust ? row(ko ? '바람이 가장 센 곳' : 'Strongest wind', gust, `${n1(gust.wind)}m/s`) : '');
    }

    const age = ageMin(d.timeJst);
    h += `<p class="kr-note">${ko
      ? `전국 ${d.count}지점이 10분마다 잰 값입니다 (${esc(d.timeJst || '')} JST`
        + `${age != null ? ` · ${Math.round(age)}분 전` : ''}).<br>`
        + `⚠️ 지점마다 재는 항목이 다릅니다 — 기온 ${d.have?.temp}곳 · 바람 ${d.have?.wind}곳 · `
        + `기압 ${d.have?.pres}곳입니다. 없는 항목은 그 지점이 안 재는 것입니다.<br>`
        + `⚠️ 전국 평균을 내지 않습니다 — 일본은 남북 2,000km 가 넘어 평균이 아무 곳도 설명하지 못합니다.`
      : `${d.count} stations, every 10 minutes (${esc(d.timeJst || '')} JST). Not all stations measure all elements.`}</p>`;
    return h + this._src(ko ? 'AMeDAS 자동관측망' : 'AMeDAS');
  },

  /* ── 지진 ──────────────────────────────────────────────── */
  async _quake() {
    const ko = i18n.lang === 'ko';
    const d = await load(SRC.quake);
    const c = myLocation.coords;
    const q = (d.quakes || []).filter((x) => x.src === 'JMA' && x.lat != null);
    if (!q.length) {
      return `<p class="kr-note">${ko ? '최근 들어온 지진이 없습니다.' : 'No recent quakes.'}</p>`
        + this._src();
    }

    let h = '';
    /* 내 자리에서 가장 가까운 것 — ⚠️ "가장 큰 것"이 아니라 "가장 가까운 것"이다.
       멀리서 난 M6 보다 가까이서 난 M4 가 내게는 더 크게 흔들린다. */
    if (c && inJapan(c.lat, c.lon)) {
      const near = nearest(q, c.lat, c.lon, 600);
      if (near) {
        const nm = nameOf({ ja: near.place, en: near.placeEn });
        h += `<div class="kr-big"><b>M${n1(near.mag)}</b>`
          + `<span>${esc(nm.text)} · ${Math.round(near.km)}km</span>`
          + `<em>${esc(String(near.at || '').slice(0, 16).replace('T', ' '))} JST`
          + `${near.depthKm != null ? ` · ${ko ? '깊이' : 'depth'} ${n1(near.depthKm)}km` : ''}</em></div>`;
        if (nm.tr) h += this._trNote();
      }
    }

    h += `<h4>${ko ? '최근 지진' : 'Recent quakes'}</h4>`;
    h += q.slice(0, 20).map((x) => {
      const nm = nameOf({ ja: x.place, en: x.placeEn });
      const away = (c && inJapan(c.lat, c.lon))
        ? ` <i style="font-style:normal;opacity:.5">${Math.round(distKm(c.lat, c.lon, x.lat, x.lon))}km</i>` : '';
      return `<div class="kr-row"><span>${esc(nm.text)}${away}</span>`
        + `<b>M${n1(x.mag)}`
        /* ⚠️ 규모와 진도는 **다른 것**이다. 진도는 작게, 다른 색으로 붙인다. */
        + (x.intensity ? ` <i style="font-style:normal;opacity:.55">${ko ? '진도' : 'int.'} ${esc(x.intensity)}</i>` : '')
        + `</b></div>`;
    }).join('');

    h += `<p class="kr-note">${ko
      ? '⚠️ <b>규모</b>는 지진 자체의 크기이고 <b>진도</b>는 그 자리에서 얼마나 흔들렸나입니다 — 다른 값입니다.<br>'
        + '⚠️ 속보로 들어온 것은 나중에 값이 바뀔 수 있습니다.'
      : '⚠️ Magnitude is the quake’s size; intensity is how strongly a place shook — different numbers.'}</p>`;
    return h + this._src(ko ? '진원·진도 정보' : 'Hypocentre / intensity');
  },

  /* ── 하늘 (낙뢰) ───────────────────────────────────────── */
  async _sky() {
    const ko = i18n.lang === 'ko';
    const d = await load(SRC.light);
    const c = myLocation.coords;
    const jp = (d.strikes || []).filter((x) => x.src === 'JMA');
    let h = '';

    if (c && inJapan(c.lat, c.lon) && jp.length) {
      const near = nearest(jp.map((x) => ({ ...x })), c.lat, c.lon, 500);
      if (near) {
        h += `<div class="kr-big"><b>${Math.round(near.km)}<i>km</i></b>`
          + `<span>${ko ? '가장 가까운 낙뢰' : 'Nearest strike'}</span>`
          + `<em>${esc(String(near.at || '').slice(11, 19))} JST</em></div>`;
      }
    }
    h += `<div class="kr-row"><span>${ko ? '최근 30분 · 일본' : 'Last 30 min · Japan'}</span><b>${jp.length}${ko ? '회' : ''}</b></div>`;
    h += `<div class="kr-row"><span>${ko ? '같은 시각 · 한국' : 'Same window · Korea'}</span><b>${d.korea ?? 0}${ko ? '회' : ''}</b></div>`;

    h += `<p class="kr-note">${ko
      ? '⚠️⚠️ <b>일본 기상청은 낙뢰의 종류를 공개하지 않습니다.</b> 땅에 떨어진 것(낙뢰)과 '
        + '구름 사이에서만 친 것(번개)을 구분해 주지 않습니다 — 기상청(한국)은 구분해 줍니다. '
        + '짐작해서 나누면 그 순간 거짓이 되므로 여기서는 나누지 않습니다.<br>'
        + '⚠️ 세기(kA)도 공개되지 않습니다.'
      : '⚠️ JMA does not publish strike type (cloud-to-ground vs cloud-to-cloud) or peak current, '
        + 'so neither is shown. KMA does publish both for Korea.'}</p>`;
    return h + this._src(ko ? '낙뢰 관측 (liden)' : 'Lightning (liden)');
  },

  /* ── 바다 (해변) ───────────────────────────────────────── */
  async _coast() {
    const ko = i18n.lang === 'ko';
    const d = await load(LOCAL.beach);
    const list = Array.isArray(d) ? d : (d.beaches || d.items || []);
    const c = myLocation.coords;
    let h = '';

    const pts = list.filter((x) => (x.la ?? x.lat) != null)
      .map((x) => ({ ...x, lat: x.la ?? x.lat, lon: x.lo ?? x.lon }));
    const near = (c && inJapan(c.lat, c.lon)) ? nearest(pts, c.lat, c.lon, 200) : null;
    if (near) {
      const nm = nameOf(near);
      h += `<div class="kr-big"><b>${Math.round(near.km)}<i>km</i></b>`
        + `<span>${ko ? '가장 가까운 해변' : 'Nearest beach'} · ${esc(nm.text)}</span></div>`;
      if (nm.tr) h += this._trNote();
    }

    const show = (near ? pts.filter((x) => x !== near) : pts)
      .map((x) => c && inJapan(c.lat, c.lon)
        ? { ...x, km: distKm(c.lat, c.lon, x.lat, x.lon) } : x);
    if (show[0]?.km != null) show.sort((a, b) => a.km - b.km);
    h += `<h4>${ko ? '해변' : 'Beaches'}</h4>`
      + show.slice(0, 20).map((x) => {
        const nm = nameOf(x);
        return `<div class="kr-row"><span>${esc(nm.text)}</span>`
          + `<b>${x.km != null ? `${Math.round(x.km)}km` : ''}</b></div>`;
      }).join('');

    h += `<p class="kr-note">${ko
      ? `일본 해변 ${pts.length}곳입니다 (OpenStreetMap 에서 저희가 정리했습니다).<br>`
        + '⚠️⚠️ <b>이안류 지수는 일본에 없습니다.</b> 한국은 국립해양조사원이 해수욕장 10곳의 '
        + '이안류를 재서 공개하는데, 일본은 그런 공개 자료를 찾지 못했습니다 — '
        + '없는 것이 아니라 <b>저희가 못 찾은 것</b>입니다.<br>'
        + '⚠️ 파도·바람은 서핑 화면에서 전 세계 모델값으로 봅니다.'
      : `${pts.length} beaches from OpenStreetMap. ⚠️ No rip-current index is available for Japan — `
        + 'Korea publishes one for ten beaches; we could not find a Japanese equivalent.'}</p>`;
    return h;
  },

  /* ── 산 ────────────────────────────────────────────────── */
  async _peak() {
    const ko = i18n.lang === 'ko';
    const d = await load(LOCAL.peak);
    const list = d.peaks || [];
    const c = myLocation.coords;
    const pts = list.map((x) => ({ ...x, lat: x.la, lon: x.lo }));

    let h = '';
    if (c && inJapan(c.lat, c.lon)) {
      const near = nearest(pts.filter((x) => x.alt >= 1000), c.lat, c.lon, 150);
      if (near) {
        const nm = nameOf(near);
        h += `<div class="kr-big"><b>${near.alt}<i>m</i></b>`
          + `<span>${ko ? '가까운 높은 산' : 'Nearest high peak'} · ${esc(nm.text)} · ${Math.round(near.km)}km</span></div>`;
        if (nm.tr) h += this._trNote();
      }
    }

    /* ⚠️⚠️ **묶지 않으면 "가장 높은 산 15곳"이 사실상 후지산 하나가 된다.**
       실측: 상위 9개가 전부 후지산 분화구 테두리였다 —
       켄가미네 3776 · 시라야마다케 3756 · 이즈가타케 3749 · 조주가타케 3734 …
       전부 반경 700m 안이다. 그대로 두면 일본에 3,700m 급 산이 아홉 개 있는 것처럼 읽힌다.
       ⚠️ 2km 로 묶는다. 3km 로 하면 기타다케(3193)와 아이노다케(3190)가 —
          3.1km 떨어진 **서로 다른 유명한 산** — 하나로 합쳐진다.
       ⚠️ 이건 **저희가 묶은 것**이지 공식 목록이 아니다. 화면에 그렇게 적는다. */
    const CLUSTER_KM = 2;
    const top = [];
    for (const x of pts.slice().sort((a, b) => b.alt - a.alt)) {
      if (top.length >= 15) break;
      if (top.some((y) => distKm(x.lat, x.lon, y.lat, y.lon) <= CLUSTER_KM)) continue;
      top.push(x);
    }
    h += `<h4>${ko ? '가장 높은 산' : 'Highest peaks'}</h4>`
      + top.map((x) => `<div class="kr-row"><span>${esc(nameOf(x).text)}</span><b>${x.alt}m</b></div>`).join('');
    h += `<p class="kr-note">⚠️ ${ko
      ? '<b>2km 안의 봉우리는 하나로 묶었습니다.</b> 안 묶으면 상위 아홉 곳이 전부 후지산 분화구 테두리라 3,700m 급 산이 아홉 개인 것처럼 보입니다. 이 묶음은 <b>저희가 만든 것</b>이지 공식 목록이 아닙니다.'
      : 'Peaks within 2 km are merged — otherwise the top nine are all points on Fuji’s crater rim. This grouping is ours, not an official list.'}</p>`;

    /* ⚠️⚠️ **한국 산 화면과 같은 것을 만들지 않는다.** 그 화면의 값어치는
       "기상청 산악예보와 실제 관측이 얼마나 벌어지나"인데, 일본에는 그 짝이 없다.
       비슷하게 생긴 빈 화면을 만드는 것보다 없다고 적는 게 낫다. */
    h += `<p class="kr-note">${ko
      ? `일본 산 ${list.length}곳입니다 (${esc(d.source || 'OpenStreetMap')}, 해발 ${d.minAlt ?? ''}m 이상).<br>`
        + '⚠️⚠️ <b>한국 산 화면처럼 예보와 실측을 견주지 못합니다.</b> 그 화면의 값어치는 '
        + '기상청 산악예보와 실제 관측이 얼마나 벌어지는지인데, 일본에는 산 정상 예보의 '
        + '공개 짝이 없습니다. 그래서 여기서는 위치와 높이만 보여드립니다.<br>'
        + '⚠️ 가장 가까운 AMeDAS 관측소 기온은 산 아래 값입니다 — 정상 기온이 아닙니다.'
      : `${list.length} peaks (${esc(d.source || 'OpenStreetMap')}). ⚠️ Unlike the Korean screen we `
        + 'cannot compare summit forecast against observation — Japan publishes no summit forecast we could find.'}</p>`;
    return h;
  },

  /** 규칙으로 옮긴 표기라는 것을 밝힌다.
   *  ⚠️ 우리가 만든 한글 표기를 **공식 표기인 척하지 않는다.** */
  _trNote() {
    const ko = i18n.lang === 'ko';
    if (!ko) return '';
    return `<p class="kr-note">⚠️ 한글 이름은 외래어 표기법에 따라 <b>저희가 옮긴 것</b>입니다. `
      + `공식 한국어 표기가 따로 있을 수 있습니다.</p>`;
  },
};
