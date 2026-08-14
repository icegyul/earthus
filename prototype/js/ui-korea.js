// 한국탭 — 기상청 자료를 탭으로 나눠 보여준다
//
// ⚠️ 탭을 열 때 그 탭 자료만 받는다. 한꺼번에 받으면 안 여는 사람에게도 부담이다.
// ⚠️ 위치를 못 받았을 때도 화면이 비지 않게 한다 — 전국 요약은 위치 없이도 보여준다.

import { i18n } from './i18n.js';
import { API } from './config.js';
import { myLocation } from './mylocation.js';
import { get, nearest, inKorea, normalFor, feelsLike } from './korea.js';
import { condText } from './kma-fcst.js';
import { evidenceTimeline, forecastHighlights, nearestForecastHour, parseKmaTime, parseKmaUtcTime, upperAirSummary, windProfileSummary } from './kma-live-metrics.js?v=20260814-n5';
import { store } from './store.js';
import { warn, levelEn } from './warn.js';
import { warnUI } from './ui-warn.js';
import { safetyGateMarkup } from './safety-gate-ui.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n1 = v => (v == null || v === '' || !Number.isFinite(Number(v))
  ? '—' : (Math.round(Number(v) * 10) / 10).toFixed(1));
/** 마지막 글자에 받침이 있나 — 조사(은/는, 이/가)를 고르는 데 쓴다.
 *  ⚠️ "전남는" 처럼 나오면 기계가 쓴 티가 난다. */
const hasJong = w => { const c = String(w || '').trim().slice(-1).charCodeAt(0);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0; };
/** 20260727193013 → 19:30:13 */
const hhmmss = t => { const s = String(t || ''); return s.length >= 14
  ? `${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}` : s.slice(8, 12); };

const TABS = [
  { id: 'now',   ko: '지금',  en: 'Now' },
  { id: 'forecast', ko: '5일 예보', en: '5-day' },
  { id: 'warn',  ko: '특보',  en: 'Alerts' },
  { id: 'sky',   ko: '하늘',  en: 'Sky' },
  { id: 'upper', ko: '상층', en: 'Upper air' },
  { id: 'mtn',   ko: '산',    en: 'Peaks' },
  { id: 'sea',   ko: '바다',  en: 'Sea' },
  { id: 'life',  ko: '생활',  en: 'Living' },
  { id: 'rec',   ko: '기록',  en: 'Record' },
];

