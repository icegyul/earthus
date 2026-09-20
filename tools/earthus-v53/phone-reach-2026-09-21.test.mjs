// 2026-09-21 실기기(폰) 감사 — 375×812 · dpr 2 · 터치 5점에서 잰 세 가지를 잠근다.
//   ㉠ 하단 탐색 알약이 메뉴 패널의 마지막 묶음('생태 · 사람 · 여행')을 통째로 덮었다.
//      패널 본문이 스크롤되지도 않아 밀어서 꺼낼 수도 없었다 — 여섯 묶음 중 하나를 영영 못 연다.
//   ㉡ 상단 설정·로그인·기능설명이 폰에서 닿지 않았다. v2 는 유료 서비스다.
//   ㉢ 터치 표적이 30×28 · 43×24 · 33×24 · 184×16 · 12×10 — 모두 iOS 최소 44 미만이었다.
//
// 이 시험은 CSS 를 문자열로 뒤지지 않는다. 값을 **꺼내서 셈해** 견준다 —
// 규칙이 있다는 사실이 아니라 그 규칙이 내는 수가 옳은지를 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../prototype/v2-three/index.html', import.meta.url), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');

const VH = 812;          // 실측 기기 — iPhone 375 × 812
const VW = 375;

// ── 아주 작은 CSS 길이 셈기 ────────────────────────────────────────────────
// var() · calc() · min() · max() · env() 를 풀어 px 수 하나로 만든다.
// env(safe-area-inset-*) 는 0 으로 본다 — 노치가 있으면 여백은 **더** 늘어날 뿐이라
// 0 으로 잰 값이 가장 빡빡한 경우다(여기서 통과하면 노치 기기에서도 통과한다).
const rootVars = () => {
  const i = css.indexOf(':root');
  const body = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
  const out = {};
  for (const m of body.matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
};

const px = (expr, vars, env = {}, depth = 0) => {
  if (depth > 12) throw new Error(`var 순환: ${expr}`);
  const vw = env.vw ?? VW, vh = env.vh ?? VH;
  let s = String(expr).trim();
  s = s.replace(/var\((--[a-z-]+)\)/g, (_, n) => {
    if (!(n in vars)) throw new Error(`정의되지 않은 변수 ${n}`);
    return `(${px(vars[n], vars, env, depth + 1)}px)`;
  });
  s = s.replace(/env\([a-z-]+\)/g, '0px');
  s = s.replace(/(\d*\.?\d+)vh/g, (_, n) => `${(Number(n) / 100) * vh}px`);
  s = s.replace(/(\d*\.?\d+)vw/g, (_, n) => `${(Number(n) / 100) * vw}px`);
  // % 는 화면 높이로 푼다. 이 셈기는 세로 값(top·height·bottom·margin)에만 쓰므로
  // 고정 위치 요소의 % 기준은 언제나 뷰포트 높이다. 가로 값에는 % 를 쓰지 않는다.
  s = s.replace(/(\d*\.?\d+)%/g, (_, n) => `${(Number(n) / 100) * vh}px`);
  s = s.replace(/calc\(/g, '(').replace(/\bmin\(/g, 'Math.min(').replace(/\bmax\(/g, 'Math.max(');
  s = s.replace(/(\d*\.?\d+)px/g, '$1');
  const probe = s.replace(/Math\.(min|max)/g, '');
  if (!/^[\d\s.+\-*/(),]+$/.test(probe)) throw new Error(`못 읽는 길이: ${expr} → ${s}`);
  const v = Function(`"use strict"; return (${s});`)();
  if (!Number.isFinite(v)) throw new Error(`수가 아니다: ${expr}`);
  return v;
};

// 중괄호를 세어 @media 본문을 통째로 꺼낸다(안에 중첩 @media 가 있다).
const blocksOf = (header) => {
  const out = [];
  let i = 0;
  while ((i = css.indexOf(header, i)) !== -1) {
    let k = css.indexOf('{', i), depth = 0;
    for (; k < css.length; k++) {
      if (css[k] === '{') depth++;
      else if (css[k] === '}' && --depth === 0) break;
    }
    out.push(css.slice(css.indexOf('{', i) + 1, k));
    i = k + 1;
  }
  return out;
};
const PHONE = blocksOf('@media (max-width: 720px)').join('\n');
assert.ok(PHONE.length > 0, '폰 폭 규칙 덩어리를 못 찾았다');

// 같은 선택자가 여러 번 나오면 (예: 폰 규칙의 #chrome 은 gap 과 padding-top 이 따로 있다)
// **전부** 이어 붙인다 — 첫 덩어리만 보면 뒤에 온 선언을 놓치고, CSS 의 캐스케이드와도 다르다.
const decl = (scope, selector) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const all = [...scope.matchAll(new RegExp(`(?:^|[};])\\s*${esc}\\s*\\{([^{}]*)\\}`, 'g'))];
  return all.length ? all.map((m) => m[1]).join(';') : null;
};
// 단축 속성("8px 12px", "calc(...) 0")을 괄호를 지키며 쪼갠다 — 공백으로 자르면 calc 이 깨진다.
const parts = (value) => {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of value.trim()) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
};

const prop = (declText, name) => {
  assert.ok(declText, `규칙을 못 찾았다 (${name} 를 읽으려던 참)`);
  const all = [...declText.matchAll(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'g'))];
  assert.ok(all.length, `${name} 선언이 없다`);
  return all[all.length - 1][1].trim();   // 같은 규칙 안에서 두 번 적혔으면 뒤엣것이 이긴다
};

const V = rootVars();
const TAP = px('var(--tap)', V);

// ── 공통 전제 ──────────────────────────────────────────────────────────────
test('표적 최소치 --tap 은 iOS HIG 의 44px 이상이다', () => {
  assert.ok(TAP >= 44, `--tap 이 ${TAP}px — 44 미만이면 아래 시험이 전부 무의미해진다`);
});

// ── ㉠ 메뉴 패널이 하단 알약을 피한다 ───────────────────────────────────────
test('㉠ 알약 치수는 한 곳(:root --nav-*)에서만 나온다 — 두 군데 박으면 또 어긋난다', () => {
  const nav = decl(PHONE, '#bottom-nav');
  const btn = decl(PHONE, '#bottom-nav button');
  assert.match(prop(nav, 'bottom'), /var\(--nav-lift\)/, '알약 높이를 토큰이 아니라 숫자로 적었다');
  assert.match(prop(nav, 'padding'), /var\(--nav-pad\)/);
  assert.match(prop(btn, 'min-height'), /var\(--tap\)/);
  // 파생 토큰이 실제로 부품들을 더한 값인가 — 조립식이 아니면 알약을 키울 때 또 어긋난다.
  const navH = px('var(--nav-h)', V);
  assert.equal(navH, TAP + px('var(--nav-pad)', V) * 2 + 2,
    `--nav-h ${navH} 가 버튼+여백+테두리 합과 다르다`);
  const reserve = px('var(--nav-reserve)', V);
  assert.ok(reserve >= px('var(--nav-lift)', V) + navH,
    `--nav-reserve ${reserve} 가 알약이 실제로 먹는 높이보다 작다`);
});

test('㉠ 패널 바닥이 알약 윗변 위에 있다 — 375×812 에서 셈으로 견준다', () => {
  const nav = decl(PHONE, '#bottom-nav');
  const navH = px('var(--nav-h)', V);
  const navTop = VH - px(prop(nav, 'bottom'), V) - navH;
  assert.equal(navTop, 600, `알약 윗변이 ${navTop} — 실측 y600 과 다르다(전제가 바뀌었다)`);

  const mp = decl(PHONE, '#menu-panel');
  const top = px(prop(mp, 'top'), V);
  const maxH = px(prop(mp, 'max-height'), V);

  // 패널은 translateY(-50%) 로 제 높이의 절반만큼 올라간다 → 바닥 = top + 높이/2.
  // 높이는 max-height 까지 자랄 수 있으므로 그때가 가장 낮게 내려온 경우다.
  const base = decl(css, '#menu-panel');
  assert.match(prop(base, 'transform'), /translateY\(-50%\)/, '세로 가운데 정렬 전제가 깨졌다');
  assert.equal(decl(PHONE, '#menu-panel').includes('transform'), false,
    '폰 규칙이 transform 을 덮어쓰면 아래 셈이 무효다');

  const worstBottom = top + maxH / 2;
  assert.ok(worstBottom <= navTop,
    `가장 길게 자란 패널의 바닥이 ${worstBottom} — 알약 윗변 ${navTop} 아래로 내려간다`);

  // 감사 당시 마지막 줄 '생태 · 사람 · 여행' 은 bottom 641 이었다. 그때 높이(≈528)를
  // 그대로 넣어 그 줄이 이제 알약 위에 서는지 본다 — 회귀의 원본을 그대로 재현한다.
  const asMeasured = top + 528 / 2;
  assert.ok(asMeasured <= navTop,
    `실측 당시 높이(528)로도 바닥이 ${asMeasured} — 여전히 알약에 깔린다`);
  assert.ok(asMeasured < 641, '감사 때의 641 보다 위로 올라오지 않았다');
});

test('㉠ 넘치면 본문이 실제로 스크롤된다 — min-height:0 이 없으면 줄어들지조차 못한다', () => {
  const body = decl(css, '.mp-body');
  assert.equal(px(prop(body, 'min-height'), V), 0,
    'flex 아이템의 min-height 기본값은 min-content 라 본문이 패널 밖으로 흘러나간다');
  assert.match(prop(body, 'flex'), /^1\s+1\s/, '본문이 남는 높이를 받아가지 않는다');
  assert.match(prop(body, 'overflow-y'), /auto|scroll/);
});

// ── ㉡ 폰에서 설정·로그인에 닿는다 ────────────────────────────────────────
//
// ⚠️ 2026-09-21 정정 — 이 자리에 원래 "폰 폭에서 이 셋이 숨겨지지 않는다"는 시험이 있었다.
//    **전제가 틀렸다.** 운영 폰 화면(375×812)에서 직접 재 보니 `#btn-settings`·`#btn-login`·`#btn-help`
//    는 정말 `display:none` 이지만, 그 규칙은 index.html 이 아니라 **런타임에 끼어드는 지구 전환기**
//    (prototype/js/earth-switch.js · ADOPT 표)가 넣는다. 그 전환기가 설정·로그인을 **좌상단 ∧ 드롭다운으로
//    입양**해 가므로(실측: 눌렀을 때 EARTHUS · Intelligence · 설정 · 로그인 네 줄이 각 170×40 으로 뜬다)
//    폰에서도 계정에 닿는다 — 오히려 상단 막대에 되살리면 **같은 것이 두 군데** 생긴다.
//    그래서 잠글 것은 '숨겨지지 않는다'가 아니라 **'입양해 가는 쪽과 여기가 어긋나지 않는다'** 이다.
//    (전환기는 v1 모듈이고 v2 는 그것을 런타임에 들여 쓴다 — v1 을 고치면 무료 v1 서비스가 같이 흔들린다.)
test('㉡ 설정·로그인은 상단 막대에 있고, 지구 전환기가 그 둘을 이름으로 찾아간다', () => {
  const chrome = html.slice(html.indexOf('<div id="chrome"'), html.indexOf('</div>', html.indexOf('<div id="chrome"')));
  // 전환기는 id 와 aria-label 두 열쇠로 찾는다 — 둘 중 하나라도 어긋나면 드롭다운에서 조용히 사라진다.
  for (const [id, label] of [['btn-settings', '설정'], ['btn-login', '로그인 / 계정']]) {
    const tag = chrome.match(new RegExp(`<(button|a)[^>]*id="${id}"[^>]*>`));
    assert.ok(tag, `${id} 가 상단 막대에 없다 — 전환기가 입양할 것이 없어 폰에서 계정에 닿지 못한다`);
    assert.ok(tag[0].includes(`aria-label="${label}"`),
      `${id} 의 aria-label 이 "${label}" 이 아니다 — earth-switch.js 의 ADOPT 셀렉터가 못 찾는다`);
    assert.ok(!/\shidden[\s>]/.test(tag[0]), `${id} 에 hidden 이 붙으면 입양 전에 이미 죽는다`);
  }
  // 이 저장소(index.html)는 그 셋을 스스로 숨기지 않는다 — 숨기는 일은 전환기 한 곳에서만 일어나야 한다.
  // 두 곳에서 숨기면 전환기를 걷어낼 때 왜 안 보이는지 찾을 수 없다.
  for (const m of css.matchAll(/(?:^|[};])\s*([^{};@]+)\{([^{}]*)\}/g)) {
    const [, sel, body] = m;
    if (!['btn-settings', 'btn-login', 'btn-help'].some((id) => sel.includes(`#${id}`))) continue;
    assert.doesNotMatch(body, /display\s*:\s*none/,
      `${sel.trim()} 이 여기서도 숨긴다 — 숨기는 주인은 earth-switch.js 하나여야 한다`);
  }
});

