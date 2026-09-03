/* EARTHUS — 상단 도구바 (좌상단 지구 전환기 오른쪽)
 *
 * PD 지시: "오른쪽 메뉴를 좌상단 지구선택메뉴 오른쪽에 통합해줘.
 *           그럼 v1, v3도 여기서 설정과 로그인, 기능설명 넣으면 되겠어"
 *
 * 세 지구가 각자 다른 자리에 도구를 두면 사용자는 앱을 옮길 때마다 다시 찾아야 한다.
 * 전환기(js/earth-switch.js) 바로 오른쪽 한 자리로 모은다.
 *
 * 이 파일은 **자리와 생김새만** 맡는다. 무엇을 넣을지는 앱이 정한다 —
 * v1 과 v3 는 가진 것이 다르기 때문이다(v3 에는 계정이 없다).
 *
 *   window.earthusAppBar.set([
 *     { id: 'help', glyph: '?', label: '기능 설명', onClick() {...} },
 *     ...
 *   ]);
 *
 * 붙이는 법: earth-switch.js 뒤에
 *   <script src="/js/app-bar.js" defer></script>
 *
 * 전환기 폭은 **재서** 쓴다. 적어 두면 라벨이 바뀌거나 언어가 달라질 때 겹친다.
 * earth-switch.js 는 건드리지 않는다 — 세 지구가 함께 쓰는 남의 파일이다.
 */
(function () {
  'use strict';
  if (window.earthusAppBar) return;

  var GAP = 10;          // 전환기와의 간격
  var NARROW = 700;      // 이보다 좁으면 나란히 두지 않고 아래로 내린다
  var items = [];
  var bar = null;

  var css = [
    '.ab-bar{position:fixed;top:14px;left:14px;z-index:8999;display:flex;align-items:stretch;',
    '  gap:2px;padding:3px;border-radius:999px;background:rgba(8,14,26,.72);',
    '  border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(10px);',
    '  -webkit-backdrop-filter:blur(10px);box-shadow:0 6px 22px rgba(0,0,0,.34);',
    '  font-family:"IBM Plex Sans KR","Malgun Gothic",system-ui,-apple-system,sans-serif}',
    '.ab-bar button{display:flex;align-items:center;gap:6px;',
    '  padding:7px 13px;border-radius:999px;border:0;background:transparent;color:#C7D6EA;',
    '  font-family:inherit;font-size:13px;font-weight:500;line-height:1.2;white-space:nowrap;',
    '  cursor:pointer;transition:background .15s ease,color .15s ease}',
    '.ab-bar button:hover{background:rgba(255,255,255,.12);color:#fff}',
    '.ab-bar button:focus-visible{outline:2px solid #7FB7F5;outline-offset:2px}',
    '.ab-bar .ab-g{font-size:14px;line-height:1}',
    /* 좁은 화면에서는 글자를 접고 기호만 남긴다 — 접지 않으면 전환기와 함께 잘린다. */
    '@media (max-width:900px){.ab-bar .ab-t{display:none}.ab-bar button{padding:7px 10px}}',
    '@media (max-width:720px){.ab-bar{padding:2px}.ab-bar button{padding:6px 9px;font-size:12px}}',
    '@media (prefers-reduced-motion:reduce){.ab-bar button{transition:none}}'
  ].join('\n');

  function style() {
    if (document.getElementById('ab-style')) return;
    var s = document.createElement('style');
    s.id = 'ab-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function place() {
    if (!bar) return;
    var sw = document.querySelector('.es-switch');
    if (!sw) { bar.style.left = '14px'; bar.style.top = '14px'; return; }
    var r = sw.getBoundingClientRect();
    if (window.innerWidth < NARROW) {
      // 나란히 두면 둘 다 잘린다. 전환기 아래로 내린다.
      bar.style.left = Math.round(r.left) + 'px';
      bar.style.top = Math.round(r.bottom + 8) + 'px';
    } else {
      bar.style.left = Math.round(r.right + GAP) + 'px';
      bar.style.top = Math.round(r.top) + 'px';
    }
  }

  function render() {
    style();
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'ab-bar';
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', 'EARTHUS 도구');
      document.body.appendChild(bar);
    }
    bar.textContent = '';
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.title = it.title || it.label || '';
      if (it.label) b.setAttribute('aria-label', it.label);
      var g = document.createElement('span');
      g.className = 'ab-g';
      g.textContent = it.glyph || '·';
      b.appendChild(g);
      if (it.label) {
        var t = document.createElement('span');
        t.className = 'ab-t';
        t.textContent = it.label;
        b.appendChild(t);
      }
      b.onclick = function (e) {
        e.preventDefault();
        try { it.onClick && it.onClick(); } catch (err) { console.warn('[app-bar]', err); }
      };
      bar.appendChild(b);
    });
    bar.hidden = items.length === 0;
    place();
  }

  window.earthusAppBar = {
    set: function (list) {
      items = Array.isArray(list) ? list.filter(Boolean) : [];
      render();
      // 전환기가 defer 로 늦게 붙을 수 있다. 몇 번 더 자리를 확인한다.
      [120, 400, 1200].forEach(function (ms) { setTimeout(place, ms); });
      return this;
    },
    refresh: render,
    place: place
  };

  window.addEventListener('resize', place);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', place);
  }
})();
