// 한국탭 — 기상청 자료를 탭으로 나눠 보여준다
//
// ⚠️ 탭을 열 때 그 탭 자료만 받는다. 한꺼번에 받으면 안 여는 사람에게도 부담이다.
// ⚠️ 위치를 못 받았을 때도 화면이 비지 않게 한다 — 전국 요약은 위치 없이도 보여준다.

import { i18n } from './i18n.js';
import { myLocation } from './mylocation.js';
import { get, nearest, inKorea, normalFor, feelsLike } from './korea.js';
import { warn } from './warn.js';
import { warnUI } from './ui-warn.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n1 = v => (v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1));
/** 마지막 글자에 받침이 있나 — 조사(은/는, 이/가)를 고르는 데 쓴다.
 *  ⚠️ "전남는" 처럼 나오면 기계가 쓴 티가 난다. */
const hasJong = w => { const c = String(w || '').trim().slice(-1).charCodeAt(0);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0; };
/** 20260727193013 → 19:30:13 */
const hhmmss = t => { const s = String(t || ''); return s.length >= 14
  ? `${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}` : s.slice(8, 12); };

const TABS = [
  { id: 'now',   ko: '지금',  en: 'Now' },
  { id: 'warn',  ko: '특보',  en: 'Alerts' },
  { id: 'sky',   ko: '하늘',  en: 'Sky' },
  { id: 'mtn',   ko: '산',    en: 'Peaks' },
  { id: 'sea',   ko: '바다',  en: 'Sea' },
  { id: 'life',  ko: '생활',  en: 'Living' },
  { id: 'rec',   ko: '기록',  en: 'Record' },
];

export const koreaPanel = {
  tab: 'now',

  init() {
    this._bind();
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
    } catch (e) {
      this.body.innerHTML = `<p class="kr-note">${ko ? '자료를 불러오지 못했습니다' : 'Could not load'} — ${esc(e.message)}</p>`;
    }
  },

  _src(d) {
    const ko = i18n.lang === 'ko';
    return `<p class="kr-note">${esc(ko ? d.source : (d.sourceEn || d.source))}`
      + (d.license ? ` · ${esc(d.license)}` : '')
      + (d.observedKst ? `<br>${ko ? '관측' : 'Observed'} ${esc(d.observedKst)} KST` : '')
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

  /* ── 특보 ─────────────────────────────────────────────── */
  async _warn() {
    const ko = i18n.lang === 'ko';
    // ⚠️ 한국 밖 사용자가 직접 열었을 수도 있다 — 그때는 여기서 받는다.
    if (!warn.data) await warn.refresh();
    // ⚠️ 자료가 이미 있어도 위치가 그 뒤에 왔을 수 있다. 열 때마다 다시 맞춘다.
    else warn.recheck();
    // 상세는 이미 만들어 둔 특보 패널이 낫다. 여기서는 요약 + 여는 버튼.
    const s = warn.summary();
    if (!s.ready) return `<p class="kr-note">${ko ? '특보 자료를 불러오지 못했습니다' : 'Could not load warnings'}</p>`;
    const kinds = (s.kinds || []).join(', ');
    return `<div class="kr-big"><b>${s.activeCount}</b><span>${ko ? '건 발효 중' : 'active'}</span>`
      + (kinds ? `<em>${esc(kinds)}</em>` : '') + `</div>`
      + (s.mine.length
          ? `<h4>${ko ? `내 지역 · ${s.zone ? s.zone.name : ''}` : `My area · ${s.zone ? s.zone.name : ''}`} <i>${s.mine.length}</i></h4>`
            + s.mine.slice(0, 6).map(w =>
                `<div class="kr-row"><span>${esc(w.icon)} ${esc(ko ? w.kind : w.kindEn)}${esc(w.level)} · ${esc(w.region)}</span><b>${esc(w.level)}</b></div>`).join('')
          : `<p class="kr-note">${s.inKorea
              ? (ko ? `내 지역(${s.zone ? s.zone.name : '?'})에는 발효 중인 특보가 없습니다.` : 'No warnings in your area.')
              : (ko ? '위치가 한국 밖이거나 아직 못 받았습니다.' : 'Location outside Korea or unavailable.')}</p>`)
      + `<button class="kr-more" id="krWarnMore">${ko ? '전체 특보 보기' : 'See all warnings'}</button>`
      + this._src(warn.data);
  },

  /* ── 하늘 (낙뢰 · 비) ─────────────────────────────────── */
  async _sky() {
    const ko = i18n.lang === 'ko';
    const [lg, aws] = await Promise.all([get('lightning'), get('aws')]);
    const c = myLocation.coords;
    let h = '';

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

    /* 비 — 레이더가 아니라 **실측**이다. 레이더는 격자 투영 자료를 못 받아 아직 넣지 않았다. */
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

    return h + this._src(lg)
      + `<p class="kr-note">${ko
        ? '강수는 레이더가 아니라 지상 관측소 실측입니다. 레이더 격자는 위경도 대응표를 받을 수 없어 아직 넣지 않았습니다 — 추측해서 얹으면 비가 엉뚱한 곳에 그려집니다.'
        : 'Rainfall is measured at ground stations, not radar. The radar grid is omitted because its lat/lon reference is unavailable; placing it by guesswork would put rain in the wrong places.'}</p>`;
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
      + this._src(d);
  },

  /* ── 생활 (자외선 · 대기확산 · 꽃가루 · 체감온도) ─────── */
  async _life() {
    const ko = i18n.lang === 'ko';
    const [lf, aws] = await Promise.all([get('life'), get('aws')]);
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
