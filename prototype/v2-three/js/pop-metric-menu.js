// EARTHUS — 국가 초점 미니 메뉴
//
// 국가를 고르면 그 자리(클릭·터치 지점)에 "이걸로 세울까?" 메뉴가 뜬다.
// 인구는 오늘 실제로 세울 수 있다 — popgrid/*.json 이 국가 단위로 잘린 실제 인구 격자다.
// 기온·습도·바람·강수는 아직 이 모양의 자료가 없다:
//   기온·습도  국가 단위로 잘린 격자 파일이 없다 (전지구 원자료는 있어도 이 화면이 못 읽는다)
//   바람       화살표(흐름장 벡터)로만 있고, 기둥으로 세울 스칼라 격자가 아니다
//   강수       지점 관측(AWS)뿐이라 국가 전체를 채울 격자가 없다
// 그래서 버튼은 두되, 눌러도 조용히 아무 일도 안 하지 않는다 — 왜 안 되는지를 말한다.
// 값을 지어내서 채우지 않는다.

const METRICS = [
  { id: 'population', ko: '인구', en: 'Population', icon: '◆', ready: true },
  { id: 'temperature', ko: '기온', en: 'Temperature', icon: '◇', ready: false,
    whyKo: '국가 단위로 잘린 기온 격자가 아직 없습니다', whyEn: 'No country-clipped temperature grid yet' },
  { id: 'humidity', ko: '습도', en: 'Humidity', icon: '◇', ready: false,
    whyKo: '국가 단위로 잘린 습도 격자가 아직 없습니다', whyEn: 'No country-clipped humidity grid yet' },
  { id: 'wind', ko: '바람', en: 'Wind', icon: '◇', ready: false,
    whyKo: '바람은 지금 흐름장(화살표)뿐이라 기둥으로 세울 격자가 없습니다', whyEn: 'Wind is a flow field, not a grid a column can be built from' },
  { id: 'rain', ko: '강수', en: 'Rain', icon: '◇', ready: false,
    whyKo: '강수는 지점 관측뿐이라 국가 전체를 채울 격자가 없습니다', whyEn: 'Rain is point-observed only — no country-wide grid exists' },
];

export class PopMetricMenu {
  constructor(i18n, onPick) {
    this.i18n = i18n;
    this.onPick = onPick;
    this.active = 'population';
    this.visible = false;
    this._tipTimer = null;

    this.el = document.createElement('div');
    this.el.id = 'pop-menu';
    this.el.setAttribute('role', 'menu');
    this.el.innerHTML = METRICS.map((m) => `
      <button class="pm-item${m.ready ? '' : ' pm-soon'}" role="menuitemradio"
              data-id="${m.id}" ${m.ready ? '' : 'aria-disabled="true"'}>
        <i class="pm-ic">${m.icon}</i><b>${i18n.ko ? m.ko : m.en}</b>${m.ready ? '' : `<em>${i18n.ko ? '준비 중' : 'soon'}</em>`}
      </button>`).join('');
    document.body.appendChild(this.el);

    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest('.pm-item');
      if (!btn) return;
      const m = METRICS.find((x) => x.id === btn.dataset.id);
      if (!m) return;
      if (!m.ready) { this._flash(btn, i18n.ko ? m.whyKo : m.whyEn); return; }
      this.active = m.id;
      this._paintActive();
      if (this.onPick) this.onPick(m.id);
    });
    // 메뉴 밖을 누르면(지구를 다시 만지는 것 포함) 닫는다.
    document.addEventListener('pointerdown', (e) => {
      if (this.visible && !this.el.contains(e.target)) this.hide();
    }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.hide(); });
  }

  _flash(btn, why) {
    let tip = btn.querySelector('.pm-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'pm-tip';
      btn.appendChild(tip);
    }
    tip.textContent = why;
    tip.classList.add('show');
    clearTimeout(this._tipTimer);
    this._tipTimer = setTimeout(() => tip.classList.remove('show'), 2400);
  }

  _paintActive() {
    this.el.querySelectorAll('.pm-item').forEach((b) => {
      const on = b.dataset.id === this.active;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    });
  }

  // (x, y): 화면 좌표(클릭·탭 지점). 화면 밖으로 나가지 않게 다음 프레임에 clamp.
  showAt(x, y, active) {
    if (active) this.active = active;
    this.visible = true;
    this.el.classList.add('show');
    this._paintActive();
    const W = window.innerWidth;
    const H = window.innerHeight;
    requestAnimationFrame(() => {
      if (!this.visible) return;
      const r = this.el.getBoundingClientRect();
      const left = Math.min(Math.max(x - r.width / 2, 10), W - r.width - 10);
      const top = Math.min(Math.max(y - r.height - 16, 10), H - r.height - 10);
      this.el.style.left = `${left}px`;
      this.el.style.top = `${top}px`;
    });
  }

  hide() {
    this.visible = false;
    this.el.classList.remove('show');
  }
}
