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
  /* env(safe-area-inset-*) 는 기본이 0 이다 — 노치가 있으면 여백은 **더** 늘어날 뿐이라
     0 으로 잰 값이 가장 빡빡한 경우다. 다만 ③(가로 노치)은 여백이 실제로 커지는지를
     봐야 하므로 env.inset 로 값을 넣을 수 있게 했다(안 넣으면 예전과 똑같이 0). */
  s = s.replace(/env\(([a-z-]+)\)/g, (_, n) => `${(env.inset && env.inset[n]) || 0}px`);
  /* ⚠️ **vh 와 dvh 는 다른 자다**(2026-09-21 반박 검증이 이 셈기의 맹점을 잡았다).
     vh(=lvh)는 주소창이 접힌 '가장 큰' 높이이고, dvh 와 position:fixed 요소는 **지금 보이는** 높이를 쓴다.
     예전에는 둘 다 VH 로 풀어서, 100vh 로 잡은 상자와 fixed 로 잡은 상자가 어긋나는 결함을
     **구조적으로 못 봤다** — 실제로 그 결함이 들어왔고 시험은 초록이었다.
     env.lvh 를 주면 vh 만 그 값으로 푼다(dvh·%·fixed 는 그대로 보이는 높이). */
  const lvh = env.lvh ?? vh;
  s = s.replace(/(\d*\.?\d+)dvh/g, (_, n) => `${(Number(n) / 100) * vh}px`);
  s = s.replace(/(\d*\.?\d+)vh/g, (_, n) => `${(Number(n) / 100) * lvh}px`);
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

/* ── ㉣ 주소창이 펴져 있는 진짜 폰 (2026-09-21 반박 검증) ─────────────────────
   이 페이지는 html·body 가 overflow:hidden 이라 **주소창이 접히지 않는다.**
   그래서 `100vh`(=lvh · 접혔을 때의 가장 큰 높이)와 `position:fixed` 가 쓰는
   '지금 보이는 높이'가 **늘** 다르다. 두 상자를 다른 자로 재면 그 차이만큼 패널이
   내려앉아 마지막 묶음이 도로 알약에 깔린다.
   개발자 도구 에뮬레이션에는 주소창이 없어 lvh == 보이는 높이라 재현되지 않는다 —
   화면 시험이 못 보는 종류이므로 여기서 수로 잡는다. */
test('㉣ 주소창이 펴져 있어도 메뉴 바닥이 알약 위에 있다 — dvh 로 재야 한다', () => {
  const VIS = 712;          // 지금 보이는 높이(주소창이 100px 을 먹은 상태)
  const LVH = 812;          // 주소창이 접혔을 때의 높이 = 100vh 가 푸는 값
  const env = { vh: VIS, lvh: LVH };

  const mp = decl(PHONE, '#menu-panel');
  const bottom = px(prop(mp, 'top'), V, env) + px(prop(mp, 'max-height'), V, env) / 2;

  const nav = decl(PHONE, '#bottom-nav');
  const navTop = VIS - px(prop(nav, 'bottom'), V, env) - px('var(--nav-h)', V, env);

  assert.ok(bottom <= navTop,
    `주소창이 ${LVH - VIS}px 펴져 있을 때 패널 바닥 ${Math.round(bottom)} 이 알약 윗변 ${Math.round(navTop)} 보다 ${Math.round(bottom - navTop)}px 아래다`);

  // 주소창이 없는 환경(에뮬레이터·데스크톱)에서도 그대로여야 한다 — 고치면서 다른 화면을 깨지 않았다.
  const same = { vh: LVH, lvh: LVH };
  const b2 = px(prop(mp, 'top'), V, same) + px(prop(mp, 'max-height'), V, same) / 2;
  const n2 = LVH - px(prop(nav, 'bottom'), V, same) - px('var(--nav-h)', V, same);
  assert.ok(b2 <= n2, '주소창이 없을 때조차 깔린다');
});

test('㉣ 셈기가 vh 와 dvh 를 갈라 푼다 — 안 그러면 이 부류를 영영 못 본다', () => {
  const env = { vh: 712, lvh: 812 };
  assert.equal(px('100vh', V, env), 812, 'vh 를 보이는 높이로 풀면 결함이 숨는다');
  assert.equal(px('100dvh', V, env), 712, 'dvh 는 지금 보이는 높이다');
  assert.equal(px('100vh', V, { vh: 812 }), 812, '주소창이 없으면 둘이 같다');
});

