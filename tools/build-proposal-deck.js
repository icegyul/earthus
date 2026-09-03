// EARTHUS 세 지구 메뉴 구조 분석 · 통합 제안
// 숫자는 전부 코드에서 뽑은 실측값이다.
const pptxgen = require('pptxgenjs');

const P = {
  bg:    '0B1220',   // 깊은 우주 남색 — 제품이 실제로 쓰는 배경
  card:  '141F33',
  card2: '1B2942',
  line:  '2A3A55',
  blue:  '4A90D9',   // 제품 강조색
  sky:   '7FB7F5',
  warm:  'F0A882',   // 기입 모형의 기온 색
  green: '8FD3A6',   // 이슬점 색
  text:  'E8EEF6',
  dim:   '9DB0C6',
  faint: '6B7F99',
  white: 'FFFFFF',
};
const KO = 'Malgun Gothic';
const W = 13.333, H = 7.5;

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.author = 'EARTHUS';
pres.title = 'EARTHUS 세 지구 — 메뉴 구조 분석과 통합 제안';

const bg = () => ({ color: P.bg });

function slide(opts = {}) {
  const s = pres.addSlide();
  s.background = bg();
  if (opts.eyebrow) {
    s.addText(opts.eyebrow, {
      x: 0.62, y: 0.42, w: 8, h: 0.3, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 12, bold: true, color: P.blue, charSpacing: 2,
    });
  }
  if (opts.title) {
    s.addText(opts.title, {
      x: 0.6, y: 0.72, w: 12.1, h: 0.85, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 32, bold: true, color: P.text,
    });
  }
  if (opts.sub) {
    s.addText(opts.sub, {
      x: 0.62, y: 1.58, w: 12.1, h: 0.5, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 14, color: P.dim, lineSpacing: 21,
    });
  }
  return s;
}

// 카드 하나
function card(s, x, y, w, h, fill) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.12,
    fill: { color: fill || P.card }, line: { color: P.line, width: 1 },
  });
}

function chip(s, x, y, label, color) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w: 0.95, h: 0.28, rectRadius: 0.14,
    fill: { color: color }, line: { type: 'none' },
  });
  s.addText(label, {
    x, y, w: 0.95, h: 0.28, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 9, bold: true, color: P.bg, align: 'center', valign: 'middle',
  });
}

/* ───────────────────────── 1. 표지 ───────────────────────── */
{
  const s = pres.addSlide();
  s.background = bg();
  // 지구를 암시하는 큰 원 — 장식이 아니라 주제
  s.addShape(pres.ShapeType.ellipse, {
    x: 8.6, y: -0.9, w: 6.6, h: 6.6,
    fill: { color: P.card2 }, line: { color: P.line, width: 1 },
  });
  s.addShape(pres.ShapeType.ellipse, {
    x: 9.55, y: 0.05, w: 4.7, h: 4.7,
    fill: { color: P.card }, line: { color: P.blue, width: 1 },
  });
  s.addText('EARTHUS', {
    x: 0.9, y: 1.55, w: 8, h: 0.5, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 15, bold: true, color: P.blue, charSpacing: 5,
  });
  s.addText('세 지구, 하나의 엔진', {
    x: 0.88, y: 2.1, w: 8.4, h: 1.1, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 46, bold: true, color: P.text,
  });
  s.addText('메뉴 구조를 실제로 세어 보고, 같은 기능이 어떻게 갈라졌는지 짚고,\n어떤 문법으로 다시 세울지 제안합니다.', {
    x: 0.9, y: 3.25, w: 7.6, h: 1.0, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 15, color: P.dim, lineSpacing: 26,
  });
  const stats = [['v1', '44', '레이어'], ['v2', '93', '레이어'], ['v3', '12', '버튼']];
  stats.forEach((t, i) => {
    const x = 0.9 + i * 2.5;
    s.addText(t[0], { x, y: 4.75, w: 2.2, h: 0.3, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 12, bold: true, color: P.blue });
    s.addText(t[1], { x, y: 5.05, w: 2.2, h: 0.75, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 44, bold: true, color: P.text });
    s.addText(t[2], { x, y: 5.82, w: 2.2, h: 0.3, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 12, color: P.faint });
  });
  s.addText('2026-09-03 · 코드에서 직접 센 값', {
    x: 0.9, y: 6.6, w: 8, h: 0.3, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 11, color: P.faint });
  s.addNotes('세 앱의 메뉴를 코드에서 직접 세어 비교했습니다. 숫자는 모두 실측값입니다.');
}

