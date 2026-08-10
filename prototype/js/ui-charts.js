// 그래프 — 커뮤니티 「자료」 탭
//
// 무엇을 그리나
//   ① 스파게티 곡선 — 해마다 한 줄. 올해가 예년 다발보다 위에 있는지 한눈에.
//   ② 대륙별 지금 기온 — 막대
//   ③ 국가별 관측소 평균 — 막대 (실제 계기 1,900여 곳)
//   ④ 예보 정확도 — **우리만 가진 자료**. 쌓이는 중이라 아직 곡선이 짧다.
//
// ⚠️ SVG 로 그린다. 외부 차트 라이브러리를 안 쓰는 이유:
//    지금 앱은 CDN 스크립트 하나(Cesium)만 쓴다. 차트를 위해 200KB 를 더 받게 하면
//    첫 화면이 느려진다. 선 그리기는 몇십 줄이면 된다.
//
// ⚠️ 축을 0 에서 자르지 않는다. 기온은 0°C 가 기준점이 아니라서
//    0 부터 그리면 차이가 안 보인다. 대신 눈금 숫자를 반드시 적는다.
//
// ⚠️ 색으로 순위를 매기지 않는다. 예년은 회색 계열, 올해만 붉게.
//    "더운 나라 = 빨강" 식으로 칠하면 자료가 아니라 인상을 전달하게 된다.

import { i18n } from './i18n.js';

const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* **굵게** 만 허용하고 나머지는 전부 이스케이프한다.
   ⚠️ 이스케이프를 먼저 하고 그다음에 ** 를 태그로 바꾼다. 순서를 바꾸면
      본문에 들어온 <b> 가 그대로 실행된다. */
const mk = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

const MONTH_KO = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
const MONTH_EN = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/* 강조할 해를 고른다 — **오늘 연도에서 10년 단위로 거슬러**.
   ⚠️ 받은 요청 그대로다: "진하게 표시되는 해는 오늘 나오는 그해의 10년전, 20년전,
      이렇게 10년단위로 표시해주고 그외 자료는 회색그래프로".
   ⚠️ 색은 "오래될수록 차갑게"로 둔다. 값의 높고 낮음과는 무관한 색이어야
      "빨간 해가 나쁜 해"로 잘못 읽히지 않는다. 올해만 붉게 두는 이유도 같다 —
      그건 값이 아니라 "지금"이라는 뜻이다. */
const DECADE_COLORS = ['#ff9f45', '#ffd166', '#7ee0a0', '#8fd0ff', '#c9a8ff'];

/**
 * 강조할 해를 고른다.
 *
 * @param years  자료에 있는 연도들
 * @param step   몇 년 간격인가 (10 또는 20)
 * @param fixed  이 목록으로 고정 (대륙마다 다른 해가 나오면 비교가 안 된다)
 *
 * ⚠️ 기준은 **오늘 연도**다. 자료의 마지막 해가 아니다.
 *    자료가 아직 모이는 중일 때 마지막 해를 기준 삼으면
 *    "20년 전"이 실제로는 40년 전이 되어 버린다.
 *
 * ⚠️ 육상기온은 대륙마다 같은 해를 써야 한다 (받은 요청).
 *    대륙별로 있는 해만 골라 쓰면 아시아는 2006·1986, 유럽은 1986 만 나와서
 *    나란히 놓고 비교할 수가 없다. 그래서 fixed 로 한 번 정해 전부에 쓴다.
 */
function pickDecades(years, step = 10, fixed = null) {
  const now = new Date().getUTCFullYear();
  const want = fixed || (() => {
    const out = [];
    for (let k = 1; k <= DECADE_COLORS.length; k++) {
      const y = now - k * step;
      if (years.includes(y)) out.push(y);
    }
    return out;
  })();
  return want.map((y, i) => ({
    year: y, color: DECADE_COLORS[i % DECADE_COLORS.length], ago: now - y,
    /* 자료에 없는 해는 색만 잡아두고 선은 안 그린다 — 범례 색이 대륙마다
       달라지면 그것대로 헷갈린다. */
    missing: !years.includes(y),
  }));
}

/** 오늘이 연중 몇 일째인가 (0부터) */
function todayIndex() {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((t - start) / 86400000);
}

/** 연중 일자 → "M월 D일" */
function doyLabel(doy, year) {
  const d = new Date(Date.UTC(year, 0, 1 + doy));
  return i18n.lang === 'ko'
    ? `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`
    : d.toISOString().slice(5, 10);
}

/* 값의 종류. ⚠️ 온도만 설정 단위(°C/°F)를 따른다.
   해빙 면적(백만 km²)에까지 화씨 변환을 걸면 2.3 이 36.1 이 된다 — 실제로 그럴 뻔했다. */
function unitVal(c, kind) {
  return (kind === 'temp' || kind == null) && i18n.unit === 'f' ? c * 9 / 5 + 32 : c;
}
function unitSuffix(kind) {
  if (kind && kind !== 'temp') return kind;              // 'M km²' 같은 그대로
  return i18n.unit === 'f' ? '°F' : '°C';
}