test('㉡ 상단 여섯 칸이 폰 폭에 실제로 들어간다 — 넘치면 눌러도 안 닿는다', () => {
  const chrome = html.slice(html.indexOf('<div id="chrome"'), html.indexOf('</div>', html.indexOf('<div id="chrome"')));
  const visible = [...chrome.matchAll(/<(?:button|a)\b[^>]*>/g)].filter((t) => !/\shidden[\s>]/.test(t[0]));
  assert.equal(visible.length, 6, `상단에 보이는 칸이 ${visible.length}개 — 셈의 전제가 바뀌었다`);

  const box = decl(css, '#chrome button, #chrome a#btn-research');
  const w = px(prop(box, 'width'), V);
  const gap = px(prop(decl(PHONE, '#chrome'), 'gap'), V);
  const pad = parts(prop(decl(css, '#chrome'), 'padding'));             // "8px 12px"
  const sidePad = px(pad[1] ?? pad[0], V);

  for (const vw of [375, 320]) {                                         // 실측 기기 · 가장 좁은 현역 아이폰
    const panelW = px(prop(decl(PHONE, '#panel'), 'width'), V, { vw });
    const inner = panelW - sidePad * 2 - 2;                              // 테두리 1px 둘
    const need = visible.length * w + (visible.length - 1) * gap;
    assert.ok(need <= inner,
      `${vw}px 폭에서 상단 막대가 넘친다 — 필요 ${need} > 안쪽 ${inner}`);
  }
});

