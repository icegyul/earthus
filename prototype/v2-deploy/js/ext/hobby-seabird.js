// EARTHUS v2-three · 취미 · 바닷새 — 우리 바다에서 실제로 센 기록
// 1.0 의 prototype/js/ui-seabird.js 를 ext 규약(ext-scene.js · CONTRACT.md)으로 옮긴 것.
//
// ⚠️ 이용허락범위 **제한 없음**이다. 바다거북(제4유형)과 다르다 —
//    가공해도 되고 분석 문장을 만들어도 된다. 출처만 밝힌다.
//
// ⚠️⚠️ **이건 "지금 새가 있는 곳"이 아니다.** 조사한 해에 그 자리에서 센 기록이다.
//    그리고 **조사하지 않은 곳에 새가 없다는 뜻도 아니다.**
//    정점 몇십 곳뿐이라, 빈 바다는 "안 갔다"는 뜻이지 "없다"가 아니다.
//    이 두 문장을 화면 맨 위에 적는다. 안 적으면 지도가 거짓말을 한다.
//
// 지구 위: ctx.makePoints 는 무리 하나에 크기 하나다(개별 크기 없음).
//    → 개체수 제곱근으로 소·중·대 세 무리로 나눠 그린다. 큰 정점이 커 보이면 된다.

const n0 = (v) => Number(v || 0).toLocaleString('ko-KR');
const COLOR = 0x4fd0e0;
const PICK_KM = 40;

/* 멸종위기 등급. ⚠️ Lambda 가 근거(몇 줄 중 몇 줄)를 같이 보낸다 —
   임계값은 우리가 정한 것이라 화면에서 밝힐 수 있게 해 둔 것이다. */
const GRADE = {
  '1': { ko: '멸종위기 I급', en: 'Endangered I', c: '#ff6b6b' },
  '2': { ko: '멸종위기 II급', en: 'Endangered II', c: '#f0a878' },
};

/* 크기 무리 — sqrt(개체수/최대) 로 0~1, 세 단계. 1.0 은 8~34px 였다. */
const CLASSES = [
  { max: 0.25, size: 7, opacity: 0.55 },
  { max: 0.55, size: 12, opacity: 0.7 },
  { max: 1.01, size: 20, opacity: 0.85 },
];

const period = (d) => {
  const yrs = d?.years || [];
  return yrs.length ? `${yrs[0][0]}–${yrs[yrs.length - 1][0]}` : '';
};

/** 지금 지도에 남길 정점. 종을 골랐으면 **그 종이 실제로 나온 정점만**.
 *  ⚠️ 개체수는 정점 전체 합이라 그대로 쓴다 — 종별 개체수는 자료에 없다.
 *     여기서 나눠 추정하면 지어내는 것이다. 크기는 "그 정점이 얼마나 큰가"다. */
const stationsOf = (state) => {
  const d = state.data || {};
  let st = (d.stations || []).filter((s) => s && s.lat != null && s.lon != null);
  if (state.spc) {
    const at = new Set((d.species || []).find((s) => s.ko === state.spc)?.at || []);
    st = st.filter((s) => at.has(s.code));
  }
  return st;
};

