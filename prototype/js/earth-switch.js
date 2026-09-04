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
 * 붙이는 법: 각 index.html 의 </body> 앞에
 *   <script src="/js/earth-switch.js" defer></script>
 *
 * 스타일과 마크업을 스스로 넣고 밖의 CSS 를 건드리지 않는다 — 세 지구의 CSS 가
 * 서로 다르기 때문이다. 클래스 이름에 es- 를 붙여 충돌을 피한다.
 *
 * ── 좁은 화면 (2026-09-04, iPhone 16 신고 반영) ────────────────────────────
 * 신고: "3개 지구 선택하는 글이 시계 위에 있어서 안 예뻐", "설정·로그인이 따로 떠 있어".
 * 폰에서는 세 지구를 늘 펴 두지 않는다. **EARTHUS 로고 하나로 접어** 두고,
 * 누르면 오른쪽으로 세 지구가 펴지고 그 아래에 도움말·설정·로그인이 세로로 붙는다.
 *   · 도움말·설정·로그인은 여기서 새로 만들지 않는다 — 각 지구가 이미 가진 단추를
 *     **찾아서 입양**하고(원래 자리에서는 숨긴다) 누르면 그 단추를 대신 누른다.
 *     그래야 세 지구의 서로 다른 동작이 그대로 살아 있고, 여기에 로직이 안 생긴다.
 *     v3(키즈)에는 설정·로그인이 없다 — 없는 것은 줄도 안 만든다.
 *   · 지금 있는 지구를 누르면 그 지구의 **처음 화면**으로 간다(해시를 떼고 이동).
 *   · 연 뒤 10초는 강제로 떠 있고, 지구나 다른 메뉴를 만지면 그때부터 다시 10초를
 *     센 뒤 접힌다 — 만지자마자 사라지면 뭘 눌렀는지 확인할 새가 없다.
 * 넓은 화면은 예전 그대로다(세 알약이 늘 펴져 있음).
 */