export const koreaPanel = {
  tab: 'now',

  init() {
    this._bind();
    if (!document.querySelector('link[data-kma-live-style]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL('../css/kma-live.css?v=20260814-n5', import.meta.url).href;
      link.dataset.kmaLiveStyle = '1';
      document.head.appendChild(link);
    }
    i18n.onChange(() => { this.renderTabs(); this.render(); });
    return this;
  },

  /** DOM 참조를 잡는다.
   *  ⚠️ init() 이 아직 안 돌았거나 시트가 나중에 만들어졌을 수 있다.
   *     그때 조용히 아무것도 안 그리면 "탭을 눌렀는데 빈 화면"이 된다.
   *     열 때마다 없으면 다시 잡는다. */
  _bind() {
    this.tabsEl = this.tabsEl || document.getElementById('koreaTabs');
    this.body = this.body || document.getElementById('koreaBody');
    return !!(this.tabsEl && this.body);
  },

  open() {
    if (!this._bind()) { console.warn('[한국탭] 화면 요소를 못 찾았다'); return; }
    const title = document.getElementById('koreaTitle');
    if (title) title.innerHTML = i18n.lang === 'ko'
      ? '기상청 라이브 <small>관측 · 공식예보 · 특보</small>'
      : 'KMA Live <small>observations · official forecasts · warnings</small>';
    this.renderTabs();
    document.getElementById('koreaSheet')?.classList.add('up');
    this.render();
  },

  close() { document.getElementById('koreaSheet')?.classList.remove('up'); },

  renderTabs() {
    if (!this.tabsEl) return;
    const ko = i18n.lang === 'ko';
    this.tabsEl.innerHTML = TABS.map(t =>
      `<button class="kr-tab${t.id === this.tab ? ' on' : ''}" data-tab="${t.id}" role="tab">${esc(ko ? t.ko : t.en)}</button>`
    ).join('');
    this.tabsEl.querySelectorAll('[data-tab]').forEach(b => {
      b.onclick = () => { this.tab = b.dataset.tab; this.renderTabs(); this.render(); };
    });
  },

  async render() {
    if (!this.body) return;
    const ko = i18n.lang === 'ko';
    this.body.innerHTML = `<p class="kr-note">${ko ? '불러오는 중…' : 'Loading…'}</p>`;
    try {
      const html = await this[`_${this.tab}`]();
      this.body.innerHTML = html;
      // ⚠️ innerHTML 로 갈아끼운 뒤에 배선한다 — 먼저 붙이면 사라진 요소에 붙는다.
      const more = document.getElementById('krWarnMore');
      if (more) more.onclick = () => { this.close(); warnUI.open(); };
      this.body.querySelectorAll('[data-kma-layer]').forEach(button => {
        button.onclick = () => this._openLayer(button.dataset.kmaLayer);
      });
      this.body.querySelectorAll('[data-radar-timeline]').forEach(input => {
        input.oninput = () => {
          let frames = [];
          try { frames = JSON.parse(decodeURIComponent(input.dataset.radarTimeline || '')); } catch { return; }
          const frame = frames[Number(input.value)];
          const image = this.body.querySelector('[data-radar-frame]');
          const link = image?.closest('a');
          const output = this.body.querySelector('[data-radar-time]');
          if (!frame || !image) return;
          const path = String(frame.url || '').replace(/^\/wind\//, '');
          const url = `${API.WIND}/${path}?v=${encodeURIComponent(frame.requestedKst || frame.generated || '')}`;
          image.src = url;
          if (link) link.href = url;
          if (output) output.textContent = `${this._time(frame.requestedKst, true)} KST`;
        };
      });
    } catch (e) {
      this.body.innerHTML = `<p class="kr-note">${ko ? '자료를 불러오지 못했습니다' : 'Could not load'} — ${esc(e.message)}</p>`;
    }
  },

  _openLayer(id) {
    if (!id) return;
    if (!store.isOn(id)) store.setLayer(id, true);
    document.dispatchEvent(new CustomEvent('earthus:earth-view-intent', {
      detail: { view: 'data', layer: id, reason: 'kma-live-map' },
    }));
    this.close();
  },

  _mapButton(id, ko, en) {
    return `<button class="kr-map" data-kma-layer="${esc(id)}">${esc(i18n.lang === 'ko' ? ko : en)} <i aria-hidden="true">↗</i></button>`;
  },

  _time(value, withDate = false) {
    const date = parseKmaTime(value);
    if (!date) return String(value || '—');
    const options = { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false };
    if (withDate) { options.month = 'numeric'; options.day = 'numeric'; }
    return new Intl.DateTimeFormat(i18n.lang === 'ko' ? 'ko-KR' : 'en-US', options).format(date);
  },

  _upperTime(value) {
    const date = parseKmaUtcTime(value);
    if (!date) return String(value || '—');
    const locale = i18n.lang === 'ko' ? 'ko-KR' : 'en-US';
    const kst = new Intl.DateTimeFormat(locale, {
      timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date);
    const utc = new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date);
    return `${kst} KST (${utc} UTC)`;
  },

  _isoTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return String(value || '—');
    return new Intl.DateTimeFormat(i18n.lang === 'ko' ? 'ko-KR' : 'en-US', {
      timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date);
  },

  _src(d) {
    const ko = i18n.lang === 'ko';
    if (!d) return '';
    /* ⚠️⚠️ 자료마다 출처 모양이 **두 가지**다.
         기상청 계열: { source, sourceEn, license }       ← 문자열 하나
         새 공공데이터: { sources: [{ko, en, license}] }   ← 여러 기관일 수 있어 배열
       배열을 안 받아 주면 화면에 **"undefined"** 가 찍힌다. 출처가 안 보이는 것도
       나쁘지만, 그 자리에 undefined 가 뜨는 건 자료 전체를 의심하게 만든다. */
    if (Array.isArray(d.sources) && d.sources.length) {
      return `<p class="kr-note">`
        + d.sources.map(s => esc(ko ? (s.ko || s.en) : (s.en || s.ko))
            + (s.license ? ` · ${esc(s.license)}` : '')).join('<br>')
        + (d.generatedKst ? `<br>${ko ? '기준' : 'As of'} ${esc(d.generatedKst)} KST` : '')
        + `</p>`;
    }
    if (!d.source && !d.sourceEn) return '';
    const isForecast = Array.isArray(d.points) && d.points.some(point => point?.baseKst);
    return `<p class="kr-note">${esc(ko ? d.source : (d.sourceEn || d.source))}`
      + (d.license ? ` · ${esc(d.license)}` : '')
      + (d.observedKst ? `<br>${isForecast ? (ko ? '수집' : 'Collected') : (ko ? '관측' : 'Observed')} `
        + `${esc(this._time(d.observedKst, true))} KST` : '')
      + (!d.observedKst && d.generated ? `<br>${ko ? '수집' : 'Collected'} ${esc(this._isoTime(d.generated))} KST` : '')
      + `</p>`;
  },

  /* ── 지금 ─────────────────────────────────────────────── */
  async _now() {
    const ko = i18n.lang === 'ko';
    const [aws, normals] = await Promise.all([get('aws'), get('normal').catch(() => null)]);
    const c = myLocation.coords;

    let head = '';
    if (c && inKorea(c.lat, c.lon)) {
      const s = nearest(aws.stations.filter(x => x.ta != null), c.lat, c.lon, 60);
      if (s) {
        // 평년 대비. ⚠️ 평년값은 84개 ASOS 지점에만 있다 — AWS 지점엔 대개 없다.
        const nm = normals && normalFor(normals, s.id);
        const anom = nm && nm.mean != null ? s.ta - nm.mean : null;
        head = `<div class="kr-big"><b>${n1(s.ta)}°C</b>`
          + `<span>${esc(s.name || s.id)} · ${ko ? '약' : '~'} ${Math.round(s.km)}km`
          + (s.alt != null ? ` · ${ko ? '해발' : 'alt'} ${Math.round(s.alt)}m` : '') + `</span>`
          + (anom != null
              ? `<em>${ko ? '평년보다' : 'vs normal'} ${anom >= 0 ? '+' : ''}${n1(anom)}°C</em>` : '')
          + `</div>`
          + `<div class="kr-kv">`
          + `<span>${ko ? '습도' : 'Humidity'}<b>${n1(s.hm)}%</b></span>`
          + `<span>${ko ? '바람' : 'Wind'}<b>${n1(s.ws1)} m/s</b></span>`
          + `<span>${ko ? '오늘 비' : 'Rain today'}<b>${n1(s.rnday)} mm</b></span>`
          + `</div>`;
      }
    } else {
      head = `<p class="kr-note">${ko
        ? '위치를 받으면 가장 가까운 관측소를 보여드립니다. 아래는 전국 요약입니다.'
        : 'Grant location to see your nearest station. National summary below.'}</p>`;
    }

    const t = aws.stations.filter(x => x.ta != null).sort((a, b) => b.ta - a.ta);
    const rain = aws.stations.filter(x => (x.rn60 || 0) > 0).sort((a, b) => b.rn60 - a.rn60);
    const row = (s, v, u) => `<div class="kr-row"><span>${esc(s.name || s.id)}</span><b>${v}${u}</b></div>`;

    return head
      + `<div class="kr-actions">${this._mapButton('landobs', '736개 관측소 지도', 'Map 736 stations')}</div>`
      + `<h4>${ko ? '전국' : 'Nationwide'} <i>${aws.count}${ko ? '지점' : ' stations'}</i></h4>`
      + `<div class="kr-cols"><div><small>${ko ? '가장 더운 곳' : 'Hottest'}</small>`
      + t.slice(0, 5).map(s => row(s, n1(s.ta), '°C')).join('')
      + `</div><div><small>${ko ? '가장 서늘한 곳' : 'Coolest'}</small>`
      + t.slice(-5).reverse().map(s => row(s, n1(s.ta), '°C')).join('')
      + `</div></div>`
      + (rain.length
          ? `<h4>${ko ? '지금 비 오는 곳' : 'Raining now'} <i>${rain.length}</i></h4>`
            + rain.slice(0, 8).map(s => row(s, n1(s.rn60), 'mm/h')).join('')
          : `<h4>${ko ? '지금 비 오는 곳' : 'Raining now'}</h4><p class="kr-note">${ko ? '없습니다' : 'None'}</p>`)
      + this._src(aws);
  },

  /* ── 5일 공식 동네예보 ────────────────────────────────── */
  async _forecast() {
    const ko = i18n.lang === 'ko';
    const doc = await get('forecast');
    const points = doc.points || [];
    const c = myLocation.coords;
    let focus = null;
    if (c && inKorea(c.lat, c.lon)) focus = nearest(points, c.lat, c.lon, 300);
    if (!focus) {
      const seoul = points.find(point => /서울/.test(point.name || '')) || points[0];
      focus = seoul ? { ...seoul, km: null } : null;
    }
    const highlights = forecastHighlights(points);
    let h = `<div class="kr-data-ribbon"><b>${doc.count}${ko ? '개 대표격자' : ' representative grids'}</b>`
      + `<span>${doc.cells}${ko ? '칸 요청' : ' cells requested'} · ${ko ? '실패' : 'failed'} ${doc.failedCells}</span>`
      + `<span>${ko ? '기상청 5km 공식예보' : 'KMA official 5 km forecast'}</span></div>`;

    if (focus) {
      const current = nearestForecastHour(focus);
      const hours = (focus.hourly || []).map(row => ({ ...row, at: parseKmaTime(row.tm) }))
        .filter(row => row.at && row.at.getTime() >= Date.now() - 60 * 60_000).slice(0, 12);
      h += `<div class="kr-big kr-forecast-hero"><b>${current?.t == null ? '—' : n1(current.t) + '°C'}</b>`
        + `<span>${esc(focus.name || focus.id)}${focus.km == null ? '' : ` · ${ko ? '약' : '~'} ${Math.round(focus.km)}km`}`
        + ` · ${esc(current ? condText(current.sky, current.pty, ko) : '—')}</span>`
        + `<em>${current ? `${this._time(current.tm, true)} · ${ko ? '발표' : 'issued'} ${this._time(focus.baseKst, true)}`
          + ` · ${ko ? '강수확률' : 'rain'} ${n1(current.pop)}% · ${ko ? '바람' : 'wind'} ${n1(current.ws)}m/s` : '—'}</em></div>`;
      h += `<div class="kr-hourly" aria-label="${ko ? '앞으로 12시간' : 'Next 12 hours'}">`
        + hours.map(row => `<div class="kr-hour"><time>${esc(this._time(row.tm))}</time>`
          + `<b>${n1(row.t)}°</b><span>${esc(condText(row.sky, row.pty, ko))}</span>`
          + `<em>${n1(row.pop)}%</em></div>`).join('') + `</div>`;
    }

    const rows = (label, list, field, unit) => `<section class="kr-rank"><small>${label}</small>`
      + list.slice(0, 5).map(row => `<div class="kr-row"><span>${esc(row.name || row.id)}</span>`
        + `<b>${n1(row[field])}${unit}</b></div>`).join('') + `</section>`;
    h += `<h4>${ko ? '같은 유효시각 전국 비교' : 'Nationwide at the same valid time'} `
      + `<i>n=${highlights.sampleCount} · ${esc(this._time(highlights.validAt, true))}</i></h4>`
      + `<div class="kr-ranks">`
      + rows(ko ? '기온 높은 곳' : 'Warmest', highlights.hottest, 't', '°C')
      + rows(ko ? '강수확률 높은 곳' : 'Highest rain chance', highlights.wettest, 'pop', '%')
      + rows(ko ? '바람 강한 곳' : 'Strongest wind', highlights.windiest, 'ws', 'm/s')
      + `</div>`;
    h += `<p class="kr-note">${ko
      ? '이 순위는 97개 대표격자의 같은 예보시각 원값 비교입니다. 실제 관측 순위가 아니며, 사용자 위치의 정확한 5km 칸과 다를 수 있습니다.'
      : 'Ranks compare raw values at the same forecast hour across 97 representative grids. They are not observation rankings and may differ from your exact 5 km cell.'}</p>`;
    return h + this._src(doc);
  },

  /* ── 특보 ─────────────────────────────────────────────── */
  async _warn() {
    const ko = i18n.lang === 'ko';
    // ⚠️ 한국 밖 사용자가 직접 열었을 수도 있다 — 그때는 여기서 받는다.
    if (!warn.data) await warn.refresh();
    // ⚠️ 자료가 이미 있어도 위치가 그 뒤에 왔을 수 있다. 열 때마다 다시 맞춘다.
    else warn.recheck();
    // 상세는 이미 만들어 둔 특보 패널이 낫다. 여기서는 요약 + 여는 버튼.
    const s = warn.summary();
    if (!s.ready) return safetyGateMarkup(s.safety, i18n.lang)
      + `<p class="kr-note">${ko ? '전국 특보 목록도 불러오지 못했습니다.' : 'The nationwide warning list could not be loaded either.'}</p>`;
    const kinds = (s.kinds || []).join(', ');
    return safetyGateMarkup(s.safety, i18n.lang)
      + `<div class="kr-big"><b>${s.activeCount}</b><span>${ko ? '건 발효 중' : 'active'}</span>`
      + (kinds ? `<em>${esc(kinds)}</em>` : '') + `</div>`
      + (s.mine.length
          ? `<h4>${ko ? `내 지역 · ${s.zone ? s.zone.name : ''}` : `My area · ${s.zone ? s.zone.name : ''}`} <i>${s.mine.length}</i></h4>`
            + s.mine.slice(0, 6).map(w =>
                // ⚠️ 영어에서 등급이 한국어로 새지 않게 한다 (levelEn)
                `<div class="kr-row"><span>${esc(w.icon)} ${esc(ko ? w.kind + w.level : `${w.kindEn || w.kind} ${levelEn(w.level)}`)} · ${esc(w.region)}</span><b>${esc(ko ? w.level : levelEn(w.level))}</b></div>`).join('')
          : '')
      + `<button class="kr-more" id="krWarnMore">${ko ? '전체 특보 보기' : 'See all warnings'}</button>`
      + `<div class="kr-actions">${this._mapButton('alerts', '특보 지도', 'Warning map')}</div>`
      + this._src(warn.data);
  },

  /* ── 하늘 (낙뢰 · 비) ─────────────────────────────────── */
  async _sky() {
    const ko = i18n.lang === 'ko';
    const [lg, aws, radar, warning] = await Promise.all([
      get('lightning'), get('aws'), get('radar').catch(() => null), get('warn').catch(() => null),
    ]);
    const c = myLocation.coords;
    let h = '';

    const timeline = evidenceTimeline({ radar, lightning: lg, aws, warning });
    const timeLabel = row => row.at ? this._isoTime(row.at) : (ko ? '시각 확인 불가' : 'Time unavailable');
    const countLabel = row => row.count == null ? (ko ? '표본수 확인 불가' : 'Sample count unavailable')
      : `n=${Number(row.count).toLocaleString()}`;
    const names = {
      RADAR: ko ? '레이더 HSR' : 'Radar HSR', LIGHTNING: ko ? '낙뢰 탐지' : 'Lightning detection',
      AWS: ko ? '지상 AWS' : 'Ground AWS', WARNING: ko ? '공식 특보' : 'Official warning',
    };
    h += `<section class="kr-evidence-time" aria-label="${ko ? '기상 근거 시간축' : 'Weather evidence timeline'}">`
      + `<header><b>${ko ? '같은 하늘·서로 다른 시각' : 'One sky, separate evidence times'}</b>`
      + `<span>${ko ? '최신 근거 순' : 'Newest evidence first'}</span></header>`
      + timeline.map(row => `<div class="kr-evidence-time-row" data-evidence-state="${esc(row.state)}">`
        + `<strong>${esc(names[row.id] || row.id)}</strong><time datetime="${esc(row.at || '')}">${esc(timeLabel(row))}</time>`
        + `<span>${esc(countLabel(row))}${row.precision ? ` · ${esc(row.precision)}` : ''}</span></div>`).join('')
      + `<p>${ko
        ? '이 줄은 서로 다른 관측·탐지·기관발표의 시각을 비교할 뿐, 값을 섞거나 평균내지 않습니다.'
        : 'This aligns timestamps only. It never averages or merges unlike observations, detections and bulletins.'}</p></section>`;

    /* ⚠️ 낙뢰(G)와 번개(C)를 절대 한 덩어리로 세지 않는다.
       G 는 땅에 떨어진 것이라 사람이 맞을 수 있고, C 는 구름 사이에서만 친 것이다.
       둘을 합쳐 "낙뢰 90회"라고 하면 위험을 부풀리는 거짓말이 된다. */
    const strikes = lg.strikes || [];
    const ground = strikes.filter(s => s.type === 'G');

    if (c && inKorea(c.lat, c.lon) && ground.length) {
      const near = nearest(ground, c.lat, c.lon, 500);
      if (near) {
        h += `<div class="kr-big"><b>${Math.round(near.km)}km</b>`
          + `<span>${ko ? '가장 가까운 낙뢰' : 'Nearest ground strike'} · ${esc(hhmmss(near.tm))}</span>`
          + `<em>${Math.abs(near.kA)} kA</em></div>`;
      }
    }

    h += `<h4>${ko ? `최근 ${lg.windowMinutes}분` : `Last ${lg.windowMinutes} min`}</h4>`
      + `<div class="kr-kv">`
      + `<span>${ko ? '낙뢰(땅)' : 'Ground'}<b>${lg.groundCount}</b></span>`
      + `<span>${ko ? '번개(구름)' : 'Cloud'}<b>${lg.cloudCount}</b></span>`
      + `<span>${ko ? '최대 세기' : 'Strongest'}<b>${lg.strongestKA != null ? Math.abs(lg.strongestKA) + ' kA' : '—'}</b></span>`
      + `</div>`;

    if (!strikes.length) {
      h += `<p class="kr-note">${ko ? '지금 탐지된 낙뢰가 없습니다.' : 'No strikes detected right now.'}</p>`;
    } else {
      // ⚠️ 잘렸으면 반드시 알린다. 조용히 자르면 "이만큼뿐"으로 읽힌다.
      if (lg.truncated) {
        h += `<p class="kr-note">${ko
          ? `⚠️ 탐지 ${lg.totalDetected}회 중 최근 ${lg.count}회만 표시합니다.`
          : `⚠️ Showing the most recent ${lg.count} of ${lg.totalDetected} detected.`}</p>`;
      }
      h += ground.slice(-8).reverse().map(s =>
        `<div class="kr-row"><span>⚡ ${esc(hhmmss(s.tm))} <i>${s.lat.toFixed(2)}, ${s.lon.toFixed(2)}</i></span>`
        + `<b>${Math.abs(s.kA)} kA</b></div>`).join('');
    }

    if (radar?.image?.url) {
      const frames = Array.isArray(radar.frames) && radar.frames.length ? radar.frames : [{
        requestedKst: radar.requestedKst, generated: radar.generated, url: radar.image.url,
        width: radar.image.width, height: radar.image.height,
      }];
      const latestFrame = frames[frames.length - 1];
      const latestPath = String(latestFrame.url || '/wind/kma-radar.png').replace(/^\/wind\//, '');
      const radarUrl = `${API.WIND}/${latestPath}?v=${encodeURIComponent(latestFrame.requestedKst || latestFrame.generated || '')}`;
      h += `<h4>${ko ? '기상청 HSR 레이더' : 'KMA HSR radar'} <i>${esc(radar.unit || 'mm/h')}</i></h4>`
        + `<figure class="kr-radar"><a href="${esc(radarUrl)}" target="_blank" rel="noopener">`
        + `<img data-radar-frame src="${esc(radarUrl)}" width="${Number(latestFrame.width) || 1000}" height="${Number(latestFrame.height) || 980}" `
        + `loading="lazy" decoding="async" alt="${ko ? '기상청 HSR 레이더 강수량 합성영상' : 'KMA HSR composite radar precipitation'}"></a>`
        + `<figcaption>${ko
          ? '강수세기·국경·행정경계·생산시각을 포함한 기상청 원본 · 누르면 크게 보기'
          : 'Official KMA image with intensity legend, boundaries and production time · tap to enlarge'}</figcaption></figure>`
        + (frames.length > 1 ? `<div class="kr-radar-timeline"><label>${ko ? '최근 레이더 시간' : 'Recent radar time'} `
          + `<output data-radar-time>${esc(this._time(latestFrame.requestedKst, true))} KST</output></label>`
          + `<input type="range" min="0" max="${frames.length - 1}" value="${frames.length - 1}" step="1" `
          + `data-radar-timeline="${esc(encodeURIComponent(JSON.stringify(frames)))}" `
          + `aria-label="${ko ? '5분 간격 레이더 영상 선택' : 'Select 5-minute radar frame'}"></div>` : '')
        + this._src(radar);
    } else {
      h += `<p class="kr-note">${ko ? '레이더 최신 영상을 불러오지 못했습니다.' : 'Latest radar image is unavailable.'}</p>`;
    }

    /* 아래 비 목록은 레이더가 아니라 관측소 실측이다. 같은 탭에서 역할을 분명히 나눠 보여 준다. */
    const rain = (aws.stations || []).filter(s => (s.rn60 || 0) > 0)
      .sort((a, b) => b.rn60 - a.rn60);
    h += `<h4>${ko ? '지금 비 오는 곳' : 'Raining now'} <i>${rain.length}${ko ? '지점' : ''}</i></h4>`;
    if (!rain.length) {
      h += `<p class="kr-note">${ko ? '전국 어디에도 시간당 강수가 잡히지 않습니다.' : 'No hourly rainfall reported.'}</p>`;
    } else {
      if (c && inKorea(c.lat, c.lon)) {
        const nr = nearest(rain, c.lat, c.lon, 300);
        if (nr) h += `<p class="kr-note">${ko
          ? `내 위치에서 가장 가까운 비 — ${esc(nr.name || nr.id)} 약 ${Math.round(nr.km)}km, 시간당 ${n1(nr.rn60)}mm`
          : `Nearest rain — ${esc(nr.name || nr.id)} ~${Math.round(nr.km)}km, ${n1(nr.rn60)} mm/h`}</p>`;
      }
      h += rain.slice(0, 10).map(s =>
        `<div class="kr-row"><span>${esc(s.name || s.id)}</span><b>${n1(s.rn60)} mm/h</b></div>`).join('');
    }

    return h + `<div class="kr-actions">${this._mapButton('lightning', '낙뢰 지도', 'Lightning map')}</div>`
      + this._src(lg)
      + `<p class="kr-note">${ko
        ? '‘지금 비 오는 곳’ 숫자는 지상 관측소 실측이고, 위 HSR은 레이더 합성영상입니다. 성격이 다른 두 값을 섞어 평균내지 않습니다.'
        : '“Raining now” numbers are ground-station observations; HSR above is composite radar imagery. The two are not averaged together.'}</p>`;
  },

  /* ── 상층 대기 관측 ───────────────────────────────────── */
  async _upper() {
    const ko = i18n.lang === 'ko';
    const [now, series, windProfile] = await Promise.all([
      get('upperNow'), get('upper'), get('windProfiler').catch(() => null),
    ]);
    const summary = upperAirSummary(now, series);
    const metric = (label, item, unit) => `<div class="kr-upper-metric"><small>${label}</small>`
      + `<b>${item.value == null ? '—' : n1(item.value)}${unit}</b>`
      + `<span>${item.percentile == null ? (ko ? '분포 계산 불가' : 'No distribution')
        : (ko ? `2010~ 관측의 ${item.percentile}백분위` : `${item.percentile}th percentile since 2010`)}</span>`
      + `<em>n=${item.historicalN.toLocaleString()}</em></div>`;
    let h = `<div class="kr-data-ribbon"><b>${ko ? '레윈존데 실측' : 'Radiosonde observations'}</b>`
      + `<span>${summary.stationCount}${ko ? '지점' : ' stations'} · ${this._upperTime(summary.latestAt)}</span>`
      + `<span>${series.count?.toLocaleString?.() || Object.keys(series.days || {}).length.toLocaleString()}${ko ? '일 기록' : ' daily records'}</span></div>`;
    h += `<div class="kr-upper-grid">`
      + metric(ko ? '총가강수량 평균' : 'Mean TPW', summary.tpw, 'mm')
      + metric(ko ? 'CAPE 지점 최댓값' : 'Max station CAPE', summary.capeMax, 'J/kg')
      + metric(ko ? 'K지수 평균' : 'Mean K index', summary.ki, '')
      + metric(ko ? '상승지수 평균' : 'Mean lifted index', summary.li, '')
      + `</div>`;
    const missing = Object.entries(summary.missing).filter(([, count]) => count > 0);
    if (missing.length) h += `<p class="kr-note">${ko ? '결측' : 'Missing'} · `
      + missing.map(([key, count]) => `${key.toUpperCase()} ${count}/${summary.stationCount}`).join(' · ') + `</p>`;
    h += `<details class="kr-geek"><summary>${ko ? '지수 읽는 법 · 덕후 노트' : 'How to read the indices'}</summary>`
      + Object.entries(now.fields || {}).map(([key, value]) => `<p><b>${esc(key.toUpperCase())}</b> ${esc(value)}</p>`).join('')
      + `<p>${ko
        ? '백분위는 기상청 관측 이력 안에서 오늘 값보다 낮았던 날의 비율입니다. 위험 확률이나 기상 예보가 아닙니다.'
        : 'Percentiles are the share of historical KMA observation days below today’s value; they are not risk probabilities or forecasts.'}</p></details>`;
    if (windProfile) {
      const profile = windProfileSummary(windProfile);
      const first = profile.stations[0];
      h += `<h4>${ko ? '연직바람 실측' : 'Vertical wind observations'} <i>${profile.stationCount}${ko ? '지점' : ' stations'} · n=${profile.levelCount.toLocaleString()}</i></h4>`
        + `<div class="kr-data-ribbon"><b>Wind Profiler</b><span>${esc(this._upperTime(profile.observedUtc))}</span>`
        + `<span>${ko ? '10분 주기 · 저층/고층 모드' : '10-minute · low/high modes'}</span></div>`
        + `<div class="kr-profile-stations">${profile.stations.slice(0, 10).map(station => `<div>`
          + `<b>${ko ? '지점' : 'Station'} ${esc(station.stn)}</b>`
          + `<span>${station.minHeightM == null ? (ko ? '고도 없음' : 'No height')
            : `${Math.round(station.minHeightM).toLocaleString()}–${Math.round(station.maxHeightM).toLocaleString()}m`}</span>`
          + `<em>n=${station.levelCount}${station.missingWind ? ` · ${ko ? '풍속 결측' : 'wind missing'} ${station.missingWind}` : ''}</em></div>`).join('')}</div>`;
      if (first) h += `<details class="kr-geek kr-profile"><summary>${ko ? `지점 ${esc(first.stn)} 실제 고도별 바람 · 성긴 표본` : `Station ${esc(first.stn)} observed levels · sparse sample`}</summary>`
        + `<p>${ko ? `전체 ${first.levelCount}개 원 관측행 중 실제 행 최대 12개만 간격을 두고 표시합니다. 고도 사이를 보간하지 않습니다.`
          : `Shows up to 12 spaced actual rows from ${first.levelCount}; values between levels are not interpolated.`}</p>`
        + `<div class="kr-profile-levels">${first.sampledLevels.map(level => `<div><span>${Math.round(Number(level.heightM)).toLocaleString()}m · ${esc(level.mode)}</span>`
          + `<b>${level.windSpeedMs == null ? (ko ? '풍속 결측' : 'wind missing') : `${n1(level.windSpeedMs)} m/s`}</b>`
          + `<em>${level.windDirectionDeg == null ? (ko ? '풍향 결측' : 'direction missing') : `${Math.round(Number(level.windDirectionDeg))}°`} · QC ${esc(level.qcRaw)}</em></div>`).join('')}</div></details>`;
      h += this._src(windProfile);
    } else {
      h += `<p class="kr-note">${ko ? '연직바람관측 자료를 불러오지 못했습니다. 안정도 지수는 위 자료가 그대로 유효합니다.'
        : 'Vertical wind observations are unavailable. The stability-index evidence above remains valid.'}</p>`;
    }
    h += `<div class="kr-actions">${this._mapButton('tpw', '동아시아 수증기 통로', 'East Asia moisture corridor')}</div>`;
    return h + this._src(now) + this._src(series);
  },

  /* ── 산 ───────────────────────────────────────────────── */
  async _mtn() {
    const ko = i18n.lang === 'ko';
    const d = await get('mountain');
    const peaks = d.peaks.filter(p => p.temp_c != null);
    const c = myLocation.coords;
    let head = '';
    if (c && inKorea(c.lat, c.lon)) {
      const p = nearest(peaks, c.lat, c.lon, 120);
      if (p) head = `<div class="kr-big"><b>${n1(p.temp_c)}°C</b>`
        + `<span>${esc(p.name)} · ${Math.round(p.alt)}m · ${ko ? '약' : '~'} ${Math.round(p.km)}km</span></div>`;
    }
    return head
      + `<h4>${ko ? '높은 곳부터' : 'By elevation'} <i>${peaks.length}${ko ? '곳' : ''}</i></h4>`
      + peaks.slice(0, 20).map(p =>
          `<div class="kr-row"><span>${esc(p.name)} <i>${Math.round(p.alt)}m</i></span><b>${n1(p.temp_c)}°C</b></div>`).join('')
      + `<p class="kr-note">${ko
          ? '⚠️ 관측값이 아니라 예보입니다. 등산 계획은 기상청 공식 발표를 확인하세요.'
          : '⚠️ These are forecasts, not observations. Check official KMA announcements before hiking.'}</p>`
      + this._src(d);
  },

  /* ── 바다 ─────────────────────────────────────────────── */
  async _sea() {
    const ko = i18n.lang === 'ko';
    const d = await get('ocean');
    const wave = d.stations.filter(s => s.wh != null).sort((a, b) => b.wh - a.wh);
    const sst = d.stations.filter(s => s.tw != null).sort((a, b) => b.tw - a.tw);
    return `<h4>${ko ? '파도 높은 곳' : 'Highest waves'}</h4>`
      + wave.slice(0, 6).map(s =>
          `<div class="kr-row"><span>${esc(s.name)} <i>${esc(s.kind)}</i></span><b>${n1(s.wh)}m</b></div>`).join('')
      + `<h4>${ko ? '수온' : 'Sea temperature'}</h4>`
      + sst.slice(0, 6).map(s =>
          `<div class="kr-row"><span>${esc(s.name)}</span><b>${n1(s.tw)}°C</b></div>`).join('')
      + `<p class="kr-note">${ko
          ? `실제 해상 장비 관측입니다 — 모델이 아닙니다. 파고 ${d.withWave}곳 · 수온 ${d.withSST}곳 / 전체 ${d.count}곳`
          : `Direct buoy observations, not model output. Waves ${d.withWave} · SST ${d.withSST} of ${d.count}`}</p>`
      + (d.quality?.waveExcluded ? `<p class="kr-note kr-quality">${ko
          ? `품질검증 · 비정상 유의파고 ${d.quality.waveExcluded}건은 원값을 보존하고 순위·지도에서 제외했습니다.`
          : `Quality check · ${d.quality.waveExcluded} anomalous wave value(s) were preserved raw and excluded from ranks/maps.`}</p>` : '')
      + `<div class="kr-actions">${this._mapButton('buoy', `${d.count}개 해양관측 지도`, `Map ${d.count} marine stations`)}</div>`
      + this._src(d);
  },

  /* ── 생활 (자외선 · 대기확산 · 꽃가루 · 체감온도) ─────── */
  async _life() {
    const ko = i18n.lang === 'ko';
    /* ⚠️ 실측·산불은 **실패해도 생활 탭 전체를 막지 않는다.**
       하나가 죽었다고 체감온도까지 사라지면 안 된다. */
    const [lf, aws, air, fire] = await Promise.all([
      get('life'), get('aws'),
      get('airobs').catch(() => null), get('fire').catch(() => null),
    ]);
    const c = myLocation.coords;
    let h = '';

    /* 체감온도는 우리가 직접 계산한다 — 이 API 는 시도 17곳뿐이지만
       AWS 736지점이면 내 동네에서 낼 수 있다. */
    if (c && inKorea(c.lat, c.lon)) {
      const s = nearest((aws.stations || []).filter(x => x.ta != null), c.lat, c.lon, 60);
      if (s) {
        const f = feelsLike(s.ta, s.hm, s.ws1);
        const label = f.kind === 'heat' ? (ko ? '여름철 체감온도' : 'Heat index')
          : f.kind === 'chill' ? (ko ? '겨울철 체감온도' : 'Wind chill')
          : (ko ? '기온 그대로' : 'Same as air temp');
        h += `<div class="kr-big"><b>${n1(f.v)}°C</b>`
          + `<span>${esc(label)} · ${esc(s.name || s.id)}</span>`
          + (f.kind !== 'plain'
              ? `<em>${ko ? '기온' : 'Air'} ${n1(s.ta)}°C · ${ko ? '습도' : 'RH'} ${n1(s.hm)}%</em>` : '')
          + `</div>`;
        /* ⚠️ 10~25°C 에서는 체감온도라는 개념을 쓰지 않는다. 왜 같은지 적어 준다. */
        if (f.kind === 'plain') {
          h += `<p class="kr-note">${ko
            ? '기온이 10~25°C 사이라 체감온도를 따로 계산하지 않습니다 — 이 구간에서는 기온이 곧 체감온도입니다.'
            : 'Between 10 and 25 °C no separate apparent temperature is defined.'}</p>`;
        }
      }
    }

    h += this._airObs(air, c, ko);
    h += this._fireRisk(fire, c, ko);

    const idx = lf.indices || {};
    const box = (key) => {
      const g = idx[key];
      if (!g) return '';
      const regs = Object.entries(g.regions || {});
      let out = `<h4>${esc(ko ? g.ko : g.en)}</h4>`;
      if (!regs.length) {
        // ⚠️ 계절 자료는 "고장"이 아니다. 이유를 그대로 보여준다.
        const why = (lf.outOfSeason || {})[key];
        out += `<p class="kr-note">${esc(why || (ko ? '자료가 없습니다.' : 'No data.'))}</p>`;
        return out;
      }
      // 내 지역을 먼저 — 없으면 전체를 값 순으로
      const mineName = this._myProvince(c, regs);
      const ordered = mineName
        ? [regs.find(r => r[0] === mineName), ...regs.filter(r => r[0] !== mineName)].filter(Boolean)
        : regs.slice().sort((a, b) => b[1].value - a[1].value);
      out += ordered.slice(0, 8).map(([name, v]) =>
        `<div class="kr-row"><span>${esc(name)}${name === mineName ? ` <i>${ko ? '내 지역' : 'mine'}</i>` : ''}</span>`
        + `<b>${n1(v.value)}${v.levelKo ? ` <i style="font-style:normal;opacity:.6">${esc(ko ? v.levelKo : v.levelEn)}</i>` : ''}</b></div>`).join('');
      const miss = (lf.missingRegions || {})[key];
      if (miss && miss.length) {
        out += `<p class="kr-note">${ko
          ? `⚠️ ${miss.join('·')}${hasJong(miss[miss.length - 1]) ? '은' : '는'} 이 지수 자료에 지역이 등록돼 있지 않아 값이 없습니다.`
          : `⚠️ ${miss.join(', ')} are not registered in this dataset.`}</p>`;
      }
      return out;
    };

    h += box('uv') + box('disp') + box('oak') + box('pine');
    return h + `<p class="kr-note">${esc(ko ? lf.scales.uv : lf.scales.uv)}</p>` + this._src(lf);
  },

  /* ── 대기질 실측 (에어코리아 673지점) ──────────────────────
     ⚠️⚠️ 지도에 칠하는 대기질 색은 유럽 CAMS **모델값**이다.
        이 앱은 부이 파고도 산 기온도 늘 실측을 앞세워 왔는데 대기질만 모델이었다.
        → 여기서 **실제로 잰 값**을 앞에 세운다. 모델을 지우지는 않는다 —
          모델은 전 지구를 덮고, 실측은 정확하지만 한국뿐이다.
     ⚠️ 등급(좋음·보통·나쁨·매우 나쁨)은 **환경부가 매긴 것**을 그대로 옮긴다.
        농도에 우리가 기준을 붙이면 환경부 발표와 다른 답이 나온다. */
  _airObs(air, c, ko) {
    if (!air || !(air.stations || []).length) return '';

    /* 가장 가까운 측정소. ⚠️ 좌표가 없는 측정소는 거리 계산에서 빼야 한다 —
       넣으면 좌표 없는 곳이 "0km"가 되어 제일 가까운 곳으로 뽑힌다. */
    const withXY = air.stations.filter(x => x.lat != null && x.pm25 != null);
    const near = (c && inKorea(c.lat, c.lon)) ? nearest(withXY, c.lat, c.lon, 20) : null;

    let out = `<h4>${ko ? '대기질 — 실제로 잰 값' : 'Air quality — measured'}</h4>`;

    if (near) {
      const km = Math.round(near.km);
      out += `<div class="kr-big"><b>${n1(near.pm25)}<i>㎍/㎥</i></b>`
        + `<span>${ko ? '초미세먼지' : 'PM2.5'} · ${esc(near.name)}`
        + `${km > 0 ? ` (${km}km)` : ''}${near.gradeKo ? ` · ${esc(near.gradeKo)}` : ''}</span>`
        + (near.pm10 != null
            ? `<em>${ko ? '미세먼지' : 'PM10'} ${n1(near.pm10)}㎍/㎥</em>` : '')
        + `</div>`;
      if (near.addr) {
        /* ⚠️ 주소를 보여주는 이유: **도로변 측정소는 원래 높게 나온다.**
           "왜 우리 동네만 높지"의 답이 대개 여기 있다. */
        out += `<p class="kr-note">${ko
          ? `측정소 위치: ${esc(near.addr)}${near.kind ? ` · ${esc(near.kind)}` : ''}`
          : `Station: ${esc(near.addr)}`}</p>`;
      }
    } else if ((air.sido || []).length) {
      /* 20km 안에 측정소가 없거나 위치를 모를 때 — **시도 평균**으로 물러난다.
         ⚠️ 이때 반드시 **몇 곳에서 쟀는지(n)** 를 같이 적는다.
            2곳 평균과 40곳 평균을 같은 굵기로 말하면 안 된다. */
      const top = air.sido.slice(0, 6);
      out += `<p class="kr-note">${ko
        ? '20km 안에 측정소가 없어 시도 평균으로 보여드립니다.'
        : 'No station within 20 km — showing provincial averages.'}</p>`;
      out += top.map(x =>
        `<div class="kr-row"><span>${esc(x.sido)}</span>`
        + `<b>${n1(x.pm25)}<i style="font-style:normal;opacity:.6">㎍/㎥ · ${x.nPm25}${ko ? '곳' : ' stns'}</i></b></div>`
      ).join('');
    } else {
      return '';
    }

    out += `<p class="kr-note">${ko
      ? `⚠️ 지도에 칠한 대기질 색은 유럽 <b>모델값</b>이고 이 숫자는 <b>실측</b>입니다 — 둘이 다를 수 있습니다. `
        + `전국 ${air.count}곳이 ${esc(air.observedKst || '')} 기준으로 잰 값이고, `
        + `등급은 <b>환경부가 매긴 것</b>을 그대로 옮깁니다.`
      : `⚠️ The map's air colour is a European <b>model</b>; these are <b>measurements</b> from `
        + `${air.count} stations (${esc(air.observedKst || '')} KST). Grades are the Ministry of Environment's.`}</p>`;
    return out;
  },

  /* ── 산불위험예보 (산림청) ────────────────────────────────
     ⚠️⚠️ **등급 이름을 우리가 붙이지 않는다.** 산림청이 나눠 준 네 단계별
        **면적 비율**을 그대로 옮긴다. 지수 평균에 우리가 임계값을 붙여
        "높음"이라고 부르면 산림청 발표와 다른 답이 나온다.
     ⚠️ 숫자는 **행정구역 전체의 평균**이다. 그 안에서도 능선과 골짜기가 다르다. */
  _fireRisk(fire, c, ko) {
    if (!fire || !(fire.sido || []).length) return '';
    const mine = (c && inKorea(c.lat, c.lon))
      ? nearest(fire.sido.filter(x => x.lat != null), c.lat, c.lon, 400) : null;
    const row = mine || fire.nation;
    if (!row) return '';

    const st = row.steps || {};
    const hi = (st.d3 || 0) + (st.d4 || 0);       // 3·4단계 면적 비율
    let out = `<h4>${ko ? '산불위험' : 'Forest-fire risk'}</h4>`;
    out += `<div class="kr-big"><b>${n1(row.avg)}</b>`
      + `<span>${ko ? '산불위험지수 평균' : 'Mean risk index'} · `
      + `${esc(mine ? row.sido : (ko ? '전국' : 'Nationwide'))}</span>`
      + `<em>${ko ? '가장 높은 곳' : 'Peak'} ${n1(row.max)}</em></div>`;

    out += `<p class="kr-note">${ko
      ? (hi > 0
          ? `⚠️ 이 지역 산림의 <b>${n1(hi)}%</b>가 산림청 기준 <b>3~4단계</b>(높은 쪽)입니다.`
          : `지금은 산림 대부분이 <b>1단계</b>(가장 낮은 쪽)입니다.`)
        + ` ⚠️ 이 숫자는 <b>행정구역 전체의 평균</b>이라 능선·골짜기마다 다릅니다. `
        + `단계는 <b>산림청이 나눈 것</b>을 그대로 옮깁니다.`
        + (mine ? '' : ' ⚠️ 위치를 몰라 전국 값을 보여드립니다.')
      : (hi > 0 ? `⚠️ <b>${n1(hi)}%</b> of forest here is at the agency's steps 3–4.`
                : 'Most forest is at step 1 (lowest).')
        + ' Values are area averages; the steps are the Forest Service’s own.'}</p>`;
    out += this._src(fire);
    return out;
  },

  /** 위경도로 시도 이름을 고른다. ⚠️ 경계 자료가 없으므로 가장 가까운 시도 중심으로 근사한다. */
  _myProvince(c, regs) {
    if (!c || !inKorea(c.lat, c.lon)) return null;
    const CENTER = {
      서울: [37.57, 126.98], 부산: [35.18, 129.08], 대구: [35.87, 128.60],
      인천: [37.46, 126.71], 광주: [35.16, 126.85], 대전: [36.35, 127.38],
      울산: [35.54, 129.31], 세종: [36.48, 127.29], 경기: [37.41, 127.52],
      강원: [37.83, 128.16], 충북: [36.80, 127.70], 충남: [36.66, 126.67],
      전북: [35.72, 127.15], 전남: [34.87, 126.99], 경북: [36.40, 128.87],
      경남: [35.24, 128.69], 제주: [33.50, 126.53],
    };
    let best = null;
    for (const [name] of regs) {
      const p = CENTER[name];
      if (!p) continue;
      const d = Math.hypot((p[0] - c.lat) * 111, (p[1] - c.lon) * 89);
      if (!best || d < best.d) best = { name, d };
    }
    return best && best.d < 160 ? best.name : null;
  },

  /* ── 기록 ─────────────────────────────────────────────── */
  async _rec() {
    const ko = i18n.lang === 'ko';
    const [ep, vf] = await Promise.all([
      get('episodes').catch(() => null), get('verify').catch(() => null),
    ]);
    let h = '';

    if (ep) {
      const months = Object.keys(ep.byMonth || {}).sort().slice(-3);
      h += `<h4>${ko ? '특보 이력' : 'Warning episodes'}</h4>`;
      if (months.length) {
        for (const m of months) {
          h += `<div class="kr-sub">${m.slice(0, 4)}-${m.slice(4)}</div>`;
          for (const [kind, v] of Object.entries(ep.byMonth[m])) {
            h += `<div class="kr-row"><span>${esc(kind)}</span>`
              + `<b>${v.count}${ko ? '건' : ''} · ${Math.round(v.hours)}${ko ? '시간' : 'h'} · ${v.regionCount}${ko ? '구역' : ' zones'}</b></div>`;
          }
        }
      } else {
        // ⚠️ 여기가 비는 건 고장이 아니다. 특보가 하나도 안 끝났을 뿐이다.
        h += `<p class="kr-note">${ko
          ? `수집 시작 ${esc(String(ep.collectingSince).slice(0, 8))} · 진행 중 ${ep.openCount}건. `
            + '끝난 특보가 생기면 여기에 쌓입니다.'
          : `Collecting since ${esc(String(ep.collectingSince).slice(0, 8))}; ${ep.openCount} open. `
            + 'Completed episodes will appear here.'}</p>`;
      }
    }

    h += `<h4>${ko ? '예보 정확도' : 'Forecast accuracy'}</h4>`;
    /* ⚠️ 날짜 칸은 오늘부터 생기지만 **채점 결과는 24시간 뒤에야** 들어온다.
       예전에 '날짜가 있으면 표 / 없으면 안내'로 갈랐더니,
       "날짜는 있는데 내용이 빈" 오늘 하루가 어디에도 안 걸려
       제목만 있고 아무 설명도 없는 화면이 나왔다.
       판단 기준은 날짜가 아니라 **실제로 그릴 줄이 있는가** 여야 한다. */
    const days = (vf && Object.keys(vf.days || {}).sort()) || [];
    const last = days.length ? vf.days[days[days.length - 1]] : {};
    const rows = Object.entries(last || {}).filter(([k]) => k.includes('temperature_2m'));

    if (rows.length) {
      h += rows.map(([k, v]) => {
        const [model, , lead] = k.split('|');
        return `<div class="kr-row"><span>${esc(model.split('_')[0].toUpperCase())} <i>${esc(lead)}</i></span>`
          + `<b>±${n1(v.mae)}°C</b></div>`;
      }).join('');
      h += `<p class="kr-note">${ko
        ? 'MAE — 예보가 실측에서 평균 몇 도 빗나갔는가. 선행시간별로 따로 봐야 합니다.'
        : 'MAE — mean absolute error vs observations, by lead time.'}</p>`;
    } else {
      const since = vf && vf.collectingSince;
      h += `<p class="kr-note">${ko
        ? `${since ? since + '부터 ' : ''}매시간 예보를 저장해, 24·48시간 뒤 실측과 맞춰 채점합니다. `
          + '아직 채점된 결과가 없습니다 — 첫 점수는 저장 시작 하루 뒤에 나옵니다.'
        : `Forecasts have been archived hourly${since ? ' since ' + since : ''} and are scored `
          + 'against observations 24–48 h later. No scores yet — the first appear a day after '
          + 'collection starts.'}</p>`;
    }
    return h;
  },
};