/* ── ㉤ 같은 폰을 **가로로 눕혔을 때** (2026-09-21 반박 검증) ───────────────────
   위 ㉠~㉣ 는 전부 375×812 한 칸에서만 쟀다. 그런데 폰 규칙이 통째로
   `@media (max-width: 720px)` 안에 있었고, 같은 기기를 눕히면 **812×375** —
   그 칸 밖이라 어젯밤 고친 것이 하나도 안 걸렸다. 위 시험은 전부 초록인 채였다.

   그래서 여기서는 'CSS 를 문자열로 뒤지기'를 한 걸음 더 민다:
   @media 머리글을 **실제로 풀어** 그 화면에서 켜지는 규칙만 모으고(scopeAt),
   그 묶음에서 값을 꺼내 상자 두 개를 만들어 **겹치는 넓이를 수로** 견준다.
   그래야 '폭이 375 일 때'가 아니라 '이 화면에서'가 증명된다. */

// 최상위 @media 덩어리를 머리글과 함께 꺼낸다(안에 중첩된 @media 는 바깥에 딸려 나온다).
const mediaBlocks = () => {
  const out = [];
  let i = 0, depth = 0;
  while (i < css.length) {
    if (depth === 0 && css.startsWith('@media', i)) {
      const open = css.indexOf('{', i);
      let k = open, d = 0;
      for (; k < css.length; k++) {
        if (css[k] === '{') d++;
        else if (css[k] === '}' && --d === 0) break;
      }
      out.push({ header: css.slice(i + '@media'.length, open).trim(), body: css.slice(open + 1, k), from: i, to: k + 1 });
      i = k + 1;
      continue;
    }
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  return out;
};
const MEDIA = mediaBlocks();

// 머리글 하나를 그 화면에서 켜지는지 아닌지로 푼다. 쉼표는 '또는', and 는 '그리고'.
const mqMatches = (header, env) => header.split(',').some((query) => (
  query.split(/\s+and\s+/).every((raw) => {
    const term = raw.trim().replace(/^\(/, '').replace(/\)$/, '');
    const m = /^([a-z-]+)\s*:\s*(.+)$/.exec(term);
    assert.ok(m, `못 읽는 화면 조건: ${raw}`);
    const feat = m[1], val = m[2].trim();
    switch (feat) {
      case 'max-width': return env.vw <= parseFloat(val);
      case 'min-width': return env.vw >= parseFloat(val);
      case 'max-height': return env.vh <= parseFloat(val);
      case 'min-height': return env.vh >= parseFloat(val);
      case 'pointer': return (env.pointer || 'fine') === val;
      case 'hover': return (env.hover || 'hover') === val;
      case 'orientation': return (env.vh >= env.vw ? 'portrait' : 'landscape') === val;
      // 아래 둘은 '화면 크기'가 아니라 사용자 설정이다 — 이 시험은 기본값(끔) 화면만 본다.
      case 'prefers-reduced-motion': return false;
      case 'prefers-color-scheme': return false;
      default: throw new Error(`모르는 화면 조건: ${feat}`);
    }
  })
));

// @media 를 전부 걷어낸 '언제나 켜지는' 규칙.
// ⚠️ 이게 없으면 decl(css, …) 이 폰 규칙까지 같이 긁어 와, 안 걸리는 화면인데도 걸린 것처럼 보인다.
const BASE = (() => {
  let out = '', last = 0;
  for (const b of MEDIA) { out += css.slice(last, b.from); last = b.to; }
  return out + css.slice(last);
})();
// 그 화면에서 실제로 켜지는 규칙 묶음 — 적힌 순서대로 이어 붙인다(같은 특정도면 뒤엣것이 이긴다).
const scopeAt = (env) => [BASE, ...MEDIA.filter((b) => mqMatches(b.header, env)).map((b) => b.body)].join('\n');
// :root 가 여러 번 나올 수 있다(가로 칸이 토큰을 덮어쓴다) — 순서대로 덮어 읽는다.
const rootVarsOf = (scope) => {
  const out = {};
  for (const r of scope.matchAll(/:root\s*\{([^{}]*)\}/g))
    for (const d of r[1].matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  return out;
};

// 하단 탐색 칸 수는 여기서 세지 않는다 — 만드는 쪽(ui-shell.js)에서 읽어 온다.
const NAV_COUNT = (() => {
  const src = readFileSync(new URL('../../prototype/v2-three/js/ui-shell.js', import.meta.url), 'utf8');
  const m = /const NAV_ITEMS = \[([\s\S]*?)\n {2}\];/.exec(src);
  assert.ok(m, 'ui-shell.js 에서 하단 탐색 목록을 못 찾았다');
  const n = [...m[1].matchAll(/\{\s*id:/g)].length;
  assert.ok(n >= 3, `하단 탐색 칸이 ${n}개 — 셈의 전제가 바뀌었다`);
  return n;
})();

/* ── 실측 상수 (2026-09-21 · 812×375 · dpr 3) ───────────────────────────────
   글꼴이 내는 크기라 CSS 에서 꺼낼 수 없는 수만 여기 둔다. 나머지는 전부 CSS 에서 셈한다. */
const TS_W = 402;        // 가운데 타임스트립이 기본 규칙에서 차지하던 폭
const TS_ROW = 24;       // 그 안의 한 줄 높이 = '지금' 단추의 보이는 높이
const NOW_W = 43;        // '지금' 단추의 보이는 폭
const NAV_H_BASE = 53;   // 기본 규칙일 때의 알약 높이(그림 17 + 틈 3 + 글자 10 + 여백 11 + 알약 여백 10 + 테두리 2)
const HUD_H = 79;        // 출처 독이 2줄일 때의 높이 — 위 ㉢ 시험이 이미 쓰던 수와 같다

const has = (declText, name) => new RegExp(`(?:^|;)\\s*${name}\\s*:`).test(declText || '');
const overlap = (a, b) => ({
  w: Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)),
  h: Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)),
});
const show = (r) => `x ${Math.round(r.x0)}~${Math.round(r.x1)} · y ${Math.round(r.y0)}~${Math.round(r.y1)}`;

