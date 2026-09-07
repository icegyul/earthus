/* 서핑 — 이 해변에 스웰이 들어오는가 (1.0 ui-surf.js 의 v2-three 이식)
 *
 * 화면의 뼈대는 셋이다. 하나로 합치지 않는다:
 *     ① 스웰이 들어오는가   (스웰 방향 vs 해변이 보는 방향)
 *     ② 파면이 깔끔한가     (바람이 육풍인가 해풍인가)
 *     ③ 어떤 파도인가       (주기 — 잡파인가 너울인가)
 *
 * ⚠️ **점수를 만들지 않는다.** "서핑 지수 7.2점"은 근거 없이 권위를 갖는다.
 * ⚠️ **"타기 좋습니다"라고 말하지 않는다.** 바다에서는 사람이 죽는다.
 *
 * 자료·판정은 1.0 모듈을 그대로 빌린다: beaches.js(해변 271+756, Open-Meteo 해양),
 * surf.js(judge/SURF_RULES), coast.js(nearestRip), korea.js(AWS 바람).
 * 지구 위 표시와 카드 배선만 여기서 새로 쓴다. 부이·이안류 문장은 hobby-sea-common.js.
 */
import {
  N_SHOW, ZOOM_KM, REGION_KM, REGION_SAMPLES, esc, cssInt, v1Common,
  anchor, center, seaContext, loadWind, windAt, labelPlan, nearestShown, fillRegions,
  tabsHtml, regionTabsHtml, anchorNote, focusBtn, backBtn, deferred, buoyLine, swimWarn,
} from './hobby-sea-common.js';

const WIND_MAX_KM = 25;
/* ⚠️ 마지막 기본값은 양양이다 — 한국에서 서핑이 실제로 이뤄지는 곳은 동해 북부다. */
const HOME = { lat: 38.02, lon: 128.72 };

/* 판정 → 점 색. ⚠️ 색은 "스웰이 들어오는가"만 말한다. 좋다/나쁘다가 아니다. */
const JUDGE_COLOR = { direct: '#4ade80', angled: '#facc15', glancing: '#fb923c', blocked: '#f87171' };
const NO_JUDGE = '#9aa8b5';

const v = (x, d = 1) => (x == null ? '—' : x.toFixed(d));

function regionList(st, r) { return st.v.beaches.byRegion(r).filter(b => b.facing != null); }

function judgeOf(st, b, ko) {
  const sea = st.v.beaches._sea.get(b.name) || null;
  const wind = windAt(st.v.korea, st.wind, b.lat, b.lon, WIND_MAX_KM, true);
  return { sea, wind, j: st.v.judge(b, sea, wind, ko) };
}

/** 지금 보여줄 해변들의 파랑을 한 번에 받아 둔다 (1.0 _fill) */
async function fill(ctx, st) {
  const { beaches } = st.v;
  const at = anchor(ctx, st, r => regionList(st, r), HOME);
  st.at = at;
  const cx = await seaContext(ctx, at);
  st.buoy = cx.buoy; st.rip = cx.rip;
  st.pick = st.region
    ? regionList(st, st.region).slice(0, N_SHOW)
    : beaches.near(at.lat, at.lon, N_SHOW);
  await beaches.sea(st.pick);
}

async function regions(st) {
  return fillRegions(st, st.v.beaches, b => b.facing != null, (seas) => {
    /* ⚠️ 값은 **그 권역에서 가장 큰 너울**이다. 평균이 아니다 — 묻는 것이 "큰 파도가 어디냐"다. */
    const sw = seas.map(s => s.swellH).filter(x => x != null);
    const sst = seas.map(s => s.sst).filter(x => x != null);
    return { maxSwell: sw.length ? Math.max(...sw) : null,
             sst: sst.length ? sst.reduce((a, b) => a + b, 0) / sst.length : null };
  });
}