/* ───────────────────────── 2. 지금 이렇게 서 있다 ───────────────────────── */
{
  const s = slide({ eyebrow: '현황', title: '세 지구는 지금 이렇게 서 있다',
    sub: '같은 자료 저장소(S3 캐시)를 쓰지만, 메뉴는 각자 자랐습니다.' });
  const apps = [
    { n: 'EARTHUS  v1', u: 'earthus.net', c: P.blue,
      d: '생활과 안전의 지구', m: ['레이어 44개 · 10묶음', '별도 화면 15개 (해양·연구·관측소…)', '계정·구독·관리자'] },
    { n: 'Intelligence  v2', u: '/v2', c: P.sky,
      d: '분석과 시간축의 지구', m: ['레이어 93개 · 7씬 (준비중 4)', '5일 예보 · 진리등급 배지', 'LLM 문답 · 3D 지형'] },
    { n: 'WONDER  v3', u: '/v3', c: P.warm,
      d: '아이의 지구', m: ['버튼 12개 · 한 화면', '공룡 · 판게아 · 충돌구', '4~9세, 읽는 글 최소'] },
  ];
  apps.forEach((a, i) => {
    const x = 0.6 + i * 4.12;
    card(s, x, 2.25, 3.85, 3.9);
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.32, y: 2.6, w: 0.42, h: 0.42,
      fill: { color: a.c }, line: { type: 'none' } });
    s.addText(a.n, { x: x + 0.95, y: 2.6, w: 2.7, h: 0.3, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 15, bold: true, color: P.text });
    s.addText(a.u, { x: x + 0.95, y: 2.88, w: 2.7, h: 0.26, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 10, color: P.faint });
    s.addText(a.d, { x: x + 0.32, y: 3.35, w: 3.2, h: 0.35, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 17, bold: true, color: a.c });
    s.addText(a.m.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < a.m.length - 1 } })), {
      x: x + 0.32, y: 3.85, w: 3.25, h: 2.0, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 12.5, color: P.dim, lineSpacing: 20, paraSpaceAfter: 7 });
  });
  s.addText('공통 상단 도구바는 오늘 세 지구에 같은 자리로 통합했습니다.', {
    x: 0.62, y: 6.45, w: 12, h: 0.3, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 12, color: P.faint });
  s.addNotes('v2가 레이어 수로는 가장 큽니다. v1은 별도 화면이 많아 메뉴 밖에도 기능이 있습니다.');
}

