/* 낚시 — 물때와 안전 (1.0 ui-fishing.js 의 v2-three 이식)
 *
 * ⚠️⚠️ 서핑 화면과 **묻는 것이 다르다.**
 *      서핑: "이 스웰이 이 해변에 들어오는가" → 방위·주기가 절반이다
 *      낚시: "물이 얼마나 움직이는가 / 지금 나가면 위험한가"
 *
 * ⚠️⚠️ **안전을 맨 위에 둔다.** 갯바위·방파제에서 해마다 사람이 죽고, 원인은 대부분 너울이다.
 * ⚠️⚠️ **"잘 나옵니다"라고 말하지 않는다.** 조황은 우리가 아는 값이 아니다.
 *      무슨 고기가 나오는지는 **말하지 않는다.** (fishing.js 머리말)
 *
 * 자료·판정은 1.0 fishing.js(지점 946+63, safety/FISH_RULES) 를 빌린다.
 * 부이·이안류 문장은 서핑과 **같은 문장** — hobby-sea-common.js 하나에서 온다.
 */
import {
  N_SHOW, ZOOM_KM, REGION_KM, REGION_SAMPLES, esc, cssInt, shortR, v1Common,
  anchor, center, seaContext, loadWind, windAt, labelPlan, nearestShown, fillRegions, clock,
  tabsHtml, regionTabsHtml, anchorNote, focusBtn, backBtn, deferred, buoyLine, swimWarn,
} from './hobby-sea-common.js';

const WIND_MAX_KM = 30;
/* ⚠️ 마지막 기본값은 서핑과 다르다. 낚시는 서·남해가 중심이라 동해(양양)로 보내면
   첫 화면이 엉뚱해진다. → 태안 앞바다. */
const HOME = { lat: 36.68, lon: 126.13 };

/* 종류별 핀 색. ⚠️ 색으로 "좋다/나쁘다"를 말하지 않는다 — **무엇인지**만 말한다. */
const KIND_COLOR = {
  island: '#f2a65a',      // 섬·갯바위
  breakwater: '#7fd1e8',  // 방파제
  pier: '#9fd8b0',        // 선착장
  marina: '#b9a7f0',
  harbour: '#e0d18a',     // 항·포구
};
const kindColor = (k) => KIND_COLOR[k] || '#e0d18a';

/* **굵게** 만 살린다. ⚠️ 이스케이프를 **먼저** 하고 그다음 푼다. */
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const v = (x, d = 1) => (x == null ? '—' : x.toFixed(d));

async function fill(ctx, st) {
  const { fishing } = st.v;
  const at = anchor(ctx, st, r => fishing.byRegion(r), HOME);
  st.at = at;
  const cx = await seaContext(ctx, at);
  st.buoy = cx.buoy; st.rip = cx.rip;
  st.pick = st.region ? fishing.byRegion(st.region).slice(0, N_SHOW) : fishing.near(at.lat, at.lon, N_SHOW);
  await fishing.sea(st.pick);
}

/* 권역 대표 — ⚠️ 서핑은 "가장 큰 너울"이었지만 낚시는 **조차**다. 묻는 것이 다르기 때문이다. */
async function regions(st) {
  return fillRegions(st, st.v.fishing, () => true, (seas) => {
    const tr = seas.map(s => s.tide?.rangeM).filter(x => x != null);
    const sw = seas.map(s => s.swellH).filter(x => x != null);
    const sst = seas.map(s => s.sst).filter(x => x != null);
    return { range: tr.length ? Math.max(...tr) : null,
             swell: sw.length ? Math.max(...sw) : null,
             sst: sst.length ? sst.reduce((a, b) => a + b, 0) / sst.length : null };
  });
}

