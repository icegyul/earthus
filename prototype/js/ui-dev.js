// 개발할 수 있는 것 — 갖고 있는데 안 쓰는 자료 목록 (운영자용)
//
// 받은 요청: "이거 관련해서 만들 수 있는건 뭐다 우리가 안쓰고 있다
//            이걸 관리자모드에 히든메뉴(개발할 수 있는 것) 이라고 해서 페이지에 정리해줘"
//
// ⚠️⚠️ **여기 적는 것은 전부 실제로 확인한 것만이다.** 짐작으로 채우면
//    "있는 줄 알고 화면을 만들었는데 없더라" 가 반복된다. 오늘만 세 번 겪었다.
//    확인 안 한 것은 `todo: true` 로 표시하고 무엇을 확인해야 하는지 적는다.
//
// ⚠️ 이 화면은 운영자용이다. 주소 뒤에 `#dev` 를 붙여야 설정에 줄이 나타난다.
//    (API 신청 관리 `#api` 와 같은 방식 — main.js 참고)

const $ = (s) => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* state
     'idle'   회색 — 받아만 두고 화면이 없다
     'part'   노랑 — 일부만 쓴다
     'block'  빨강 — 막혀 있다 (라이선스·연락·신청)
     'done'   초록 — 다 쓰고 있다 (대조용으로 몇 개만 둔다) */
/* ⚠️⚠️ **이 목록이 유일한 원본이다.** 앱(#dev)과 관리자 페이지(admin.html)가
   둘 다 여기서 가져다 쓴다. 두 곳에 따로 적으면 **한쪽만 고치게 된다** —
   그러면 관리자 페이지가 조용히 옛말을 하게 된다. */