/* ── 그래프 상자 크기 ──────────────────────────────────────
   ⚠️⚠️ **"육상·해상 차트가 그려지다 말았다"의 정체가 여기였다.**
      예전에는 700 단위로 그려 놓고 CSS 로 `.ch-svg{min-width:420px}` 를 걸었다.
      폰(390px)에서 시트 내용폭을 실제로 재보니 **322px** 였다 → **98px 이 잘렸다.**
      하필 잘린 98px 이 **오른쪽 값 라벨 칸(R=78단위)** 과 정확히 겹쳤다.
      그래서 선은 보이는데 숫자가 통째로 사라져 "덜 그려진" 것처럼 보였다.

   ⚠️ `.ch-wrap` 에 `overflow-x:auto` 가 있어 밀면 보이긴 했다. 그런데
      **아무도 밀 수 있다는 걸 모른다.** 게다가 이 wrap 은 확대/이동 제스처를
      먼저 받는다. 보이지 않는 것은 없는 것이다.

   → 고침: **단위 폭을 실제 픽셀 폭에 맞춘다.** 배율이 1:1 이 되므로
      글자 크기가 지정한 값 그대로 나온다(줄여서 4.8px 로 뭉개지지 않는다). */
function chartBox() {
  const host = document.querySelector('#sheet');
  /* 시트가 아직 안 열렸으면 폭이 0 이다. 그때는 CSS 규칙과 같은 식으로 어림한다
     (#sheet: left/right 12px · max-width 520px · 좌우 안쪽 여백 22px). */
  let avail = Math.min(520, innerWidth - 24) - 44;
  if (host) {
    const cs = getComputedStyle(host);
    const w = host.getBoundingClientRect().width
      - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (w > 40) avail = w;
  }
  const W = Math.round(Math.max(300, Math.min(700, avail)));
  const narrow = W < 420;
  /* ⚠️ 값 옆 연도는 **자리가 진짜 있을 때만** 붙인다.
     "20.2°C 2016" 은 1:1 에서 84px 쯤 되는데 라벨 칸은 70px 이다 —
     넓은 화면(476단위)에서 실측하니 **5.5px 삐져나왔다.**
     연도는 아래 범례에 색과 함께 있고 점 색도 같다. **값이 먼저다.** */
  const showYear = W >= 560;
  return {
    W,
    /* ⚠️ 세로도 같이 줄인다. H 를 320 으로 두면 폰에서 322×320 — 거의 정사각형이다.
       해마다 한 줄인 곡선은 **가로로 길어야** 언제가 언제인지 읽힌다. */
    H: Math.round(Math.max(190, Math.min(320, W * 0.46))),
    L: narrow ? 34 : 42,     // 왼쪽 눈금 숫자 칸
    /* 오른쪽 값 라벨 칸. ⚠️ 좁을 때 58 로 뒀더니 가장 긴 라벨이
       상자 오른쪽 끝에 **0.1px 남기고 닿았다**(실측). 여유를 준다 —
       칸을 넓히면 라벨이 그만큼 왼쪽에서 시작한다. */
    R: showYear ? 100 : (narrow ? 68 : 78),
    showYear,
    T: 14,
    B: 24,
    narrow,
  };
}

/**
 * 해마다 한 줄인 곡선.
 *   · 올해 = 붉게 · 10년 단위 = 색 · 나머지 = 회색
 *   · 오늘 자리에 세로선, 그 선과 만나는 곳에 값을 적는다
 *   · 마지막 자료 점에 날짜를 적는다
 */