export default {
  key: 'hobby/fishing',
  title: '낚시',
  badge: 'MODEL',

  async load(ctx, st) {
    const [{ fishing, safety, FISH_RULES }, common] = await Promise.all([ctx.v1('fishing.js'), v1Common(ctx)]);
    st.v = { fishing, safety, FISH_RULES, korea: common.korea, coast: common.coast };
    st.tab = st.tab || 'near'; st.region = st.region || null; st.focus = null;
    await fishing.load();
    st.wind = await loadWind(ctx);
    await fill(ctx, st);
    let altKm = Infinity; try { altKm = ctx.cam().altKm; } catch (_) { }
    const c = center(st.pick) || st.at;
    st.point = (altKm >= REGION_KM || st.at.from === 'region') ? { lat: c.lat, lon: c.lon, altKm: ZOOM_KM } : null;
    st.mode = 'spot';
  },

  build(ctx, st) {
    const { fishing, FISH_RULES } = st.v;
    if (st.mode === 'region' && st.regions?.length) {
      const rows = st.regions;
      ctx.add(ctx.makePoints(rows.map(r => ({ lat: r.lat, lon: r.lon, c: cssInt(kindColor('harbour')) })), { size: 9 }));
      rows.forEach(r => {
        const bits = [];
        if (r.range != null) bits.push(`조차 ${r.range.toFixed(1)}m`);
        if (r.swell != null) bits.push(`너울 ${r.swell.toFixed(1)}m`);
        const danger = r.swell != null && r.swell >= FISH_RULES.swellDangerM;
        ctx.add(ctx.placeLabel(ctx.makeLabel(shortR(r.region) + (bits.length ? '  ' + bits.join(' · ') : ''),
          danger ? '#fca5a5' : '#cfe0ee'), r.lat, r.lon));
      });
      return;
    }
    const list = st.pick || [];
    if (!list.length) return;
    ctx.add(ctx.makePoints(list.map(s => ({ lat: s.lat, lon: s.lon, c: cssInt(kindColor(s.kind)) })), { size: 8 }));
    /* 지구에는 **물때와 너울**만 올린다 — 낚시에서 먼저 알아야 할 둘이다. ⚠️ 라벨은 짧게. */
    labelPlan(ctx, list, st.focus ? 12 : 6).forEach(s => {
      const sea = fishing._sea.get(s.name) || null;
      const bits = [];
      if (sea?.tide?.rangeM != null) bits.push(`${sea.tide.rangeM.toFixed(1)}m`);
      if (sea?.swellH != null && sea.swellH >= 0.5) bits.push(`너울 ${sea.swellH.toFixed(1)}`);
      /* ⚠️ 위험한 곳만 붉게 한다. 색으로 말하는 유일한 것이 안전이다. */
      const danger = sea?.swellH != null && sea.swellH >= FISH_RULES.swellDangerM;
      const col = s.name === st.focus ? '#ffffff' : danger ? '#fca5a5' : '#cfe0ee';
      ctx.add(ctx.placeLabel(ctx.makeLabel(s.name + (bits.length ? '  ' + bits.join(' · ') : ''), col), s.lat, s.lon));
    });
  },

  update(ctx, st, camera, altKm) {
    const mode = altKm > REGION_KM ? 'region' : 'spot';
    if (mode === st.mode) return;
    st.mode = mode;
    if (mode === 'region' && !st.regions) {
      regions(st).then(() => { if (st.mode === 'region') { ctx.rebuild(); ctx.refresh(); } })
        .catch(e => console.warn('[낚시] 권역 표시 실패 —', e.message));
      return;
    }
    ctx.rebuild(); ctx.refresh();
  },

  card(ctx, st) {
    const ko = ctx.ko;
    const { fishing } = st.v;
    const m = fishing.meta || {};
    if (st.focus) {
      const s = (st.pick || []).find(x => x.name === st.focus);
      if (s) return backBtn(ko) + buoyLine(st.buoy, ko) + swimWarn(ko, st.rip, st.v.coast)
        + `<div class="mt-list">${this._card(st, s, ko)}</div>` + this._foot(st, ko);
      st.focus = null;
    }
    const head = tabsHtml(ko, st.tab);
    if (st.tab === 'how') return head + this._how(st, ko);
    const rows = fishing.regions().map(r => ({ key: r, label: shortR(r), n: fishing.byRegion(r).length }))
      .filter(r => r.n);
    const list = st.pick || [];
    return head + regionTabsHtml(ko, st, rows)
      + `<p class="mt-times">${ko
        ? anchorNote(ko, st.at?.from, '태안') + `방파제·항·섬 ${m.count}곳 · 바다 자료 Open-Meteo 해양`
        : `${m.count} spots · sea data from Open-Meteo Marine`}</p>`
      + buoyLine(st.buoy, ko) + swimWarn(ko, st.rip, st.v.coast)
      + (st.mode === 'region' ? this._regionList(st, ko) : '')
      + `<div class="mt-list">${list.map(s => this._card(st, s, ko)).join('')}</div>`
      + this._foot(st, ko);
  },

  _regionList(st, ko) {
    const rows = (st.regions || []).slice().sort((a, b) => (b.range ?? -1) - (a.range ?? -1));
    if (!rows.length) return '';
    return `<div class="sf-rglist">
      <p class="sf-rghead">${ko
        ? `바다별 <b>오늘 조차</b> · 권역마다 ${REGION_SAMPLES}곳을 재서 낸 값입니다`
        : `Today's tidal range by sea · ${REGION_SAMPLES} sample points each`}</p>
      ${rows.map((r, i) => `<button class="sf-rg${i === 0 && r.range != null ? ' top' : ''}"
          data-action="ext:region" data-region="${esc(r.region)}">
        <b>${esc(shortR(r.region))}</b>
        <span class="n">${r.range == null ? '—' : r.range.toFixed(1) + 'm'}</span>
        <em>${r.swell == null ? '' : '너울 ' + r.swell.toFixed(1) + 'm'}</em></button>`).join('')}
      <p class="sf-rgnote">${ko
        ? `권역별 ${REGION_SAMPLES}개 표본 · 바다 선택 시 지점별 표시`
        : `${REGION_SAMPLES} samples per region · select a sea for point detail`}</p>
    </div>`;
  },

  /* 지점 한 장 — 1.0 _card 그대로. 안전 → 물때 → 너울·수온·물살 순서를 바꾸지 않는다. */
  _card(st, s, ko) {
    const { fishing, safety } = st.v;
    const sea = fishing._sea.get(s.name) || null;
    const wind = windAt(st.v.korea, st.wind, s.lat, s.lon, WIND_MAX_KM, false);
    /* ⚠️ 일본 지점은 이름을 못 읽는 쪽이 훨씬 많다. 원문을 그대로 두되 어느 쪽인지 표시한다.
       ⚠️ kindKo(방파제·선착장 구분)가 일본에는 없다 — 없는 것을 지어내지 않는다. */
    const jp = s.country === 'jp';
    const kindTxt = jp ? (ko ? '일본' : 'Japan') : esc(s.kindKo || '');
    const head = `
      <header>
        <h4>${esc(s.name)}${jp && s.nameJa && s.nameMark !== 'ja' ? ` <span class="sf-ja">${esc(s.nameJa)}</span>` : ''}</h4>
        <span class="mt-alt">${kindTxt}${s.km != null ? ` · ${s.km}km` : ''}${jp && ko && s.nameMark === 'ja' ? ' · 현지 표기' : ''}</span>
        ${focusBtn(ko, s.name)}
      </header>`;
    const open = `<article class="mt-card${s.name === st.focus ? ' sf-hit' : ''}" data-fs-spot="${esc(s.name)}">`;
    if (!sea) {
      return `${open}${head}<p class="sf-none">${ko ? '이 지점의 바다 자료가 없습니다' : 'No sea data at this point'}</p></article>`;
    }
    const sf = safety(sea, wind, s, ko);
    const t = sea.tide;
    /* ⚠️⚠️ 안전을 **맨 위**에 둔다. 아래에 두면 조차·수온을 보고 그냥 나간다. */
    const safe = `<div class="fs-safe ${sf.level}">${sf.lines.map(l => `<p>${md(l)}</p>`).join('')}</div>`;
    /* 물때 — ⚠️ 물때 번호(몇 물)는 적지 않는다. 대신 조차와 다음 만조·간조를 적는다. */
    const PHASE = { spring: ko ? '사리에 가까움' : 'near spring tide', mid: ko ? '중간' : 'mid',
                    neap: ko ? '조금에 가까움' : 'near neap tide' };
    const tide = !t ? '' : `
      <div class="fs-tide${t.matters ? '' : ' dim'}">
        <div class="fs-trow">
          <span class="k">${ko ? '오늘 조차' : "Today's range"}</span>
          <span class="n">${v(t.rangeM, 2)}<i>m</i></span>
          <span class="s">${t.phase ? PHASE[t.phase] : ''}</span>
        </div>
        ${t.next?.length ? `<p class="fs-next">${t.next.slice(0, 2).map(x =>
          `${x.kind === 'high' ? (ko ? '만조' : 'High') : (ko ? '간조' : 'Low')} <b>${clock(x.at, ko)}</b>`).join(' · ')}</p>` : ''}
        ${t.maxRangeM ? `<p class="fs-cmp">${ko
          ? `이번 ${t.days}일 중 가장 큰 날은 ${v(t.maxRangeM, 2)}m 입니다`
          : `Largest in the next ${t.days} days: ${v(t.maxRangeM, 2)} m`}</p>` : ''}
        ${!t.matters ? `<p class="fs-cmp">${ko ? '조차 작음 · 물때 영향 낮음' : 'Small tidal range · lower tide influence'}</p>` : ''}
      </div>`;
    const trio = `
      <div class="sf-trio">
        <div class="sf-cell">
          <span class="k">${ko ? '너울' : 'Swell'}</span>
          <span class="n">${v(sea.swellH)}<i>m</i></span>
          <span class="s">${sea.swellPeriod ? `${v(sea.swellPeriod, 0)}${ko ? '초' : 's'}` : ''}</span>
        </div>
        <div class="sf-cell">
          <span class="k">${ko ? '수온' : 'Sea temp'}</span>
          <span class="n">${v(sea.sst)}<i>°</i></span>
          <span class="s"></span>
        </div>
        <div class="sf-cell">
          <span class="k">${ko ? '물살' : 'Current'}</span>
          <span class="n">${v(sea.cur, 2)}<i>m/s</i></span>
          <span class="s">${wind ? `${ko ? '바람' : 'wind'} ${v(wind.speed)}m/s` : ''}</span>
        </div>
      </div>`;
    return `${open}${head}${safe}${tide}${trio}</article>`;
  },

  _how(st, ko) {
    const R = st.v.FISH_RULES;
    if (!ko) {
      return `<div class="mt-foot">
        <p>Inputs · tidal range · swell · wind · sea temperature</p>
        <p>Tide display · forecast range and next high/low water</p></div>`;
    }
    return `<div class="mt-foot">
      <p><b>표시 자료</b><br>
        ① 물이 얼마나 움직이는가 (조차)<br>
        ② 지금 나가면 위험한가 (너울·바람)<br>
        ③ 물이 얼마나 찬가 (수온)</p>
      <p>물때 · 조위 예보의 실제 조차와 다음 만조·간조 · 시간 해상도 1시간</p>
      <p><b>안전 문턱</b><br>
        너울 ${R.swellWatchM}m 이상 — 갯바위·방파제에서 조심<br>
        너울 ${R.swellDangerM}m 이상 — 올라가지 말 것<br>
        바람 ${R.windDangerMs}m/s 이상 — 배는 대부분 못 뜸</p>
      <p>현장 안전 · 발판 · 조류 · 구명조끼 확인</p>
    </div>`;
  },

  _foot(st, ko) {
    const m = st.v.fishing.meta || {};
    return `<div class="mt-foot">
      <p>${ko ? '지점 자료 OpenStreetMap (ODbL) · 바다 자료 Open-Meteo 해양 · 바람 기상청 AWS'
              : 'Spots: OpenStreetMap (ODbL) · Sea: Open-Meteo Marine · Wind: KMA AWS'}</p>
      ${m.generated ? `<p>${ko ? '자료 시각' : 'Data time'} · ${esc(m.generated)}</p>` : ''}
    </div>`;
  },

  pick(ctx, st, lat, lon) {
    const s = nearestShown(ctx, st.pick, lat, lon);
    if (!s) return null;
    return { title: s.name, badge: 'MODEL', body: `<div class="mt-list">${this._card(st, s, ctx.ko)}</div>` };
  },

  action(ctx, st, name, ds) {
    const card = () => this.card(ctx, st);
    if (name === 'tab') { st.tab = ds.tab || 'near'; st.focus = null; return { html: card(), inPlace: true }; }
    if (name === 'list') { st.focus = null; return { html: card(), inPlace: true, rebuild: true }; }
    if (name === 'focus') {
      const s = (st.pick || []).find(x => x.name === ds.id);
      if (!s) return { handled: true };
      st.focus = s.name; st.tab = 'near';
      return { html: card(), inPlace: true, point: { lat: s.lat, lon: s.lon, altKm: ZOOM_KM }, rebuild: true };
    }
    if (name === 'region') {
      st.region = ds.region || null; st.focus = null; st.mode = 'spot';
      const c = st.region ? center(st.v.fishing.byRegion(st.region)) : null;
      return deferred(ctx, st, () => fill(ctx, st), card, c ? { lat: c.lat, lon: c.lon, altKm: ZOOM_KM } : null);
    }
    if (name === 'here') {
      st.region = null; st.focus = null; st.mode = 'spot';
      return deferred(ctx, st, () => fill(ctx, st), card, null);
    }
    return null;
  },

  close(ctx, st) { st.focus = null; st.point = null; },
};