export const GROUPS = [
  {
    title: '받아뒀는데 화면이 없다',
    note: '자료는 이미 S3 에 있다. 화면만 붙이면 된다.',
    items: [
      { s: 'done', name: '에코뱅크 조류 조사', size: '806,219건 · 342종 · 5km 격자 4,521칸',
        can: '취미 > 전국 조류 조사에서 조사 기록이 있는 5km 칸을 표시',
        warn: '⚠️ 현재 위치·개체수 지도가 아니다. 점 크기는 기록 건수다. '
            + '유료 상품·내보내기는 공식 세부 이용조건 확인 전 보류한다.' },
      { s: 'part', name: '바닷새 연도별 정점 기록', size: '19,739건 · 정점 37곳 · 2015–2023',
        can: '정점마다 9년 변화 — 지금은 종별 변화만 보여준다',
        warn: '⚠️ 반드시 조사 횟수로 나눠서 보여줄 것. 원값으로 그리면 '
            + '2016년(조사 1,035번)이 낮아 보이는데 한 번당으로는 9년 중 최고다.' },
      { s: 'idle', name: '해양조사 정점 물성', size: '31,212건',
        can: '정점별 수온·염분(wtchWtem·wtchSlnty) — 바닷새 좌표 붙이려고 받아뒀는데 나머지 칸은 안 본다',
        warn: '⚠️ 값이 비어 있는 줄이 많다. 얼마나 채워져 있는지 먼저 셀 것.' },
    ],
  },
  {
    title: '막혀 있다',
    note: '기술이 아니라 허락·연락이 필요하다.',
    items: [
      { s: 'block', name: '철새 원본 GPS 경로', size: '공개본은 179줄뿐',
        can: '거북처럼 진짜 이동 경로 — 자료에 추적기 코드(vt2031)가 있으니 기관은 갖고 있다',
        warn: '⚠️ 농림축산검역본부 역학조사과 054-912-0438 에 문의해야 한다. '
            + '가을 남하 자료도 같이 물어볼 것 — 공개본은 북상(1~5월)만이다.' },
      { s: 'block', name: '바다거북', size: '45마리 · 28,770점',
        can: '지금도 지도에 그린다. 다만 **분석 문장을 만들 수 없다**',
        warn: '⚠️ 공공누리 제4유형(상업적 이용금지·변경금지). 유료 기능에 못 섞는다. '
            + '국립해양생물자원관 041-950-0831 협의 필요.' },
      { s: 'block', name: 'GEMS (천리안2B 대기)', size: '—',
        can: '아시아 대기질 — 지금 쓰는 어느 자료보다 넓고 촘촘하다',
        warn: '⚠️ 제4유형으로 보인다. 확인 전에는 붙이지 않는다.' },
      { s: 'block', name: '에코뱅크 로드킬 · 유리창 충돌', size: '로드킬 5.6만 · 충돌 1만',
        can: '위치와 날짜가 있어 지도에 바로 올라간다. 시민 참여형이라 이야기도 있다',
        warn: '⚠️ **Open API 84개 어디에도 없다.** 홈페이지 배너에만 있고 '
            + "'국가중점개방데이터 다운로드'(파일)로만 열리는 듯하다. 따로 확인할 것." },
    ],
  },
  {
    title: '관광 흐름 — 공개 구현',
    note: '2026-08-20 기획 변경. 전지구를 거짓으로 채우지 않고 공식 범위가 있는 서울부터 연다.',
    items: [
      { s: 'done', name: '서울 관광 흐름', size: '공식 장소 121곳 · 5분 수집 · 저층 3D 블록',
        can: '서울시 현재 혼잡·기관 예측·집계 추세·날씨/대기질/특보·BEST TIME·대안·지켜보기',
        warn: '⚠️ 아래 2026-08-05 보류 판단은 이 개발문서 승인으로 폐기했다. '
            + '121곳 밖은 비어 있는 것이지 한산한 것이 아니다. '
            + '발급 키가 연결되기 전에는 서울시 sample 키의 광화문·덕수궁 1곳만 표시한다. '
            + 'OD 근거 없는 이동 방향, 운영시간, 입장 가능, 수용력, 안전 판단은 만들지 않는다.' },
      { s: 'done', name: 'Weather Card v7', size: '현재 · 24시간 · 10일 · 상세 8종',
        can: '관측과 공식 예보를 분리하고 시간 선택을 지구 레이어와 동기화',
        warn: '⚠️ 값마다 출처·관측/발표/유효 시각을 유지하며 Earthus가 새 예보를 만들지 않는다.' },
    ],
  },
  {
    title: '안 하기로 한 것',
    note: '이유가 있어서 안 한다. 다시 꺼낼 때 이 줄을 먼저 볼 것.',
    items: [
      { s: 'idle', name: '히마와리-9 원본 직접 수신', size: 'HSD 이진파일 · 1.4GB/10분',
        can: '—',
        warn: '⚠️ NetCDF 가 아니라 전용 이진 형식이고 대역폭이 크다. '
            + '지금 GIBS 타일로 충분하다. 얻는 것보다 드는 것이 크다.' },
      { s: 'idle', name: '국립수목원 조류자원', size: '—',
        can: '새 이름·사진 사전',
        warn: '⚠️ 표본 위치는 **채집한 자리**지 이동이 아니다. 이동 분석에는 못 쓴다.' },
      { s: 'idle', name: '봉우리 야생동식물 POI', size: '—',
        can: '—',
        warn: '⚠️ 이미 같은 기관 API 를 산 메뉴에서 쓰고 있고, 이동과 무관하다.' },
      /* ⚠️ 다만 같은 응답에 딸려 오는 재난문자(disaster)는 우리 것이 맞다.
         특보·지진·쓰나미와 같은 줄이고 "안전 정보는 영원히 무료"에 맞는다. */
      { s: 'idle', name: '↳ 그 응답의 재난문자', size: '같은 API 에 함께 옴',
        can: '폭염·호우 안전안내를 발표 시각·발령 구역과 함께 — '
           + '지금 특보(기상청)와 다른 계통이라 겹치지 않는다',
        warn: '위 인파는 미뤘지만 이것만 따로 가져오는 것은 검토할 만하다. '
            + '⚠️ 다만 행안부 재난문자 API 가 따로 있는지 먼저 확인할 것 — '
            + '서울시를 거치면 서울만 온다.' },
    ],
  },
  {
    title: '⚠️ 먼저 할 것 — 자료가 아니라 장사',
    note: '자료를 더 붙여도 돈 받는 길이 안 열리면 소용이 없다.',
    items: [
      { s: 'block', name: '토스 가맹점 신청', size: '사업자등록증 필요',
        can: '결제 코드는 다 있다. 막힌 건 키 하나뿐이다',
        warn: '⚠️ 테스트 키는 신청 즉시 나오고 그걸로 끝까지 돌려볼 수 있다.' },
      { s: 'block', name: 'billing.sql 실행', size: '1분',
        can: 'prototype/supabase/billing.sql → Supabase SQL Editor → Run',
        warn: "⚠️ 'destructive operations' 경고는 그 스크립트가 방금 만든 함수에 "
            + 'revoke 를 걸어서 나온다. 기존 자료는 안 건드린다.' },
      { s: 'block', name: '통신판매업 신고', size: '구청·시청',
        can: '—',
        warn: '⚠️⚠️ **신고번호 없이 유료 판매를 시작하면 안 된다.** 받으면 화면 아래 '
            + '사업자 정보에 함께 적어야 한다.' },
    ],
  },
];