/* ───────────────────────── 3. 겹침의 실제 크기 ───────────────────────── */
{
  const s = slide({ eyebrow: '겹침', title: '무엇이 겹치고 무엇이 그 앱에만 있나',
    sub: 'id 가 달라도 같은 것을 세려면 개념으로 이어야 합니다. 손으로 이어 센 값입니다.' });
  const big = [
    { n: '23', l: 'v1 ∩ v2\n같은 개념', c: P.blue },
    { n: '6', l: '세 지구 모두\n있는 개념', c: P.sky },
    { n: '21', l: 'v1 에만', c: P.warm },
    { n: '69', l: 'v2 에만', c: P.green },
  ];
  big.forEach((b, i) => {
    const x = 0.6 + i * 3.1;
    card(s, x, 2.3, 2.85, 1.85);
    s.addText(b.n, { x: x + 0.25, y: 2.5, w: 2.4, h: 0.9, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 46, bold: true, color: b.c });
    s.addText(b.l, { x: x + 0.25, y: 3.42, w: 2.4, h: 0.6, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 11.5, color: P.dim, lineSpacing: 16 });
  });
  card(s, 0.6, 4.45, 5.95, 1.95, P.card2);
  s.addText('세 지구 모두 있는 여섯 가지', { x: 0.9, y: 4.68, w: 5.4, h: 0.32, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 14, bold: true, color: P.sky });
  s.addText('구름 · 비 · 기온 · 바람 · 지진 · 낙뢰', { x: 0.9, y: 5.05, w: 5.4, h: 0.45, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 19, bold: true, color: P.text });
  s.addText('여기가 «같은 자료, 다른 문법» 을 세울 자리입니다.', {
    x: 0.9, y: 5.6, w: 5.4, h: 0.55, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 12, color: P.dim, lineSpacing: 18 });

  card(s, 6.75, 4.45, 5.98, 1.95);
  s.addText('그 앱에만 있는 것의 성격', { x: 7.05, y: 4.68, w: 5.4, h: 0.32, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 14, bold: true, color: P.warm });
  const only = [
    ['v1', '수증기 통로 · 최고/최저기온 · 미세먼지 · 안개 · 토양수분'],
    ['v2', '3D 지형 · 5일 예보 · 산림감소 · 인구 타워 · Argo · 우주'],
    ['v3', '공룡 발자국 · 옛 대륙 · 운석 충돌구'],
  ];
  only.forEach((o, i) => {
    s.addText(o[0], { x: 7.05, y: 5.06 + i * 0.42, w: 0.5, h: 0.3, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 11.5, bold: true, color: P.sky });
    s.addText(o[1], { x: 7.6, y: 5.06 + i * 0.42, w: 4.95, h: 0.34, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 10.5, color: P.dim });
  });
  s.addNotes('겹치는 23개가 통합의 대상이고, 여섯 개는 셋 다 있으니 표현 규칙을 세울 기준입니다.');
}

/* ───────────────────────── 4. 진단 — 축이 지켜지지 않는다 ───────────────────────── */
{
  const s = slide({ eyebrow: '진단 ①', title: '전환기는 시간축을 약속하는데, 내용이 지키지 않는다' });
  card(s, 0.6, 2.15, 12.13, 1.5, P.card2);
  s.addText('js/earth-switch.js 가 적어 둔 약속', { x: 0.95, y: 2.35, w: 6, h: 0.3, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 12, bold: true, color: P.blue });
  const axis = [['EARTHUS', '현재', '지금 지구에서 무슨 일이'],
                ['Intelligence', '미래', '앞으로 무슨 일이 — 예보와 시나리오'],
                ['WONDER', '과거', '여기까지 어떻게 왔나']];
  axis.forEach((a, i) => {
    const x = 0.95 + i * 4.0;
    s.addText(`${a[0]}  ·  ${a[1]}`, { x, y: 2.72, w: 3.8, h: 0.28, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 13, bold: true, color: P.text });
    s.addText(a[2], { x, y: 3.0, w: 3.8, h: 0.4, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 11, color: P.dim });
  });
  s.addText('그런데 실제로는', { x: 0.62, y: 3.95, w: 6, h: 0.35, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 16, bold: true, color: P.warm });
  const gaps = [
    ['«미래» 인 v2 에 실황이 잔뜩', '구름 실황 · 지진 실황 · 바람 관측 3천 개소 · 레이더 강수 · 기입 모형'],
    ['«현재» 인 v1 에 예보가 있다', '예보 바람 · 최고/최저기온 · 영국 예보'],
    ['«과거» 인 v3 에 현재가 대부분', '12개 중 공룡·판게아·충돌구 3개만 과거, 나머지는 지금 날씨'],
  ];
  gaps.forEach((g, i) => {
    const y = 4.42 + i * 0.72;
    card(s, 0.6, y, 12.13, 0.6);
    s.addText(g[0], { x: 0.95, y: y + 0.13, w: 4.3, h: 0.34, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 13, bold: true, color: P.text, valign: 'middle' });
    s.addText(g[1], { x: 5.35, y: y + 0.13, w: 7.1, h: 0.34, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 11.5, color: P.dim, valign: 'middle' });
  });
  s.addText('사용자는 «어디에 뭐가 있는지» 를 축이 아니라 기억으로 찾고 있습니다.', {
    x: 0.62, y: 6.72, w: 12, h: 0.32, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 12.5, color: P.faint });
  s.addNotes('이 어긋남이 메뉴가 커질수록 비용이 됩니다. 축을 지키거나, 축을 바꾸거나 둘 중 하나입니다.');
}

