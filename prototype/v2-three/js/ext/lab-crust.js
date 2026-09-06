// LAB · 땅의 움직임 — 1.0 ui-community.js renderCrust 를 옮겨 적음 (2026-09-06)
//
// ⚠️⚠️ 이 앱에서 유일하게 하늘이 아닌 자료이고, 가장 순수하게 "잰 값"이다 —
//    GNSS 상시관측점의 좌표가 해마다 얼마나 달라졌는지, 그뿐이다. 모델도 예보도 아니다.
// ⚠️ 그래서 못 하는 것을 화면에 먼저 적는다. 안 그러면 "지진 감지"로 읽힌다.
// 자료: ${S3}/events/crustal.json (1.0 수집기) — {korea, japan: {medianSpeed, medianDir, n}, count, cite}

export default {
  key: 'lab/crust',
  title: '땅의 움직임',
  badge: 'OBSERVED',

  async load(ctx, state, signal) {
    state.data = await ctx.fetchJson(`${ctx.S3}/events/crustal.json`, { signal, cache: 'no-cache' });
    if (!state.data?.korea || !state.data?.japan) throw new Error('crustal.json 형식이 다릅니다');
  },

  card(ctx, state) {
    const d = state.data; const ko = ctx.ko; const esc = ctx.esc;
    const near = (a) => (a == null ? '—' : Number(a).toFixed(0));
    const compass = (deg) => {
      const N = ko ? ['북', '북동', '동', '남동', '남', '남서', '서', '북서'] : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      return N[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
    };
    const stat = (nm, v) => `<div class="cr-stat"><div class="n">${near(v.medianSpeed)}<small>mm/${ko ? '년' : 'yr'}</small></div>`
      + `<div class="k">${nm} · ${compass(v.medianDir)}${ko ? '쪽' : ''} · ${esc(v.n)}${ko ? '지점' : ' sites'}</div></div>`;
    return `<p class="cr-lead">${ko
      ? '<b>땅이 실제로 얼마나 움직였는지</b>입니다. 계산한 값이 아니라 GNSS 상시관측점의 좌표가 해마다 달라진 거리입니다.'
      : '<b>Measured</b> motion of continuous GNSS stations — not a model.'}</p>`
      + `<div class="cr-grid">${stat(ko ? '한국' : 'Korea', d.korea)}${stat(ko ? '일본' : 'Japan', d.japan)}</div>`
      /* ⚠️⚠️ 이 문단을 지우면 안 된다. 숫자만 보면 "땅이 갈라지고 있다"로 읽힌다. */
      + `<p class="cr-note">${ko
        ? '이 움직임의 대부분은 <b>판 전체가 함께 가는 것</b>입니다. 한반도가 연 3cm 동남동으로 가는 것은 유라시아판이 그렇게 가기 때문이지, 땅이 찢어지고 있어서가 아닙니다. 우리도 그 위에 얹혀 같이 갑니다.'
        : 'Most of this is whole-plate drift, not local deformation.'}</p>`
      + `<div class="cr-case">${ko
        ? '<b>2011년 동일본대지진(M9.0) 때</b><br><span>진앙 130km 지점 <b>3.42m</b> 이동 · 200km 지점 1.97m · <b>대전 2.3cm</b> — 한반도가 통째로 동쪽으로 끌려갔습니다.</span>'
        : '<b>2011 Tōhoku (M9.0)</b><br><span>3.42 m at 130 km · 1.97 m at 200 km · 2.3 cm in Daejeon — the whole peninsula shifted east.</span>'}</div>`
      + `<div class="cr-cant">${ko
        ? '<b>자료 범위</b><br>· 최종 좌표 약 <b>한 달 지연</b><br>· 중소 지진 변위는 일일 관측 잡음 범위<br>· 분석 단위 · 월간 GNSS 위치 변화'
        : '<b>Data scope</b><br>· Final positions lag about <b>one month</b><br>· Smaller-quake displacement sits within daily noise<br>· Analysis unit · monthly GNSS position change'}</div>`
      + `<p class="cr-src">${ko
        ? `자료: 네바다 측지연구소(UNR) MIDAS 속도장 · 관측점 ${Number(d.count || 0).toLocaleString()}곳 · ${esc(d.cite || '')}`
        : `Source: Nevada Geodetic Laboratory · ${Number(d.count || 0).toLocaleString()} sites · ${esc(d.cite || '')}`}</p>`
      + `<p class="kr-note">${ko
        ? '지구 위 1,352개 관측점의 실제 속도 화살표는 재해 › <b>지각 이동 속도 (GNSS 실측)</b> 레이어에서 봅니다.'
        : 'The 1,352 station vectors themselves are the Hazards › <b>Crustal velocity (GNSS)</b> layer.'}
        <button type="button" data-action="ext:open/hazards/crustal">${ko ? '그 레이어 켜기' : 'Open that layer'}</button></p>`;
  },
};
