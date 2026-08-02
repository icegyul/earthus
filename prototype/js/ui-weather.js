// 내 자리 날씨 — 아래 온도를 누르면 열린다
//
// 왜 만들었나 (받은 요청)
//   "오늘 날씨, 14일 날씨, 안내는 첫 화면 뜨면 아래 지금 온도 나오는곳 누르면
//    나오게 해주고, 그전에 말한 날씨 분석 멘트도 함께 나오게 해줘,
//    이후에는 메뉴->내위치 누르면 거기서 내 위치로 가면서 다시 화면 나오게"
//
//   첫 화면의 큰 온도 숫자는 "누르면 뭔가 있을 것 같은" 자리인데 아무 일도 없었다.
//   실제로 눌러도 터치가 그대로 지구본으로 빠져나갔다(#ambient 는 pointer-events:none).
//
// 구성
//   오늘   — 지금 값 + 시간별 (이미 받아 둔 자료를 그대로 쓴다)
//   14일   — 일별 최고/최저·강수. ⚠️ 뒤로 갈수록 맞을 확률이 떨어진다는 걸 화면에 적는다
//   안내   — 날씨 분석 서술. ⚠️ 아직 만들지 않았다 — **자리만 두고 없다고 적는다**
//
// ⚠️ 분석 멘트를 지어내지 않는다.
//    air-state 야간 잡(build-order 16e)이 만들어 S3 에 올리기 전까지는
//    "준비 중"이라고 정직하게 적는다. 그럴듯한 문장을 만들어 두면
//    그게 관측인지 우리 추측인지 아무도 구분할 수 없게 된다.
//
// ⚠️ 예보 자료는 Open-Meteo 다. 기상청이 아니다 — 화면에 그렇게 적는다.

import { i18n } from './i18n.js';
import { chrome } from './ui.js';
import { wxText } from './layers/weather.js';
import { myLocation } from './mylocation.js';
import { kmaFcst, condText } from './kma-fcst.js';

const $ = s => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c;
  if (h != null) n.innerHTML = h; return n; };

/* 14일 중 어디부터 "참고용"인가.
   ⚠️ 임의로 정한 선이 아니다 — 수치예보의 결정론적 정확도는 대체로 7일 안팎에서
      기후값 수준으로 떨어진다. 그 뒤를 같은 굵기로 보여주면 거짓 확신을 준다.
      정확한 근거 조사는 methodology-sources 로 넘긴다. 그 전까지는 **선을 긋고
      선 뒤는 흐리게 + 문구로 알린다**. */
const CONFIDENT_DAYS = 7;

/* 한국 대략 범위 — warn.js 와 같은 상자를 쓴다.
   ⚠️ 넉넉하게 잡는다: 제주 남단(33.1)·최북단(38.6)·독도(131.9)를 다 품어야 한다. */
const inKorea = (lat, lon) =>
  lat != null && lon != null &&
  lat >= 32.5 && lat <= 39.0 && lon >= 124.0 && lon <= 132.5;

