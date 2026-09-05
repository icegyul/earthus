/* EARTHUS — 지구 전환기 (좌상단)
 *
 * 하나의 서비스가 시간축이 다른 세 지구를 갖는다.
 *   EARTHUS       현재   지금 지구에서 무슨 일이
 *   Intelligence  미래   앞으로 무슨 일이 — 예보와 시나리오
 *   WONDER        과거   여기까지 어떻게 왔나 — 대륙과 공룡
 *
 * 통합 이름은 EARTHUS 이고, 세 지구 어디에서나 같은 자리에서 서로 오갈 수 있어야
 * 한다. 그래서 세 파일이 각자 만들지 않고 이 한 곳만 고치면 되게 했다.
 *
 * AETHERUS(우주)는 여기 넣지 않는다 — 지구가 아니고, 기존처럼 메뉴 안에 둔다.
 *
 * ── 배포 주소 (2026-09-04) ──────────────────────────────────────────────
 * 실제 파일은 /v2/, /v3/ 에 있다(S3 키·deploy 스크립트 기준). 그런데 사람이
 * 보는 메뉴·링크는 어디서도 그 이름을 걸지 않는다 — /Intelligence, /wonder
 * 라는 별칭으로만 건다. /v2, /v3 는 주소창에 직접 쳤을 때만 열리는
 * "숨은 직통 주소"로 남겨 둔다(개발·확인용). 별칭은 같은 index.html 바이트를
 * <base href="/v2/"> 를 얹어 /Intelligence, /Intelligence/, /Intelligence/index.html
 * 세 키에 추가로 올려서 만든다 — tools/deploy-v2-three.sh, aws/deploy-v3-kids.sh
 * 의 "별칭 발행" 단계를 볼 것. 자산 파일을 통째로 복제하지 않는다.
 *
 * 붙이는 법: 각 index.html 의 </body> 앞에
 *   <script src="/js/earth-switch.js" defer></script>
 *
 * 스타일과 마크업을 스스로 넣고 밖의 CSS 를 건드리지 않는다 — 세 지구의 CSS 가
 * 서로 다르기 때문이다. 클래스 이름에 es- 를 붙여 충돌을 피한다.
 *
 * ── 좁은 화면 (2026-09-04, iPhone 16 신고 반영 — 2차 수정) ─────────────────
 * 1차 수정(로고 텍스트 "EARTHUS" 버튼 + 옆으로 펴지는 지구 목록 + 그 아래 펴지는
 * 더보기 목록)을 실기기로 보고 받은 지적 셋:
 *   · "EARTHUS 가 두 번 나온다" — 로고 버튼 자체가 글자 "EARTHUS" 였고, 펴면 그
 *     옆에 지구 목록의 첫 칸도 "EARTHUS" 였다. 화면엔 실제로 "EARTHUS EARTHUS
 *     Intelligence WONDER" 로 찍혔다.
 *   · "이 디자인이 예쁘니? 좌측으로 메뉴 생기고 하단으로 메뉴 생기고" — 한 번은
 *     옆으로, 한 번은 아래로, 두 방향으로 벌어지는 모양이 부담스럽다는 지적.
 *   · "도움말이 왜 여기 나와? 로그인과 설정만 말했는데" — 더보기 목록에 도움말을
 *     같이 넣은 건 내 임의 판단이었다. 요청한 적 없다.
 *
 * 그래서 다시 짰다:
 *   · 접힌 로고는 **글자가 아니라 브랜드 아이콘**(logo/earthus-appicon.svg,
 *     정본 자산 — 새로 그리지 않는다)이다. 글자가 없으니 지구 목록과 겹칠 이름이
 *     없다.
 *   · 펴면 로고 **바로 아래로 카드 하나만** 뜬다(옆으로 벌어지지 않는다). 그
 *     카드 안에 지구 셋 → 구분선 → 더보기(설정·로그인만)가 한 줄로 세로 나열된다.
 *   · 더보기는 **설정·로그인만** 입양한다. 도움말은 여기 넣지 않는다 — 딴 데
 *     넣을지는 다음 지시를 기다린다(첫 방문 안내는 각 지구가 이미 자동으로 한
 *     번 띄운다. 그건 그대로다).
 * 넓은 화면(>720px)은 손대지 않았다 — 세 알약이 늘 펴져 있는 예전 모습 그대로.
 */