/* ───────────────────────── 5. 진단 ② — 같은 기능이 두 갈래로 ───────────────────────── */
{
  const s = slide({ eyebrow: '진단 ②', title: '같은 기능이 서로 모른 채 두 갈래로 자랐다' });
  const cases = [
    { t: '물어보기', a: 'v1 · 규칙 기반 라우터 856줄',
      b: 'v2 · LLM(제미니) + 승인된 3D 도구',
      note: 'v1 은 구조적으로 환각이 불가능하고, v2 는 문장으로 설명하고 장면을 옮긴다. 둘 다 옳다.' },
    { t: '태풍', a: 'v1 · 「태풍」 하나',
      b: 'v2 · 공식트랙 / 앙상블 / 유사경로 / 사건 / 시뮬 다섯',
      note: '같은 사건을 한쪽은 한 줄로, 한쪽은 다섯 줄로 낸다.' },
    { t: '사람', a: 'v1 · 관광 밀도 · 명소',
      b: 'v2 · 서울 실시간 / 도시 타워 / 인구 조각 / 국가 인구 / 지금×거주',
      note: '관측(지금 사람)과 추정(거주 인구)이 이름만으로는 안 갈린다.' },
    { t: '일기도 기호', a: 'v1 · 오늘 추가',
      b: 'v2 · 오늘 추가',
      note: '같은 규칙으로 두 곳에 만들었다 — 이게 유지되려면 규칙이 한 곳에 있어야 한다.' },
  ];
  cases.forEach((c, i) => {
    const y = 2.16 + i * 1.08;
    card(s, 0.6, y, 12.13, 1.0);
    s.addText(c.t, { x: 0.9, y: y + 0.14, w: 1.5, h: 0.35, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 15, bold: true, color: P.sky });
    s.addText(c.a, { x: 2.5, y: y + 0.13, w: 3.5, h: 0.3, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 11.5, color: P.text });
    s.addText(c.b, { x: 6.2, y: y + 0.13, w: 6.3, h: 0.3, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 11.5, color: P.text });
    s.addText(c.note, { x: 2.5, y: y + 0.5, w: 10, h: 0.35, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 11, color: P.faint });
  });
  s.addText('v1 의 라우터 주석이 이미 답을 적어 두었습니다 —\n«나중에 LLM 을 붙이는 날, LLM 이 하는 일은 질문 이해 → 이 라우터 호출 → 문장화다»', {
    x: 0.62, y: 6.55, w: 12, h: 0.58, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 11.5, italic: true, color: P.warm, lineSpacing: 16 });
  s.addNotes('두 구현을 합치는 방향은 이미 코드에 적혀 있습니다. LLM 이 라우터를 부르고 문장화합니다.');
}

