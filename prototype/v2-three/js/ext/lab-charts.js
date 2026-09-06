// LAB · 자료 그래프 — 1.0 ui-charts.js `chartsPanel` 을 그대로 빌려 쓴다 (v2-three ext 규약)
//
// 그리기는 전부 1.0 이 한다 (SVG · .ch-* 클래스). 여기서는 컨테이너만 내주고 붙인다.
//   ⚠️ ui-charts.js 의 chartBox() 가 폭을 재려고 `#sheet` 를 찾는다. 1.0 시트가 없으면
//      `min(520, innerWidth-24)-44` 로 어림한다 — 예외는 없다. 다만 v2 패널 폭과 다를 수 있어
//      afterRender 에서 SVG 를 컨테이너 폭에 맞춰 늘인다(viewBox 가 있어 비율은 유지된다).
//   ⚠️ 카드 안 도구 링크(./verify.html …)는 1.0 상대경로다. v2 는 /v2/ 아래라 절대경로로 바꾼다.

const BODY_ID = 'ext-charts-body';

/** 1.0 의 상대 링크(./x.html)를 같은 origin 절대경로(/x.html)로 */
function absolutizeLinks(root) {
  root.querySelectorAll('a[href^="./"]').forEach((a) => {
    a.setAttribute('href', '/' + a.getAttribute('href').slice(2));
  });
}

export default {
  key: 'lab/charts',
  title: '자료 그래프',
  badge: 'OBSERVED',

  async load(ctx, state, signal) {
    state.ko = ctx.ko;
    const { chartsPanel } = await ctx.v1('ui-charts.js');
    await chartsPanel.load();                        // 각 계열은 안에서 개별 catch → null
    if (signal?.aborted) return;
    state.panel = chartsPanel;
    state.data = chartsPanel._data || true;
  },

  card(ctx, state) {
    if (!state.panel) return `<p class="sky-dim">${ctx.ko ? '불러오는 중…' : 'Loading…'}</p>`;
    return `<div id="${BODY_ID}" class="ext-charts"></div>`;
  },

  afterRender(ctx, state, root) {
    const div = root?.querySelector?.(`#${BODY_ID}`) || (typeof document !== 'undefined' ? document.getElementById(BODY_ID) : null);
    if (!div || !state.panel) return;
    div.innerHTML = '';
    try { state.panel.render(div, ctx.ko); }
    catch (e) {
      div.innerHTML = `<p class="sky-note">${ctx.ko
        ? `그래프를 불러오지 못했습니다 (${ctx.esc(e.message)}).`
        : `Could not load charts (${ctx.esc(e.message)}).`}</p>`;
      return;
    }
    /* 컨테이너 폭에 맞춘다 — chartBox 가 #sheet 없이 어림한 폭과 v2 패널 폭이 다를 수 있다. */
    div.querySelectorAll('.ch-wrap svg').forEach((svg) => { svg.style.width = '100%'; svg.style.height = 'auto'; svg.style.display = 'block'; });
    absolutizeLinks(div);
    /* 대륙·극지 탭은 1.0 이 body.innerHTML='' 뒤 다시 그린다 — 그때 링크·폭도 다시 맞춘다. */
    if (!div.__extObserver && typeof MutationObserver !== 'undefined') {
      const mo = new MutationObserver(() => {
        div.querySelectorAll('.ch-wrap svg').forEach((svg) => { if (svg.style.width !== '100%') { svg.style.width = '100%'; svg.style.height = 'auto'; svg.style.display = 'block'; } });
        absolutizeLinks(div);
      });
      mo.observe(div, { childList: true });
      div.__extObserver = mo;
      state._observer = mo;
    }
  },

  close(ctx, state) {
    try { state._observer?.disconnect(); } catch (_) { /* 없으면 그만 */ }
    state._observer = null;
  },
};