// ── ㉢ 44px 미만 표적이 없다 · 넓힌 표적이 이웃과 겹치지 않는다 ──────────────
// 가상요소로 넓힌 표적의 실제 크기를 꺼내 온다.
const pseudoBox = (selector) => {
  const d = decl(PHONE, selector);
  return { w: px(prop(d, 'width'), V), h: px(prop(d, 'height'), V) };
};

test('㉢ 상단 여섯 칸 — 표적 44×44, 이웃과 2px 떨어져 있다', () => {
  const t = pseudoBox('#chrome button::after, #chrome a#btn-research::after');
  assert.ok(t.w >= TAP && t.h >= TAP, `상단 표적이 ${t.w}×${t.h}`);

  const box = decl(css, '#chrome button, #chrome a#btn-research');
  const vw = px(prop(box, 'width'), V), vh = px(prop(box, 'height'), V);
  const gap = px(prop(decl(PHONE, '#chrome'), 'gap'), V);

  // 가로: 표적이 그림 밖으로 (표적−그림)/2 씩 번진다. 두 이웃이 각각 번지므로 틈이 그 둘을 견뎌야 한다.
  const bleedX = (t.w - vw) / 2;
  assert.ok(gap >= bleedX * 2,
    `틈 ${gap} < 좌우 번짐 ${bleedX * 2} — 이웃 표적과 겹쳐 엉뚱한 것이 눌린다`);
  assert.equal(gap - bleedX * 2, 2, '표적 사이 여유가 2px 이라는 보고서의 셈과 다르다');

  // 세로: 막대 안쪽 여백보다 덜 번져야 표적이 막대 밖(지구·범례)으로 안 나간다.
  const bleedY = (t.h - vh) / 2;
  const topPad = px(parts(prop(decl(css, '#chrome'), 'padding'))[0], V);
  assert.ok(bleedY <= topPad,
    `표적이 막대 위아래로 ${bleedY} 번진다 — 안쪽 여백 ${topPad} 를 넘어 밖으로 새어 나간다`);
});