/* ───────────────────────── 6. 제안 원칙 ───────────────────────── */
{
  const s = slide({ eyebrow: '제안 ①', title: '하나의 엔진, 세 문법',
    sub: '자료와 계산은 한 벌만 둡니다. 다른 것은 «누구에게 어떻게 보이는가» 뿐입니다.' });
  const layers = [
    { t: '자료 · 계산', d: 'S3 캐시 · Lambda · 진리등급 — 한 벌', c: P.blue, w: 12.13, x: 0.6 },
  ];
  card(s, 0.6, 2.3, 12.13, 1.0, P.card2);
  s.addText('공통 층 — 한 벌만 둔다', { x: 0.95, y: 2.5, w: 6, h: 0.3, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 13, bold: true, color: P.blue });
  s.addText('자료 수집(Lambda) · S3 캐시 · 진리등급 어휘 · 질문 라우터 · 공통 상단 도구바', {
    x: 0.95, y: 2.83, w: 11.4, h: 0.35, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 12.5, color: P.dim });

  const three = [
    { n: 'v1 · 지금', c: P.blue, sub: '읽는 사람: 오늘을 사는 어른',
      g: ['질문에 바로 답한다', '숫자와 경보가 먼저', '한 화면에 결론'] },
    { n: 'v2 · 깊이', c: P.sky, sub: '읽는 사람: 왜인지 알고 싶은 사람',
      g: ['시간축과 근거가 먼저', '진리등급을 항상 표기', '층을 겹쳐 스스로 판단'] },
    { n: 'v3 · 경이', c: P.warm, sub: '읽는 사람: 4~9세 아이',
      g: ['글자 대신 그림과 움직임', '단추 하나에 개념 하나', '«진짜 지금» 임을 말해준다'] },
  ];
  three.forEach((t, i) => {
    const x = 0.6 + i * 4.12;
    card(s, x, 3.55, 3.85, 2.75);
    s.addShape(pres.ShapeType.roundRect, { x: x + 0.3, y: 3.8, w: 1.75, h: 0.34, rectRadius: 0.17,
      fill: { color: t.c }, line: { type: 'none' } });
    s.addText(t.n, { x: x + 0.3, y: 3.8, w: 1.75, h: 0.34, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 11.5, bold: true, color: P.bg, align: 'center', valign: 'middle' });
    s.addText(t.sub, { x: x + 0.3, y: 4.25, w: 3.3, h: 0.3, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 11, color: P.faint });
    s.addText(t.g.map((g, j) => ({ text: g, options: { bullet: true, breakLine: j < t.g.length - 1 } })), {
      x: x + 0.3, y: 4.65, w: 3.3, h: 1.5, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 12.5, color: P.text, lineSpacing: 20, paraSpaceAfter: 8 });
  });
  s.addText('«같은 엔진, 다른 문법» — 기능을 나누는 것이 아니라 말투를 나눕니다.', {
    x: 0.62, y: 6.55, w: 12, h: 0.32, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 12.5, color: P.dim });
  s.addNotes('기능을 앱마다 다르게 두면 유지가 안 됩니다. 자료는 한 벌, 표현만 셋입니다.');
}

/* ───────────────────────── 7. 최적 메뉴 구성 ───────────────────────── */
{
  const s = slide({ eyebrow: '제안 ②', title: '최적 메뉴 구성',
    sub: '한국이 언제나 먼저입니다. 공통 여섯은 세 곳 모두, 나머지는 성격에 맞는 곳 하나에만 둡니다.' });
  const cols = [
    { h: 'v1 · 지금', c: P.blue, rows: [
      ['지금', '날씨 · 대기질 · 특보'],
      ['안전', '태풍 · 지진 · 산불 · 쓰나미'],
      ['내 주변', '관측소 · 부이 · 내 위치'],
      ['이동', '항공편 · 선박'],
      ['묻기', '질문 → 지구가 답한다'],
    ] },
    { h: 'v2 · 깊이', c: P.sky, rows: [
      ['시간', '5일 예보 · 산림감소 · 지진 25년'],
      ['땅과 바다', '3D 지형 · 해저 · 해수면 전망'],
      ['사람', '실시간 인구 · 도시 타워'],
      ['우주', '위성 · 태양 · 은하'],
      ['근거', '진리등급 · 사건 방 · 묻기'],
    ] },
    { h: 'v3 · 경이', c: P.warm, rows: [
      ['오늘 지구', '구름 · 비 · 번개 · 기온 · 바람'],
      ['땅', '산맥 · 강 · 지진'],
      ['아주 옛날', '공룡 · 옛 대륙 · 충돌구'],
      ['나', '내 위치 · 이게 뭐야'],
      ['—', '설정은 넣을 것이 생기면'],
    ] },
  ];
  cols.forEach((c, i) => {
    const x = 0.6 + i * 4.12;
    card(s, x, 2.35, 3.85, 4.05);
    s.addShape(pres.ShapeType.roundRect, { x: x + 0.3, y: 2.6, w: 1.55, h: 0.32, rectRadius: 0.16,
      fill: { color: c.c }, line: { type: 'none' } });
    s.addText(c.h, { x: x + 0.3, y: 2.6, w: 1.55, h: 0.32, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 11, bold: true, color: P.bg, align: 'center', valign: 'middle' });
    c.rows.forEach((r, j) => {
      const y = 3.12 + j * 0.63;
      s.addText(r[0], { x: x + 0.3, y, w: 3.3, h: 0.26, isTextBox: true, margin: 0,
        fontFace: KO, fontSize: 11.5, bold: true, color: c.c });
      s.addText(r[1], { x: x + 0.3, y: y + 0.26, w: 3.3, h: 0.3, isTextBox: true, margin: 0,
        fontFace: KO, fontSize: 11, color: P.dim });
    });
  });
  s.addText('묶음 이름을 자료 이름이 아니라 «사람이 하려는 일» 로 지었습니다 — 지금 / 안전 / 시간 / 근거.', {
    x: 0.62, y: 6.6, w: 12, h: 0.32, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 12, color: P.faint });
  s.addNotes('v2 의 93개는 7씬으로도 깊습니다. 사람이 하려는 일로 묶으면 찾는 시간이 줄어듭니다.');
}