// 좌하단 출처 독 — 폭은 그 안의 출처 줄(#srcNote)이 정하고, 높이는 --hud-h(2줄 실측)다.
const hudBox = (scope, vars, env) => {
  const d = decl(scope, '#hud');
  const pad = parts(prop(d, 'padding'));
  const padH = px(pad[1] ?? pad[0], vars, env);
  const left = px(prop(d, 'left'), vars, env);
  const bottom = px(prop(d, 'bottom'), vars, env);
  const w = px(prop(decl(scope, '#srcNote'), 'max-width'), vars, env) + padH * 2 + 2;
  // 높이의 주인은 :root 의 --hud-h 다. 토큰이 없는 판(고치기 전)에서도 상자를 그릴 수 있게
  // 실측 79 로 물러선다 — 그래야 실패 메시지가 '변수가 없다'가 아니라 **몇 px 덮는다**를 말한다.
  const h = vars['--hud-h'] ? px('var(--hud-h)', vars, env) : HUD_H;
  return { x0: left, x1: left + w, y0: env.vh - bottom - h, y1: env.vh - bottom };
};

// 타임라인 '지금' 단추의 **눌리는** 상자 — 가상요소로 넓혀 뒀으면 그 크기, 아니면 보이는 크기.
const tsNowBox = (scope, vars, env) => {
  const ts = decl(scope, '#timestrip');
  const pad = parts(prop(ts, 'padding'));
  const padV = px(pad[0], vars, env), padH = px(pad[1] ?? pad[0], vars, env);
  const bottom = px(prop(ts, 'bottom'), vars, env);
  const rowMid = env.vh - bottom - 1 - padV - TS_ROW / 2;      // 테두리 1 + 안쪽 여백 + 줄의 절반
  // 오른쪽 끝이 적혀 있으면 화면 폭으로 늘어난 것이고, 없으면 가운데 정렬(실측 폭)이다.
  const x0 = has(ts, 'right') ? px(prop(ts, 'left'), vars, env) : (env.vw - TS_W) / 2;
  const btn = decl(scope, '#ts-now, #ts-play');
  const w = Math.max(NOW_W, has(btn, 'min-width') ? px(prop(btn, 'min-width'), vars, env) : 0);
  const after = decl(scope, '#ts-now::after, #ts-play::after');
  const h = after ? px(prop(after, 'height'), vars, env) : TS_ROW;
  return { x0: x0 + 1 + padH, x1: x0 + 1 + padH + w, y0: rowMid - h / 2, y1: rowMid + h / 2 };
};