test('㉢ 타임라인 지금·재생 — 표적 44, 가로로는 한 치도 안 번진다', () => {
  for (const sel of ['#ts-now', '#ts-play']) {
    const d = decl(PHONE, '#ts-now, #ts-play');
    assert.ok(px(prop(d, 'min-width'), V) >= TAP, `${sel} 가로 표적이 44 미만`);
  }
  const t = decl(PHONE, '#ts-now::after, #ts-play::after');
  assert.ok(px(prop(t, 'height'), V) >= TAP, '세로 표적이 44 미만');
  // 가로로 번지면 두 단추 사이 8px 틈을 먹어 서로 겹친다 — left/right 0 으로 묶여 있어야 한다.
  assert.equal(px(prop(t, 'left'), V), 0);
  assert.equal(px(prop(t, 'right'), V), 0);
});

test('㉢ 시간 슬라이더 — 잡히는 높이는 44, 막대가 차지하는 자리는 그대로다', () => {
  const d = decl(PHONE, '#timestrip input[type="range"]');
  const h = px(prop(d, 'height'), V);
  assert.ok(h >= TAP, `슬라이더 표적이 ${h} — 폰의 주 조작인데 잡히지 않는다`);
  // 음수 바깥여백으로 줄 높이를 되돌린다. 안 되돌리면 타임스트립이 커지고
  // 좌하단 #hud → 하단 알약까지 줄줄이 밀린다(그 수들은 PD 실측으로 정해진 값이다).
  const NATIVE_RANGE_H = 16;    // 실측 184×16 — 손대기 전 슬라이더가 줄에서 차지하던 높이
  const mv = px(parts(prop(d, 'margin'))[0], V);
  assert.ok(mv < 0, '바깥여백이 음수가 아니면 줄 높이를 되돌리지 못한다');
  assert.equal(h + mv * 2, NATIVE_RANGE_H,
    `바깥상자 높이가 ${h + mv * 2} — 손대기 전 ${NATIVE_RANGE_H} 과 달라 아래 배치가 전부 밀린다`);
  assert.equal(px(prop(d, 'min-width'), V), 0);
  assert.match(prop(d, 'flex'), /^1\s+1\s/, '슬라이더가 남는 폭을 받아가지 않는다');
});

