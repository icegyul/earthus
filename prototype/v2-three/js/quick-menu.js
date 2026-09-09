// EARTHUS — 우클릭 퀵 메뉴 (radial)
//
// 지구 위에서 오른쪽 클릭하면 누른 그 자리(화면 좌표)에 작은 원형 메뉴가 열린다.
// 국가 중심이 아니라 클릭 지점이 기준이다 — 지시서 §28. 게임식 래디얼 휠이고
// 평소에는 숨어 있다. ESC·바깥 클릭·항목 선택으로 닫힌다.
//
// 항목이 하는 일은 main.js 가 정의한다(국가 픽·지점 실황 조회·설정 서랍).
// 이 컴포넌트는 원형 배치·열고 닫기·화면 경계 보정만 책임진다. 값을 만들지 않는다.

const ITEMS = [
  { id: 'population', ko: '인구', en: 'Pop', icon: '◆' },
  { id: 'temperature', ko: '기온', en: 'Temp', icon: '°' },
  { id: 'humidity', ko: '습도', en: 'Humid', icon: '≈' },
  { id: 'wind', ko: '바람', en: 'Wind', icon: '➤' },
  { id: 'rain', ko: '강수', en: 'Rain', icon: '☂' },
  { id: 'settings', ko: '설정', en: 'Setup', icon: '⚙' },
];

// 항목 6개를 시계 방향으로 균등 배치. 첫 항목(인구)이 12시에서 시작한다.
const RADIUS = 78;
const angleAt = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / ITEMS.length;

export class QuickMenu {
  constructor(i18n, onPick) {
    this.i18n = i18n;
    this.onPick = onPick || (() => {});
    this.visible = false;

    this.el = document.createElement('div');
    this.el.id = 'quick-menu';
    this.el.setAttribute('role', 'menu');
    this.el.setAttribute('aria-label', i18n.ko ? '빠른 메뉴' : 'Quick menu');
    this.el.innerHTML = ITEMS.map((m, i) => {
      const a = angleAt(i);
      return `<button class="qk-item" role="menuitem" data-id="${m.id}"
        style="--qk-x:${Math.round(Math.cos(a) * RADIUS)}px;--qk-y:${Math.round(Math.sin(a) * RADIUS)}px"
        aria-label="${i18n.ko ? m.ko : m.en}">
        <i>${m.icon}</i><b>${i18n.ko ? m.ko : m.en}</b></button>`;
    }).join('') + '<i class="qk-dot" aria-hidden="true"></i>';
    document.body.appendChild(this.el);

    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest('.qk-item');
      if (!btn) return;
      const m = ITEMS.find((x) => x.id === btn.dataset.id);
      this.close();
      if (m) this.onPick(m.id, this._hit, this._x, this._y);
    });
    // 메뉴 밖을 누르면 닫는다(지구를 다시 만지는 것 포함) — pop-metric-menu 와 같은 문.
    document.addEventListener('pointerdown', (e) => {
      if (this.visible && !this.el.contains(e.target)) this.close();
    }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
  }

  // (x, y): 우클릭 화면 좌표. hit: raycast 결과({lat, lon} | null) — 항목 실행이 쓴다.
  open(x, y, hit) {
    this._x = x;
    this._y = y;
    this._hit = hit;
    this.visible = true;
    this.el.classList.add('show');
    // 화면 밖으로 나가지 않게 중심을 안쪽으로 끌어온다 (지시서 §29 — edge 자동 보정).
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cx = Math.min(Math.max(x, RADIUS + 12), W - RADIUS - 12);
    const cy = Math.min(Math.max(y, RADIUS + 12), H - RADIUS - 12);
    this.el.style.left = `${cx}px`;
    this.el.style.top = `${cy}px`;
  }

  close() {
    this.visible = false;
    this.el.classList.remove('show');
  }
}