export function spaghetti(series, opt = {}) {
  /* 값의 종류 — 'temp' 면 설정 단위를 따르고, 그 밖에는 문자열을 그대로 붙인다. */
  const kind = opt.kind || 'temp';
  const years = Object.keys(series).map(Number).sort((a, b) => a - b);
  if (years.length < 2) return null;
  const { W, H, L, R, T, B, showYear } = chartBox();

  let lo = Infinity, hi = -Infinity;
  years.forEach(y => (series[y] || []).forEach(v => {
    if (v == null) return;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }));
  if (!isFinite(lo)) return null;
  const pad = (hi - lo) * 0.08 || 0.5;
  lo -= pad; hi += pad;

  const x = d => L + (d / 364) * (W - L - R);
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);

  const path = arr => {
    let d = '', pen = false;
    arr.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const newest = years[years.length - 1];
  const decades = pickDecades(years, opt.step || 10, opt.fixed || null)
    .filter(d => !d.missing);
  const hot = new Set([newest, ...decades.map(d => d.year)]);
  const parts = [];

  // ── 눈금 ──
  for (let k = 0; k <= 5; k++) {
    const v = lo + (hi - lo) * (k / 5);
    const yy = y(v);
    parts.push(`<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}"
      stroke="rgba(255,255,255,.07)"/>`);
    parts.push(`<text x="${L - 5}" y="${(yy + 3).toFixed(1)}" text-anchor="end"
      fill="rgba(255,255,255,.38)" font-size="9">${unitVal(v).toFixed(1)}</text>`);
  }
  MONTH_START.forEach((d, m) => {
    parts.push(`<text x="${x(d).toFixed(1)}" y="${H - 7}" fill="rgba(255,255,255,.32)"
      font-size="8.5">${i18n.lang === 'ko' ? m + 1 : MONTH_EN[m]}</text>`);
  });

  /* ── 예년 (회색) ──
     ⚠️ 굵기와 진하기를 낮춘다. 배경이 되어야 올해와 10년 단위가 읽힌다. */
  years.filter(yr => !hot.has(yr)).forEach(yr => {
    parts.push(`<path d="${path(series[yr])}" fill="none"
      stroke="rgba(160,175,195,.20)" stroke-width="0.9"/>`);
  });

  // ── 10년 단위 ──
  decades.slice().reverse().forEach(d => {
    parts.push(`<path d="${path(series[d.year])}" fill="none"
      stroke="${d.color}" stroke-width="1.5" opacity="0.9"/>`);
  });

  // ── 올해 ──
  const cur = series[newest] || [];
  parts.push(`<path d="${path(cur)}" fill="none" stroke="#ff5d5d"
    stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`);

  /* ── 오늘 세로선 ──────────────────────────────────────────
     ⚠️ 기준을 항상 "오늘"로 잡는다 (받은 요청). 자료가 어제까지여도
        선은 오늘에 둔다 — 그래야 "지금 우리가 어디쯤인지"가 고정된다. */
  const td = Math.min(364, todayIndex());
  const tx = x(td);
  parts.push(`<line x1="${tx.toFixed(1)}" y1="${T}" x2="${tx.toFixed(1)}" y2="${H - B}"
    stroke="rgba(255,255,255,.34)" stroke-width="1" stroke-dasharray="3 3"/>`);
  parts.push(`<text x="${tx.toFixed(1)}" y="${T - 3}" text-anchor="middle"
    fill="rgba(255,255,255,.55)" font-size="9">${i18n.lang === 'ko' ? '오늘' : 'today'}</text>`);

  /* ── 세로선과 만나는 곳의 값 ─────────────────────────────
     ⚠️ 겹쳐 적으면 못 읽는다. y 좌표로 정렬해 최소 간격을 확보한다. */
  const marks = [];
  const at = (arr, yr, color, w) => {
    /* 오늘 값이 없으면(자료가 어제까지) 가장 가까운 앞쪽 값을 쓴다.
       ⚠️ 그 사실을 티 나게 하려고 점을 비워 그린다. */
    let i = td, exact = true;
    while (i >= 0 && arr[i] == null) { i--; exact = false; }
    if (i < 0) return;
    marks.push({ v: arr[i], yr, color, w, exact, i });
  };
  at(cur, newest, '#ff5d5d', 2.6);
  decades.forEach(d => at(series[d.year] || [], d.year, d.color, 1.5));

  marks.sort((a, b) => a.v - b.v);
  const MIN = 12;
  let prevY = null;
  marks.forEach(mk => {
    let yy = y(mk.v);
    if (prevY != null && prevY - yy < MIN) yy = prevY - MIN;
    prevY = yy;
    parts.push(`<circle cx="${tx.toFixed(1)}" cy="${y(mk.v).toFixed(1)}" r="${mk.w > 2 ? 3.4 : 2.6}"
      fill="${mk.exact ? mk.color : 'none'}" stroke="${mk.color}" stroke-width="1.4"/>`);
    parts.push(`<line x1="${(tx + 4).toFixed(1)}" y1="${y(mk.v).toFixed(1)}"
      x2="${(W - R + 4).toFixed(1)}" y2="${yy.toFixed(1)}"
      stroke="${mk.color}" stroke-width="0.8" opacity=".5"/>`);
    parts.push(`<text x="${(W - R + 8).toFixed(1)}" y="${(yy + 3.5).toFixed(1)}"
      fill="${mk.color}" font-size="10.5">${unitVal(mk.v, kind).toFixed(1)}${unitSuffix(kind)}${
      showYear ? `<tspan fill="rgba(255,255,255,.42)" font-size="9"> ${mk.yr}</tspan>` : ''}</text>`);
  });

  /* ── 마지막 자료 점 ──────────────────────────────────────
     ⚠️ "이 그래프가 언제까지인지"를 반드시 적는다. 안 적으면 올해 선이
        중간에 끊긴 것이 이상 현상으로 읽힌다. */
  let last = cur.length - 1;
  while (last >= 0 && cur[last] == null) last--;
  let lastLabel = null;
  if (last >= 0) {
    parts.push(`<circle cx="${x(last).toFixed(1)}" cy="${y(cur[last]).toFixed(1)}" r="3"
      fill="#ff5d5d"/>`);
    lastLabel = doyLabel(last, newest);
  }

  return {
    svg: `<svg viewBox="0 0 ${W} ${H}" class="ch-svg">${parts.join('')}</svg>`,
    years, newest, decades, lastLabel, lastIdx: last, W, H,
  };
}


/** 범례 — 올해 · 10년 단위 · 예년 */
export function legendOf(s2, ko) {
  const bits = [`<span><i style="background:#ff5d5d"></i>${s2.newest}</span>`];
  s2.decades.forEach(d => bits.push(
    `<span><i style="background:${d.color}"></i>${d.year}<em>${ko ? `${d.ago}년 전` : `${d.ago}y ago`}</em></span>`));
  bits.push(`<span><i style="background:rgba(160,175,195,.35)"></i>${ko ? '나머지 해' : 'other years'}</span>`);
  return bits.join('');
}