(function () {
  'use strict';
  if (window.__earthSwitch) return;
  window.__earthSwitch = true;

  // 개발 서버(root=prototype/)와 배포(app/ 아래)에서 v3 경로가 다르다.
  var DEV = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var NARROW = '(max-width:720px)';
  var HOLD_MS = 10000;   // 연 뒤 강제로 떠 있는 시간
  // 정본 브랜드 아이콘(prototype/logo/) — 루트 상대경로라 세 지구 어디서 열어도
  // 같은 파일을 가리킨다(이 스크립트 자체도 같은 방식). 새로 그리지 않는다.
  var ICON = '/logo/earthus-appicon.svg';

  /* 주소창에 직접 치면 /v2, /v3 도 여전히 열린다(개발·확인용) — 다만 메뉴는
     아무 데서도 그 이름을 걸지 않는다. 메뉴가 거는 이름은 항상 /Intelligence,
     /wonder 다. 개발 서버(prototype/ 를 그대로 서빙)에는 이 별칭이 없으므로
     그때는 폴더명을 그대로 쓴다. */
  var EARTHS = [
    { id: 'earthus', label: 'EARTHUS',      href: '/' },
    { id: 'intel',   label: 'Intelligence', href: DEV ? '/v2-three/' : '/Intelligence' },
    { id: 'wonder',  label: 'WONDER',       href: DEV ? '/v3-kids/' : '/wonder' }
  ];

  /* 각 지구가 이미 갖고 있는 단추를 찾는 열쇠. **설정·로그인만** — 요청받은 것만 넣는다.
     v2 는 id, v1·v3 는 aria-label 로만 구분된다(공용 앱바가 id 를 안 준다).
     영어 화면에서는 라벨이 바뀌므로 두 언어를 다 적는다. */
  var ADOPT = [
    { id: 'settings', ko: '설정', en: 'Settings',
      sel: '#btn-settings,[aria-label="설정"],[aria-label="Settings"]' },
    { id: 'login', ko: '로그인', en: 'Sign in',
      sel: '#btn-login,[aria-label="로그인"],[aria-label="Sign in"],[aria-label="Sign in / account"]' }
  ];
  /* 도움말은 드롭다운에 넣지 말라는 지적을 받아 목록(ADOPT)에서는 뺐다.
     다만 목록에서만 빼고 원래 자리에 그대로 두면, 아이콘 버튼 바로 아래에
     동그란 "?" 하나만 외따로 남아 떠 있다(앱바의 나머지 두 개는 입양돼 사라졌으니).
     그 잔재가 더 지저분해서, 좁은 화면에서는 일단 통째로 숨긴다 — 목록에 다시
     넣으라는 지시가 오면 그때 넣는다. 첫 방문 안내는 각 지구가 이미 자동으로
     한 번 띄우므로 접근로가 아예 없어지는 것은 아니다. */
  var HELP_SEL = '#btn-help,[aria-label="기능 설명"],[aria-label="이게 뭐야"],'
    + '[aria-label="What is this"],[aria-label="Show the walkthrough again"]';

  // 지금 어느 지구인가. 긴 경로부터 본다 — '/' 는 무엇에나 걸리기 때문이다.
  // /v2, /v3 는 메뉴엔 없지만 주소창으로 직접 오는 방문은 여전히 있으므로 계속 인식한다.
  function currentId() {
    var p = location.pathname;
    if (/^\/v3(-kids)?(\/|$)/.test(p) || /^\/wonder(\/|$)/i.test(p)) return 'wonder';
    if (/^\/v2(\/|$)/.test(p) || /^\/v2-three(\/|$)/.test(p) || /^\/Intelligence(\/|$)/i.test(p)) return 'intel';
    return 'earthus';
  }

  var css = [
    // 넓은 화면(기본): 예전 그대로 — 알약 세 개가 늘 펴져 있다.
    '.es-switch{position:fixed;top:14px;left:14px;z-index:9000;',
    '  display:flex;align-items:stretch;gap:2px;padding:3px;',
    '  border-radius:999px;background:rgba(8,14,26,.72);',
    '  border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(10px);',
    '  -webkit-backdrop-filter:blur(10px);box-shadow:0 6px 22px rgba(0,0,0,.34);',
    '  font-family:"IBM Plex Sans KR","Malgun Gothic",system-ui,-apple-system,sans-serif}',
    '.es-switch>a{display:flex;align-items:center;',
    '  padding:7px 15px;border-radius:999px;text-decoration:none;color:#C7D6EA;',
    '  font-size:13px;font-weight:500;letter-spacing:.01em;line-height:1.2;white-space:nowrap;',
    '  transition:background .15s ease,color .15s ease}',
    '.es-switch>a:hover{background:rgba(255,255,255,.12);color:#fff}',
    '.es-switch>a[aria-current="page"]{background:#fff;color:#0E1726}',
    '.es-switch>a:focus-visible{outline:2px solid #7FB7F5;outline-offset:2px}',
    '.es-logo,.es-menu{display:none}',   // 넓은 화면엔 아이콘 버튼도 드롭다운도 없다
    '@media (prefers-reduced-motion:reduce){.es-switch>a{transition:none}}',

    // 좁은 화면: 브랜드 아이콘 버튼 하나 + 누르면 그 아래로 카드 하나.
    '@media ' + NARROW + '{',
    '  .es-switch{top:8px;left:8px;padding:0;background:none;border:0;',
    '    box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;',
    '    font-family:"IBM Plex Sans KR","Malgun Gothic",system-ui,-apple-system,sans-serif}',
    '  .es-switch>a{display:none}',      // 넓은 화면용 알약은 숨기고 드롭다운 쪽만 쓴다
    '  .es-logo{display:flex;align-items:center;justify-content:center;',
    '    width:40px;height:40px;padding:0;border:1px solid rgba(255,255,255,.18);',
    '    border-radius:11px;background:rgba(8,14,26,.78);overflow:hidden;',
    '    backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);',
    '    box-shadow:0 6px 18px rgba(0,0,0,.34);touch-action:manipulation}',
    '  .es-logo:active{background:rgba(20,28,44,.9)}',
    '  .es-logo img{width:100%;height:100%;display:block;object-fit:cover}',
    '  .es-switch.es-open .es-menu{display:flex}',
    '  .es-menu{position:absolute;top:46px;left:0;flex-direction:column;min-width:184px;',
    '    gap:1px;padding:6px;border-radius:14px;background:rgba(8,14,26,.92);',
    '    border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(14px);',
    '    -webkit-backdrop-filter:blur(14px);box-shadow:0 12px 32px rgba(0,0,0,.4)}',
    '  .es-menu a,.es-menu button{all:unset;box-sizing:border-box;display:flex;',
    '    align-items:center;width:100%;padding:11px 13px;border-radius:9px;',
    '    color:#C7D6EA;font-size:14px;font-weight:500;letter-spacing:.01em;',
    '    cursor:pointer;touch-action:manipulation}',
    '  .es-menu a:active,.es-menu button:active{background:rgba(255,255,255,.14)}',
    '  .es-menu a[aria-current="page"]{color:#fff;font-weight:700;background:rgba(255,255,255,.10)}',
    '  .es-menu .es-div{height:1px;margin:4px 8px;background:rgba(255,255,255,.14)}',
    // 입양한 단추는 원래 자리에서 숨긴다 — 같은 것이 두 군데 있으면 안 된다.
    // ⚠️ 클래스를 붙여 숨기면 안 된다: v1·v3 의 공용 앱바는 부팅 뒤에 **다시 그려져서**
    //    붙여 둔 클래스가 통째로 날아간다(실측 — 숨겼는데 ⚙ ○ 가 되살아났다).
    //    그래서 선택자 자체를 CSS 에 박는다. 다시 그려도 계속 숨겨진다.
    '  ' + ADOPT.map(function (a) { return a.sel; }).join(',') + ',' + HELP_SEL + '{display:none!important}',
    '  .es-bar-empty{display:none!important}}'
  ].join('\n');

  function mount() {
    if (document.querySelector('.es-switch')) return;

    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var here = currentId();
    // 영어 화면에서 이 라벨만 한국어로 남는다(실측). 세 지구가 저장하는 키를 차례로 보고,
    // 없으면 기기 언어를 따른다 — 앱마다 i18n 모듈이 달라 여기서 직접 판단한다.
    var lang = 'ko';
    try {
      lang = localStorage.getItem('earthus.lang')
          || localStorage.getItem('earthus.v2.lang')
          || ((navigator.languages && navigator.languages[0]) || navigator.language || '');
    } catch (e) { lang = ''; }
    var ko = /^ko/i.test(lang || 'ko');

    var nav = document.createElement('nav');
    nav.className = 'es-switch';
    nav.setAttribute('aria-label', ko ? '지구 고르기' : 'Choose an Earth');

    // 지금 있는 지구를 누르면 **처음 화면**으로 돌아간다. 해시를 떼고 가야
    // 링크로 복원된 카메라·레이어까지 초기화된다.
    var goHome = function (ev, href) {
      ev.preventDefault();
      if (location.hash || location.search) location.href = href;
      else location.reload();
    };

    // 넓은 화면용 알약 (예전 그대로) — nav 바로 아래 평평하게.
    EARTHS.forEach(function (e) {
      var a = document.createElement('a');
      a.href = e.href;
      a.textContent = e.label;
      if (e.id === here) {
        a.setAttribute('aria-current', 'page');
        a.addEventListener('click', function (ev) { goHome(ev, e.href); });
      }
      nav.appendChild(a);
    });

    // 좁은 화면용 아이콘 버튼.
    var logo = document.createElement('button');
    logo.type = 'button';
    logo.className = 'es-logo';
    logo.setAttribute('aria-expanded', 'false');
    logo.setAttribute('aria-label', ko ? '지구와 메뉴 고르기' : 'Earths and menu');
    var icon = document.createElement('img');
    icon.src = ICON;
    icon.alt = '';           // 버튼 자체의 aria-label 이 이미 설명한다
    icon.setAttribute('aria-hidden', 'true');
    logo.appendChild(icon);
    nav.appendChild(logo);

    // 좁은 화면용 드롭다운 카드 — 지구 셋 → 구분선 → 더보기(설정·로그인).
    var menu = document.createElement('div');
    menu.className = 'es-menu';
    menu.setAttribute('role', 'menu');
    EARTHS.forEach(function (e) {
      var a = document.createElement('a');
      a.href = e.href;
      a.textContent = e.label;
      a.setAttribute('role', 'menuitem');
      if (e.id === here) {
        a.setAttribute('aria-current', 'page');
        a.addEventListener('click', function (ev) { goHome(ev, e.href); });
      }
      menu.appendChild(a);
    });
    nav.appendChild(menu);   // 입양한 설정·로그인은 adopt() 가 menu 에 직접 쌓는다

    document.body.appendChild(nav);

    /* ── 설정·로그인 입양 ─────────────────────────────────────────────────
       앱바를 늦게 만드는 지구가 있어서(v1·v3 는 부팅이 끝난 뒤에 만든다)
       몇 번 더 찾아본다. 이미 입양한 것은 다시 넣지 않는다. */
    var adopted = {};
    var divider = null;
    function adopt() {
      ADOPT.forEach(function (a) {
        if (adopted[a.id]) return;
        var src;
        try { src = document.querySelector(a.sel); } catch (e) { src = null; }
        if (!src) return;                       // 이 지구에 없는 메뉴는 줄도 만들지 않는다
        adopted[a.id] = true;
        if (!divider) {
          divider = document.createElement('div');
          divider.className = 'es-div';
          menu.appendChild(divider);
        }
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        b.textContent = ko ? a.ko : a.en;
        /* ⚠️ 찾아 둔 노드를 붙잡지 않고 **누를 때 다시 찾는다.** 앱바가 다시 그려지면
           붙잡아 둔 노드는 화면에서 떨어져 나가 눌러도 아무 일이 없다. */
        b.addEventListener('click', function () {
          close();
          var live = document.querySelector(a.sel);
          if (live) live.click();               // 동작은 각 지구의 것이다
        });
        menu.appendChild(b);
      });
      syncBars();
    }
    // 앱바에 보이는 단추가 하나도 남지 않으면 빈 알약만 떠 있게 된다 — 통째로 숨긴다.
    function syncBars() {
      document.querySelectorAll('.ab-bar').forEach(function (bar) {
        var live = 0;
        for (var i = 0; i < bar.children.length; i += 1) {
          if (getComputedStyle(bar.children[i]).display !== 'none') live += 1;
        }
        bar.classList.toggle('es-bar-empty', live === 0);
      });
    }
    [0, 400, 1200, 2500, 5000].forEach(function (t) { setTimeout(adopt, t); });
    /* 앱바를 다시 그리는 지구가 있다 — 그때마다 빈 알약 판정을 새로 한다.
       ⚠️ 지구 화면은 DOM 이 쉴 새 없이 바뀐다. 변화마다 getComputedStyle 을 부르면
          강제 레이아웃이 초당 수백 번 일어나 폰에서 지구가 끊긴다 — 반드시 묶어서 센다. */
    try {
      var pending = 0;
      new MutationObserver(function () {
        if (pending) return;
        pending = setTimeout(function () { pending = 0; adopt(); }, 500);
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) { /* 옛 브라우저면 위의 재시도만으로 간다 */ }

    /* ── 펴고 접기 ───────────────────────────────────────────────────── */
    var timer = 0;
    function arm() { clearTimeout(timer); timer = setTimeout(close, HOLD_MS); }
    function open() {
      adopt();                       // 늦게 생긴 단추가 있으면 지금 잡는다
      nav.classList.add('es-open');
      logo.setAttribute('aria-expanded', 'true');
      arm();
    }
    function close() {
      clearTimeout(timer);
      nav.classList.remove('es-open');
      logo.setAttribute('aria-expanded', 'false');
    }
    logo.addEventListener('click', function () {
      if (nav.classList.contains('es-open')) close(); else open();
    });
    /* 바깥을 만져도 **즉시 닫지 않는다** — 연 뒤 10초는 강제로 떠 있고,
       만진 시점부터 다시 10초를 센다. 지구를 돌려 보고 나서 고르는 사람이 있다. */
    document.addEventListener('pointerdown', function (ev) {
      if (!nav.classList.contains('es-open')) return;
      if (nav.contains(ev.target)) return;
      arm();
    }, true);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