export default {
  key: 'hobby/surf',
  title: '서핑',
  badge: 'MODEL',

  async load(ctx, st) {
    const [{ beaches, shortName, shortRegion }, { judge, SURF_RULES }, common] = await Promise.all([
      ctx.v1('beaches.js'), ctx.v1('surf.js'), v1Common(ctx),
    ]);
    st.v = { beaches, shortName, shortRegion, judge, SURF_RULES, korea: common.korea, coast: common.coast };
    st.tab = st.tab || 'near'; st.region = st.region || null; st.focus = null;
    await beaches.load();
    st.wind = await loadWind(ctx);
    await fill(ctx, st);
    /* ⚠️ 이미 가까이 보고 있으면 카메라를 건드리지 않는다 — 사용자가 맞춰 둔 자리다.
       ⚠️ 기준점이 아니라 **고른 해변들의 한가운데**로 간다. */
    let altKm = Infinity; try { altKm = ctx.cam().altKm; } catch (_) { }
    const c = center(st.pick) || st.at;
    st.point = (altKm >= REGION_KM || st.at.from === 'region') ? { lat: c.lat, lon: c.lon, altKm: ZOOM_KM } : null;
    st.mode = 'beach';
  },

  build(ctx, st) {
    const ko = ctx.ko;
    if (st.mode === 'region' && st.regions?.length) {
      const rows = st.regions;
      const top = rows.reduce((a, b) => ((b.maxSwell ?? -1) > (a?.maxSwell ?? -1) ? b : a), null);
      ctx.add(ctx.makePoints(rows.map(r => ({ lat: r.lat, lon: r.lon, c: cssInt(r === top && r.maxSwell != null ? '#7fd1e8' : '#2aa8bd') })), { size: 9 }));
      rows.forEach(r => {
        const bits = [];
        if (r.maxSwell != null) bits.push(`${r.maxSwell.toFixed(1)}m`);
        if (r.sst != null) bits.push(`${r.sst.toFixed(0)}°`);
        const isTop = top && r === top && r.maxSwell != null;
        const text = st.v.shortRegion(r.region) + (bits.length ? '  ' + bits.join(' · ') : '')
          + (isTop ? (ko ? '  ← 가장 큼' : '  ← highest') : '');
        ctx.add(ctx.placeLabel(ctx.makeLabel(text, isTop ? '#e6f4f8' : '#cfe0ee'), r.lat, r.lon));
      });
      return;
    }
    const list = st.pick || [];
    if (!list.length) return;
    ctx.add(ctx.makePoints(list.map(b => {
      const { j } = judgeOf(st, b, ko);
      return { lat: b.lat, lon: b.lon, c: cssInt(j.ok ? (JUDGE_COLOR[j.exposure.key] || NO_JUDGE) : NO_JUDGE) };
    }), { size: 8 }));
    /* ⚠️ 이름표는 위에서부터, 실거리로 떨어진 곳에만. 값이 없으면 자리를 **비운다**. */
    labelPlan(ctx, list, st.focus ? 12 : 6).forEach(b => {
      const sea = st.v.beaches._sea.get(b.name) || null;
      const bits = [];
      if (sea?.swellH != null) bits.push(`${sea.swellH.toFixed(1)}m`);
      if (sea?.sst != null) bits.push(`${sea.sst.toFixed(0)}°`);
      const text = st.v.shortName(b.name) + (bits.length ? '  ' + bits.join(' · ') : '');
      ctx.add(ctx.placeLabel(ctx.makeLabel(text, b.name === st.focus ? '#ffffff' : '#cfe0ee'), b.lat, b.lon));
    });
  },

  /* 높이에 따라 **무엇을 찍을지가 다르다.** 멀리서는 "어느 바다가 큰가", 가까이서는 "이 해변이 지금 어떤가". */
  update(ctx, st, camera, altKm) {
    const mode = altKm > REGION_KM ? 'region' : 'beach';
    if (mode === st.mode) return;
    st.mode = mode;
    if (mode === 'region' && !st.regions) {
      regions(st).then(() => { if (st.mode === 'region') { ctx.rebuild(); ctx.refresh(); } })
        .catch(e => console.warn('[서핑] 권역 표시 실패 —', e.message));
      return;
    }
    ctx.rebuild(); ctx.refresh();
  },

  card(ctx, st) {
    const ko = ctx.ko;
    const { beaches, shortRegion } = st.v;
    const m = beaches.meta || {};
    if (st.focus) {
      const b = (st.pick || []).find(x => x.name === st.focus);
      if (b) return backBtn(ko) + buoyLine(st.buoy, ko) + swimWarn(ko, st.rip, st.v.coast)
        + `<div class="mt-list">${this._card(st, b, ko)}</div>` + this._foot(st, ko);
      st.focus = null;
    }
    const head = tabsHtml(ko, st.tab);
    if (st.tab === 'how') return head + this._how(st, ko);
    const rows = beaches.regions().map(r => ({ key: r, label: shortRegion(r), n: regionList(st, r).length }))
      .filter(r => r.n);
    const list = st.pick || [];
    return head + regionTabsHtml(ko, st, rows)
      + `<p class="mt-times">${ko
        ? anchorNote(ko, st.at?.from, '양양')
          + `해변 ${m.count}곳 중 바다 방향을 낸 곳 ${m.withFacing}곳 · 파랑 자료 Open-Meteo 해양`
        : `${m.withFacing} of ${m.count} beaches have a shore orientation · waves: Open-Meteo Marine`}</p>`
      + buoyLine(st.buoy, ko) + swimWarn(ko, st.rip, st.v.coast)
      + (st.mode === 'region' ? this._regionList(st, ko) : '')
      + `<div class="mt-list">${list.map(b => this._card(st, b, ko)).join('')}</div>`
      + this._foot(st, ko);
  },

  /* 멀리서 볼 때 — 어느 바다가 큰가를 먼저 말한다.
     ⚠️⚠️ **"몇 곳을 재서 낸 값"인지 반드시 적는다.** 권역 전체를 잰 것이 아니다. */
  _regionList(st, ko) {
    const rows = (st.regions || []).slice().sort((a, b) => (b.maxSwell ?? -1) - (a.maxSwell ?? -1));
    if (!rows.length) return '';
    return `<div class="sf-rglist">
      <p class="sf-rghead">${ko
        ? `바다별 <b>가장 큰 너울</b> · 권역마다 ${REGION_SAMPLES}곳을 재서 낸 값입니다`
        : `Largest swell by sea · sampled at ${REGION_SAMPLES} points per region`}</p>
      ${rows.map((r, i) => `<button class="sf-rg${i === 0 && r.maxSwell != null ? ' top' : ''}"
          data-action="ext:region" data-region="${esc(r.region)}">
        <b>${esc(st.v.shortRegion(r.region))}</b>
        <span class="n">${r.maxSwell == null ? '—' : r.maxSwell.toFixed(1) + 'm'}</span>
        <em>${r.sst == null ? '' : r.sst.toFixed(0) + '°'}</em></button>`).join('')}
      <p class="sf-rgnote">${ko
        ? `권역별 ${REGION_SAMPLES}개 표본 · 바다 선택 시 해변별 표시`
        : `${REGION_SAMPLES} samples per region · select a sea for beach detail`}</p>
    </div>`;
  },

  /* 해변 한 장 — 1.0 _card 그대로. 머리에 "지도 ▸" 만 더했다. */
  _card(st, b, ko) {
    const { shortName, shortRegion } = st.v;
    const { sea, j } = judgeOf(st, b, ko);
    const jp = b.country === 'jp';
    const markKo = { tr: '표기 변환', ja: '현지 표기', en: '영문' }[b.nameMark];
    const head = `
      <header>
        <h4>${esc(shortName(b.name))}${jp && b.nameJa && b.nameMark !== 'ja'
          ? ` <span class="sf-ja">${esc(b.nameJa)}</span>` : ''}</h4>
        <span class="mt-alt">${jp ? (ko ? '일본' : 'Japan') : esc(shortRegion(b.region))}${
          b.km != null ? ` · ${b.km}km` : ''}${markKo && ko ? ` · ${markKo}` : ''}</span>
        ${focusBtn(ko, b.name)}
      </header>${jp ? `<p class="sf-nofacing">${ko
        ? '바다 방향 자료 없음 · 파도·주기·수온 표시'
        : 'Shore orientation unavailable · waves, period and temperature shown'}</p>` : ''}`;
    const open = `<article class="mt-card${b.name === st.focus ? ' sf-hit' : ''}" data-sf-beach="${esc(b.name)}">`;

    if (!sea) {
      return `${open}${head}<p class="sf-none">${ko ? '이 지점의 파랑 자료가 없습니다'
                                : 'No wave data at this point'}</p></article>`;
    }
    /* ⚠️ **너울과 풍파를 나눠 보여준다.** 같은 1.5m 라도 너울 12초면 좋은 파도, 풍파 5초면 잡파다.
       ⚠️ 값이 없으면 '—' 로 둔다. 0 으로 채우면 "파도가 없다"로 읽힌다. */
    const trio = `
      <div class="sf-trio">
        <div class="sf-cell">
          <span class="k">${ko ? '너울' : 'Swell'}</span>
          <span class="n">${v(sea.swellH)}<i>m</i></span>
          <span class="s">${v(sea.swellPeriod, 1)}${ko ? '초' : 's'}</span>
        </div>
        <div class="sf-cell">
          <span class="k">${ko ? '파도' : 'Wind wave'}</span>
          <span class="n">${v(sea.windH)}<i>m</i></span>
          <span class="s">${sea.windPeriod ? `${v(sea.windPeriod, 1)}${ko ? '초' : 's'}` : (ko ? '없음' : 'none')}</span>
        </div>
        <div class="sf-cell">
          <span class="k">${ko ? '수온' : 'Sea temp'}</span>
          <span class="n">${v(sea.sst)}<i>°</i></span>
          <span class="s">${sea.sst == null ? '' : (ko ? suit(sea.sst) : '')}</span>
        </div>
      </div>`;
    const tide = tideLine(sea.tide, ko);
    if (!j.ok) return `${open}${head}${trio}${tide}<p class="sf-none">${esc(j.why)}</p></article>`;

    const cls = { direct: 'good', angled: 'ok', glancing: 'weak', blocked: 'bad' };
    const wcls = { offshore: 'good', cross: 'ok', onshore: 'bad' };
    return `${open}${head}${trio}${tide}
      <ul class="sf-rows">
        <li class="${cls[j.exposure.key] || ''}">
          <i>${ko ? '스웰' : 'Swell'}</i><b>${j.exposure.text}</b>
          <em>${ko ? `${j.exposure.gapDeg}° 차이` : `${j.exposure.gapDeg}° off`}</em>
        </li>
        ${j.wind ? `<li class="${wcls[j.wind.key] || ''}">
          <i>${ko ? '바람' : 'Wind'}</i><b>${j.wind.text}</b>
          <em>${j.wind.speed != null ? `${j.wind.speed.toFixed(1)} m/s` : ''}</em>
        </li>` : `<li><i>${ko ? '바람' : 'Wind'}</i>
          <b class="dim">${ko ? '가까운 관측소가 없습니다' : 'No nearby station'}</b></li>`}
        ${j.period ? `<li><i>${ko ? '주기' : 'Period'}</i><b>${j.period.text}</b>
          <em>${j.period.s.toFixed(1)}${ko ? '초' : ' s'}</em></li>` : ''}
      </ul>
    </article>`;
  },

  _how(st, ko) {
    const P = st.v.SURF_RULES.PERIOD;
    const n = st.v.beaches.meta?.withFacing ?? 0;
    return `<div class="mt-note">${ko ? `
      <b>파고는 주기와 함께 읽습니다.</b><br>
      파고 1.5m · 주기 6초 → 잡파. 파고 1.5m · 주기 14초 → 좋은 너울.
      같은 1.5m 인데 완전히 다릅니다.
      <br><br>
      <b>그리고 그 해변에 들어와야 합니다.</b> 북향 해변에 남쪽 스웰은 안 들어옵니다.
      그래서 스웰이 오는 방향과 <b>해변이 보는 방향</b>을 견줍니다 —
      전국 해변 ${n}곳의 방향을 OpenStreetMap 해안선에서 계산해 두었습니다.
      <br><br>
      <b>바람은 파면을 만들거나 부숩니다.</b> 육지에서 바다로 부는 육풍은
      파면을 세워 깔끔하게 하고, 바다에서 불어오는 해풍은 뭉갭니다.
      ` : `
      <b>Read wave height with period.</b><br>
      1.5 m at 6 s is chop; 1.5 m at 14 s is a good groundswell.
      <br><br><b>Swell direction must face the beach.</b> We compare swell direction with the
      <b>shore orientation</b> of ${n} beaches, computed from OpenStreetMap coastlines.
      <br><br><b>Wind shapes or ruins the face.</b> Offshore cleans it up; onshore blows it out.`}
      <br><br>
      <b>${ko ? '주기 표시 구간' : 'Period display bands'}</b><br>
      ${P.map(p => `· ~${p.max}s ${ko ? p.ko : p.en}`).join('<br>')}
    </div>`;
  },

  _foot(st, ko) {
    const m = st.v.beaches.meta || {};
    return `<p class="mt-foot">
      ${ko ? `표시 기준 · 파도 · 바람 · 해안선 방향<br><small>${esc(m.source || '')} · ${esc(m.license || '')} · 파랑 Open-Meteo 해양</small>`
      : `Display inputs · waves · wind · shoreline orientation<br><small>${esc(m.source || '')} · ${esc(m.license || '')}</small>`}
    </p>`;
  },

  /** 지구를 눌렀을 때 — 보이는 해변 중 25km 안의 것 */
  pick(ctx, st, lat, lon) {
    const b = nearestShown(ctx, st.pick, lat, lon);
    if (!b) return null;
    const ko = ctx.ko;
    return { title: st.v.shortName(b.name), badge: 'MODEL',
             body: `<div class="mt-list">${this._card(st, b, ko)}</div>` };
  },

  action(ctx, st, name, ds) {
    const card = () => this.card(ctx, st);
    if (name === 'tab') { st.tab = ds.tab || 'near'; st.focus = null; return { html: card(), inPlace: true }; }
    if (name === 'list') { st.focus = null; return { html: card(), inPlace: true, rebuild: true }; }
    if (name === 'focus') {
      const b = (st.pick || []).find(x => x.name === ds.id);
      if (!b) return { handled: true };
      st.focus = b.name; st.tab = 'near';
      return { html: card(), inPlace: true, point: { lat: b.lat, lon: b.lon, altKm: ZOOM_KM }, rebuild: true };
    }
    if (name === 'region') {
      /* 지역을 바꾸면 지구 표시도 바뀌어야 한다 — 목록은 남해인데 지구에는 동해 해변이 찍히면 안 된다. */
      st.region = ds.region || null; st.focus = null; st.mode = 'beach';
      const c = st.region ? center(regionList(st, st.region)) : null;
      return deferred(ctx, st, () => fill(ctx, st), card, c ? { lat: c.lat, lon: c.lon, altKm: ZOOM_KM } : null);
    }
    if (name === 'here') {
      /* 지금 보고 있는 지구 기준으로 다시 고른다. ⚠️ 카메라는 **건드리지 않는다.** */
      st.region = null; st.focus = null; st.mode = 'beach';
      return deferred(ctx, st, () => fill(ctx, st), card, null);
    }
    return null;
  },

  close(ctx, st) { st.focus = null; st.point = null; },
};