const DOT = { idle: '#9aa4b2', part: '#e0c26a', block: '#f0785a', done: '#7fd8c8' };

/** 목록을 넣을 자리에 그린다. 앱과 관리자 페이지가 같은 함수를 쓴다.
 *  ⚠️ 여기서 만드는 class 이름(dev-*)은 두 곳의 CSS 에 다 있어야 한다. */
export function renderDevList(body) {
  if (!body) return;
  body.innerHTML = '';
  body.appendChild(el('p', 'dev-lead',
    '갖고 있는데 안 쓰는 자료와, 막혀 있는 것들입니다.<br>'
    + '<b>⚠️ 여기 적힌 숫자는 전부 실제로 받아서 확인한 값입니다.</b> '
    + '짐작으로 채우지 않았습니다 — 있는 줄 알고 화면을 만들었다가 없어서 '
    + '되돌린 일이 여러 번 있었습니다.'));

  GROUPS.forEach((g) => {
    body.appendChild(el('p', 'dev-h', esc(g.title)));
    body.appendChild(el('p', 'dev-sub', esc(g.note)));
    g.items.forEach((it) => {
      const card = el('div', 'dev-card');
      card.appendChild(el('div', 'dev-top',
        `<i style="background:${DOT[it.s] || DOT.idle}"></i>`
        + `<b>${esc(it.name)}</b><em>${esc(it.size)}</em>`));
      if (it.can && it.can !== '—') {
        card.appendChild(el('p', 'dev-can', esc(it.can).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')));
      }
      if (it.warn) {
        card.appendChild(el('p', 'dev-warn', esc(it.warn).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')));
      }
      body.appendChild(card);
    });
  });
}

export const devPanel = {
  open() {
    document.querySelectorAll('.sheet-panel.up').forEach((p) => p.classList.remove('up'));
    $('#devSheet')?.classList.add('up');
    renderDevList($('#devBody'));
    $('#devBody')?.appendChild(el('p', 'sub-legal',
      '⚠️ 이 화면은 운영자용입니다. 주소 뒤에 <code>#dev</code> 를 붙여야 나타납니다.<br>'
      + '관리자 페이지(<code>/admin.html</code>)에도 같은 목록이 있습니다 — '
      + '고칠 곳은 <code>prototype/js/ui-dev.js</code> 한 곳입니다.'));
  },

  close() { $('#devSheet')?.classList.remove('up'); },
};