const navBox = (scope, vars, env) => {
  const d = decl(scope, '#bottom-nav');
  const btn = decl(scope, '#bottom-nav button');
  const pad = px(prop(d, 'padding'), vars, env);
  const gap = px(prop(d, 'gap'), vars, env);
  const minW = px(prop(btn, 'min-width'), vars, env);
  // 버튼에 min-height 를 준 화면에서만 알약 높이가 --nav-h 로 조립된다. 아니면 글자 높이가 정한다.
  const h = has(btn, 'min-height') ? px('var(--nav-h)', vars, env) : NAV_H_BASE;
  const w = NAV_COUNT * minW + (NAV_COUNT - 1) * gap + pad * 2 + 2;
  const bottom = px(prop(d, 'bottom'), vars, env);
  const x0 = has(d, 'right') ? env.vw - px(prop(d, 'right'), vars, env) - w : (env.vw - w) / 2;
  return { x0, x1: x0 + w, y0: env.vh - bottom - h, y1: env.vh - bottom };
};

// 메뉴 패널 — translateY(-50%) 라 바닥 = top + 높이/2. 가장 길게 자란 경우(max-height)가 가장 낮다.
const menuBox = (scope, vars, env) => {
  const d = decl(scope, '#menu-panel');
  const top = px(prop(d, 'top'), vars, env);
  const maxH = px(prop(d, 'max-height'), vars, env);
  const w = px(prop(d, 'width'), vars, env);
  return { x0: 0, x1: w, y0: top - maxH / 2, y1: top + maxH / 2 };
};

/* 걸리는 화면 · 안 걸리는 화면을 **표로** 잠근다.
   폰 규칙을 폭이 아니라 '폰이라는 사실'에 걸되, 데스크톱을 건드리면 안 된다:
   창을 세로로 좁힌 노트북(1280×500)과, 자판이 올라와 세로인 채 납작해진 폰(375×450)이
   가로 칸에 걸리면 그쪽이 망가진다. */
const SCREENS = [
  { n: '폰 세로 375×812 (터치)',        vw: 375, vh: 812,  pointer: 'coarse', phone: true,  land: false },
  { n: '폰 가로 812×375 (터치)',        vw: 812, vh: 375,  pointer: 'coarse', phone: true,  land: true },
  { n: '폰 가로 667×375 (터치·SE)',     vw: 667, vh: 375,  pointer: 'coarse', phone: true,  land: true },
  { n: '데스크톱 1440×900 (마우스)',    vw: 1440, vh: 900, pointer: 'fine',   phone: false, land: false },
  { n: '세로로 좁힌 노트북 1280×500',   vw: 1280, vh: 500, pointer: 'fine',   phone: false, land: false },
  { n: '태블릿 세로 768×1024 (터치)',   vw: 768, vh: 1024, pointer: 'coarse', phone: false, land: false },
  { n: '태블릿 가로 1024×768 (터치)',   vw: 1024, vh: 768, pointer: 'coarse', phone: false, land: false },
  { n: '폰 세로+자판 375×450 (터치)',   vw: 375, vh: 450,  pointer: 'coarse', phone: true,  land: false },
];
// 그 화면에서 폰 규칙이 켜졌나 = 하단 알약 버튼이 44px 표적을 받았나.
const phoneOn = (scope) => has(decl(scope, '#bottom-nav button'), 'min-height');
// 가로 전용 칸이 켜졌나 = 알약이 가운데를 떠나 오른쪽에 붙었나.
const landOn = (scope) => has(decl(scope, '#bottom-nav'), 'right');