export default {
  key: 'hobby/seabird',
  title: '바닷새',
  badge: 'HISTORY',

  async load(ctx, state, signal) {
    // ⚠️ S3 는 없는 객체에 403 을 준다
    state.data = await ctx.fetchJson(`${ctx.S3}/events/seabird.json`, { signal, cache: 'no-cache' });
    if (state.spc === undefined) state.spc = null;   // 고른 종 (null = 전체 정점)
    state.point = null;
  },

  /** 개체수로 크기를 바꾼다. 다만 **제곱근**을 쓴다 —
   *  53만 마리와 100 마리를 그대로 비례시키면 큰 점 하나가 화면을 덮는다. */
  build(ctx, state) {
    const st = stationsOf(state);
    if (!st.length) return;
    const max = Math.max(...st.map((s) => s.individuals || 0)) || 1;
    const groups = CLASSES.map(() => []);
    st.forEach((s) => {
      const f = Math.sqrt((s.individuals || 0) / max);          // 0~1
      const k = CLASSES.findIndex((c) => f < c.max);
      groups[k < 0 ? CLASSES.length - 1 : k].push({ lat: s.lat, lon: s.lon });
    });
    groups.forEach((items, i) => {
      if (!items.length) return;
      ctx.add(ctx.makePoints(items, { size: CLASSES[i].size, opacity: CLASSES[i].opacity, color: COLOR, lift: 0.0035 }));
    });
  },

  card(ctx, state) {
    const { esc } = ctx; const ko = ctx.ko;
    const d = state.data || {};
    const yrs = d.years || [];
    const from = yrs.length ? yrs[0][0] : '';
    const to = yrs.length ? yrs[yrs.length - 1][0] : '';
    const nSt = (d.stations || []).length;
    let h = '';

    h += `<div class="sb-warn">`
      + `<b>${ko ? '조사 기록' : 'Survey records'}</b>`
      + `<p>${esc(from)}–${esc(to)} · ${nSt}${ko ? '개 조사정점 · 조사 당시 개체수' : ' stations · counts at survey time'}</p>`
      + `<p>${esc(ko ? (d.note?.ko || '조사한 해에 그 자리에서 센 기록입니다. ⚠️ 지금 거기 있다는 뜻이 아니고, 조사하지 않은 곳에 새가 없다는 뜻도 아닙니다.')
                  : (d.note?.en || 'Counts made at survey stations in the survey year — not live positions; empty water means not surveyed, not no birds.'))}</p>`
      + `</div>`;

    // 한눈에
    h += `<div class="sb-sum">`
      + [[n0(d.records), ko ? '관측 기록' : 'records'],
         [n0(d.speciesCount), ko ? '종' : 'species'],
         [n0(nSt), ko ? '조사정점' : 'stations'],
         [`${from}–${to}`, ko ? '조사 기간' : 'period']]
        .map(([v, k]) => `<div class="sb-cell"><b>${esc(v)}</b><em>${esc(k)}</em></div>`).join('')
      + `</div>`;

    // 9년 변화 — ⚠️ 조사 횟수로 나눈 값이다. 이유는 _years() 주석 참고.
    h += `<p class="sb-h">${ko ? '9년 동안 어떻게 달라졌나' : 'Change over 9 years'}</p>`
      + this._years(ctx, d.years)
      + `<p class="sb-note">${esc(ko ? (d.note?.yearKo || '') : (d.note?.yearEn || ''))}</p>`;

    const S = d.species || [];
    const endangered = S.filter((s) => s.endangered);

    /* 멸종위기부터 보여준다. ⚠️ 흔한 새를 위에 두면 이게 안 보인다. */
    if (endangered.length) {
      h += `<p class="sb-h">${ko ? `멸종위기 ${endangered.length}종 관측 기록` : `${endangered.length} endangered species records`}</p>`
        + this._rows(ctx, state, endangered);
    }
    h += `<p class="sb-h">${ko ? '많이 기록된 순' : 'Most recorded'}</p>`
      + this._rows(ctx, state, S.filter((s) => !s.endangered).slice(0, 30));

    /* ── 출처 ───────────────────────────────────────────── */
    h += `<p class="sub-legal">${esc(d.source || '')} · ${esc(d.license || '')}<br>`
      + esc(ko ? (d.note?.ko || '') : (d.note?.en || '')) + `</p>`;
    return h;
  },

  /** 해마다 막대 하나. `by` 는 [연도, 조사 횟수, 센 마릿수] 다.
   *
   *  ⚠️⚠️ **센 마릿수를 그대로 그리면 안 된다.** 해마다 조사를 나간 횟수가 다르다 —
   *     2016년은 1,035번, 2017년은 2,843번이다. 원값으로 그리면 2016년이 낮게 나오는데
   *     **조사 한 번당으로 보면 2016년이 가장 높다.** 정반대로 읽힌다.
   *  → 막대는 **조사 한 번당 마릿수**로 그리고, 조사 횟수는 숫자로 함께 적는다. */
  _years(ctx, by) {
    const { esc } = ctx; const ko = ctx.ko;
    const rows = (by || []).filter((r) => r && r[1] > 0)
      .map(([y, n, c]) => ({ y: String(y).slice(0, 4), n, c, per: c / n }));
    if (!rows.length) return `<div class="sb-yr"></div>`;
    const max = Math.max(...rows.map((r) => r.per)) || 1;
    return `<div class="sb-yr">` + rows.map((r) =>
      `<div class="sb-yrow"><i>${esc(r.y)}</i>`
      + `<u><b style="width:${(r.per / max * 100).toFixed(1)}%"></b></u>`
      + `<s>${r.per.toFixed(0)}<em>${ko ? '마리/조사' : '/survey'}</em></s>`
      + `<q>${ko ? `조사 ${n0(r.n)}번` : `${n0(r.n)} surveys`}</q></div>`).join('')
      + `</div>`;
  },

  /** 종 목록. 누르면 그 종이 나온 정점만 지도에 남긴다. */
  _rows(ctx, state, list) {
    const { esc } = ctx; const ko = ctx.ko;
    return `<div class="sb-list">` + list.map((s) => {
      const on = state.spc === s.ko;
      const g = s.endangered && GRADE[s.endangered.grade];
      let r = `<button class="sb-row${on ? ' on' : ''}" data-action="ext:species" data-code="${esc(s.ko)}">`
        + `<span class="sb-nm"><b>${esc(ko ? s.ko : (s.sci || s.ko))}</b>`
        + (g ? `<i class="sb-g" style="--g:${g.c}">${ko ? g.ko : g.en}</i>` : '')
        + `<em>${esc(s.sci || '')}</em></span>`
        + `<span class="sb-n">${n0(s.individuals)}<u>${ko ? '마리' : ''}</u>`
        + `<em>${ko ? `정점 ${s.stations}곳` : `${s.stations} stations`}</em></span></button>`;
      /* 고른 종은 **바로 그 자리에** 9년 변화를 편다.
         ⚠️ 화면 위쪽에 펴면 목록이 밀려서, 누른 줄이 어디 갔는지 눈이 놓친다. */
      if (on) {
        r += `<div class="sb-open">` + this._years(ctx, s.by)
          + `<p class="sb-note">${ko
            ? `정점 ${s.stations}곳에서 ${n0(s.records)}번 기록 · 지도를 이 종이 나온 곳으로 좁혔습니다`
            : `${n0(s.records)} records at ${s.stations} stations`}</p></div>`;
      }
      return r;
    }).join('') + `</div>`;
  },

  /** 지구를 눌렀을 때 — 40 km 안의 조사정점 → 정점 카드 (기록·종·개체). */
  pick(ctx, state, lat, lon) {
    const { esc } = ctx; const ko = ctx.ko; const d = state.data || {};
    let best = null; let bd = PICK_KM;
    stationsOf(state).forEach((s) => {
      const dk = ctx.distKm({ lat, lon }, { lat: s.lat, lon: s.lon });
      if (dk < bd) { bd = dk; best = s; }
    });
    if (!best) return null;
    const s = best; const per = period(d);
    return {
      title: `${ko ? '조사정점' : 'Station'} ${s.code}`,
      badge: 'HISTORY',
      body: `<div class="sb-warn">`
        + `<b>${ko ? '조사정점' : 'Station'} ${esc(s.code)}</b>`
        + `<p>${ko ? '기록' : 'Records'} ${n0(s.records)}${ko ? '건' : ''} · ${ko ? '종' : 'species'} ${n0(s.species)}<br>`
        + `${ko ? '센 개체' : 'Individuals'} <b>${n0(s.individuals)}</b> ${ko ? '(조사한 해들의 합계)' : '(sum over survey years)'}</p>`
        + `<p><b>${ko ? `조사 기간 ${esc(per)}` : `Survey period ${esc(per)}`}</b> · ${ko
          ? '조사한 해에 그 자리에서 센 기록 — 지금 있다는 뜻이 아닙니다'
          : 'counts made at this station in the survey year — not a live position'}</p>`
        + `</div>`
        + this._years(ctx, s.by)
        + `<p class="sub-legal">${esc(d.source || '')} · ${esc(d.license || '')}</p>`,
    };
  },

  /** ext:species data-code — 같은 종을 다시 누르면 전체로. 지구는 다시 그린다. */
  action(ctx, state, name, ds) {
    if (name !== 'species') return null;
    const code = ds?.code ? String(ds.code) : null;
    state.spc = (!code || state.spc === code) ? null : code;
    return { rebuild: true, html: this.card(ctx, state) };
  },

  close(ctx, state) { state.spc = null; },
};
