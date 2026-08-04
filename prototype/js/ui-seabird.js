// 바닷새 — 우리 바다에서 실제로 센 기록
//
// 받은 요청: "데이터 보고 관련 메뉴 만들어주고"
//
// ⚠️ 이용허락범위 **제한 없음**이다. 바다거북(제4유형)과 다르다 —
//    가공해도 되고 분석 문장을 만들어도 된다. 출처만 밝힌다.
//
// ⚠️⚠️ **이건 "지금 새가 있는 곳"이 아니다.** 조사한 해에 그 자리에서 센 기록이다.
//    그리고 **조사하지 않은 곳에 새가 없다는 뜻도 아니다.**
//    정점 72곳뿐이라, 빈 바다는 "안 갔다"는 뜻이지 "없다"가 아니다.
//    이 두 문장을 화면 맨 위에 적는다. 안 적으면 지도가 거짓말을 한다.

import { i18n } from './i18n.js';
import { API } from '../js/config.js';
import { viewer } from './viewer.js';
import { power } from './power.js';

const $ = (s) => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = (v) => Number(v || 0).toLocaleString('ko-KR');

/* 멸종위기 등급. ⚠️ Lambda 가 근거(몇 줄 중 몇 줄)를 같이 보낸다 —
   임계값은 우리가 정한 것이라 화면에서 밝힐 수 있게 해 둔 것이다. */
const GRADE = {
  '1': { ko: '멸종위기 I급', en: 'Endangered I', c: '#ff6b6b' },
  '2': { ko: '멸종위기 II급', en: 'Endangered II', c: '#f0a878' },
};

let _data = null;

async function load() {
  if (_data) return _data;
  const r = await fetch(`${API.EVENTS}/seabird.json`, { cache: 'no-cache' });
  if (!r.ok) throw new Error('seabird ' + r.status);   // ⚠️ S3 는 없는 객체에 403 을 준다
  _data = await r.json();
  return _data;
}