(function () {
  'use strict';
  if (window.__earthSwitch) return;
  window.__earthSwitch = true;

  // 개발 서버(root=prototype/)와 배포(app/ 아래)에서 v3 경로가 다르다.
  var DEV = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var NARROW = '(max-width:720px)';
  var HOLD_MS = 10000;   // 연 뒤 강제로 떠 있는 시간

  var EARTHS = [
    { id: 'earthus', label: 'EARTHUS',      href: '/' },
    { id: 'intel',   label: 'Intelligence', href: '/v2-three/' },
    { id: 'wonder',  label: 'WONDER',       href: DEV ? '/v3-kids/' : '/v3/' }
  ];

  /* 각 지구가 이미 갖고 있는 단추를 찾는 열쇠. 앞에서부터 먼저 맞는 것을 쓴다.
     v2 는 id, v1·v3 는 aria-label 로만 구분된다(공용 앱바가 id 를 안 준다).
     영어 화면에서는 라벨이 바뀌므로 두 언어를 다 적는다. */
  var ADOPT = [
    { id: 'help', ko: '도움말', en: 'Help',
      sel: '#btn-help,[aria-label="기능 설명"],[aria-label="이게 뭐야"],[aria-label="What is this"],[aria-label="Show the walkthrough again"]' },
    { id: 'settings', ko: '설정', en: 'Settings',
      sel: '#btn-settings,[aria-label="설정"],[aria-label="Settings"]' },
    { id: 'login', ko: '로그인', en: 'Sign in',
      sel: '#btn-login,[aria-label="로그인"],[aria-label="Sign in"],[aria-label="Sign in / account"]' }
  ];

  // 지금 어느 지구인가. 긴 경로부터 본다 — '/' 는 무엇에나 걸리기 때문이다.
  function currentId() {
    var p = location.pathname;
    if (/^\/v3(-kids)?\//.test(p)) return 'wonder';
    if (/^\/v2/.test(p)) return 'intel';
    return 'earthus';
  }

  var css = [
    '.es-switch{position:fixed;top:14px;left:14px;z-index:9000;',
    '  display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:3px;',
    '  border-radius:999px;background:rgba(8,14,26,.72);',
    '  border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(10px);',
    '  -webkit-backdrop-filter:blur(10px);box-shadow:0 6px 22px rgba(0,0,0,.34);',
    '  font-family:"IBM Plex Sans KR","Malgun Gothic",system-ui,-apple-system,sans-serif}',
    '.es-row{display:flex;align-items:stretch;gap:2px}',
    '.es-earths{display:flex;align-items:stretch;gap:2px}',
    '.es-switch a,.es-logo,.es-more button{display:flex;align-items:center;',
    '  padding:7px 15px;border-radius:999px;text-decoration:none;color:#C7D6EA;',
    '  font-size:13px;font-weight:500;letter-spacing:.01em;line-height:1.2;white-space:nowrap;',
    '  background:none;border:0;font-family:inherit;cursor:pointer;',
    '  transition:background .15s ease,color .15s ease}',
    '.es-switch a:hover,.es-logo:hover,.es-more button:hover{background:rgba(255,255,255,.12);color:#fff}',
    '.es-switch a[aria-current="page"]{background:#fff;color:#0E1726}',
    '.es-switch a:focus-visible,.es-logo:focus-visible,.es-more button:focus-visible{outline:2px solid #7FB7F5;outline-offset:2px}',
    // 넓은 화면: 예전 그대로 — 로고와 더보기는 없다.
    '.es-logo,.es-more{display:none}',
    '@media ' + NARROW + '{',
    '  .es-switch{top:8px;left:8px;padding:2px;gap:0}',
    '  .es-switch a,.es-logo,.es-more button{padding:8px 12px;font-size:13px}',
    // 접힌 상태 = 로고 하나. 편 상태에서만 지구들과 더보기가 나온다.
    '  .es-logo{display:flex;font-weight:700;letter-spacing:.06em}',
    '  .es-earths{display:none}',
    '  .es-switch.es-open{border-radius:18px;padding:4px}',
    '  .es-switch.es-open .es-earths{display:flex}',
    '  .es-switch.es-open .es-more{display:flex;flex-direction:column;align-items:stretch;',
    '    gap:1px;margin-top:3px;padding-top:4px;border-top:1px solid rgba(255,255,255,.14)}',
    '  .es-more button{justify-content:flex-start;color:#AFC2DA;font-size:13px}',
    // 입양한 단추는 원래 자리에서 숨긴다 — 같은 것이 두 군데 있으면 안 된다.
    // ⚠️ 클래스를 붙여 숨기면 안 된다: v1·v3 의 공용 앱바는 부팅 뒤에 **다시 그려져서**
    //    붙여 둔 클래스가 통째로 날아간다(실측 — 숨겼는데 ? ⚙ ○ 가 되살아났다).
    //    그래서 선택자 자체를 CSS 에 박는다. 다시 그려도 계속 숨겨진다.
    '  ' + ADOPT.map(function (a) { return a.sel; }).join(',') + '{display:none!important}',
    '  .es-bar-empty{display:none!important}}',
    '@media (prefers-reduced-motion:reduce){.es-switch a,.es-logo,.es-more button{transition:none}}'
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

    var row = document.createElement('div');
    row.className = 'es-row';

    var logo = document.createElement('button');
    logo.type = 'button';
    logo.className = 'es-logo';
    logo.textContent = 'EARTHUS';
    logo.setAttribute('aria-expanded', 'false');
    logo.setAttribute('aria-label', ko ? '지구와 메뉴 고르기' : 'Earths and menu');
    row.appendChild(logo);

    var earths = document.createElement('div');
    earths.className = 'es-earths';
    EARTHS.forEach(function (e) {
      var a = document.createElement('a');
      a.href = e.href;
      a.textContent = e.label;
      if (e.id === here) {
        a.setAttribute('aria-current', 'page');
        /* 지금 있는 지구를 누르면 **처음 화면**으로 돌아간다.
           예전에는 아무 일도 하지 않았는데(preventDefault), 폰에서는 접힌 메뉴를 열어
           자기 지구를 누르는 것이 "처음으로"라는 뜻으로 읽힌다. 해시를 떼고 가야
           링크로 복원된 카메라·레이어까지 초기화된다. */
        a.addEventListener('click', function (ev) {
          ev.preventDefault();
          if (location.hash || location.search) location.href = e.href;
          else location.reload();
        });
      }
      earths.appendChild(a);
    });
    row.appendChild(earths);
    nav.appendChild(row);

    var more = document.createElement('div');
    more.className = 'es-more';
    nav.appendChild(more);

    document.body.appendChild(nav);

    /* ── 각 지구의 단추 입양 ──────────────────────────────────────────────
       앱바를 늦게 만드는 지구가 있어서(v1·v3 는 부팅이 끝난 뒤에 만든다)
       몇 번 더 찾아본다. 이미 입양한 것은 다시 넣지 않는다. */
    var adopted = {};
    function adopt() {
      ADOPT.forEach(function (a) {
        if (adopted[a.id]) return;
        var src;
        try { src = document.querySelector(a.sel); } catch (e) { src = null; }
        if (!src) return;                       // 이 지구에 없는 메뉴는 줄도 만들지 않는다
        adopted[a.id] = true;
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = ko ? a.ko : a.en;
        /* ⚠️ 찾아 둔 노드를 붙잡지 않고 **누를 때 다시 찾는다.** 앱바가 다시 그려지면
           붙잡아 둔 노드는 화면에서 떨어져 나가 눌러도 아무 일이 없다. */
        b.addEventListener('click', function () {
          close();
          var live = document.querySelector(a.sel);
          if (live) live.click();               // 동작은 각 지구의 것이다
        });
        more.appendChild(b);
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