/** 그래프 아래 한 줄 — 어디까지의 자료인가 */
export function rangeNote(s2, ko, source) {
  const upto = s2.lastLabel
    ? (ko ? `${s2.newest}년 ${s2.lastLabel}까지` : `through ${s2.lastLabel}, ${s2.newest}`)
    : '';
  return (ko
    ? `${s2.years[0]}–${s2.newest} · ${upto} · 자료 ${source}`
    : `${s2.years[0]}–${s2.newest} · ${upto} · source ${source}`);
}


/* ── 그래프 확대 ────────────────────────────────────────────
   ⚠️ SVG 를 다시 그리지 않는다. viewBox 만 바꾼다 —
      확대할 때마다 경로 수천 개를 다시 만들면 손가락을 따라오지 못한다.
   ⚠️ 가로만 확대한다. 세로까지 늘리면 눈금 숫자가 화면 밖으로 나가고,
      우리가 보고 싶은 건 "언제"지 "얼마나 높이"가 아니다. */
export function makeZoomable(wrap, W, H) {
  let z = 1, ox = 0;                       // 배율, 왼쪽 시작 x (viewBox 좌표)
  const svg = wrap.querySelector('svg');
  if (!svg) return;
  const MIN = 1, MAX = 12;

  const apply = () => {
    const w = W / z;
    ox = Math.max(0, Math.min(W - w, ox));
    svg.setAttribute('viewBox', `${ox.toFixed(1)} 0 ${w.toFixed(1)} ${H}`);
    wrap.classList.toggle('zoomed', z > 1.02);
  };

  /** 화면 x → viewBox x */
  const vx = (clientX) => {
    const r = wrap.getBoundingClientRect();
    return ox + ((clientX - r.left) / r.width) * (W / z);
  };

  const zoomAt = (clientX, factor) => {
    const before = vx(clientX);
    z = Math.max(MIN, Math.min(MAX, z * factor));
    const r = wrap.getBoundingClientRect();
    ox = before - ((clientX - r.left) / r.width) * (W / z);
    apply();
  };

  // ── 손가락 두 개로 벌리기 ──
  const pts = new Map();
  let baseDist = 0, baseZ = 1, lastMid = 0;
  wrap.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, e.clientX);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      baseDist = Math.abs(a - b); baseZ = z; lastMid = (a + b) / 2;
      wrap.setPointerCapture(e.pointerId);
    }
  });
  wrap.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, e.clientX);
    if (pts.size === 2 && baseDist > 0) {
      e.preventDefault();
      const [a, b] = [...pts.values()];
      const d = Math.abs(a - b), mid = (a + b) / 2;
      const want = Math.max(MIN, Math.min(MAX, baseZ * (d / baseDist)));
      const before = vx(mid);
      z = want;
      const r = wrap.getBoundingClientRect();
      ox = before - ((mid - r.left) / r.width) * (W / z);
      /* 두 손가락을 함께 움직이면 그만큼 밀린다 */
      ox -= ((mid - lastMid) / r.width) * (W / z);
      lastMid = mid;
      apply();
    }
  }, { passive: false });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) baseDist = 0; };
  wrap.addEventListener('pointerup', up);
  wrap.addEventListener('pointercancel', up);

  // ── 손가락 하나로 밀기 (확대했을 때만) ──
  let dragX = null, dragOx = 0;
  wrap.addEventListener('pointerdown', e => {
    if (pts.size !== 1 || z <= 1.02) return;
    dragX = e.clientX; dragOx = ox;
  });
  wrap.addEventListener('pointermove', e => {
    if (dragX == null || pts.size !== 1) return;
    e.preventDefault();
    const r = wrap.getBoundingClientRect();
    ox = dragOx - ((e.clientX - dragX) / r.width) * (W / z);
    apply();
  }, { passive: false });
  wrap.addEventListener('pointerup', () => { dragX = null; });

  // ── 마우스 휠 / 트랙패드 ──
  wrap.addEventListener('wheel', e => {
    if (!e.ctrlKey && Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;   // 가로 스크롤은 통과
    e.preventDefault();
    zoomAt(e.clientX, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  // ── 두 번 눌러 되돌리기 ──
  wrap.addEventListener('dblclick', e => {
    if (z > 1.02) { z = 1; ox = 0; apply(); }
    else zoomAt(e.clientX, 3);
  });

  apply();
}

/** 가로 막대 */
function bars(rows, fmt, opts = {}) {
  if (!rows.length) return '';
  const vals = rows.map(r => r.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1e-6) hi = lo + 1;
  // ⚠️ 0 에서 자르지 않는다 (기온은 0 이 기준점이 아니다). 대신 눈금 숫자를 적는다.
  const span = hi - lo;
  return rows.map(r => {
    const w = ((r.v - lo) / span) * 100;
    /* ⚠️ 한국만 도드라지게 (받은 요청). 색으로 값의 좋고 나쁨을 말하는 게 아니라
       "여기가 우리"라는 표시다 — 그래서 막대 색이 아니라 테두리와 글자로 구분한다. */
    return `<div class="ch-bar${r.kr ? ' kr' : ''}">
      <span class="ch-bn">${esc(r.name)}</span>
      <span class="ch-bt"><i style="width:${Math.max(2, w).toFixed(1)}%"></i></span>
      <span class="ch-bv">${esc(fmt(r))}</span>
    </div>`;
  }).join('');
}

export const chartsPanel = {
  _data: null,
  /* 지금 보고 있는 대륙. ⚠️ 기본은 전 육지다 —
     특정 대륙을 기본으로 두면 "지구가 이렇다"로 잘못 읽힌다. */
  _region: 'land',
  _pole: 'arctic',

  async load() {
    if (this._data) return this._data;
    const { stats } = await import('./stats.js');
    const [regions, countries, sst, land, korea, ice] = await Promise.all([
      stats.regions().catch(() => null),
      stats.countries().catch(() => null),
      stats.sstSeries().catch(() => null),
      stats.landSeries().catch(() => null),
      stats.koreaSeries().catch(() => null),
      stats.seaIceSeries().catch(() => null),
    ]);
    this._data = { regions, countries, sst, land, korea, ice };
    return this._data;
  },

  get land() { return this._data?.land; },

  /** 해빙 — 극지를 골라 보는 곡선.
   *  ⚠️ 기후 자료 중 가장 설명이 필요 없는 그림이다. 올해 선이 다발 아래로
   *     떨어진 것이 그대로 보인다. 그래서 형용사를 붙이지 않는다. */
  _renderIce(body, ko) {
    const I = this._data.ice;
    const poles = I.poles || {};
    const ids = Object.keys(I.series).filter(k => Object.keys(I.series[k] || {}).length);
    if (!ids.length) return;
    if (!ids.includes(this._pole)) this._pole = ids[0];

    body.appendChild(el('div', 'ch-h', ko ? '해빙 면적 — 극지를 눌러 보세요'
                                          : 'Sea ice extent — tap a pole'));
    const tabs = el('div', 'ch-tabs');
    ids.forEach(id => {
      const b = el('button', 'ch-tab' + (id === this._pole ? ' on' : ''),
                   esc(poles[id]?.ko && ko ? poles[id].ko : (id === 'arctic' ? 'Arctic' : 'Antarctic')));
      b.onclick = () => { this._pole = id; body.innerHTML = ''; this.render(body, ko); };
      tabs.appendChild(b);
    });
    body.appendChild(tabs);

    const s3 = spaghetti(I.series[this._pole], { step: 10, kind: ' M km²' });
    if (!s3) return;
    const w = el('div', 'ch-wrap', s3.svg);
    body.appendChild(w);
    makeZoomable(w, s3.W, s3.H);
    body.appendChild(el('div', 'ch-leg', legendOf(s3, ko)));
    body.appendChild(el('p', 'ch-note', esc(rangeNote(s3, ko, I.source))));
    body.appendChild(el('p', 'ch-note', mk(ko
      ? `단위는 백만 km². ⚠️ **면적(extent)** 입니다 — 해빙 농도 15% 이상인 격자칸의 넓이를 통째로 센 값이고, 실제 얼음이 덮은 넓이(area)와는 20~30% 차이가 납니다.\n`
        + `⚠️ 1979~1987년은 위성이 이틀에 한 번 훑어 빈 날이 많습니다. 그 날을 앞뒤 값으로 메우지 않았습니다 — 메우면 그때도 자료가 촘촘했던 것처럼 보입니다.\n`
        + `⚠️ 올해 곡선은 ${esc(poles[this._pole]?.last || '')}까지입니다. ${this._pole === 'antarctic' ? '남극 최대는 9월이라 올해 최댓값은 아직 나오지 않았습니다.' : '북극 최소는 9월이라 올해 최솟값은 아직 나오지 않았습니다.'}`
      : `Units: million km². ⚠️ This is **extent** — the whole area of grid cells with at least 15% ice concentration, which differs from ice *area* by 20–30%.\n`
        + `⚠️ From 1979 to 1987 the satellite sampled every other day; those gaps are left empty rather than filled, which would imply a denser record than existed.\n`
        + `⚠️ This year's curve runs to ${esc(poles[this._pole]?.last || '')}. ${this._pole === 'antarctic' ? "The Antarctic maximum falls in September, so this year's peak has not happened yet." : "The Arctic minimum falls in September, so this year's low has not happened yet."}`)));
  },

  /** 대륙 버튼 + 그 대륙의 해마다 한 줄 곡선 */
  _renderLand(body, ko) {
    const L = this.land || { series: {}, regions: {}, source: '' };
    const KR = this._data?.korea;
    const names = { ...(L.regions || {}) };
    let ids = Object.keys(L.series).filter(k => Object.keys(L.series[k] || {}).length);
    /* ⚠️ 한국은 격자가 아니라 **기상청 관측**이다 (받은 요청).
       자료원이 다르므로 같은 그래프에 겹쳐 그리지 않고 탭으로만 나란히 둔다. */
    if (KR?.series && Object.keys(KR.series).length) {
      names.kr = ko ? '한국' : 'Korea';
      ids = ['kr', ...ids.filter(x => x !== 'kr')];
    } else {
      ids = ids.filter(x => x !== 'kr');
    }
    if (!ids.length) return;
    if (!ids.includes(this._region)) this._region = ids[0];

    body.appendChild(el('div', 'ch-h', ko
      ? '일별 육상 기온 — 대륙을 눌러 보세요'
      : 'Daily land temperature — tap a continent'));

    const tabs = el('div', 'ch-tabs');
    ids.forEach(id => {
      const b = el('button', 'ch-tab' + (id === this._region ? ' on' : ''),
                   esc(names[id] || id));
      b.onclick = () => {
        this._region = id;
        /* 다시 그린다. ⚠️ body 를 통째로 비우고 render 를 다시 부른다 —
           부분 갱신은 상태가 어긋나기 쉽고, 이 화면은 그릴 것이 몇 개 안 된다. */
        body.innerHTML = '';
        this.render(body, ko);
      };
      tabs.appendChild(b);
    });
    body.appendChild(tabs);

    const isKR = this._region === 'kr' && KR?.series;
    const src = isKR ? KR : L;
    /* ⚠️ 대륙은 전부 같은 해를 쓴다 (받은 요청). 기준이 되는 '전 육지' 계열에서
       한 번 정하고 그 목록을 모든 대륙에 그대로 넘긴다.
       ⚠️ 한국은 자료원이 달라(기상청 관측, 1973~) 따로 고른다. */
    let opt;
    if (isKR) {
      opt = { step: 10 };
    } else {
      const ref = Object.keys(L.series.land || {}).map(Number);
      const now = new Date().getUTCFullYear();
      const fixed = [];
      for (let k = 1; k <= 5; k++) {
        const y = now - k * 20;
        if (ref.includes(y)) fixed.push(y);
      }
      opt = { step: 20, fixed };
    }
    const s2 = spaghetti(isKR ? KR.series : L.series[this._region], opt);
    if (!s2) {
      body.appendChild(el('p', 'ch-note', ko
        ? '이 지역은 아직 자료가 두 해 미만이라 곡선을 그리지 않습니다.'
        : 'Fewer than two years here yet, so no curve is drawn.'));
      return;
    }
    const w2 = el('div', 'ch-wrap', s2.svg);
    body.appendChild(w2);
    makeZoomable(w2, s2.W, s2.H);
    body.appendChild(el('div', 'ch-leg', legendOf(s2, ko)));
    body.appendChild(el('p', 'ch-note', esc(rangeNote(s2, ko, src.source))));
    if (isKR) {
      const st = (KR.stations || []).map(x => x.name).join(' · ');
      body.appendChild(el('p', 'ch-note', mk(ko
        ? `**기상청 관측**입니다 (NOAA GHCN-Daily 경유 — 기상청 API는 인증키가 필요해 공개 경로를 씁니다).\n`
          + `관측소 ${(KR.stations || []).length}곳: ${esc(st)}\n`
          + `⚠️ **전국 평균 기온이 아닙니다** — 기상청 공식 전국 평균과는 관측소 구성이 달라 값이 조금 다릅니다.\n`
          + `⚠️ 관측소 구성을 1973년부터 고정했습니다. 관측소가 늘고 줄면 기온이 변하지 않아도 평균이 튀기 때문입니다.\n`
          + `⚠️ 서울은 빠져 있습니다 — 서울 관측소 자료가 2025년 8월에서 끊겨 있어, 넣으면 그해부터 평균이 튑니다.`
        : `**Korea Meteorological Administration observations**, obtained via NOAA GHCN-Daily (the KMA API requires a key, so the open route is used).\n`
          + `${(KR.stations || []).length} stations: ${esc(st)}\n`
          + `⚠️ **Not the national mean temperature** — the KMA's official figure uses a different station set.\n`
          + `⚠️ The station set is fixed from 1973 so the average does not jump when stations come and go.\n`
          + `⚠️ Seoul is excluded: its record stops in August 2025, and including it would make the average jump from that year.`)));
    } else {
      body.appendChild(el('p', 'ch-note', mk(ko
        ? `${esc(names[this._region] || this._region)}\n`
          + `⚠️ **육지만** 담긴 자료라 바다가 섞이지 않습니다 — 진짜 대륙 평균입니다.\n`
          + `⚠️ 일평균은 (일최고+일최저)/2 입니다. CPC 가 최고·최저만 주기 때문이고, 시간별 평균과는 조금 다릅니다.`
        : `${esc(names[this._region] || this._region)}\n`
          + `⚠️ The dataset is **land only**, so no ocean is mixed in — these are true continental means.\n`
          + `⚠️ Daily mean is (daily max + daily min) / 2, because CPC supplies only max and min.`)));
    }
  },

  render(body, ko) {
    const d = this._data;
    if (!d) {
      body.appendChild(el('p', 'sky-dim', ko ? '불러오는 중…' : 'Loading…'));
      return;
    }

    /* earthus가 시간을 들여 쌓은 자료로 만든 도구들.
       ⚠️ 예전에는 예보 검증만 설정 맨 아래에 있었고, 내 관측소·Research Pack은
          서로의 페이지에서만 갈 수 있었다. 만들어 놓고 메인 앱에서 못 찾으면 없는
          기능과 같다. 새 최상위 메뉴를 늘리지 않고 자료를 보러 온 이 탭 맨 앞에 둔다. */
    const tools = el('section', 'ch-tools');
    tools.setAttribute('aria-label', ko ? 'earthus 분석 도구' : 'earthus analysis tools');
    tools.appendChild(el('div', 'ch-tools-head', ko ? '시간이 쌓일수록 달라지는 자료' : 'Data that grows with time'));
    (ko ? [
      ['./verify.html', '예보 검증', '그때의 예보와 실제 관측을 같은 지점·시각으로 비교', 'GFS · ECMWF · 24/48시간'],
      ['./station.html', '내 관측소', '기상청 ASOS 한 곳을 저장하고 쌓이는 관측 이력 확인', '무료 1곳 · 이 기기에 저장'],
      ['./research.html', 'Research Pack', '검증·관측 자료를 조건과 체크섬이 있는 CSV로 내려받기', '무료 미리보기'],
    ] : [
      ['./verify.html', 'Forecast verification', 'Compare the forecast captured then with the observation at the same place and time', 'GFS · ECMWF · 24/48 h'],
      ['./station.html', 'My station', 'Save one KMA ASOS station and follow its accumulating observation history', '1 free · saved on this device'],
      ['./research.html', 'Research Pack', 'Download verification and observations as reproducible CSV files with checksums', 'Free preview'],
    ]).forEach(([href, title, copy, meta]) => {
      const a = el('a', 'ch-tool');
      a.href = href; a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = `<span><b>${esc(title)}</b><em>${esc(copy)}</em><small>${esc(meta)}</small></span>`
        + '<i aria-hidden="true">↗</i>';
      tools.appendChild(a);
    });
    body.appendChild(tools);

    // ── ① 스파게티: 일별 해수면온도 ──
    if (d.sst?.series?.['60S60N']) {
      /* ⚠️ 해수면온도는 10년 단위 그대로 둔다 — "지금 너무 잘 보이고 비교가 되어서
         좋다"는 평을 받았다. 육상만 20년으로 바꾼다. */
      const s = spaghetti(d.sst.series['60S60N'], { step: 10 });
      if (s) {
        body.appendChild(el('div', 'ch-h', ko
          ? `일별 해수면온도 60°S–60°N · ${s.years[0]}–${s.newest}`
          : `Daily sea surface temperature 60°S–60°N · ${s.years[0]}–${s.newest}`));
        const w1 = el('div', 'ch-wrap', s.svg);
        body.appendChild(w1);
        makeZoomable(w1, s.W, s.H);
        body.appendChild(el('div', 'ch-leg', legendOf(s, ko)));
        body.appendChild(el('p', 'ch-note', esc(rangeNote(s, ko, d.sst.source))));
        body.appendChild(el('p', 'ch-note', mk(ko
          ? `해마다 한 줄입니다. 올해 선이 다발보다 위에 있으면 그게 답입니다. 자료 ${esc(d.sst.source)} · 면적 가중(cos 위도) 평균 — 이걸 안 하면 극지가 과대평가되어 값이 낮게 나옵니다.`
          : `One line per year. If this year sits above the bundle, that is the answer. Source: ${esc(d.sst.source)}, area-weighted by cos(latitude) — without that the poles are over-counted and the mean reads low.`)));
      }
    } else {
      body.appendChild(el('div', 'ch-h', ko ? '일별 해수면온도 (준비 중)' : 'Daily SST (being built)'));
      body.appendChild(el('p', 'ch-note', ko
        ? '1982년부터의 일별 자료를 지금 모으고 있습니다. 다 모이면 해마다 한 줄인 곡선이 여기 나옵니다. 없는 값을 미리 그려두지 않습니다.'
        : 'Daily values back to 1982 are being collected now. When they are in, one line per year will appear here. We do not draw a placeholder curve.'));
    }

    // ── ①-1 해빙 면적 (북극 · 남극) ──
    if (d.ice?.series) this._renderIce(body, ko);

    // ── ①-2 대륙별 일별 육상 기온 (과거 ~ 오늘) ──
    if (this.land?.series || this._data?.korea?.series) this._renderLand(body, ko);

    // ── ② 지역별 지금 기온 ──
    if (d.regions?.rows?.length) {
      body.appendChild(el('div', 'ch-h', ko ? '지금 기온 — 지역별' : 'Temperature right now — by region'));
      /* ⚠️ 설정의 온도 단위를 따른다. °C 를 박아두면 화씨로 맞춘 사람에게
         다른 화면과 다른 값이 보인다 (실제로 지적받았다). */
      body.appendChild(el('div', 'ch-bars',
        bars(d.regions.rows.map(r => ({ name: r.name, v: r.temp, n: r.n,
                                        kr: r.id === 'korea' })),
             r => i18n.temp(r.v, 1) + (r.n <= 2 ? (ko ? ` · 격자 ${r.n}칸` : ` · ${r.n} cell`) : ''))));
      const t = (d.regions.time || '').replace('T', ' ').replace(':00:00Z', ' UTC');
      body.appendChild(el('p', 'ch-note', mk(ko
        ? `자료 시각 ${esc(t)} · 5° 격자의 면적가중 평균입니다.\n⚠️ 상자 범위라 바다가 섞여 있습니다. 그래서 "대륙 평균"이 아니라 "지역 평균"이라고 적습니다.`
        : `Data time ${esc(t)} · area-weighted mean of the 5° grid.\n⚠️ These are bounding boxes, so ocean is included — hence “region”, not “continent”, average.`)));
      if (d.regions.sst) {
        body.appendChild(el('p', 'ch-note', ko
          ? `참고 — 전지구 해수면온도 평균 ${i18n.temp(d.regions.sst.mean, 2)} (바다 격자 ${d.regions.sst.n}칸)`
          : `For reference — global mean SST ${i18n.temp(d.regions.sst.mean, 2)} (${d.regions.sst.n} ocean cells)`));
      }
    }

    // ── ③ 국가별 관측소 평균 ──
    if (d.countries?.rows?.length) {
      /* ⚠️ 전부 보여준다 (받은 지적). 예전에는 위 8개 + 아래 5개만 보여줘서
         미국·일본·중국처럼 중간에 있는 나라가 통째로 안 보였다.
         한국도 맨 위로 올리지 않고 **제 순위 자리**에 둔다. */
      const rows = d.countries.rows;
      const top = rows;
      body.appendChild(el('div', 'ch-h', ko
        ? `국가별 관측소 평균 기온 — ${rows.length}개국`
        : `Mean station temperature by country — ${rows.length} countries`));
      body.appendChild(el('div', 'ch-bars',
        bars(top.map(r => ({ name: r.name, v: r.mean, n: r.n, kr: r.kr })),
             r => `${i18n.temp(r.v, 1)} · ${r.n}${ko ? '곳' : ''}`)));
      if (d.countries.kr) {
        const k = d.countries.kr;
        body.appendChild(el('p', 'ch-kr',
          ko ? `한국은 ${k.of}개국 중 ${k.rank}위 · 관측소 ${k.n}곳 평균 ${i18n.temp(k.mean, 1)}`
             : `Korea ranks ${k.rank} of ${k.of} · mean of ${k.n} stations, ${i18n.temp(k.mean, 1)}`));
      }
      /* ⚠️ 이 문장을 빼면 안 된다. "그 나라 평균 기온"으로 읽히면 틀린 정보가 된다. */
      body.appendChild(el('p', 'ch-note', mk(ko
        ? `공항에 설치된 계기 ${d.countries.total.toLocaleString()}곳의 실황을 나라별로 묶은 것입니다.\n⚠️ **그 나라의 평균 기온이 아닙니다** — 공항 위치에 있는 관측소들의 평균입니다. 관측소가 3곳 미만인 나라는 뺐고, 부호를 모르는 ${d.countries.unknown}곳도 뺐습니다. 나라 이름을 지어내지 않습니다.`
        : `Live readings from ${d.countries.total.toLocaleString()} airport instruments, grouped by country.\n⚠️ **This is not a country's average temperature** — it is the mean of stations that happen to sit at airports. Countries with fewer than three stations are excluded, as are ${d.countries.unknown} stations whose code we do not map. We do not invent country names.`)));
    }

    // ── ④ 우리만 가진 자료 ──
    body.appendChild(el('div', 'ch-h', ko ? '우리만 가진 자료' : 'Data only we hold'));
    body.appendChild(el('div', 'ch-own',
      (ko ? [
        ['예보 정확도', '그때의 예보와 실제 관측을 같은 지점·시각으로 맞춰본 기록. 지나간 예보를 돌려주는 API 는 없어서, 그 시점에 붙잡은 우리 자료 말고는 만들 수 없습니다.', '운영 중 · GFS·ECMWF 24/48시간'],
        ['태풍 소멸 후 경로', '공식 기관은 열대저기압 지위를 잃는 순간 추적을 끊습니다. 그 뒤 72시간을 잇는 기록.', '2026-07-27 수집 시작'],
        ['산불 생애주기', '같은 불을 시간축으로 잇는 지속 ID. FIRMS 는 "이 시각 이 자리에 열이 있다"만 줍니다.', '2026-07-26 수집 시작'],
      ] : [
        ['Forecast accuracy', 'A captured forecast checked against the observation at the same place and time. No API returns a past forecast, so this can only be built from what we captured then.', 'Live · GFS and ECMWF at 24/48 h'],
        ['Tracks after dissipation', 'Agencies stop tracking the moment a storm loses tropical status. This records the following 72 hours.', 'collecting since 2026-07-27'],
        ['Wildfire lifecycle', 'A persistent id linking one fire across time. FIRMS only says “there is heat here now”.', 'collecting since 2026-07-26'],
      ]).map(([t, why, when]) =>
        `<div class="ch-o"><b>${esc(t)}</b><p>${esc(why)}</p><span>${esc(when)}</span></div>`).join('')));
    body.appendChild(el('p', 'ch-note', ko
      ? '예보 검증은 지점·시각별 사례와 일별 집계를 공개하고 있습니다. 태풍 소멸 후 경로와 산불 생애주기는 아직 추세 그래프를 만들 만큼 쌓이지 않아 곡선을 그리지 않습니다.'
      : 'Forecast verification is live with station-time cases and daily aggregates. Post-dissipation storm tracks and wildfire lifecycles are not yet long enough for trend charts, so no curve is drawn for them.'));
  },
};
