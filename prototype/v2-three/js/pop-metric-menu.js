// EARTHUS — 국가 초점 미니 메뉴
//
// 국가를 고르면 그 자리(클릭·터치 지점)에 "이걸로 세울까?" 메뉴가 뜬다.
// 인구는 오늘 실제로 세울 수 있다 — popgrid/*.json 이 국가 단위로 잘린 실제 인구 격자다.
// 기온·습도·바람·강수는 아직 이 모양의 자료가 없다:
//   기온·습도  국가 단위로 잘린 격자 파일이 없다 (전지구 원자료는 있어도 이 화면이 못 읽는다)
//   바람       화살표(흐름장 벡터)로만 있고, 기둥으로 세울 스칼라 격자가 아니다
//   강수       지점 관측(AWS)뿐이라 국가 전체를 채울 격자가 없다
// (2026-09-23 정정) 위 세 줄 중 기온·바람·강수는 이제 사실이 아니다. 이 화면은 기온·10 m 바람·누적강수를
//   GFS 0.5° 전지구 프레임으로 읽는다 — 색면·바람 입자, 그리고 우클릭·길게 누르기 퀵메뉴의 지점 값
//   (main.js pointWeather · point-readout.js). 없는 것은 값이 아니라 **국가 기둥**이다: 기둥은 popgrid
//   (국가 단위로 잘린 인구 격자)로만 세운다. 습도는 그 프레임에도 없다(point-readout.js METRIC_ABSENT).
//   UX 자동 점검(2026-09-23)이 이 팝업의 사유 문장이 사실과 달라졌다고 잡았다 — 있는 것을 없다고 말하는 것도
//   지어낸 말이다. 그래서 사유를 지금 사실로 고치고, 라벨도 '준비 중'(곧 열린다고 읽힌다 — ui-shell.js 의
//   CAP 규칙)에서 지금 상태를 적는 '기둥 없음'으로 바꿨다. 이 버튼들을 실제 조회로 열지는 PD 결정(B1)이라 막아 둔다.
// (2026-09-23 정정) 라벨 교체('준비 중' → '기둥 없음')는 되돌렸다 — 수정 계획의 B1 선택지 ②('막아 두고 문구만 바꾼다.
//   예: 기둥 없음') 그 자체라 PD 승인 전이다(적대 검토가 잡음). 라벨은 PD 가 B1 을 정할 때까지 '준비 중'/'soon' 이다.
//   승인된 것(A3·A5)은 그대로 둔다: 사유 문장을 사실대로 고친 것 · aria-describedby 숨긴 사유 · 아이콘 aria-hidden.
// 그래서 버튼은 두되, 눌러도 조용히 아무 일도 안 하지 않는다 — 왜 안 되는지를 말한다.
// 값을 지어내서 채우지 않는다.

const METRICS = [
  { id: 'population', ko: '인구', en: 'Population', icon: '◆', ready: true },
  // (2026-09-23 정정) 기온·바람·강수의 사유는 머리말 정정 줄대로 고쳤다 — 값은 있고, 국가 기둥이 없다.
  //   옛 문장: 기온 '국가 단위로 잘린 기온 격자가 아직 없습니다' · 바람 '흐름장(화살표)뿐' · 강수 '지점 관측뿐'.
  //   습도 문장은 그대로 둔다(여전히 사실이다).
  { id: 'temperature', ko: '기온', en: 'Temperature', icon: '◇', ready: false,
    whyKo: '국가 기둥은 인구 격자로만 세웁니다. 기온은 GFS 0.5° 색면과 지점 값(우클릭·길게 누르기)으로 봅니다',
    whyEn: 'Country columns are built from the population grid only. See temperature as the GFS 0.5° colour layer or a point value (right-click / long-press)' },
  { id: 'humidity', ko: '습도', en: 'Humidity', icon: '◇', ready: false,
    whyKo: '국가 단위로 잘린 습도 격자가 아직 없습니다', whyEn: 'No country-clipped humidity grid yet' },
  { id: 'wind', ko: '바람', en: 'Wind', icon: '◇', ready: false,
    whyKo: '국가 기둥은 인구 격자로만 세웁니다. 바람은 GFS 10 m 바람 색면·입자와 지점 값(우클릭·길게 누르기)으로 봅니다',
    whyEn: 'Country columns are built from the population grid only. See wind as the GFS 10 m wind layer / particles or a point value (right-click / long-press)' },
  { id: 'rain', ko: '강수', en: 'Rain', icon: '◇', ready: false,
    whyKo: '국가 기둥은 인구 격자로만 세웁니다. 강수는 GFS 0.5° 색면과 지점 값(우클릭·길게 누르기)으로 봅니다',
    whyEn: 'Country columns are built from the population grid only. See rain as the GFS 0.5° colour layer or a point value (right-click / long-press)' },
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
    // 2026-09-23 UX 자동 점검(axe): 이름 없는 menu 였다 — 옆 quick-menu.js 처럼 이름을 준다.
    this.el.setAttribute('aria-label', i18n.ko ? '지표 선택' : 'Metric');
    // 2026-09-23 UX 자동 점검: 막힌 버튼의 '왜 안 되나'가 화면(.pm-tip)에만 있어 보조기기는 라벨만 들었다.
    //   사유를 숨긴 span 에 두고 aria-describedby 로 잇는다. 아이콘 글리프는 읽지 않는다.
    //   ⚠️ .sr-only 가 아니라 hidden 이다 — .sr-only 는 트리에 남아 사유 문장이 버튼 **이름**에까지 섞인다.
    //      hidden 은 이름 계산에서 빠지고, aria-describedby 가 직접 가리키는 노드는 숨어 있어도 설명으로 읽힌다(accname).
    //   라벨 '준비 중'/'soon' → '기둥 없음'/'no column' (머리말 2026-09-23 정정 참고 — 곧 열린다는 약속이 아니라 지금 상태다).
    //   (2026-09-23 정정) 라벨 교체는 되돌렸다 — B1(PD 결정) 영역이다. 머리말 두 번째 정정 줄 참고.
    this.el.innerHTML = METRICS.map((m) => `
      <button class="pm-item${m.ready ? '' : ' pm-soon'}" role="menuitemradio"
              data-id="${m.id}" ${m.ready ? '' : `aria-disabled="true" aria-describedby="pm-why-${m.id}"`}>
        <i class="pm-ic" aria-hidden="true">${m.icon}</i><b>${i18n.ko ? m.ko : m.en}</b>${m.ready ? '' : `<em>${i18n.ko ? '준비 중' : 'soon'}</em><span id="pm-why-${m.id}" hidden>${i18n.ko ? m.whyKo : m.whyEn}</span>`}
      </button>`).join('');
    document.body.appendChild(this.el);
    // 2026-09-23 UX 자동 점검(axe critical ×5 aria-required-attr): aria-checked 는 showAt() 에서만 달려
    //   첫 국가 클릭 전까지 menuitemradio 다섯 개 모두 비어 있었다. 만들자마자 한 번 칠한다.
    this._paintActive();

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
      // 같은 사유가 aria-describedby(hidden span)로 이미 읽힌다 — 버튼 이름에 두 번 섞이지 않게 숨긴다(2026-09-23 UX 점검).
      tip.setAttribute('aria-hidden', 'true');
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