/* ───────────────────────── 8. 같은 자료, 다른 문법 ───────────────────────── */
{
  const s = slide({ eyebrow: '제안 ③', title: '같은 자료, 다른 문법',
    sub: '세 지구 모두 있는 여섯 가지를 어떻게 다르게 낼지 규칙으로 못박습니다.' });
  const rows = [
    ['구름', '위성 영상 그대로', '두께 + 운정 높이로 세운 3D', '뭉게구름이 흘러간다'],
    ['비', '레이더 강수', '색면 + 번개 표식 · 5일 재생', '물방울이 떨어진다'],
    ['기온', '지금 몇 도', '평년 대비 편차', '덥다 · 춥다 두 색'],
    ['바람', '관측소 실측 화살', '입자 흐름 + 깃 기호', '바람이 분다'],
    ['지진', '방금 난 것 목록', '25년 이력 · 깊이 · 판 경계', '땅이 흔들린 곳'],
    ['낙뢰', '최근 60분 위치', '뇌우 표식 + 비 색면 위', '번쩍!'],
  ];
  const colX = [0.95, 3.15, 6.05, 10.15];
  const head = ['자료', 'v1 · 지금', 'v2 · 깊이', 'v3 · 경이'];
  const headC = [P.faint, P.blue, P.sky, P.warm];
  card(s, 0.6, 2.25, 12.13, 4.25);
  head.forEach((h, i) => {
    s.addText(h, { x: colX[i], y: 2.45, w: 2.7, h: 0.3, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 12, bold: true, color: headC[i] });
  });
  rows.forEach((r, i) => {
    const y = 2.92 + i * 0.58;
    if (i % 2 === 0) {
      s.addShape(pres.ShapeType.rect, { x: 0.75, y: y - 0.06, w: 11.8, h: 0.52,
        fill: { color: P.card2 }, line: { type: 'none' } });
    }
    r.forEach((t, j) => {
      s.addText(t, { x: colX[j], y, w: j === 0 ? 2.0 : (j === 3 ? 2.4 : 2.9), h: 0.4, isTextBox: true, margin: 0,
        fontFace: KO, fontSize: 12, bold: j === 0, color: j === 0 ? P.text : P.dim, valign: 'middle' });
    });
  });
  s.addText('값은 한 곳에서 오고, 말투만 셋입니다. 어느 지구에서 봐도 수는 같아야 합니다.', {
    x: 0.62, y: 6.7, w: 12, h: 0.32, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 12, color: P.faint });
  s.addNotes('표현이 달라도 값이 다르면 안 됩니다. 그게 이 규칙의 핵심입니다.');
}

