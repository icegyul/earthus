// 뉴스 말풍선 — 지구 위 그 자리에서 무슨 일이 났는지 (받은 요청)
//
//   "News 는 누르면 지구에서 이루어지는 뉴스를 보여주고 발생된 지역마다 지구에서
//    큰 말풍선에 나오게 해주고, 뉴스 성격에 따라 말풍선의 엣지 선 색이 다르게"
//
// 왜 canvas 인가
//   Cesium 의 label 은 배경판 색만 정할 수 있고 **테두리 색을 못 준다.**
//   "성격에 따라 테두리 색이 달라야" 하므로 직접 그려서 빌보드로 올린다.
//   (pin.js 가 핀을 그리는 것과 같은 방식이다)
//
// ⚠️⚠️ 개수를 반드시 제한할 것. 이게 이 파일에서 제일 중요한 규칙이다.
//   같은 날 새벽 발열의 원인이 **라벨 2,843개가 한 번에 켜진 것**이었다.
//   말풍선은 라벨보다 훨씬 무겁다 — 이벤트마다 글자가 달라서 캐시가 안 되고,
//   하나가 텍스처 한 장이다. 확정 사건 상위 몇 개만 단다.
//   나머지는 지금처럼 점으로 남는다(점은 거의 공짜다).
//
// ⚠️ 미확정 사건에는 절대 달지 않는다.
//   말풍선은 라벨보다 강한 표시다. 미확정에 달면 "확인된 사건"으로 읽히고,
//   그건 이 레이어가 존재하는 이유(거르기)와 정면으로 어긋난다.
//
// ⚠️ 저작권 — 말풍선에 넣는 것은 **기사 제목과 분류**까지다.
//   본문·요약을 넣지 않는다 (regional-news 수집기 머리말과 같은 규율).

/* 레티나에서 또렷하려면 2배로 그린 뒤 절반 크기로 표시한다. */
const S = 2;

/* 말풍선 크기(CSS px 기준). ⚠️ 폭을 더 키우지 말 것 —
   폰 화면(375px)에서 260px 이 넘으면 두 개만 겹쳐도 화면이 막힌다. */
const MAXW = 224;
const PAD_X = 11;
const PAD_Y = 9;
const TAIL = 7;              // 꼬리 높이
const RADIUS = 11;

/* ⚠️ 한글 폰트를 반드시 지정한다. 안 하면 안드로이드·윈도우에서 대체 폰트로
   떨어져 자간이 틀어진다 (maplabel.js 에 같은 교훈이 적혀 있다). */
const FONT_KIND = `600 ${11 * S}px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`;
const FONT_TITLE = `400 ${12.5 * S}px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`;

/** 글자를 폭에 맞춰 줄로 자른다. 넘치면 마지막 줄에 … */
function wrap(ctx, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width <= maxW || !cur) { cur = t; continue; }
    lines.push(cur); cur = w;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur) lines.push(cur);

  if (lines.length === maxLines) {
    /* 마지막 줄이 넘치면 한 글자씩 줄여 … 를 붙인다.
       ⚠️ 한글은 단어 경계가 드물어 낱말 단위로만 자르면 거의 안 잘린다. */
    let last = lines[maxLines - 1];
    const used = words.join(' ').length;
    const shown = lines.join(' ').length;
    if (shown < used || ctx.measureText(last).width > maxW) {
      while (last.length > 1 && ctx.measureText(last + '…').width > maxW) {
        last = last.slice(0, -1);
      }
      if (shown < used) last += '…';
      lines[maxLines - 1] = last;
    }
  }
  return lines;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * 말풍선 이미지를 만든다.
 * @param {object} o
 *   kind   분류 이름 (예: '시위·집회')
 *   title  기사 제목 (없으면 생략)
 *   color  테두리 색 — **뉴스 성격에 따라 다르다** (받은 요청의 핵심)
 * @returns {{url:string, w:number, h:number}}  w·h 는 CSS px
 */
export function bubbleImage({ kind, title, color }) {
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d');

  // ── 1) 크기부터 잰다 (그리기 전에 캔버스 크기를 정해야 한다)
  const innerW = (MAXW - PAD_X * 2) * S;
  g.font = FONT_KIND;
  const kindW = g.measureText(kind || '').width;
  g.font = FONT_TITLE;
  const titleLines = title ? wrap(g, title, innerW, 2) : [];
  let textW = kindW;
  titleLines.forEach(l => { textW = Math.max(textW, g.measureText(l).width); });

  const boxW = Math.min(MAXW * S, textW + PAD_X * 2 * S);
  const lineH = 16 * S;
  const kindH = kind ? 15 * S : 0;
  const boxH = PAD_Y * 2 * S + kindH + titleLines.length * lineH;

  cv.width = Math.ceil(boxW);
  cv.height = Math.ceil(boxH + TAIL * S);

  // ── 2) 그린다 (캔버스 크기를 바꾸면 컨텍스트가 초기화되므로 폰트를 다시 준다)
  const c = Cesium.Color.fromCssColorString(color || '#ffd166');
  const rgb = `${Math.round(c.red * 255)},${Math.round(c.green * 255)},${Math.round(c.blue * 255)}`;

  // 몸통
  g.fillStyle = 'rgba(10,14,20,0.86)';
  g.strokeStyle = `rgba(${rgb},0.95)`;
  g.lineWidth = 1.6 * S;
  roundRect(g, g.lineWidth / 2, g.lineWidth / 2,
            cv.width - g.lineWidth, boxH - g.lineWidth, RADIUS * S);
  g.fill(); g.stroke();

  // 꼬리 — 아래 가운데. ⚠️ 끝점이 사건 좌표에 닿아야 한다.
  const cx = cv.width / 2;
  g.beginPath();
  g.moveTo(cx - TAIL * S, boxH - g.lineWidth);
  g.lineTo(cx, boxH + TAIL * S - g.lineWidth);
  g.lineTo(cx + TAIL * S, boxH - g.lineWidth);
  g.closePath();
  g.fillStyle = 'rgba(10,14,20,0.86)';
  g.fill();
  /* 꼬리 테두리는 양옆 두 변만 긋는다 — 몸통과 만나는 위쪽을 그으면
     본체 테두리 위에 선이 한 겹 더 얹혀 두꺼워 보인다. */
  g.beginPath();
  g.moveTo(cx - TAIL * S, boxH - g.lineWidth);
  g.lineTo(cx, boxH + TAIL * S - g.lineWidth);
  g.lineTo(cx + TAIL * S, boxH - g.lineWidth);
  g.strokeStyle = `rgba(${rgb},0.95)`;
  g.stroke();

  // 분류 — 색 점 + 이름
  let y = PAD_Y * S;
  if (kind) {
    g.fillStyle = `rgba(${rgb},1)`;
    g.beginPath();
    g.arc(PAD_X * S + 3 * S, y + 6 * S, 3 * S, 0, Math.PI * 2);
    g.fill();
    g.font = FONT_KIND;
    g.textBaseline = 'middle';
    g.fillText(kind, PAD_X * S + 11 * S, y + 6.5 * S);
    y += kindH;
  }

  // 제목
  if (titleLines.length) {
    g.font = FONT_TITLE;
    g.fillStyle = 'rgba(255,255,255,0.93)';
    g.textBaseline = 'middle';
    titleLines.forEach((l, i) => {
      g.fillText(l, PAD_X * S, y + lineH * i + lineH / 2);
    });
  }

  return { url: cv.toDataURL('image/png'), w: cv.width / S, h: cv.height / S };
}