test('㉤ 어느 화면에 걸리고 어느 화면에 안 걸리는지 — 여덟 칸을 전부 풀어 본다', () => {
  const rows = [];
  for (const s of SCREENS) {
    const scope = scopeAt(s);
    const got = { phone: phoneOn(scope), land: landOn(scope) };
    rows.push(`${s.n.padEnd(26)} 폰규칙 ${got.phone ? '○' : '×'} · 가로칸 ${got.land ? '○' : '×'}`);
    assert.equal(got.phone, s.phone, `${s.n}: 폰 규칙이 ${got.phone ? '걸렸다' : '안 걸렸다'} — 표와 다르다\n${rows.join('\n')}`);
    assert.equal(got.land, s.land, `${s.n}: 가로 칸이 ${got.land ? '걸렸다' : '안 걸렸다'} — 표와 다르다\n${rows.join('\n')}`);
  }
  // 가로 칸이 켜진 화면은 반드시 폰 규칙도 같이 켜져 있어야 한다 — 가로 칸은 덮어쓰기지 대체가 아니다.
  for (const s of SCREENS) if (s.land) assert.ok(s.phone, `${s.n}: 가로 칸만 켜지고 폰 규칙이 없다`);
});

test('㉤① 눕힌 폰에서 출처 독이 타임라인 "지금" 단추를 덮지 않는다 — 812×375 를 상자로 견준다', () => {
  const env = { vw: 812, vh: 375, pointer: 'coarse' };
  const scope = scopeAt(env);
  const vars = rootVarsOf(scope);
  const hud = hudBox(scope, vars, env);
  const now = tsNowBox(scope, vars, env);
  const o = overlap(hud, now);
  assert.equal(o.w * o.h, 0,
    `#hud [${show(hud)}] 가 '지금' 표적 [${show(now)}] 을 ${o.w}×${o.h} 덮는다 — ` +
    `#hud 엔 클릭 핸들러가 없어 눌러도 아무 일이 안 난다(현재로 돌아올 유일한 단추다)`);
  // 겹치지만 않으면 되는 게 아니다 — 손가락이 미끄러질 만큼은 떨어져 있어야 한다.
  assert.ok(hud.y1 <= now.y0 - 4,
    `출처 독 아랫변 ${hud.y1} 와 표적 윗변 ${now.y0} 사이가 ${now.y0 - hud.y1}px 뿐이다`);
});

test('㉤② 눕힌 폰에서 메뉴 패널과 하단 알약이 서로를 안다 — 겹치는 상자가 0 이다', () => {
  const env = { vw: 812, vh: 375, pointer: 'coarse' };
  const scope = scopeAt(env);
  const vars = rootVarsOf(scope);
  const panel = menuBox(scope, vars, env);
  const nav = navBox(scope, vars, env);
  const hud = hudBox(scope, vars, env);

  const o = overlap(panel, nav);
  assert.equal(o.w * o.h, 0,
    `메뉴 패널 [${show(panel)}] 과 알약 [${show(nav)}] 이 ${o.w}×${o.h} 겹친다 — ` +
    `알약(z6)이 패널(z5) 위라 그 자리의 메뉴 줄을 누르면 엉뚱한 하단 탭이 열린다`);
  // 패널은 알약만 피하면 되는 게 아니다 — 같은 아래쪽을 먹는 출처 독(z7)도 피해야 한다.
  const o2 = overlap(panel, hud);
  assert.equal(o2.w * o2.h, 0, `메뉴 패널이 출처 독과 ${o2.w}×${o2.h} 겹친다 — z7 이 위라 메뉴 아래쪽 글이 지워진다`);
  // 출처 독과 알약은 같은 줄에 선다(가로는 폭이 남는다) — 그렇다면 가로로 안 겹쳐야 한다.
  const o3 = overlap(hud, nav);
  assert.equal(o3.w * o3.h, 0, `출처 독과 알약이 ${o3.w}×${o3.h} 겹친다 — #hud 가 z7 이라 첫 칸을 덮는다`);

  // 비켜서는 높이는 **둘 중 더 높이 올라온 쪽**을 덮어야 한다 — 한쪽만 보면 나머지가 패널을 덮는다.
  const reserve = px('var(--nav-reserve)', vars, env);
  const navStack = px('var(--nav-lift)', vars, env) + px('var(--nav-h)', vars, env);
  const hudStack = px('var(--hud-lift)', vars, env) + px('var(--hud-h)', vars, env);
  assert.ok(reserve >= Math.max(navStack, hudStack),
    `--nav-reserve ${reserve} 가 아래쪽이 실제로 먹는 높이 ${Math.max(navStack, hudStack)} 보다 작다`);
});

