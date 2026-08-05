// 패널(시트) 공통 닫기 — 어떤 경우에도 빠져나올 수 있게
//
// 왜 필요한가
//   닫기(×)는 패널 우상단에 position:absolute 로 붙어 있다.
//   패널이 길어져 스크롤되면 × 가 위로 밀려 올라가 손이 닿지 않는다.
//   게다가 폰에서는 패널이 하단 툴바에 가려 아예 못 누르는 일이 있었다.
//   → 배경을 눌러도 닫히고, Esc 로도 닫히게 해서 막다른 길을 없앤다.

/** 열려 있는 패널을 찾는 셀렉터 — 새 패널을 만들면 여기 추가할 것 */
export const OPEN_PANELS = '#sheet.up, #settings.up, .sheet-panel.up';

/* ── 접근성: 패널이 열릴 때 의미 구조를 붙인다 ────────────────────
   받은 감사(P2-4): 시트들은 눈에는 모달인데 role="dialog"·aria-modal·
   aria-labelledby 가 없어 스크린리더에는 그냥 글 뭉치였다.
   ⚠️ 29개 시트에 손으로 다는 대신 **열릴 때 자동으로** 붙인다 —
      손으로 달면 새 시트가 생길 때마다 빠뜨린다(검색 목록에서 이미 겪었다).
   ⚠️ 닫힌 패널은 inert 로 탭 순서에서도 뺀다. 화면 밖에 있는데 탭이 들어가면
      "탭을 눌렀는데 아무 데도 안 간다"가 된다. */
function markA11y(el) {
  if (!el || el.dataset.a11y) return;
  el.dataset.a11y = '1';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  const h = el.querySelector('h3, h2, .sheet-title, #sheetTitle');
  if (h) {
    if (!h.id) h.id = 'ttl-' + (el.id || Math.random().toString(36).slice(2, 8));
    el.setAttribute('aria-labelledby', h.id);
  } else if (!el.getAttribute('aria-label')) {
    el.setAttribute('aria-label', '정보 창');
  }
}

/** 열림/닫힘에 맞춰 role 과 inert 를 유지한다 */
function syncA11y() {
  let anyOpen = false;
  document.querySelectorAll('#sheet, #settings, .sheet-panel').forEach(el => {
    const open = el.classList.contains('up');
    if (open) anyOpen = true;
    if (open) markA11y(el);
    if ('inert' in HTMLElement.prototype) el.inert = !open;
    el.setAttribute('aria-hidden', String(!open));
  });
  /* 위성 로딩 표시처럼 z-index가 높은 지도 보조 UI가 시트의 마지막 줄을 가리지 않게
     공통 상태를 body에 둔다. 여는 코드가 수십 군데라 각자 숨기면 반드시 빠진다. */
  document.body.classList.toggle('panel-open', anyOpen);
}

export const panels = {
  init() {
    /* 클래스가 바뀔 때마다 맞춘다 — 여는 곳이 수십 군데라 한 곳에서 감시한다 */
    new MutationObserver(syncA11y).observe(document.body,
      { subtree: true, attributes: true, attributeFilter: ['class'] });
    syncA11y();
    // 배경(지구) 탭 → 가장 위 패널 닫기
    // ⚠️ 캔버스에서 시작한 입력만 본다. 패널 안을 스크롤하다 손을 떼는 걸
    //    "바깥 클릭"으로 오인하면 읽는 중에 패널이 닫혀버린다.
    document.addEventListener('pointerdown', ev => {
      const open = [...document.querySelectorAll(OPEN_PANELS)];
      if (!open.length) return;
      if (open.some(p => p.contains(ev.target))) return;   // 패널 안이면 무시
      // 설정 버튼 같은 여는 버튼을 눌렀을 땐 그쪽 핸들러에 맡긴다
      if (ev.target.closest('#gear, [data-open]')) return;
      /* ⚠️⚠️ **지도를 봐야 하는 화면은 바깥 탭으로 안 닫는다.**
         받은 지적: "취미 메뉴에서 각각 누르고 큰 화면에서 보고 싶은데 꺼져".
         서핑·낚시·활공장·산은 **지도에 표시를 그려 놓고 그걸 보라는 화면**이다.
         지도를 만질 때마다 닫히면 볼 수가 없다 — 그 화면들은 닫기 버튼으로만 닫는다. */
      const top = open[open.length - 1];
      if (top.classList.contains('keep-open')) return;
      this.closeTop();
    }, true);

    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') this.closeTop();
    });
    return this;
  },

  /* 시트를 닫을 때 같이 치워야 하는 것들.
     ⚠️⚠️ 시트에 `.up` 만 떼면 **지도에 찍은 표시가 그대로 남는다.**
        받은 신고: "서핑 선택 후 나가려면 어떻게 하지? 계속 유지 되는데".
        닫는 길이 셋(닫기 버튼 · 바깥 탭 · Esc)인데 정리는 한 군데도 안 걸려 있었다.
        → 여기에 등록해 두면 **어느 길로 닫아도** 불린다. */
  _cleanup: new Map(),
  onClose(id, fn) { this._cleanup.set(id, fn); return this; },
  _fire(el) {
    const fn = el && this._cleanup.get(el.id);
    if (fn) { try { fn(); } catch (e) { console.warn('[panels] 정리 실패', e.message); } }
  },

  closeTop() {
    const open = [...document.querySelectorAll(OPEN_PANELS)];
    if (!open.length) return;
    // 가장 나중에 열린 것(= z-index 가 높거나 문서 뒤쪽) 하나만 닫는다
    const el = open[open.length - 1];
    el.classList.remove('up');
    this._fire(el);
  },

  closeAll() {
    document.querySelectorAll(OPEN_PANELS).forEach(p => {
      p.classList.remove('up');
      this._fire(p);
    });
  },
};
