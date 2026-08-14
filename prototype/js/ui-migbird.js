// 철새 — 우리 동네 오리가 봄에 어디로 가나
//
// ⚠️⚠️⚠️ **바다거북 같은 경로가 아니다.** 원자료는 한 줄에 출발지 하나, 도착지 하나뿐이다.
//    사이를 이은 선은 **실제로 날아간 길이 아니다.** "여기서 저기로"라는 뜻일 뿐이다.
//
// ⚠️⚠️ **도착지에 점을 찍지 않는다.** "중국 지린성"은 남한의 두 배다.
//    점을 찍으면 보는 사람은 거기 갔다고 읽는다 — 없는 정밀도를 지어내는 것이다.
//    → 도착지는 **원**으로 그린다. 원이 크다는 건 "이 안 어딘가"라는 뜻이다.
//
// ⚠️ 이용허락범위 제한 없음. 거북(제4유형)과 달리 분석해도 된다.

import { i18n } from './i18n.js';
import { API } from '../js/config.js';
import { viewer } from './viewer.js';
import { power } from './power.js';

const $ = (s) => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = (v) => Number(v || 0).toLocaleString('ko-KR');

/* 종별 색 — ⚠️ 값을 바꾸는 게 아니라 구분해 보이게 하는 것이다. */
const COL = ['#4fd0e0', '#f0a878', '#b9a7f0', '#9fd8b0', '#e0c26a', '#e08fb0', '#8fb8e0'];
const colorOf = (list, name) => COL[Math.max(0, list.indexOf(name)) % COL.length];

let _data = null;

async function load() {
  if (_data) return _data;
  const r = await fetch(`${API.EVENTS}/migbird.json`, { cache: 'no-cache' });
  if (!r.ok) throw new Error('migbird ' + r.status);
  _data = await r.json();
  return _data;
}

