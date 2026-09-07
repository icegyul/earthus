// 첫 방문 안내 — 레이어 57개를 아무 설명 없이 마주하면 대부분 첫 화면에서 나간다.
// 조작법과 '어디에 무엇이 있는지'만 한 번 알려주고 비켜선다. 다시 보려면 ? 버튼.
//
// 저장은 localStorage 한 줄뿐이고 서버로 아무것도 보내지 않는다.

const KEY = 'earthus.seen.intro.v1';

/* 첫 화면 안내가 한국어로만 있어서, 영어를 고른 사람이 v2 에서 처음 보는 글이
   통째로 한국어였다. 이 파일은 i18n 모듈을 안 쓰므로 여기서 언어를 읽는다. */
function isEn() {
  try {
    const v = localStorage.getItem('earthus.lang') || localStorage.getItem('earthus.v2.lang');
    if (v === 'en') return true;
    if (v === 'ko') return false;
  } catch (e) { /* 사생활 모드 */ }
  const nav = (navigator.languages && navigator.languages[0]) || navigator.language || '';
  return !/^ko/i.test(nav);
}
const EN = isEn();

const STEPS = EN ? [
  {
    icon: '🖱',
    title: 'Turn the Earth yourself',
    body: 'Drag to rotate, wheel or two fingers to zoom. Middle-click (two fingers up and down on mobile) tilts the view so you can look from the side.',
  },
  {
    icon: '🗂',
    title: 'The left handle is the data drawer',
    body: 'EARTHUS holds terrain, weather, ocean, people and hazards; AETHERUS holds space and orbits. Every real-data layer you can turn on is in there.',
  },
  {
    icon: '🛰',
    title: 'EARTH INTELLIGENCE on the right',
    body: 'What is happening now, the sky where you are, and the source and freshness of whatever you are looking at.',
  },
  {
    icon: '⤴',
    title: 'Share exactly what you see',
    body: 'The ⤴ button copies a link that carries the camera position and the layers you turned on. You can save the picture too.',
  },
] : [
  {
    icon: '🖱',
    title: '지구를 직접 돌려 보세요',
    body: '끌면 회전, 휠·두 손가락으로 줌. 마우스 휠 클릭(모바일은 두 손가락 위아래)으로 시점을 눕혀 옆면에서 볼 수 있습니다.',
  },
  {
    icon: '🗂',
    title: '왼쪽 손잡이 = 데이터 서랍',
    body: 'EARTHUS는 지형·날씨·해양·사람·재해, AETHERUS는 우주·궤도. 지금 켤 수 있는 실데이터 레이어가 모두 여기 있습니다.',
  },
  {
    icon: '🛰',
    title: '오른쪽 EARTH INTELLIGENCE',
    body: '지금 일어나는 사건, 내 위치의 하늘, 지금 보고 있는 것의 출처와 신선도를 읽는 곳입니다.',
  },
  {
    icon: '⤴',
    title: '보고 있는 화면을 그대로 공유',
    body: '위쪽 ⤴ 버튼이 카메라 위치·켜 놓은 레이어까지 담은 링크를 복사합니다. 지구 그림도 저장할 수 있어요.',
  },
];

// 이 문장은 제품의 약속이다. 옮길 때도 뜻을 깎지 않는다.
const PRINCIPLE = EN
  ? 'This app <b>never invents a value</b> — where there is no data it stays empty, and a badge says whether you are looking at an observation or a forecast.'
  : '이 앱은 <b>없는 값을 만들지 않습니다</b> — 데이터가 없으면 비워 두고, 관측인지 예보인지 배지로 밝힙니다.';

const HEAD_SUB = EN ? 'A living Earth, from real data' : '실데이터로 살아 있는 지구';
const GO = EN ? 'Go and see the Earth' : '지구 보러 가기';

export function initOnboard() {
  const dom = document.createElement('div');
  dom.id = 'intro';
  dom.innerHTML = `
    <div class="intro-card">
      <div class="intro-head">
        <b>EARTHUS</b>
        <span>${HEAD_SUB}</span>
        <button class="intro-x" data-intro="close" aria-label="${window.__earthusT ? window.__earthusT('close') : '닫기'}">✕</button>
      </div>
      <div class="intro-steps">
        ${STEPS.map((s) => `<div class="intro-step">
          <i>${s.icon}</i>
          <div><b>${s.title}</b><p>${s.body}</p></div>
        </div>`).join('')}
      </div>
      <div class="intro-foot">${PRINCIPLE}</div>
      <button class="intro-go" data-intro="close">${GO}</button>
    </div>`;
  document.body.appendChild(dom);

  const close = () => {
    dom.classList.remove('show');
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* 사생활 모드면 저장만 못 할 뿐 */ }
  };
  dom.addEventListener('click', (e) => {
    if (e.target === dom || e.target.closest('[data-intro="close"]')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dom.classList.contains('show')) close();
  });

  const open = () => dom.classList.add('show');

  let seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch (e) { seen = false; }
  if (!seen) setTimeout(open, 900);   // 지구가 먼저 보이고 나서 뜬다

  return { open, close };
}
