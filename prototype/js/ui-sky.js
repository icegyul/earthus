// 하늘 패널 — 태양 활동 · 일식/월식 · 유성우
//
// 세 가지를 한 화면에 두는 이유
//   전부 "지구 밖을 올려다보는" 이야기다. 태양이 어떤 상태인지 보고,
//   오늘 밤 무엇을 볼 수 있는지 알고, 다음 큰 사건이 언제인지 안다.
//   레이어 토글로는 표현할 수 없는 것들이라 패널로 묶었다.
//
// ⚠️ 확실하지 않은 것을 확실한 것처럼 쓰지 않는다.
//    · 유성우 예상 개수는 "대략"이라고 명시한다 (ZHR 은 이상 조건 기준이다)
//    · 일식의 지방 상황은 계산하지 않고 NASA 지도로 넘긴다
//    · 태양 플레어와 오로라의 인과를 우리가 단정하지 않는다

import { i18n } from './i18n.js';
import { solar } from './layers/solar.js';
import { myLocation } from './mylocation.js';
import {
  upcomingEclipses, upcomingShowers, viewing, moonPhase, moonPhaseName,
  ECLIPSE_TYPE, LUNAR_TYPE, nasaLink,
} from './sky.js';

const $ = s => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };

/** UTC 시각을 기기 표준시로 — 사용자는 자기 시계로 생각한다 */
function local(d, withTime = true) {
  const o = { year: 'numeric', month: 'short', day: 'numeric' };
  if (withTime) { o.hour = '2-digit'; o.minute = '2-digit'; }
  return new Intl.DateTimeFormat(i18n.lang === 'ko' ? 'ko-KR' : 'en-US', o).format(d);
}

function daysUntil(d) {
  return Math.round((d.getTime() - Date.now()) / 86400e3);
}