/* ───────────────────────── 9. 디자인 제안 ───────────────────────── */
{
  const s = slide({ eyebrow: '제안 ④', title: '디자인 — 세 지구가 같은 규칙을 쓴다' });
  // 상단 도구바 재현
  card(s, 0.6, 2.2, 12.13, 1.35, P.card2);
  s.addText('① 한 줄 상단바 — 오늘 통합 완료', { x: 0.95, y: 2.38, w: 6, h: 0.3, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 12.5, bold: true, color: P.blue });
  const pill = ['EARTHUS', 'Intelligence', 'WONDER'];
  let px = 0.95;
  pill.forEach((t, i) => {
    const w = 0.35 + t.length * 0.088;
    s.addShape(pres.ShapeType.roundRect, { x: px, y: 2.78, w, h: 0.38, rectRadius: 0.19,
      fill: { color: i === 1 ? P.white : P.card }, line: { color: P.line, width: 1 } });
    s.addText(t, { x: px, y: 2.78, w, h: 0.38, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 10.5, bold: true, color: i === 1 ? P.bg : P.dim,
      align: 'center', valign: 'middle' });
    px += w + 0.08;
  });
  px += 0.25;
  ['?  기능 설명', '⚙  설정', '○  로그인'].forEach((t) => {
    const w = 0.3 + t.length * 0.088;
    s.addShape(pres.ShapeType.roundRect, { x: px, y: 2.78, w, h: 0.38, rectRadius: 0.19,
      fill: { color: P.card }, line: { color: P.line, width: 1 } });
    s.addText(t, { x: px, y: 2.78, w, h: 0.38, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 10.5, color: P.dim, align: 'center', valign: 'middle' });
    px += w + 0.08;
  });
  s.addText('세 지구 어디서나 같은 자리. 앱마다 담기는 것만 다릅니다.', {
    x: px + 0.2, y: 2.78, w: 3.2, h: 0.38, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 10.5, color: P.faint, valign: 'middle' });

  // 진리등급 배지
  card(s, 0.6, 3.75, 6.0, 2.6);
  s.addText('② 진리등급 배지 — 어휘를 하나로', { x: 0.95, y: 3.95, w: 5.3, h: 0.3, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 12.5, bold: true, color: P.blue });
  const badges = [
    ['관측', P.green, '기관이 실제로 잰 값'],
    ['공식예보', P.sky, '기관이 발표한 예보'],
    ['특보', 'F2C14E', '공식 경보'],
    ['모델', 'B08BE0', '제공자 수치모델'],
    ['자체분석', P.warm, 'EARTHUS 가 유도'],
    ['시뮬', P.faint, '가정 기반 · 예보 아님'],
  ];
  badges.forEach((b, i) => {
    const y = 4.35 + i * 0.34;
    chip(s, 0.95, y, b[0], b[1]);
    s.addText(b[2], { x: 2.05, y, w: 4.3, h: 0.28, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 11, color: P.dim, valign: 'middle' });
  });

  // 표현 원칙
  card(s, 6.85, 3.75, 5.88, 2.6);
  s.addText('③ 세 지구가 함께 지키는 것', { x: 7.2, y: 3.95, w: 5.2, h: 0.3, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 12.5, bold: true, color: P.blue });
  const rules = [
    '없는 값은 0 이 아니라 «비운다»',
    '관측과 예측을 같은 밝기로 그리지 않는다',
    '변환한 것은 변환했다고 카드에 적는다',
    '한국이 언제나 먼저 — 메뉴·목록·도시',
    '어두운 배경 · 값에만 색을 쓴다',
  ];
  s.addText(rules.map((r, i) => ({ text: r, options: { bullet: true, breakLine: i < rules.length - 1 } })), {
    x: 7.2, y: 4.35, w: 5.2, h: 1.9, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 12, color: P.text, lineSpacing: 19, paraSpaceAfter: 7 });
  s.addNotes('배지 어휘는 이미 v2 에 있습니다. v1·v3 로 넓히면 세 지구가 같은 말로 말합니다.');
}