test('㉤② 눕혀도 44px 표적이 그대로 산다 — 폰 규칙이 통째로 꺼지면 여기서 걸린다', () => {
  const env = { vw: 812, vh: 375, pointer: 'coarse' };
  const scope = scopeAt(env);
  const vars = rootVarsOf(scope);
  const tap = px('var(--tap)', vars, env);
  const top = decl(scope, '#chrome button::after, #chrome a#btn-research::after');
  assert.ok(px(prop(top, 'width'), vars, env) >= tap && px(prop(top, 'height'), vars, env) >= tap,
    '상단 여섯 칸의 표적이 44 미만으로 되돌아갔다');
  assert.ok(px(prop(decl(scope, '#ts-now, #ts-play'), 'min-width'), vars, env) >= tap, "'지금'·'▶' 가로 표적이 44 미만");
  assert.ok(px(prop(decl(scope, '#ts-now::after, #ts-play::after'), 'height'), vars, env) >= tap, "'지금'·'▶' 세로 표적이 44 미만");
  const more = decl(scope, '#hud-more::after');
  assert.ok(px(prop(more, 'width'), vars, env) >= tap && px(prop(more, 'height'), vars, env) >= tap, '출처 펼치기 ▾ 표적이 44 미만');
  assert.ok(px(prop(decl(scope, '#timestrip input[type="range"]'), 'height'), vars, env) >= tap, '시간 슬라이더 표적이 44 미만');
  assert.ok(px(prop(decl(scope, '#bottom-nav button'), 'min-height'), vars, env) >= tap, '하단 알약 표적이 44 미만');
});

test('㉤③ 노치 기기를 눕히면 좌우 안전영역을 실제로 피한다 — 수로 견준다', () => {
  const inset = { 'safe-area-inset-left': 59, 'safe-area-inset-right': 0, 'safe-area-inset-top': 0, 'safe-area-inset-bottom': 21 };
  const env = { vw: 812, vh: 375, pointer: 'coarse', inset };
  const scope = scopeAt(env);
  const vars = rootVarsOf(scope);
  const flat = { vw: 812, vh: 375, pointer: 'coarse' };   // 같은 화면, 노치 없음

  for (const [sel, side] of [['#hud', 'left'], ['#timestrip', 'left'], ['#quake-cap', 'left']]) {
    const d = decl(scope, sel);
    const with0 = px(prop(d, side), vars, flat);
    const with59 = px(prop(d, side), vars, env);
    assert.equal(with59 - with0, 59, `${sel} 의 ${side} 가 노치를 안 읽는다 — 왼쪽 59px 이 가린 채로 선다`);
  }
  // 오른쪽 노치(반대로 눕힌 기기)도 같다.
  const right = { vw: 812, vh: 375, pointer: 'coarse', inset: { 'safe-area-inset-right': 59, 'safe-area-inset-bottom': 21 } };
  for (const sel of ['#bottom-nav', '#timestrip', '#intel', '#field-legend']) {
    const d = decl(scopeAt(right), sel);
    assert.ok(has(d, 'right'), `${sel} 에 오른쪽 자리가 없다 — 안전영역을 더할 곳이 없다`);
    assert.equal(px(prop(d, 'right'), rootVarsOf(scopeAt(right)), right) - px(prop(d, 'right'), vars, flat), 59,
      `${sel} 의 right 가 노치를 안 읽는다`);
  }
  // 노치가 있어도 ①②의 겹침은 그대로 0 이어야 한다(안전영역이 늘면 자리가 다 같이 밀린다).
  const vs = rootVarsOf(scope);
  for (const [a, b, name] of [
    [hudBox(scope, vs, env), tsNowBox(scope, vs, env), "출처 독 × '지금'"],
    [menuBox(scope, vs, env), navBox(scope, vs, env), '메뉴 × 알약'],
    [menuBox(scope, vs, env), hudBox(scope, vs, env), '메뉴 × 출처 독'],
  ]) {
    const o = overlap(a, b);
    assert.equal(o.w * o.h, 0, `노치 기기에서 ${name} 이 ${o.w}×${o.h} 겹친다`);
  }
});

