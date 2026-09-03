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
 */
(function () {
  'use strict';
  if (window.__earthSwitch) return;
  window.__earthSwitch = true;

  // 개발 서버(root=prototype/)와 배포(app/ 아래)에서 v3 경로가 다르다.
  var DEV = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  var EARTHS = [
    { id: 'earthus', label: 'EARTHUS',      href: '/' },
    { id: 'intel',   label: 'Intelligence', href: '/v2-three/' },
    { id: 'wonder',  label: 'WONDER',       href: DEV ? '/v3-kids/' : '/v3/' }
  ];

  // 지금 어느 지구인가. 긴 경로부터 본다 — '/' 는 무엇에나 걸리기 때문이다.
  function currentId() {
    var p = location.pathname;
    if (/^\/v3(-kids)?\//.test(p)) return 'wonder';
    if (/^\/v2/.test(p)) return 'intel';
    return 'earthus';
  }

  var css = [
    '.es-switch{position:fixed;top:14px;left:14px;z-index:9000;display:flex;align-items:stretch;',
    '  gap:2px;padding:3px;border-radius:999px;background:rgba(8,14,26,.72);',
    '  border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(10px);',
    '  -webkit-backdrop-filter:blur(10px);box-shadow:0 6px 22px rgba(0,0,0,.34);',
    '  font-family:"IBM Plex Sans KR","Malgun Gothic",system-ui,-apple-system,sans-serif}',
    '.es-switch a{display:flex;align-items:center;',
    '  padding:7px 15px;border-radius:999px;text-decoration:none;color:#C7D6EA;',
    '  font-size:13px;font-weight:500;letter-spacing:.01em;line-height:1.2;white-space:nowrap;',
    '  transition:background .15s ease,color .15s ease}',
    '.es-switch a:hover{background:rgba(255,255,255,.12);color:#fff}',
    '.es-switch a[aria-current="page"]{background:#fff;color:#0E1726;cursor:default}',
    '.es-switch a:focus-visible{outline:2px solid #7FB7F5;outline-offset:2px}',
    '@media (max-width:720px){',
    '  .es-switch{top:8px;left:8px;padding:2px}',
    '  .es-switch a{padding:6px 11px;font-size:12px}}',
    '@media (prefers-reduced-motion:reduce){.es-switch a{transition:none}}'
  ].join('\n');

  function mount() {
    if (document.querySelector('.es-switch')) return;

    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var here = currentId();
    var nav = document.createElement('nav');
    nav.className = 'es-switch';
    // 영어 화면에서 이 라벨만 한국어로 남는다(실측). 세 지구가 저장하는 키를 차례로 보고,
    // 없으면 기기 언어를 따른다 — 앱마다 i18n 모듈이 달라 여기서 직접 판단한다.
    var lang = 'ko';
    try {
      lang = localStorage.getItem('earthus.lang')
          || localStorage.getItem('earthus.v2.lang')
          || ((navigator.languages && navigator.languages[0]) || navigator.language || '');
    } catch (e) { lang = ''; }
    var ko = /^ko/i.test(lang || 'ko');
    nav.setAttribute('aria-label', ko ? '지구 고르기' : 'Choose an Earth');

    EARTHS.forEach(function (e) {
      var a = document.createElement('a');
      a.href = e.href;
      a.textContent = e.label;
      if (e.id === here) {
        a.setAttribute('aria-current', 'page');
        a.addEventListener('click', function (ev) { ev.preventDefault(); });
      }
      nav.appendChild(a);
    });

    document.body.appendChild(nav);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
