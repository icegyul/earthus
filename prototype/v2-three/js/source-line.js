// EARTHUS v2 — 좌하단 출처 줄의 글 (B5 · 2026-09-23 PD 승인 + 정정)
//
// 무엇이 잘못돼 있었나:
//   ① 기온·바람·강수 색면을 켜도 좌하단 출처 줄은 구름 출처와 고정 크레딧만 말했다. 지금 화면의 색이 **무슨 모델의
//      몇 시 런 · 몇 시 유효값**인지는 위쪽 범례(#field-legend .fl-meta)에만 있었다 — 폰에서 범례를 가리면 출처가 없었다.
//      PD(2026-09-23): "화면 좌하단 구름출처 에 같이 나오게 하라고 몇번이야기하니".
//   ② 기본색 크레딧이 'Natural Earth II' 고정 글자였다(main.js paintSrc). 바탕을 블루마블·오늘의 지구(VIIRS)로 바꿔도
//      Natural Earth II 라고 말했다 — DEV-DIRECTIVE 지형 ③ '작지만 정직성 버그'.
//
// 이 파일이 하는 일: 순서를 **한 곳에서** 정한다(시험이 이 함수의 출력 순서를 본다).
//   1. 지금 켜진 색면의 출처·런·유효시각 — 범례가 화면에 그리는 글자 **그대로**(새로 지어내지 않는다)
//   2. 구름 출처(#cloud-note 그대로)
//   3. 늘 있는 크레딧 — AWS Terrarium 지형 · **지금 걸린** 바탕의 이름(+ 기준일이 있으면 그 날짜)
// 1 은 <span class="src-field"> 로 감싼다. 넓은 화면·눕힌 폰에서는 index.html 이 그 칸을 숨긴다
//   (넓은 화면은 범례가 오른쪽 아래에 늘 같이 서 있다 — 그 화면은 이번 변경에서 한 치도 안 바뀐다).
// 글자는 전부 이스케이프한다 — 범례 제목·구름 글은 남의 자료에서 온다. <b> 는 이 파일이 넣는 것뿐이다.
//
// ⚠️ 이 머리말에 import 식을 글자 그대로 적지 마라 — tools/build-v2-bundle.sh 4/4 가 주석 속 import 도 읽는다(field-legend.js 머리말).

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/**
 * 좌하단 출처 줄 HTML (순수).
 *   field  { title, meta } | null — 범례가 보일 때만. meta 는 legendMetaLine 이 만든 '출처 · 런 · 유효' 한 줄
 *   cloud  #cloud-note 글자 ('구름 끔' 도 그대로 — 끈 것도 사실이다)
 *   base   { src, date } | null — 지금 걸린 바탕. 모르면 null → 'Natural Earth II'(앱의 첫 바탕)로 물러서지 않고 이름을 뺀다
 *   ko     한국어 화면인가
 */
export const composeSourceLine = ({ field = null, cloud = '', base = { src: 'Natural Earth II' }, ko = true } = {}) => {
  const f = field ? [clean(field.title), clean(field.meta)].filter(Boolean) : [];
  const c = clean(cloud);
  const baseSrc = base && clean(base.src);
  const baseDate = base && clean(base.date);
  const fixed = [ko ? '<b>AWS Terrarium</b> 지형' : '<b>AWS Terrarium</b> terrain'];
  if (baseSrc) fixed.push(`<b>${esc(baseSrc)}</b> ${ko ? '기본색' : 'base'}${baseDate ? ` ${esc(baseDate)}` : ''}`);
  /* (2026-09-23 정정) 크레딧을 따로 감싼다. 폰 세로의 두 줄 자르기 안에 크레딧이 있으면 늘 잘려 ▾ 뒤로 숨었다(B5 검토 실측) —
     ESO·Esri·NASA 처럼 AWS Terrarium·Natural Earth II 도 '보이는 크레딧'이 이용 조건이고 v1 출처 독도 크레딧 줄은 접지 않는다.
     그래서 폰 세로에서는 크레딧을 **자르지 않는 셋째 줄**(.src-credit)로 세우고, 넓은 화면에서는 예전처럼 한 줄로 이어 읽힌다
     (.src-sep 은 이어 읽힐 때의 ' · ' — 폰 세로에서만 숨긴다). 글자 순서(색면 → 구름 → 크레딧)는 그대로다. */
  const fieldSpan = (trail) => (f.length
    ? `<span class="src-field"><b>${esc(f[0])}</b>${f[1] ? ` ${esc(f[1])}` : ''}${trail}</span>` : '');
  const main = c ? `${fieldSpan(' · ')}${esc(c)}` : fieldSpan('');
  const sep = main ? '<span class="src-sep"> · </span>' : '';
  return `<span class="src-main">${ko ? '출처' : 'Source'}: ${main}</span>${sep}<span class="src-credit">${fixed.join(' · ')}</span>`;
};

/** 범례 상자(#field-legend)에서 지금 그려진 제목·출처 줄을 읽는다. 숨었으면 null. */
export const readLegend = (el) => {
  if (!el || el.hidden) return null;
  const title = clean(el.querySelector('.fl-title')?.textContent);
  const meta = clean(el.querySelector('.fl-meta')?.textContent);
  return title || meta ? { title, meta } : null;
};