export const migbirdPanel = {
  _ents: [],
  _spc: null,

  async open() {
    document.querySelectorAll('.sheet-panel.up').forEach((p) => p.classList.remove('up'));
    $('#migbirdSheet')?.classList.add('up');
    const body = $('#migbirdBody');
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

  close() { $('#migbirdSheet')?.classList.remove('up'); this.clear(); },

  render() {
    const body = $('#migbirdBody');
    if (!body || !_data) return;
    const ko = i18n.lang === 'ko';
    body.innerHTML = '';
    const names = (_data.species || []).map(([n]) => n);

    body.appendChild(el('div', 'mb-warn',
      `<b>${ko ? '이동 기록 표시' : 'Movement record display'}</b>`
      + `<p>${ko
        ? '출발·도착 두 지점을 직선으로 연결 · 도착 범위는 원의 반경으로 표시'
        : 'Departure and arrival joined by a straight line · arrival extent shown as a radius'}</p>`));

    const sum = el('div', 'sb-sum');
    const yrs = _data.years || [];
    [[n0((_data.trips || []).length), ko ? '이동 기록' : 'movements'],
     [n0((_data.species || []).length), ko ? '종' : 'species'],
     [n0(new Set((_data.trips || []).map((t) => t.tag)).size), ko ? '추적기' : 'trackers'],
     [yrs.length ? `${yrs[0][0]}–${yrs[yrs.length - 1][0]}` : '', ko ? '기간' : 'period']]
      .forEach(([v, k]) => sum.appendChild(el('div', 'sb-cell', `<b>${esc(v)}</b><em>${esc(k)}</em>`)));
    body.appendChild(sum);

    // 종 — 누르면 그 종만 지도에 남는다
    body.appendChild(el('p', 'sb-h', ko ? '어떤 새가 떠났나' : 'Which birds'));
    const chips = el('div', 'tt-chips');
    const all = el('button', 'tt-chip' + (this._spc === null ? ' on' : ''),
      `${ko ? '전체' : 'All'} ${(_data.trips || []).length}`);
    all.onclick = () => { this._spc = null; this.render(); this.draw(); };
    chips.appendChild(all);
    (_data.species || []).forEach(([nm, n]) => {
      const on = this._spc === nm;
      const c = el('button', 'tt-chip' + (on ? ' on' : ''),
        `<i style="background:${colorOf(names, nm)}"></i>${esc(nm)} ${n}`);
      c.onclick = () => { this._spc = on ? null : nm; this.render(); this.draw(); };
      chips.appendChild(c);
    });
    body.appendChild(chips);

    // 어디로 갔나 — 도착지 순위
    const trips = this._trips();
    const cnt = {};
    trips.forEach((t) => { cnt[t.to] = (cnt[t.to] || 0) + 1; });
    const rank = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 14);
    body.appendChild(el('p', 'sb-h', ko ? '많이 간 곳' : 'Most common destinations'));
    const list = el('div', 'sb-list');
    const max = rank.length ? rank[0][1] : 1;
    rank.forEach(([nm, n]) => {
      list.appendChild(el('div', 'sb-yrow',
        `<i style="flex:0 0 auto;min-width:0;max-width:150px;overflow:hidden;`
        + `text-overflow:ellipsis;white-space:nowrap">${esc(nm)}</i>`
        + `<u><b style="width:${(n / max * 100).toFixed(0)}%"></b></u>`
        + `<s style="flex:0 0 34px">${n}</s>`));
    });
    body.appendChild(list);

    body.appendChild(el('p', 'sub-legal',
      `${esc(_data.source || '')} · ${esc(_data.license || '')}<br>`
      + esc(ko ? (_data.note?.ko || '') : (_data.note?.en || '')).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\n/g, '<br>')));
  },

  _trips() {
    return (_data.trips || []).filter((t) => !this._spc || t.spc === this._spc);
  },

  draw() {
    this.clear();
    if (!_data || !window.Cesium || !viewer) return;
    const C = window.Cesium;
    const ko = i18n.lang === 'ko';
    const names = (_data.species || []).map(([n]) => n);
    const trips = this._trips();
    const P = {};
    (_data.places || []).forEach((p) => { P[p.name] = p; });

    // 이 종이 실제로 쓴 곳만 그린다
    const used = new Set();
    /* ⚠️⚠️ 자리마다 **어떤 새**가 오갔는지도 센다.
       받은 지적: "철새중에 이름이 안나오는것도 있네".
       선에는 종 이름이 있었는데 **출발점·도착원에는 없었다** —
       그런데 점과 원이 선보다 훨씬 누르기 쉬워서, 눌러보면 대개
       "전북 익산 — 떠난 기록 18건" 처럼 **이름 없는 답**이 돌아왔다. */
    const spcAt = {};
    trips.forEach((t) => {
      used.add(t.from); used.add(t.to);
      (spcAt[t.from] ||= {})[t.spc] = (spcAt[t.from][t.spc] || 0) + 1;
      (spcAt[t.to] ||= {})[t.spc] = (spcAt[t.to][t.spc] || 0) + 1;
    });
    /** 그 자리에 많은 새부터 세 가지. ⚠️ 더 있으면 '외 N종'으로 밝힌다 —
        세 개만 적고 말면 나머지가 없는 것처럼 읽힌다. */
    const birdsAt = (name) => {
      const e = Object.entries(spcAt[name] || {}).sort((a, b) => b[1] - a[1]);
      if (!e.length) return '';
      const head = e.slice(0, 3).map(([nm, n]) => `${nm} ${n}`).join(' · ');
      return head + (e.length > 3 ? (ko ? ` 외 ${e.length - 3}종` : ` +${e.length - 3}`) : '');
    };

    (_data.places || []).filter((p) => used.has(p.name)).forEach((p) => {
      if (p.home) {
        /* 출발지 — 시·군 단위라 점으로 찍어도 된다(±12km) */
        this._ents.push(viewer.entities.add({
          _pick: `${p.name} — ${ko ? `여기서 떠난 기록 ${p.n}건` : `${p.n} departures`}`
            + (birdsAt(p.name) ? ` · ${birdsAt(p.name)}` : ''),
          position: C.Cartesian3.fromDegrees(p.lon, p.lat),
          point: { pixelSize: 7, color: C.Color.fromCssColorString('#ffd08a').withAlpha(0.95),
                   outlineColor: C.Color.BLACK.withAlpha(0.5), outlineWidth: 1,
                   disableDepthTestDistance: Number.POSITIVE_INFINITY },
          description: `<div style="font:14px/1.7 -apple-system,sans-serif"><b>${esc(p.name)}</b><br>`
            + `${ko ? '여기서 떠난 기록' : 'Departures'} ${p.n}${ko ? '건' : ''}</div>`,
        }));
      } else {
        /* ⚠️⚠️ 도착지는 **원**이다. 반경이 곧 "얼마나 모르는가"다. */
        this._ents.push(viewer.entities.add({
          /* ⚠️ 반경을 반드시 같이 말한다. 원 이름만 읽으면 '거기 갔다'로 들린다. */
          _pick: (ko
            ? `${p.name} — 도착 ${p.n}건`
            : `${p.name} — ${p.n} arrivals`)
            + (birdsAt(p.name) ? ` · ${birdsAt(p.name)}` : '')
            + (ko ? ` · 범위 반경 약 ${p.r}km` : ` · radius ~${p.r} km`),
          position: C.Cartesian3.fromDegrees(p.lon, p.lat),
          ellipse: {
            semiMajorAxis: p.r * 1000, semiMinorAxis: p.r * 1000,
            /* ⚠️ 채움을 0.11 로 뒀더니 **밝은 지구 위에서 아예 안 보였다.**
               윤곽 위주로 하되 채움도 눈에 걸릴 만큼은 준다. */
            material: C.Color.fromCssColorString('#4fd0e0').withAlpha(0.14),
            outline: true, outlineColor: C.Color.fromCssColorString('#7fe4f0').withAlpha(0.55),
            outlineWidth: 1,
            /* ⚠️⚠️⚠️ **`CLAMP_TO_GROUND` 를 쓰지 않는다.** 받은 신고: "발열이 생겨".
               지형에 붙이는 도형(ground primitive)은 **지형 모양에 맞춰 다시 계산**되므로
               폰에서 가장 비싸다. 원 59개를 그렇게 그리면 손에서 열이 난다.
               ⚠️ 예전에 `height:0` 으로 뒀을 때 안 보였던 건 지구에 묻혀서가 아니라
                  **그릴 시간을 안 줘서**였다(power.animate 로 따로 고쳤다).
                  원인을 잘못 짚고 비싼 쪽으로 바꿨던 것이다 — 되돌린다.
               ⚠️ 이건 대략의 영역 표시지 지형에 딱 맞아야 하는 그림이 아니다. */
            height: 0,
          },
          description: `<div style="font:14px/1.7 -apple-system,sans-serif"><b>${esc(p.name)}</b><br>`
            + `${ko ? '도착 기록' : 'Arrivals'} ${p.n}${ko ? '건' : ''}<hr style="opacity:.2">`
            + `<b>${ko ? `도착 범위 · 반경 약 ${p.r}km` : `Arrival extent · radius ~${p.r} km`}</b></div>`,
        }));
      }
    });

    /* 이동 — ⚠️ 곡선은 보기 쉬우라고 그은 것이다. 실제 경로가 아니다. */
    trips.forEach((t) => {
      const a = P[t.from], b = P[t.to];
      if (!a || !b) return;
      const col = C.Color.fromCssColorString(colorOf(names, t.spc));
      this._ents.push(viewer.entities.add({
        /* 받은 요청: "새 선을 누르면 어떤 새인지 나오게 해줘" */
        _pick: ko
          ? `🦆 ${t.spc} · ${t.from} → ${t.to} · ${t.on} 떠남 (추적기 ${t.tag})`
          : `${t.spc} · ${t.from} → ${t.to} · left ${t.on}`,
        polyline: {
          /* ⚠️⚠️ 양 끝을 높이 0 으로 두면 **지구에 묻혀 안 보인다.**
             가운데만 260km 올렸더니 그래도 화면에 아무것도 안 나왔다.
             → 양 끝도 띄운다. 이 선은 실제로 날아간 길이 아니라
               "여기서 저기로"를 잇는 표시이므로 띄워도 뜻이 달라지지 않는다. */
          positions: C.Cartesian3.fromDegreesArrayHeights(
            [a.lon, a.lat, 20000,
             (a.lon + b.lon) / 2, (a.lat + b.lat) / 2, 260000,
             b.lon, b.lat, 20000]),
          /* ⚠️⚠️ **PolylineGlowMaterialProperty 를 쓰지 않는다.**
             글로우는 색을 선 폭에 걸쳐 퍼뜨리는 재질이라 **폭이 좁으면 사라진다.**
             width 1.6 + glow 로 그렸더니 179개가 화면에 하나도 안 나왔다.
             엔티티는 멀쩡히 있는데 안 보여서 가려진 줄 알고 한참 헤맸다.
          ⚠️ 그리고 179개를 진하게 그으면 한국 위가 실뭉치가 된다.
             전체일 때는 흐리게, 종을 고르면 진하게. */
          /* ⚠️ 굵기 1.2 · 투명도 0.26 으로 뒀더니 **어두운 바탕에서 안 보였다.**
             선이 179개나 있는데 화면이 비어 있어서 좌표가 틀린 줄 알고 한참 팠다.
             재보니 좌표도 높이도 멀쩡했다 — **눈에 안 띄는 값이었을 뿐이다.**
             화면은 위성 구름(거의 검정)일 때가 많다. 그 위에서 보이는 값으로 잡는다. */
          width: this._spc ? 2.6 : 1.8,
          material: col.withAlpha(this._spc ? 0.9 : 0.5),
          arcType: C.ArcType.NONE,
        },
        description: `<div style="font:14px/1.7 -apple-system,sans-serif">`
          + `<b>${esc(t.spc)}</b> <small style="opacity:.6">${esc(t.tag)}</small><hr style="opacity:.2">`
          + `${esc(t.from)} → ${esc(t.to)}<br>${ko ? '떠난 날' : 'Left'} ${esc(t.on)} (${esc(t.yr)})`
          + `<hr style="opacity:.2"><b>${ko ? '출발·도착 직선 연결' : 'Straight line between departure and arrival'}</b></div>`,
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
    /* ⚠️ 1500 → 700. 도형이 만들어지는 데는 이만큼이면 넉넉하고,
       길게 잡을수록 폰이 그만큼 더 오래 그린다(= 발열). */
    power.animate(700);
  },

  clear() {
    if (!viewer) return;
    this._ents.forEach((e) => { try { viewer.entities.remove(e); } catch (_) { } });
    this._ents = [];
  },
};