/* 물때. ⚠️⚠️ **조차가 작은 곳에서 크게 띄우지 않는다.** 0.5m 미만이면 한 줄로만 적는다. */
function tideLine(t, ko) {
  if (!t) return '';
  const hhmm = (ms) => new Intl.DateTimeFormat(ko ? 'ko-KR' : 'en', {
    hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
  if (!t.matters) {
    return `<p class="sf-tide small">${ko
      ? `물때 — 조차 ${(t.rangeM * 100).toFixed(0)}cm 로 <b>영향이 거의 없는 바다</b>입니다.`
      : `Tide range only ${(t.rangeM * 100).toFixed(0)} cm — little effect here.`}</p>`;
  }
  const nx = (t.next || []).map(n =>
    `${n.kind === 'high' ? (ko ? '만조' : 'High') : (ko ? '간조' : 'Low')} ${hhmm(n.at)}`).join(' · ');
  return `<p class="sf-tide">${ko
    ? `<b>물때</b> 조차 ${t.rangeM.toFixed(2)}m · 지금 ${t.nowM > 0 ? '+' : ''}${t.nowM.toFixed(2)}m`
      + `${t.rising != null ? ` (${t.rising ? '드는 중' : '나는 중'})` : ''}${nx ? ` — ${nx}` : ''}`
    : `<b>Tide</b> range ${t.rangeM.toFixed(2)} m${nx ? ` — ${nx}` : ''}`}</p>`;
}

/* 수온으로 슈트를 가늠한다. ⚠️ 널리 쓰이는 목안이지 공인 기준이 아니다. */
function suit(t) {
  if (t >= 24) return '슈트 없이도';
  if (t >= 20) return '스프링';
  if (t >= 17) return '3/2mm';
  if (t >= 14) return '4/3mm';
  return '5mm+';
}
