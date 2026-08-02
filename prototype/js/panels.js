// 패널(시트) 공통 닫기 — 어떤 경우에도 빠져나올 수 있게
//
// 왜 필요한가
//   닫기(×)는 패널 우상단에 position:absolute 로 붙어 있다.
//   패널이 길어져 스크롤되면 × 가 위로 밀려 올라가 손이 닿지 않는다.
//   게다가 폰에서는 패널이 하단 툴바에 가려 아예 못 누르는 일이 있었다.
//   → 배경을 눌러도 닫히고, Esc 로도 닫히게 해서 막다른 길을 없앤다.

/** 열려 있는 패널을 찾는 셀렉터 — 새 패널을 만들면 여기 추가할 것 */
export const OPEN_PANELS = '#sheet.up, #settings.up, .sheet-panel.up';

export const panels = {
  init() {
    // 배경(지구) 탭 → 가장 위 패널 닫기
    // ⚠️ 캔버스에서 시작한 입력만 본다. 패널 안을 스크롤하다 손을 떼는 걸
    //    "바깥 클릭"으로 오인하면 읽는 중에 패널이 닫혀버린다.
    document.addEventListener('pointerdown', ev => {
      const open = [...document.querySelectorAll(OPEN_PANELS)];
      if (!open.length) return;
      if (open.some(p => p.contains(ev.target))) return;   // 패널 안이면 무시
      // 설정 버튼 같은 여는 버튼을 눌렀을 땐 그쪽 핸들러에 맡긴다
      if (ev.target.closest('#gear, [data-open]')) return;
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