/* ───────────────────────── 10. 실행 순서 ───────────────────────── */
{
  const s = slide({ eyebrow: '실행', title: '무엇부터 하면 되는가',
    sub: '값싼 것부터, 그리고 되돌리기 어려운 것은 나중에.' });
  const steps = [
    { n: '1', t: '묻기를 하나로', d: 'v1 라우터를 공용으로 올리고, v2 LLM 이 그 라우터를 부르게 한다. v1 주석이 예언한 구조 그대로.', c: P.blue, e: '엔진 통합' },
    { n: '2', t: '진리등급 어휘 통일', d: 'v2 의 배지 어휘를 v1·v3 로. 같은 자료가 세 곳에서 같은 이름으로 불린다.', c: P.sky, e: '표현 통일' },
    { n: '3', t: '공통 여섯의 문법 확정', d: '구름·비·기온·바람·지진·낙뢰를 세 문법으로 못박고 v3 를 그 기준으로 채운다.', c: P.warm, e: '문법' },
    { n: '4', t: '메뉴를 «하려는 일» 로', d: '자료 이름 대신 지금·안전·시간·근거로 다시 묶는다. 한국이 먼저.', c: P.green, e: '정보구조' },
    { n: '5', t: '축을 지키거나 바꾸거나', d: '현재/미래/과거를 지킬지, 지금·깊이·경이로 바꿀지 정한다. 이건 제품 결정.', c: 'B08BE0', e: '결정 필요' },
  ];
  steps.forEach((st, i) => {
    const y = 2.3 + i * 0.87;
    card(s, 0.6, y, 12.13, 0.74);
    s.addShape(pres.ShapeType.ellipse, { x: 0.88, y: y + 0.16, w: 0.42, h: 0.42,
      fill: { color: st.c }, line: { type: 'none' } });
    s.addText(st.n, { x: 0.88, y: y + 0.16, w: 0.42, h: 0.42, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 14, bold: true, color: P.bg, align: 'center', valign: 'middle' });
    s.addText(st.t, { x: 1.5, y: y + 0.09, w: 2.9, h: 0.3, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 13.5, bold: true, color: P.text });
    s.addText(st.e, { x: 1.5, y: y + 0.39, w: 2.9, h: 0.25, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 10, color: st.c });
    s.addText(st.d, { x: 4.5, y: y + 0.2, w: 8.0, h: 0.4, isTextBox: true, margin: 0,
      fontFace: KO, fontSize: 11.5, color: P.dim, valign: 'middle' });
  });
  s.addNotes('1~3 은 코드 작업, 4~5 는 제품 결정이 먼저 필요합니다.');
}

/* ───────────────────────── 11. 마무리 ───────────────────────── */
{
  const s = pres.addSlide();
  s.background = bg();
  s.addShape(pres.ShapeType.ellipse, { x: -2.2, y: 2.0, w: 7.4, h: 7.4,
    fill: { color: P.card }, line: { color: P.line, width: 1 } });
  s.addText('한 줄로', { x: 5.6, y: 2.35, w: 7, h: 0.4, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 13, bold: true, color: P.blue, charSpacing: 3 });
  s.addText('기능을 나누지 말고\n말투를 나눈다', { x: 5.55, y: 2.85, w: 7.2, h: 1.6, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 38, bold: true, color: P.text, lineSpacing: 46 });
  s.addText('자료와 계산은 한 벌. 세 지구는 같은 값을 다른 말투로 낸다.\n어느 지구에서 봐도 수는 같아야 하고, 없는 값은 어디서도 채우지 않는다.', {
    x: 5.58, y: 4.6, w: 7.1, h: 1.0, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 14, color: P.dim, lineSpacing: 24 });
  s.addText('EARTHUS · 2026-09-03', { x: 5.58, y: 6.3, w: 7, h: 0.3, isTextBox: true, margin: 0,
    fontFace: KO, fontSize: 11, color: P.faint });
  s.addNotes('원칙 한 줄로 끝냅니다.');
}

pres.writeFile({ fileName: 'EARTHUS_세지구_메뉴통합제안.pptx' })
  .then((f) => console.log('만듦:', f));
