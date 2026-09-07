// LAB · 분석 보고서 — 1.0 ui-lab-reports.js `labReportsPanel` 을 그대로 빌려 쓴다 (v2-three ext 규약)
//
// 목록·문구·클래스(.lab-report-*)는 전부 1.0 이 그린다. 여기서는 컨테이너만 내준다.
//   ⚠️ 1.0 은 `./lab-reports.html?kind=…&report=…` 상대경로로 링크한다. v2 는 /v2/ 아래에 있어
//      그대로 두면 /v2/lab-reports.html 로 가서 404 다 → afterRender 에서 `/lab-reports.html…` 로 바꾼다.
//   ⚠️ 상세와 권한 판정은 lab-reports.html 이 맡는다 (1.0 과 같다). 여기서 보고서를 지어내지 않는다.

const BODY_ID = 'ext-reports-body';

function absolutizeLinks(root) {
  root.querySelectorAll('a[href^="./"]').forEach((a) => {
    a.setAttribute('href', '/' + a.getAttribute('href').slice(2));
  });
}

export default {
  key: 'lab/reports',
  title: '분석 보고서',
  badge: 'DERIVED',

  async load(ctx, state, signal) {
    state.ko = ctx.ko;
    const { labReportsPanel } = await ctx.v1('ui-lab-reports.js');
    /* loadLabReports 는 목록 하나가 실패해도 failures 에 적고 돌아온다 — 0건으로 확정하지 않는다. */
    const data = await labReportsPanel.load();
    if (signal?.aborted) return;
    state.panel = labReportsPanel;
    state.data = data;
  },

  card(ctx, state) {
    if (!state.panel) return `<p class="comm-load">${ctx.ko ? '보고서 목록을 불러오는 중…' : 'Loading reports…'}</p>`;
    return `<div id="${BODY_ID}" class="ext-reports"></div>`;
  },

  afterRender(ctx, state, root) {
    const div = root?.querySelector?.(`#${BODY_ID}`) || (typeof document !== 'undefined' ? document.getElementById(BODY_ID) : null);
    if (!div || !state.panel) return;
    div.innerHTML = '';
    try { state.panel.render(div, ctx.ko); }
    catch (e) {
      div.innerHTML = `<p class="sky-note">${ctx.ko
        ? `보고서를 불러오지 못했습니다 (${ctx.esc(e.message)}).`
        : `Could not load reports (${ctx.esc(e.message)}).`}</p>`;
      return;
    }
    absolutizeLinks(div);
  },
};
