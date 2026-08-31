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
  /* keep-open(서핑·낚시 같은 지도 화면)만 열려 있을 때는 브랜드 손잡이를 남겨야
     한다 — 이 시트는 바깥 탭·Esc 로 안 닫혀서, 손잡이까지 숨기면 시트의 × 가
     유일한 출구가 된다. 손잡이 숨김(decision-rail.css)은 이 클래스를 본다. */
  const anyModal = [...document.querySelectorAll('#sheet.up, #settings.up, .sheet-panel.up')]
    .some(el => !el.classList.contains('keep-open'));
  document.body.classList.toggle('panel-open-modal', anyModal);
}

export const panels = {
  /* 열림 순서 스택 — closeTop 이 문서 순서가 아니라 실제로 나중에 연 것을 닫게 한다 */
  _stack: [],
  /* 직전에 열려 있던 패널들 — "새로 열렸다"를 판정하는 기준 */
  _wasUp: new Set(),

  /* ⚠️⚠️ 패널 배타성은 여기 한 곳에서 집행한다.
     여는 곳이 35군데가 넘고 절반은 다른 패널을 닫지 않아서, 서핑 위에 낚시,
     시트 위에 정보 창이 두세 장씩 겹쳤다 ("하나만 나와야 하는데 두세 개가 보인다").
     오프너마다 고치면 새 시트가 생길 때마다 또 빠진다 — 클래스 감시에서 잡는다.
     · 새로 .up 이 된 패널이 있으면 나머지 열린 패널을 전부 닫는다 (keep-open 포함 —
       keep-open 은 "바깥 탭으로 안 닫힌다"는 뜻이지 "다른 창과 겹쳐도 된다"가 아니다.
       지도 표시는 onClose 정리(offChip)가 따로 살리므로 창만 닫혀도 잃는 게 없다).
     · 패널이 열리면 메뉴 드로어도 닫는다 — 시트와 메뉴가 나란히 겹치지 않게. */
  _enforce() {
    const all = [...document.querySelectorAll('#sheet, #settings, .sheet-panel')];
    const nowUp = all.filter(el => el.classList.contains('up'));
    const gained = nowUp.filter(el => !this._wasUp.has(el));
    if (gained.length) {
      const keep = gained[gained.length - 1];
      nowUp.forEach(el => {
        if (el === keep) return;
        el.classList.remove('up');
        this._fire(el);
      });
      this._stack = this._stack.filter(el => el !== keep && el.classList.contains('up'));
      this._stack.push(keep);
      document.dispatchEvent(new CustomEvent('earthus:close-menu'));
    } else {
      this._stack = this._stack.filter(el => el.classList.contains('up'));
    }
    this._wasUp = new Set(all.filter(el => el.classList.contains('up')));
  },

  init() {
    /* 클래스가 바뀔 때마다 맞춘다 — 여는 곳이 수십 군데라 한 곳에서 감시한다 */
    new MutationObserver(() => { this._enforce(); syncA11y(); }).observe(document.body,
      { subtree: true, attributes: true, attributeFilter: ['class'] });
    this._enforce();
    syncA11y();

    /* 메뉴가 열리면 일반 시트는 닫는다 — 마우스는 바깥 pointerdown 이 이미 이렇게
       동작하는데, 키보드·프로그램 경로만 시트가 남아 메뉴와 겹쳤다. keep-open
       (서핑·낚시 같은 지도 화면)은 메뉴가 잠깐 덮었다 돌아가는 게 맞으므로 남긴다. */
    document.addEventListener('earthus:open-menu', () => {
      [...document.querySelectorAll(OPEN_PANELS)].forEach(el => {
        if (el.classList.contains('keep-open')) return;
        el.classList.remove('up');
        this._fire(el);
      });
    });
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
      this._stack = this._stack.filter(el => el.classList.contains('up'));
      const top = this._stack[this._stack.length - 1] || open[open.length - 1];
      if (top.classList.contains('keep-open')) return;
      this.closeTop();
    }, true);

    document.addEventListener('keydown', ev => {
      if (ev.key !== 'Escape') return;
      /* Esc 는 화면 맨 위 한 겹만 닫는다. 검색(z30)·메뉴(z28)가 열려 있으면
         그쪽 핸들러가 처리한다 — 예전엔 넷이 각자 반응해 Esc 한 번에
         겹친 창이 전부 동시에 사라졌다. */
      if (ev.defaultPrevented) return;
      if (document.getElementById('searchBox')?.classList.contains('on')) return;
      if (document.getElementById('menuMain')?.classList.contains('open')
          || document.getElementById('menuSub')?.classList.contains('open')) return;
      this.closeTop();
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
    /* 가장 나중에 연 것 하나만 닫는다 — 문서 순서가 아니라 실제 열림 순서다.
       (문서 순서로 닫으면 화면 뒤에 깔린 패널이 먼저 닫혀 "Esc 를 눌러도
       화면이 안 변한다"가 됐다) */
    this._stack = this._stack.filter(el => el.classList.contains('up'));
    const el = this._stack[this._stack.length - 1]
      || [...document.querySelectorAll(OPEN_PANELS)].pop();
    if (!el) return;
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