test('㉢ 출처 독 펼치기 ▾ — 표적 44×44, 왼쪽 이웃은 누를 수 없는 글자다', () => {
  const t = pseudoBox('#hud-more::after');
  assert.ok(t.w >= TAP && t.h >= TAP, `펼치기 표적이 ${t.w}×${t.h}`);
  // 가로로 16씩 번진다. 같은 줄의 왼쪽 이웃이 조작 요소면 그쪽이 눌릴 수 있다.
  const row = html.slice(html.indexOf('<div id="hud-row">'), html.indexOf('</div>', html.indexOf('<div id="hud-row">')));
  const clickable = [...row.matchAll(/<(button|a|input|select)\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(clickable.length, 1, `#hud-row 에 누를 수 있는 것이 ${clickable.length}개 — 번진 표적이 이웃을 덮는다`);
  assert.match(clickable[0], /id="hud-more"/);

  // 위로 17 번져도 하단 알약 아랫변에 닿지 않는다(#hud 는 2줄이면 79 까지 자란다).
  const hudBottom = px(prop(decl(PHONE, '#hud'), 'bottom'), V);
  const hudRowCenter = hudBottom + 79 - 5 - 6;                  // 위쪽 여백 5, 글줄 ≈12 의 한가운데
  const navUnderside = px(prop(decl(PHONE, '#bottom-nav'), 'bottom'), V);
  assert.ok(hudRowCenter + t.h / 2 <= navUnderside,
    `표적 위쪽 끝 ${hudRowCenter + t.h / 2} 가 알약 아랫변 ${navUnderside} 를 넘는다`);
});
