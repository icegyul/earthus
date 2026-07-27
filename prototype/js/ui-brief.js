// AI 브리핑 카드 — 사실 한 줄 + 그 줄의 출처
//
// 왜 이 모양인가
//   "무슨 일이 났는지"를 알려면 기사 제목만으로는 부족하고, 기사 본문을 그대로
//   실을 수는 없다(저작권). 그래서 사실을 항목으로 쪼개고 **항목마다 근거를 붙인다.**
//   출처가 문장 옆에 붙어 있으면 읽는 사람이 그 자리에서 확인할 수 있다 —
//   글 끝에 링크를 모아두면 어느 문장의 근거인지 알 수 없다.
//
// ⚠️ AI 가 썼다는 사실을 숨기지 않는다. 카드에 모델명과 안내 문구를 적는다.
// ⚠️ 출처 없는 항목은 서버가 이미 버렸다. 여기서 만들어 채우지 않는다.
// ⚠️ 확인되지 않은 것(unresolved)을 감추지 않는다. 비어 보이는 카드보다
//    "이건 아직 모른다"가 정직하고 실제로 더 쓸모 있다.

import { i18n } from './i18n.js';

const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CONF = {
  high:   { ko: '교차확인', en: 'Corroborated', color: '#3ddc84' },
  medium: { ko: '부분확인', en: 'Partial',      color: '#ffd166' },
  low:    { ko: '단일 출처', en: 'Single source', color: '#ff9f43' },
};

/** 매체 이름 — 도메인에서 뒤쪽 붙임말을 떼서 읽기 쉽게.
    ⚠️ 우리가 매체 이름을 예쁘게 지어 붙이지 않는다. 도메인을 줄이기만 한다.
       그래야 사용자가 링크와 같은 것임을 알 수 있다. */
function outletName(host) {
  return String(host || '')
    .replace(/^(www|amp|m|edition|news)\./, '')
    .replace(/\.(co|com|org|net|gov|go|or|ne)\.[a-z]{2}$/, '')
    .replace(/\.(com|org|net|news|info|io|co)$/, '');
}

/** 한 항목의 출처 칩. 첫 매체를 이름으로 보여주고 나머지는 +N.
    ⚠️ +N 을 누르면 나머지 링크가 펼쳐진다. 처음부터 다 펼치면
       문장보다 링크가 길어져서 읽을 수가 없다. */
function sourceChip(sources, ko) {
  const wrap = el('span', 'bf-src');
  const first = sources[0];
  const a = el('a', 'bf-chip', esc(outletName(first.host)));
  a.href = first.url; a.target = '_blank'; a.rel = 'noopener';
  a.title = first.title || first.url;
  wrap.appendChild(a);

  const rest = sources.slice(1);
  if (rest.length) {
    const more = el('button', 'bf-chip more', `+${rest.length}`);
    more.title = ko ? '다른 출처 보기' : 'Show other sources';
    more.onclick = () => {
      more.remove();
      rest.forEach(s => {
        const b = el('a', 'bf-chip', esc(outletName(s.host)));
        b.href = s.url; b.target = '_blank'; b.rel = 'noopener';
        b.title = s.title || s.url;
        wrap.appendChild(b);
      });
    };
    wrap.appendChild(more);
  }
  return wrap;
}

/**
 * 브리핑 카드.
 * @param b        briefs.json 의 한 항목
 * @param opts.onGo  "이 지역 보기" 를 눌렀을 때 (없으면 버튼을 안 만든다)
 * @param opts.compact  시트 안에 들어갈 때 — 제목을 줄이고 여백을 좁힌다
 */
export function briefCard(b, opts = {}) {
  const ko = i18n.lang === 'ko';
  const L = k => (b[k] && (b[k][i18n.lang] ?? b[k].en)) || '';
  const card = el('div', 'bf-card' + (opts.compact ? ' compact' : ''));

  const conf = CONF[b.confidence] || CONF.low;
  const kind = ko ? b.kindKo : b.kindEn;

  /* ── 머리 ── 분류 · 신뢰도 · 매체 수 */
  card.appendChild(el('div', 'bf-top',
    `<span class="bf-kind">${esc(kind || '')}</span>`
    + `<span class="bf-conf" style="--c:${conf.color}">${ko ? conf.ko : conf.en}</span>`
    + `<span class="bf-outlets">${b.outlets?.length || 0}${ko ? '개 매체' : ' outlets'}</span>`));

  /* ── 제목 ── 이게 주인공이다 */
  card.appendChild(el('h4', 'bf-head', esc(L('headline'))));
  card.appendChild(el('div', 'bf-place', esc(b.place || '')));

  const sum = L('summary');
  if (sum) card.appendChild(el('p', 'bf-sum', esc(sum)));

  /* ── 사실 항목 ── 항목마다 출처 칩 */
  if (b.bullets?.length) {
    const ul = el('ul', 'bf-list');
    b.bullets.forEach(bt => {
      const li = el('li');
      li.appendChild(el('span', 'bf-txt', esc(bt[i18n.lang] ?? bt.en ?? '')));
      if (bt.sources?.length) li.appendChild(sourceChip(bt.sources, ko));
      ul.appendChild(li);
    });
    card.appendChild(ul);
  }

  /* ── 관련 정보 ── 표로 짧게 */
  if (b.context?.length) {
    const box = el('div', 'bf-ctx');
    b.context.forEach(c => {
      const label = ko ? c.label_ko : c.label_en;
      const value = ko ? c.value_ko : c.value_en;
      if (!label || !value) return;
      box.appendChild(el('div', 'bf-ctx-row',
        `<span>${esc(label)}</span><b>${esc(value)}</b>`));
    });
    if (box.children.length) card.appendChild(box);
  }

  /* ── 아직 모르는 것 ──
     ⚠️ 이걸 감추면 카드가 실제보다 확실해 보인다. 그게 위험하다. */
  const un = (b.unresolved && (b.unresolved[i18n.lang] || b.unresolved.en)) || [];
  if (un.length) {
    const box = el('div', 'bf-open');
    box.appendChild(el('div', 'bf-open-h', ko ? '아직 확인되지 않음' : 'Not yet established'));
    const ul = el('ul');
    un.forEach(u => ul.appendChild(el('li', null, esc(u))));
    box.appendChild(ul);
    card.appendChild(box);
  }

  /* ── 지역으로 ── 이 카드에서 그 자리로 갈 수 있어야 한다 */
  if (opts.onGo) {
    const go = el('button', 'bf-go', ko ? '이 지역 보기' : 'View this area');
    go.onclick = () => opts.onGo(b);
    card.appendChild(go);
  }

  /* ── AI 표기 ──
     ⚠️ 작게라도 반드시 남긴다. AI 가 쓴 글을 사람이 쓴 것처럼 두면 속이는 것이다. */
  const when = (b.at || '').slice(11, 16);
  card.appendChild(el('div', 'bf-by', ko
    ? `AI 정리 (${esc(b.writtenBy || '')}) · ${when} UTC · 각 항목의 출처를 눌러 원문을 확인하세요`
    : `Written by AI (${esc(b.writtenBy || '')}) · ${when} UTC · tap a source to read the original`));

  return card;
}

/** 목록 맨 위에 붙일 안내 — 서버가 준 문구를 그대로 쓴다 */
export function briefNotice(meta) {
  const t = meta?.notice?.[i18n.lang] || meta?.notice?.en;
  if (!t) return null;
  return el('p', 'bf-notice', esc(t));
}