export const seabirdPanel = {
  _ents: [],
  _spc: null,        // 고른 종 (null = 전체 정점)

  async open() {
    document.querySelectorAll('.sheet-panel.up').forEach((p) => p.classList.remove('up'));
    $('#seabirdSheet')?.classList.add('up');
    const body = $('#seabirdBody');
    const ko = i18n.lang === 'ko';
    if (body) body.innerHTML = `<p class="kr-note">${ko ? '불러오는 중…' : 'Loading…'}</p>`;
    try {
      await load();
      this.render();
      this.draw();
    } catch (e) {
      if (body) body.innerHTML = `<p class="kr-note">${ko
        ? '자료를 불러오지 못했습니다' : 'Could not load'} — ${esc(e.message)}</p>`;
    }
  },

  close() { $('#seabirdSheet')?.classList.remove('up'); this.clear(); },

  render() {
    const body = $('#seabirdBody');
    if (!body || !_data) return;
    const ko = i18n.lang === 'ko';
    body.innerHTML = '';

    const yrs = _data.years || [];
    const from = yrs.length ? yrs[0][0] : '';
    const to = yrs.length ? yrs[yrs.length - 1][0] : '';

    /* ── ⚠️ 맨 위: 이게 무엇이 **아닌지** ───────────────────── */
    body.appendChild(el('div', 'sb-warn',
      `<b>${ko ? '⚠️ 지금 있는 새가 아닙니다' : '⚠️ Not live positions'}</b>`
      + `<p>${ko
        ? `조사하러 나간 해에 <b>그 자리에서 센 숫자</b>입니다. `
          + `${esc(from)}~${esc(to)}년 자료라 지금 거기 있다는 뜻이 아닙니다.<br>`
          + `<b>⚠️ 빈 바다는 "새가 없다"가 아니라 "조사를 안 했다"는 뜻입니다.</b> `
          + `정점이 ${(_data.stations || []).length}곳뿐입니다.`
        : `Counts made at survey stations in the survey year (${esc(from)}–${esc(to)}). `
          + `Empty sea means "not surveyed", not "no birds".`}</p>`));

    // 한눈에
    const sum = el('div', 'sb-sum');
    [[n0(_data.records), ko ? '관측 기록' : 'records'],
     [n0(_data.speciesCount), ko ? '종' : 'species'],
     [n0((_data.stations || []).length), ko ? '조사정점' : 'stations'],
     [`${from}–${to}`, ko ? '조사 기간' : 'period']].forEach(([v, k]) => {
      sum.appendChild(el('div', 'sb-cell', `<b>${esc(v)}</b><em>${esc(k)}</em>`));
    });
    body.appendChild(sum);

    // 9년 변화 — ⚠️ 조사 횟수로 나눈 값이다. 이유는 _years() 주석 참고.
    body.appendChild(el('p', 'sb-h', ko ? '9년 동안 어떻게 달라졌나' : 'Change over 9 years'));
    body.appendChild(this._years(_data.years, ko));
    body.appendChild(el('p', 'sb-note', ko ? esc(_data.note?.yearKo || '') : esc(_data.note?.yearEn || '')));

    const S = _data.species || [];
    const endangered = S.filter((s) => s.endangered);

    /* 멸종위기부터 보여준다. ⚠️ 흔한 새를 위에 두면 이게 안 보인다. */
    if (endangered.length) {
      body.appendChild(el('p', 'sb-h', ko
        ? `⚠️ 멸종위기 ${endangered.length}종이 이 바다에서 관측됐습니다`
        : `⚠️ ${endangered.length} endangered species recorded here`));
      body.appendChild(this._rows(endangered, ko));
    }

    body.appendChild(el('p', 'sb-h', ko ? '많이 기록된 순' : 'Most recorded'));
    body.appendChild(this._rows(S.filter((s) => !s.endangered).slice(0, 30), ko));

    /* ── 출처 ───────────────────────────────────────────── */
    body.appendChild(el('p', 'sub-legal',
      `${esc(_data.source || '')} · ${esc(_data.license || '')}<br>`
      + (ko ? esc(_data.note?.ko || '') : esc(_data.note?.en || ''))));
  },

  /** 해마다 막대 하나. `by` 는 [연도, 조사 횟수, 센 마릿수] 다.
   *
   *  ⚠️⚠️ **센 마릿수를 그대로 그리면 안 된다.** 해마다 조사를 나간 횟수가 다르다 —
   *     2016년은 1,035번, 2017년은 2,843번이다. 원값으로 그리면 2016년이 낮게 나오는데
   *     **조사 한 번당으로 보면 2016년이 가장 높다.** 정반대로 읽힌다.
   *  → 막대는 **조사 한 번당 마릿수**로 그리고, 조사 횟수는 숫자로 함께 적는다.
   *     둘 중 하나만 보여주면 어느 쪽이든 오해가 생긴다. */
  _years(by, ko) {
    const rows = (by || []).filter((r) => r[1] > 0)
      .map(([y, n, c]) => ({ y: String(y).slice(0, 4), n, c, per: c / n }));
    const wrap = el('div', 'sb-yr');
    if (!rows.length) return wrap;
    const max = Math.max(...rows.map((r) => r.per)) || 1;
    rows.forEach((r) => {
      wrap.appendChild(el('div', 'sb-yrow',
        `<i>${esc(r.y)}</i>`
        + `<u><b style="width:${(r.per / max * 100).toFixed(1)}%"></b></u>`
        + `<s>${r.per.toFixed(0)}<em>${ko ? '마리/조사' : '/survey'}</em></s>`
        + `<q>${ko ? `조사 ${n0(r.n)}번` : `${n0(r.n)} surveys`}</q>`));
    });
    return wrap;
  },

  /** 종 목록. 누르면 그 종이 나온 정점만 지도에 남긴다. */
  _rows(list, ko) {
    const wrap = el('div', 'sb-list');
    list.forEach((s) => {
      const on = this._spc === s.ko;
      const g = s.endangered && GRADE[s.endangered.grade];
      const row = el('button', 'sb-row' + (on ? ' on' : ''),
        `<span class="sb-nm"><b>${esc(ko ? s.ko : (s.sci || s.ko))}</b>`
        + (g ? `<i class="sb-g" style="--g:${g.c}">${ko ? g.ko : g.en}</i>` : '')
        + `<em>${esc(s.sci || '')}</em></span>`
        + `<span class="sb-n">${n0(s.individuals)}<u>${ko ? '마리' : ''}</u>`
        + `<em>${ko ? `정점 ${s.stations}곳` : `${s.stations} stations`}</em></span>`);
      row.onclick = () => { this._spc = on ? null : s.ko; this.render(); this.draw(); };
      wrap.appendChild(row);
      /* 고른 종은 **바로 그 자리에** 9년 변화를 편다.
         ⚠️ 화면 위쪽에 펴면 목록이 밀려서, 누른 줄이 어디 갔는지 눈이 놓친다. */
      if (on) {
        const box = el('div', 'sb-open');
        box.appendChild(this._years(s.by, ko));
        box.appendChild(el('p', 'sb-note', ko
          ? `정점 ${s.stations}곳에서 ${n0(s.records)}번 기록 · 지도를 이 종이 나온 곳으로 좁혔습니다`
          : `${n0(s.records)} records at ${s.stations} stations`));
        wrap.appendChild(box);
      }
    });
    return wrap;
  },

  /** 지도에 정점을 찍는다.
   *  ⚠️ 개체수로 크기를 바꾼다. 다만 **제곱근**을 쓴다 —
   *     53만 마리와 100 마리를 그대로 비례시키면 큰 점 하나가 화면을 덮는다. */
  draw() {
    this.clear();
    if (!_data || !window.Cesium || !viewer) return;
    const C = window.Cesium;
    const ko = i18n.lang === 'ko';
    let st = (_data.stations || []).filter((s) => s.lat != null);
    /* 종을 골랐으면 **그 종이 실제로 나온 정점만** 남긴다.
       ⚠️ 개체수는 정점 전체 합이라 그대로 쓴다 — 종별 개체수는 자료에 없다.
          여기서 나눠 추정하면 지어내는 것이다. 크기는 "그 정점이 얼마나 큰가"다. */
    if (this._spc) {
      const at = new Set((_data.species || []).find((s) => s.ko === this._spc)?.at || []);
      st = st.filter((s) => at.has(s.code));
    }
    if (!st.length) return;

    const max = Math.max(...st.map((s) => s.individuals || 0)) || 1;
    st.forEach((s) => {
      const f = Math.sqrt((s.individuals || 0) / max);          // 0~1
      const px = 8 + f * 26;
      this._ents.push(viewer.entities.add({
        position: C.Cartesian3.fromDegrees(s.lon, s.lat),
        point: {
          pixelSize: px,
          color: C.Color.fromCssColorString('#4fd0e0').withAlpha(0.34 + f * 0.4),
          outlineColor: C.Color.fromCssColorString('#9fe8f0').withAlpha(0.8),
          outlineWidth: 1.2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        description:
          `<div style="font:14px/1.7 -apple-system,sans-serif">`
          + `<b>${ko ? '조사정점' : 'Station'} ${esc(s.code)}</b><hr style="opacity:.2">`
          + `${ko ? '기록' : 'Records'} ${n0(s.records)}${ko ? '건' : ''} · `
          + `${ko ? '종' : 'species'} ${n0(s.species)}<br>`
          + `${ko ? '센 개체' : 'Individuals'} <b>${n0(s.individuals)}</b><br>`
          + `<hr style="opacity:.2"><b style="color:#f0a878">⚠️ ${ko
              ? '조사한 해에 센 숫자입니다. 지금 여기 있다는 뜻이 아닙니다.'
              : 'Counted during survey years — not current.'}</b><br>`
          + `<small style="opacity:.6">${esc(_data.source || '')}</small></div>`,
      }));
    });

    /* ⚠️⚠️⚠️ **이걸 빠뜨리면 그린 것이 화면에 안 나온다.**
       이 앱은 `requestRenderMode` — 변한 게 있을 때만 그린다(power.js).
       그런데 **선·원 도형은 한 프레임에 안 만들어진다.** 여러 프레임에 걸쳐
       조립되므로 `requestRender()` 한 번으로는 조립이 끝나기 전에 멈춘다.
       → 엔티티는 멀쩡히 있는데 화면은 비어 있다. 좌표·색·높이를 다 의심하며
         한참 헤맸다. 답은 "그릴 시간을 안 줬다"였다.
       ⚠️ 점(point)은 한 프레임에 나오기 때문에 **점만 보이고 선만 안 보인다** —
          이 증상이 나오면 여기를 먼저 볼 것. */
    power.animate(1500);
  },

  clear() {
    if (!viewer) return;
    this._ents.forEach((e) => { try { viewer.entities.remove(e); } catch (_) { } });
    this._ents = [];
  },
};