export const weatherPanel = {
  tab: 'today',
  /* 한국이면 기상청 동네예보를 담아 둔다 (없으면 null → Open-Meteo 로 돌아간다) */
  kma: null,

  init() {
    /* 하단 온도 덩어리를 누를 수 있게 한다.
       ⚠️ #ambient 전체를 pointer-events:auto 로 되돌리면 안 된다 —
          그러면 지구를 돌리려고 화면 위쪽을 잡았을 때 텍스트가 먹어버린다.
          누를 수 있어야 하는 건 아래 온도 덩어리 하나뿐이다. (CSS 에서 지정) */
    $('#ambBottom')?.addEventListener('click', () => this.open());
    return this;
  },

  open(tab) {
    if (tab) this.tab = tab;
    document.querySelectorAll('.sheet-panel.up').forEach(p => p.classList.remove('up'));
    $('#wxSheet')?.classList.add('up');
    this.render();
    /* 아직 안 받았으면 받아 온다 (위치 권한을 늦게 준 경우) */
    if (!chrome.wx) chrome.loadWeather().then(() => this.render());
    /* 한국이면 기상청 예보를 덧대 온다.
       ⚠️ 먼저 그리고 나서 덧댄다 — 기상청을 기다리느라 화면이 비어 있으면 안 된다. */
    kmaFcst.at(chrome.place.lat, chrome.place.lon).then(k => {
      if (!k) return;
      this.kma = k;
      this.render();
    }).catch(() => { /* 실패하면 Open-Meteo 그대로 */ });
  },

  close() { $('#wxSheet')?.classList.remove('up'); },

  render() {
    const body = $('#wxBody');
    if (!body) return;
    const ko = i18n.lang === 'ko';
    body.innerHTML = '';

    $('#wxTitle').textContent = chrome.place.name || (ko ? '내 자리' : 'My spot');

    // 탭
    const tabs = el('div', 'comm-tabs');
    [['today', ko ? '오늘' : 'Today'],
     ['d14',   ko ? '14일' : '14 days'],
     ['note',  ko ? '안내' : 'Notes']].forEach(([k, label]) => {
      const b = el('button', 'comm-tab' + (this.tab === k ? ' on' : ''), label);
      b.onclick = () => { this.tab = k; this.render(); };
      tabs.appendChild(b);
    });
    body.appendChild(tabs);

    const wx = chrome.wx;
    if (!wx) {
      body.appendChild(el('p', 'wx-empty', ko ? '날씨를 받는 중입니다…' : 'Loading weather…'));
      return;
    }

    if (this.tab === 'today') this._today(body, wx, ko);
    else if (this.tab === 'd14') this._d14(body, wx, ko);
    else this._noteTab(body, ko);

    /* 한국 안이면 기상청 자료로 이어 준다.
       ⚠️ '한국' 메뉴를 없애면서 그 화면(특보·산·바다·생활·기록)이 갈 곳을 잃었다.
          자료가 있는데 여는 길이 없으면 없는 것과 같다 — 여기서 잇는다.
       ⚠️ 한국 밖에서는 만들지 않는다. 관측소가 없는 곳에서 열면 빈 화면이다. */
    if (inKorea(chrome.place.lat, chrome.place.lon)) {
      const b = el('button', 'wx-kr',
        `<b>${ko ? '기상청 자료 자세히' : 'KMA detail'}</b>`
        + `<i>${ko ? '특보 · 산 · 바다 · 생활기상 · 기록' : 'Warnings · mountains · sea · records'}</i>`
        + `<span>›</span>`);
      b.onclick = async () => {
        const { koreaPanel } = await import('./ui-korea.js');
        this.close();
        koreaPanel.open();
      };
      body.appendChild(b);
    }

    /* 출처 — 어느 탭이든 항상 붙는다.
       ⚠️ 탭마다 자료가 다르다. '오늘'은 한국이면 기상청, '14일'은 아직 Open-Meteo 다.
          한 줄로 뭉뚱그리면 어느 값이 어디서 왔는지 알 수 없게 된다. */
    const useKma = this.tab === 'today' && !!this.kma?.now;
    body.appendChild(el('div', 'wx-src', useKma
      ? (ko ? `자료 출처: ${esc(this.kma.source)} · ${esc(this.kma.license)}`
            : `Source: ${esc(this.kma.sourceEn || this.kma.source)}`)
      : (ko ? '자료 출처: Open-Meteo (전지구 수치예보). 기상청 공식 예보가 아닙니다.'
            : 'Source: Open-Meteo (global NWP). Not an official forecast.')));
  },

  /* ── 오늘 ─────────────────────────────────────────────────── */
  _today(body, wx, ko) {
    /* ⚠️⚠️ **서술이 맨 위다.** 설계 문서(weather-narrative-design.md §3-b)의 결정 —
       "저런 식의 분석 문구는 오늘 기상정보 제공해줄 때 주는 걸로 가자".
       숫자 위에 "그래서 오늘이 어떤 날인가" 한 문단이 먼저 온다.
       ⚠️ 처음엔 별도 '안내' 탭에 넣었다. 그건 아무도 안 누른다 —
          '내 위치'를 누르면 바로 이 탭이 열리는데 거기 없으면 없는 것과 같다. */
    this._narrative(body, ko);

    // 한국이면 기상청 동네예보로 그린다 (공식·5km)
    if (this.kma?.now) { this._todayKma(body, ko); return; }
    this._todayMeteo(body, wx, ko);
  },

  /** 기상청 동네예보판 — 항목이 Open-Meteo 와 달라 따로 그린다 */
  _todayKma(body, ko) {
    const k = this.kma, n = k.now;
    const today = (k.hours[0]?.tm || '').slice(0, 8);
    const dd = k.days[today] || {};

    body.appendChild(el('div', 'wx-now',
      `<div class="wn-t">${i18n.temp(n.t)}</div>`
      + `<div class="wn-r"><b>${esc(condText(n.sky, n.pty, ko))}</b>`
      + `<i>${dd.tmax != null ? `${ko ? '최고' : 'H'} ${i18n.temp(dd.tmax)}` : ''}`
      + `${dd.tmin != null ? ` · ${ko ? '최저' : 'L'} ${i18n.temp(dd.tmin)}` : ''}</i></div>`));

    const rows = [];
    if (n.rh != null) rows.push([ko ? '습도' : 'Humidity', `${Math.round(n.rh)}%`]);
    if (n.ws != null) rows.push([ko ? '바람' : 'Wind', `${n.ws.toFixed(1)} m/s`]);
    if (n.pop != null) rows.push([ko ? '강수확률' : 'Rain chance', `${Math.round(n.pop)}%`]);
    if (typeof n.pcp === 'number' && n.pcp > 0)
      rows.push([ko ? '강수량' : 'Precip', `${n.pcp} mm`]);
    else if (typeof n.pcp === 'string')
      rows.push([ko ? '강수량' : 'Precip', n.pcp]);       // '1mm 미만' 같은 원문
    if (rows.length) {
      const g = el('div', 'wx-grid');
      rows.forEach(([a, b]) => g.appendChild(el('div', 'wx-cell', `<i>${esc(a)}</i><b>${esc(b)}</b>`)));
      body.appendChild(g);
    }

    // 시간별 강수확률 — 12시간
    const next = k.hours.slice(0, 12);
    if (next.length) {
      body.appendChild(el('div', 'wx-sub', ko ? '시간별 강수확률' : 'Hourly rain chance'));
      const bars = el('div', 'wx-bars');
      next.forEach(h => {
        const p = h.pop ?? 0;
        bars.appendChild(el('div', 'wxb',
          `<span class="wxb-v" style="height:${Math.max(3, p)}%"></span>`
          + `<span class="wxb-p">${Math.round(p)}</span>`
          + `<span class="wxb-h">${String(h.tm).slice(8, 10)}</span>`));
      });
      body.appendChild(bars);
    }

    /* ⚠️ 어느 지점 기준인지 반드시 적는다. 내가 선 자리의 격자가 아니다. */
    body.appendChild(el('div', 'wx-where', ko
      ? `기상청 ${esc(k.name)} 지점 기준 (약 ${k.km}km) · ${fmtBase(k.baseKst)} 발표`
      : `KMA ${esc(k.name)} station (~${k.km} km) · issued ${fmtBase(k.baseKst)}`));
  },

  /** Open-Meteo 판 (한국 밖, 또는 기상청을 못 받았을 때) */
  _todayMeteo(body, wx, ko) {
    const c = wx.current, d = wx.daily;

    body.appendChild(el('div', 'wx-now',
      `<div class="wn-t">${i18n.temp(c.temperature_2m)}</div>`
      + `<div class="wn-r"><b>${esc(wxText(c.weather_code))}</b>`
      + `<i>${ko ? '최고' : 'H'} ${i18n.temp(d.temperature_2m_max[0])} · `
      + `${ko ? '최저' : 'L'} ${i18n.temp(d.temperature_2m_min[0])}</i></div>`));

    // 값 몇 개 — 없는 값은 줄을 아예 만들지 않는다
    const rows = [];
    if (c.apparent_temperature != null)
      rows.push([ko ? '체감' : 'Feels like', i18n.temp(c.apparent_temperature)]);
    if (c.relative_humidity_2m != null)
      rows.push([ko ? '습도' : 'Humidity', `${Math.round(c.relative_humidity_2m)}%`]);
    if (c.wind_speed_10m != null)
      rows.push([ko ? '바람' : 'Wind', `${c.wind_speed_10m.toFixed(1)} m/s`]);
    if (c.surface_pressure != null)
      rows.push([ko ? '기압' : 'Pressure', `${Math.round(c.surface_pressure)} hPa`]);
    if (d.sunrise?.[0] && d.sunset?.[0])
      rows.push([ko ? '해뜸 · 해짐' : 'Sun',
                 `${d.sunrise[0].slice(11, 16)} · ${d.sunset[0].slice(11, 16)}`]);
    if (rows.length) {
      const g = el('div', 'wx-grid');
      rows.forEach(([k, v]) => g.appendChild(el('div', 'wx-cell',
        `<i>${esc(k)}</i><b>${esc(v)}</b>`)));
      body.appendChild(g);
    }

    // 시간별 강수확률 — 있는 만큼만
    const h = wx.hourly;
    if (h?.time?.length && h.precipitation_probability) {
      const now = Date.now();
      const idx = h.time.map((t, i) => [new Date(t).getTime(), i])
        .filter(([t]) => t >= now - 3600_000).slice(0, 12).map(([, i]) => i);
      if (idx.length) {
        body.appendChild(el('div', 'wx-sub', ko ? '시간별 강수확률' : 'Hourly rain chance'));
        const bars = el('div', 'wx-bars');
        idx.forEach(i => {
          const p = h.precipitation_probability[i] ?? 0;
          const hh = h.time[i].slice(11, 13);
          bars.appendChild(el('div', 'wxb',
            `<span class="wxb-v" style="height:${Math.max(3, p)}%"></span>`
            + `<span class="wxb-p">${p}</span><span class="wxb-h">${hh}</span>`));
        });
        body.appendChild(bars);
      }
    }
  },

  /* ── 14일 ─────────────────────────────────────────────────── */
  _d14(body, wx, ko) {
    const d = wx.daily;
    if (!d?.time?.length) {
      body.appendChild(el('p', 'wx-empty', ko ? '예보가 없습니다' : 'No forecast'));
      return;
    }
    /* 막대 길이를 맞추려면 전체 기간의 최저·최고가 필요하다 */
    const lo = Math.min(...d.temperature_2m_min.filter(v => v != null));
    const hi = Math.max(...d.temperature_2m_max.filter(v => v != null));
    const span = Math.max(1, hi - lo);

    const list = el('div', 'wx-days');
    d.time.forEach((t, i) => {
      const dt = new Date(t + 'T00:00:00');
      const day = ko ? '일월화수목금토'[dt.getDay()] : ['Su','Mo','Tu','We','Th','Fr','Sa'][dt.getDay()];
      const mn = d.temperature_2m_min[i], mx = d.temperature_2m_max[i];
      if (mn == null || mx == null) return;
      const left = ((mn - lo) / span) * 100, width = ((mx - mn) / span) * 100;
      const pop = d.precipitation_probability_max?.[i];
      const r = el('div', 'wx-day' + (i >= CONFIDENT_DAYS ? ' far' : ''));
      r.innerHTML =
        `<span class="wd-d">${i === 0 ? (ko ? '오늘' : 'Today') : day}</span>`
        + `<span class="wd-n">${dt.getMonth() + 1}/${dt.getDate()}</span>`
        + `<span class="wd-p">${pop != null ? pop + '%' : ''}</span>`
        + `<span class="wd-lo">${i18n.temp(mn, 0)}</span>`
        + `<span class="wd-bar"><i style="left:${left}%;width:${Math.max(4, width)}%"></i></span>`
        + `<span class="wd-hi">${i18n.temp(mx, 0)}</span>`;
      list.appendChild(r);
    });
    body.appendChild(list);

    /* ⚠️ 뒤쪽이 흐린 이유를 반드시 적는다. 안 적으면 "왜 흐리지?"가 아니라
       그냥 같은 확신으로 읽는다. */
    body.appendChild(el('div', 'wx-caveat', ko
      ? `${CONFIDENT_DAYS}일 뒤부터는 흐리게 표시합니다. 수치예보는 뒤로 갈수록 맞을 확률이 떨어집니다 — 흐름을 보는 용도로만 보세요.`
      : `Days beyond ${CONFIDENT_DAYS} are dimmed. Skill drops with lead time — read them as a trend, not a forecast.`));
  },

  /* ── 안내 ───────────────────────────────────────────────────
     받은 요청: 내 위치 날씨를 **원고처럼** 보여 달라.
     ⚠️⚠️ 원고가 좋은 이유는 형용사가 아니라 **검증 가능한 주장**이라는 것이다 —
        "덥습니다"가 아니라 "평년보다 상위 5%". 그래서 규칙은 하나다:
        **숫자 없는 문장은 쓰지 않는다.** (narrative.js 머리말 참고) */
  /* '안내' 탭 — ⚠️ 서술은 '오늘'에 있다. 여기서 또 그리면 같은 글이 두 번 나온다.
     여기는 **어떻게 읽는지**만 적는다. */
  _noteTab(body, ko) {
    body.appendChild(el('div', 'mt-foot',
      `<p><b>${ko ? '오늘 첫 줄은 어떻게 나오나' : 'How the headline works'}</b></p>`
      + `<p>${ko
          ? '지금 잰 값을 <b>1995~2026년 기상청 ASOS 실측</b>과 견줍니다. '
            + '그날 ±7일을 모아 낸 분포에서 오늘이 몇 %인지 보고, '
            + '가장 이례적인 것 하나를 첫 줄로 씁니다.'
          : 'Today is compared against 30 years of KMA ASOS observations.'}</p>`
      + `<p>⚠️ ${ko
          ? '<b>판정 기준에 저희가 정한 값은 없습니다.</b> 열대야 25°C · 초열대야 30°C · '
            + '폭염 33/35°C 는 모두 기상청 정의입니다.'
          : 'Thresholds are KMA definitions, not ours.'}</p>`
      + `<p>⚠️ ${ko
          ? '<b>평범한 날은 평범하다고 씁니다.</b> 매일 극적인 척하면 '
            + '진짜 위험한 날에 아무도 믿지 않기 때문입니다.'
          : 'Ordinary days are called ordinary.'}</p>`
      + `<p>⚠️ ${ko
          ? '<b>예보가 아닙니다.</b> 지금 잰 값과 과거 기록을 견준 것입니다.'
          : 'Not a forecast.'}</p>`));
  },

  _narrative(body, ko) {
    const box = el('div', 'wx-narr');
    box.innerHTML = `<p class="wx-narr-load">${ko ? '오늘이 어떤 날인지 보는 중…' : 'Reading today…'}</p>`;
    body.appendChild(box);

    const p = chrome.place;
    if (!p || p.lat == null) {
      box.innerHTML = `<p class="wx-narr-load">${ko
        ? '위치를 알면 그날이 평년과 어떻게 다른지 알려드립니다.'
        : 'Grant location to compare today against 30 years.'}</p>`;
      return;
    }

    import('./narrative.js').then(({ narrative }) => narrative.build(p.lat, p.lon, ko))
      .then(n => {
        if (!n) {
          box.innerHTML = `<p class="wx-narr-load">${ko
            ? '지금 값을 받지 못했습니다.' : 'Could not load.'}</p>`;
          return;
        }
        const md = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        /* 평년 대비를 막대로 — ⚠️ 숫자만 쓰면 "상위 8%"가 얼마나 드문지 안 와닿는다 */
        const bar = r => !r.p ? '' :
          `<span class="wx-pb"><i style="left:${Math.max(2, Math.min(98, r.p))}%"></i></span>`
          + `<em>${r.p >= 50 ? (ko ? `상위 ${100 - r.p}%` : `top ${100 - r.p}%`)
                             : (ko ? `하위 ${r.p}%` : `bottom ${r.p}%`)}</em>`;

        box.innerHTML = `
          <div class="wx-narr-head ${n.level}">
            <p class="h">${md(n.head)}</p>
            ${n.num ? `<p class="n">${esc(n.num)}</p>` : ''}
          </div>
          <button class="wx-narr-more" data-wx-more>${ko ? '근거 보기' : 'Why'}</button>
          <div class="wx-narr-body" hidden>
            ${n.why ? `<p class="wx-why">${esc(n.why)}</p>` : ''}
            ${n.rows.length ? `<ul class="wx-narr-rows">${n.rows.map(r => `
              <li><i>${esc(r.k)}</i><b>${esc(r.v)}</b>${bar(r)}</li>`).join('')}</ul>` : ''}
            ${n.feelN >= 2 ? `
              <div class="wx-feel">
                <b>${ko ? `체감온도 — 공식 ${n.feelN}개 중 ${n.feelHot}개가 폭염 단계`
                        : `Feels-like — ${n.feelHot}/${n.feelN} in heat range`}</b>
                <p>${['kma', 'nws', 'hx'].filter(k => n.feel[k] != null).map(k =>
                  `${({ kma: '기상청', nws: 'NWS 지수', hx: 'Humidex' })[k]} ${n.feel[k]}`)
                  .join(' · ')}</p>
                <p class="wx-feel-warn">⚠️ ${ko
                  ? '공식마다 단위와 가정이 다릅니다 — 숫자를 같은 자로 비교하지 마세요. '
                    + '단계로만 견줍니다.'
                  : 'Different units and assumptions — compare levels, not numbers.'}</p>
              </div>` : ''}
            <div class="wx-narr-src">
              ${n.caveats.map(c => `<p>${esc(c)}</p>`).join('')}
              ${n.sources.map(sname => `<p class="s">${esc(sname)}</p>`).join('')}
            </div>
          </div>`;
        box.querySelector('[data-wx-more]')?.addEventListener('click', (e) => {
          const b = box.querySelector('.wx-narr-body');
          const on = b.hasAttribute('hidden');
          if (on) b.removeAttribute('hidden'); else b.setAttribute('hidden', '');
          e.target.textContent = on ? (ko ? '접기' : 'Hide') : (ko ? '근거 보기' : 'Why');
        });
      })
      .catch(err => {
        box.innerHTML = `<p class="wx-narr-load">${ko ? '오늘 상태를 내지 못했습니다.'
          : 'Could not build.'}<br><small>${esc(err.message)}</small></p>`;
      });

    // 지금 어디 기준인지 — 이건 지금도 정직하게 말할 수 있다
    const st = myLocation.state;
    body.appendChild(el('div', 'wx-where', ko
      ? (st === 'ok'
          ? `기준 위치: 내 위치 (${chrome.place.lat.toFixed(3)}, ${chrome.place.lon.toFixed(3)})`
          : `기준 위치: 기본값 ${chrome.place.name} — 위치 권한이 없어 내 자리를 모릅니다`)
      : (st === 'ok'
          ? `Based on your location (${chrome.place.lat.toFixed(3)}, ${chrome.place.lon.toFixed(3)})`
          : `Based on a default location — location permission not granted`)));
  },
};

/** '202608020500' → '8/2 05시' — 언제 발표된 예보인지 밝힌다 */
function fmtBase(s) {
  const t = String(s || '');
  if (t.length < 12) return t;
  return `${+t.slice(4, 6)}/${+t.slice(6, 8)} ${t.slice(8, 10)}시`;
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