test('㉤ 데스크톱·태블릿은 한 치도 안 건드린다 — 기본 규칙 그대로여야 한다', () => {
  for (const s of SCREENS.filter((x) => !x.phone)) {
    const scope = scopeAt(s);
    const vars = rootVarsOf(scope);
    const mp = decl(scope, '#menu-panel');
    assert.equal(px(prop(mp, 'top'), vars, s), s.vh / 2, `${s.n}: 메뉴 패널이 화면 한가운데를 떠났다`);
    assert.equal(px(prop(mp, 'max-height'), vars, s), s.vh - 96, `${s.n}: 메뉴 패널 높이가 기본값이 아니다`);
    assert.equal(px(prop(decl(scope, '#bottom-nav'), 'bottom'), vars, s), 84, `${s.n}: 알약이 기본 자리를 떠났다`);
    assert.equal(px(prop(decl(scope, '#hud'), 'bottom'), vars, s), 12, `${s.n}: 출처 독이 기본 자리를 떠났다`);
    assert.equal(has(decl(scope, '#bottom-nav'), 'right'), false, `${s.n}: 알약이 가운데를 떠나 오른쪽에 붙었다`);
  }
});

test('㉤ 눕힌 화면에는 눕힌 화면의 수를 준다 — 세로 수를 그대로 쓰면 메뉴가 107px 로 찌그러진다', () => {
  const env = { vw: 812, vh: 375, pointer: 'coarse' };
  const scope = scopeAt(env);
  const vars = rootVarsOf(scope);
  const maxH = px(prop(decl(scope, '#menu-panel'), 'max-height'), vars, env);

  // 세로 규칙의 비켜서는 높이(--nav-reserve)를 그대로 썼다면 얼마였나 — 그 값보다 커야 한다.
  const portrait = rootVarsOf(scopeAt({ vw: 375, vh: 812, pointer: 'coarse' }));
  const naive = env.vh - px('var(--nav-reserve)', portrait, env) - 48;
  assert.ok(maxH > naive, `눕힌 메뉴 높이 ${maxH} 가 세로 수를 그대로 쓴 ${naive} 보다 크지 않다 — 가로에 맞는 수를 안 줬다`);
  // 셈의 전제를 적어 둔다: 세로 수를 그대로 쓰면 107px 이었다(보고서의 수).
  assert.equal(Math.round(naive), 107, `세로 수를 그대로 쓴 높이가 ${naive} — 보고서의 107 과 다르다(전제가 바뀌었다)`);
  // 본문이 줄어들 수 있어야 비로소 스크롤한다 — 가로에서는 잘리는 높이가 늘 모자라다.
  const body = decl(scope, '.mp-body');
  assert.equal(px(prop(body, 'min-height'), vars, env), 0);
  assert.match(prop(body, 'overflow-y'), /auto|scroll/);
});

/* ── ㉥ 좁은 가로 화면에서 출처 독이 알약을 덮지 않는다 (2026-09-21 재검) ──────
   눕힌 칸이 독과 알약을 **같은 줄**에 세우는데, 286행이 640px 이하에서 #srcNote 를
   62vw 까지 넓힌다. 그래서 640×360(360×640 안드로이드를 눕힌 것) 같은 화면에서
   독(z7·불투명)이 알약(z6)의 첫 두 칸을 덮어 눌러도 아무 일이 안 났다.
   PD 기기(812×375)는 폭이 넉넉해 안 걸리지만, 한 기기에서 안 보인다고 없는 결함이 아니다. */
test('㉥ 좁은 가로에서도 출처 글이 알약 앞에서 끊긴다', () => {
  const NAV_W = 298;            // 테두리2 + 여백10 + 5칸×54 + 틈 4×4 (A 갈래가 셈한 값)
  const HUD_LEFT = 52;          // 눕힌 칸의 #hud left
  const GAP = 8;                // 알약 오른쪽 여백
  for (const vw of [640, 667, 812]) {
    const env = { vw, vh: 360 };
    const src = decl(css, '#srcNote');
    const maxW = px(prop(src, 'max-width'), V, env);
    const hudRight = HUD_LEFT + 26 + maxW;          // 독 = 아이콘 26 + 글자
    const navLeft = vw - GAP - NAV_W;
    assert.ok(hudRight <= navLeft,
      `${vw}×360 에서 출처 독 오른쪽 끝 ${Math.round(hudRight)} 이 알약 왼쪽 ${Math.round(navLeft)} 을 ${Math.round(hudRight - navLeft)}px 넘는다`);
  }
});