export const skyPanel = {
  init() {
    const box = $('#skySheet');
    if (!box) return this;
    i18n.onChange(() => { if (box.classList.contains('up')) this.render(); });
    return this;
  },

  async open() {
    const box = $('#skySheet');
    box.classList.add('up');
    this.render();
    // 태양 데이터는 열 때 받아온다 (항상 폴링할 이유가 없다)
    try { await solar.refresh(); } catch (e) { console.warn('[solar]', e.message); }
    if (box.classList.contains('up')) this.render();
  },

  render() {
    const ko = i18n.lang === 'ko';
    const body = $('#skyBody');
    if (!body) return;
    body.innerHTML = '';
    $('#skyTitle').textContent = ko ? '하늘' : 'Sky';

    body.append(this.sunBlock(ko), this.showerBlock(ko), this.eclipseBlock(ko));
  },

  /* ── 태양 ─────────────────────────────────────────────────── */
  sunBlock(ko) {
    const wrap = el('section', 'sky-sec');
    wrap.appendChild(el('h4', null, ko ? '태양' : 'The Sun'));

    if (!solar.meta) {
      wrap.appendChild(el('p', 'sky-dim', ko ? '불러오는 중…' : 'Loading…'));
      return wrap;
    }
    const d = solar.detail();

    const row = el('div', 'sun-row');
    const img = el('img', 'sun-img');
    img.src = d.image;
    img.alt = ko ? '태양 최신 영상 (SDO AIA 193Å)' : 'Latest Sun image (SDO AIA 193Å)';
    img.loading = 'lazy';
    row.appendChild(img);

    const info = el('div', 'sun-info');
    const badge = el('span', 'sun-badge', solar.meta.flareClass || '—');
    badge.style.borderColor = solar.color();
    badge.style.color = solar.color();
    info.appendChild(badge);

    const dl = el('dl', 'sky-rows');
    Object.entries(d.rows).forEach(([k, v]) => {
      dl.appendChild(el('dt', null, k));
      dl.appendChild(el('dd', null, v));
    });
    info.appendChild(dl);
    row.appendChild(info);
    wrap.appendChild(row);

    wrap.appendChild(el('p', 'sky-note', ko
      ? '태양 영상은 NASA SDO 의 193Å 극자외선 관측입니다. 플레어가 났다고 반드시 오로라가 보이는 것은 아닙니다 — 태양풍이 지구에 닿기까지 1~3일이 걸리고 방향에 따라 비껴가기도 합니다. 예보는 NOAA SWPC 를 보세요.'
      : 'Image: NASA SDO 193Å extreme-UV. A flare does not guarantee aurora — the solar wind takes 1–3 days to arrive and may miss Earth entirely. See NOAA SWPC for forecasts.'));
    const a = el('a', 'sky-link', ko ? 'NOAA 우주기상 예보 ↗' : 'NOAA space weather forecast ↗');
    a.href = 'https://www.swpc.noaa.gov/products/aurora-30-minute-forecast';
    a.target = '_blank'; a.rel = 'noopener';
    wrap.appendChild(a);
    return wrap;
  },

  /* ── 유성우 ───────────────────────────────────────────────── */
  showerBlock(ko) {
    const wrap = el('section', 'sky-sec');
    wrap.appendChild(el('h4', null, ko ? '유성우' : 'Meteor showers'));

    const c = myLocation.coords;
    if (!c) {
      wrap.appendChild(el('p', 'sky-dim', ko
        ? '내 위치를 켜면 이 자리에서 몇 개나 볼 수 있는지 계산해 드립니다.'
        : 'Enable location to see how many are visible from where you are.'));
    }

    const mp = moonPhase();
    wrap.appendChild(el('p', 'sky-dim', ko
      ? `오늘 달: ${moonPhaseName(mp.elong, true)} · 밝은 면 ${Math.round(mp.illum * 100)}%`
      : `Moon tonight: ${moonPhaseName(mp.elong, false)} · ${Math.round(mp.illum * 100)}% lit`));

    upcomingShowers(new Date(), 4).forEach(s => {
      const card = el('div', 'sky-card' + (s.active ? ' live' : ''));
      const dn = daysUntil(s.at);

      const head = el('div', 'sc-head');
      head.appendChild(el('b', null, ko ? s.ko : s.en));
      head.appendChild(el('span', 'sc-when',
        dn <= 0 ? (ko ? '오늘 밤 극대' : 'Peaks tonight')
        : dn === 1 ? (ko ? '내일 극대' : 'Peaks tomorrow')
        : (ko ? `${dn}일 뒤` : `in ${dn} days`)));
      card.appendChild(head);

      const dl = el('dl', 'sky-rows');
      const add = (k, v) => { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); };
      add(ko ? '극대' : 'Peak', local(s.at, false));

      if (c) {
        const v = viewing(s, c.lat, c.lon, s.at);
        if (!v) {
          add(ko ? '내 위치에서' : 'From your location',
              ko ? '유성이 뻗어 나오는 자리가 지평선 위로 안 올라옵니다' : 'Radiant never rises');
        } else {
          add(ko ? '가장 좋은 때' : 'Best time', local(v.best));
          add(ko ? '유성이 뻗어 나오는 자리' : 'Radiant altitude',
              ko ? `하늘 ${v.alt.toFixed(0)}° 높이` : `${v.alt.toFixed(0)}°`);
          add(ko ? '예상' : 'Expected',
              ko ? `시간당 대략 ${v.rate}개` : `roughly ${v.rate}/hour`);
          if (v.moonAlt > 0 && v.illum > 0.4) {
            add(ko ? '달 방해' : 'Moon',
                ko ? `떠 있음 (${Math.round(v.illum * 100)}%) — 어두운 유성은 묻힙니다`
                   : `up (${Math.round(v.illum * 100)}% lit) — faint meteors washed out`);
          }
        }
      } else {
        add('ZHR', `${s.zhr}`);
      }
      add(ko ? '기원' : 'Parent body', s.body);
      card.appendChild(dl);
      wrap.appendChild(card);
    });

    wrap.appendChild(el('p', 'sky-note', ko
      ? '유성우는 하늘 한 지점에서 사방으로 뻗어 나오는 것처럼 보입니다. 그 자리가 높이 떠 있을수록 많이 보입니다. '
      + '예상 개수는 그 높이와 달빛을 함께 따진 어림값입니다. '
      + '⚠️ ZHR 은 「구름 한 점 없고 불빛도 없는 하늘에서, 그 자리가 바로 머리 위에 있을 때」의 개수라 '
      + '실제 도시에서는 이보다 훨씬 적게 보입니다. 자료: 국제유성기구(IMO) 유성우 달력.'
      : 'Expected counts are estimates from radiant altitude and moonlight. ZHR assumes a perfectly dark sky with the radiant overhead, so city skies show far fewer. Source: IMO meteor shower calendar.'));
    return wrap;
  },

  /* ── 일식·월식 ────────────────────────────────────────────── */
  eclipseBlock(ko) {
    const wrap = el('section', 'sky-sec');
    wrap.appendChild(el('h4', null, ko ? '일식 · 월식' : 'Eclipses'));

    upcomingEclipses(Date.now(), 5).forEach(e => {
      const at = new Date(e.date);
      const dn = daysUntil(at);
      const T = e.kind === 'solar' ? ECLIPSE_TYPE[e.type] : LUNAR_TYPE[e.type];
      const card = el('div', 'sky-card');

      const head = el('div', 'sc-head');
      const b = el('b', null, ko ? T.ko : T.en + (e.kind === 'solar' ? ' solar' : ''));
      if (e.kind === 'solar') b.style.color = T.color;
      head.appendChild(b);
      head.appendChild(el('span', 'sc-when', dn <= 0
        ? (ko ? '오늘' : 'today')
        : dn < 60 ? (ko ? `${dn}일 뒤` : `in ${dn} days`)
        : (ko ? `${Math.round(dn / 30)}개월 뒤` : `in ${Math.round(dn / 30)} months`)));
      card.appendChild(head);

      const dl = el('dl', 'sky-rows');
      const add = (k, v) => { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); };
      add(ko ? '식심(최대) 시각' : 'Greatest eclipse', local(at));
      if (e.kind === 'solar') {
        add(ko ? '식분' : 'Magnitude', e.mag.toFixed(3));
        if (e.dur) add(ko ? '최대 지속' : 'Max duration', e.dur);
        if (e.width) add(ko ? '중심대 폭' : 'Path width', `${e.width} km`);
        if (e.central) add(ko ? '개기/금환 지역' : 'Central path', e.central);
        add(ko ? '부분식 지역' : 'Partial from', e.see);
      } else {
        if (e.mag > 0) add(ko ? '본영 식분' : 'Umbral magnitude', e.mag.toFixed(3));
        if (e.tot) add(ko ? '개기 지속' : 'Totality', e.tot);
        else if (e.par) add(ko ? '부분식 지속' : 'Partial phase', e.par);
        add(ko ? '보이는 지역' : 'Visible from', e.see);
      }
      card.appendChild(dl);

      const a = el('a', 'sky-link', ko ? 'NASA 상세 지도 ↗' : 'NASA detail map ↗');
      a.href = nasaLink(e); a.target = '_blank'; a.rel = 'noopener';
      card.appendChild(a);
      wrap.appendChild(card);
    });

    wrap.appendChild(el('p', 'sky-note', ko
      ? '내 위치에서 몇 시에 어떻게 보이는지는 이 앱이 계산하지 않습니다. 지방 상황은 정밀 계산이 필요해, 잘못 안내하면 헛걸음하게 됩니다 — NASA 지도에서 확인하세요. 자료: NASA GSFC 5천년 일·월식 목록(Espenak & Meeus).'
      : 'Local circumstances are not computed here — getting them wrong would send you to the wrong place at the wrong time. Check the NASA map. Source: NASA GSFC Five Millennium Canon (Espenak & Meeus).'));

    wrap.appendChild(el('p', 'sky-warn', ko
      ? '⚠️ 일식은 맨눈이나 일반 선글라스로 보면 안 됩니다. 부분식 단계에서는 반드시 인증된 일식 안경(ISO 12312-2)을 쓰세요.'
      : '⚠️ Never look at a partial solar eclipse without certified eclipse glasses (ISO 12312-2). Sunglasses are not enough.'));
    return wrap;
  },
};
