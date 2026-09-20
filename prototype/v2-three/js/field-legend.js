// EARTHUS v2 — 늘 떠 있는 범례 (DEV-DIRECTIVE 2026-09-20 · W1 §6 범례 컴포넌트 · W2 "범례가 항상 의미와 단위를 말한다")
//
// 무엇이 없어 있었나: v2 에는 색면의 범례가 사실상 없었다. 색을 값으로 되돌릴 눈금이 화면에 없으니
// "어디가 얼마나 다른가"를 10초 안에 말할 수 없었다(W2 완료 기준).
//
// 이 파일이 하는 일: field-scales.js 의 표를 **그대로** 읽어 구간 띠 + 경계 숫자 + 단위 + 출처·런·유효시각 한 줄 + 풀이 한 줄을 그린다.
//   · 색과 경계를 여기 적지 않는다. 범례의 칸은 legendModel() 이 준 것뿐이다 — 셰이더의 팔레트와 같은 바이트다.
//   · **색만으로 말하지 않는다**: 경계마다 숫자, 줄마다 단위, 칸마다 글자 라벨(title · aria-label '30 – 35 °C').
//   · 칸은 **단색**이다. 이 파일과 index.html 의 범례 CSS 어디에도 그라데이션은 없다(시험이 잠근다).
//   · 글자는 전부 textContent 로 넣는다 — 출처·제목이 남의 자료에서 와도 HTML 로 해석되지 않는다.
//
// ── 자리 (index.html 의 #field-legend 규칙) ──────────────────────────────────────────────────────────────────
//   넓은 화면(≥ 1110): 오른쪽 아래 구석(right 14 · bottom 12). 우측 패널 #intel 이 bottom 156 에서 시작하므로 그 아래 136px 가 빈다.
//   721 ~ 1109:        가운데 타임스트립·하단 바와 가로로 겹치기 시작한다 → 상단 줄 아래 오른쪽(top 66).
//   폰(≤ 720):          아래쪽은 타임스트립(10) · #hud(66~145) · 하단 바(158~214) · 바텀시트(220~)로 **꽉 차 있다.**
//                       그래서 위로 간다 — 전환기(8~48)와 상단 줄(56~102) 아래, 좌우 8px (top 108 + 안전영역).
//   상자의 **폭과 높이는 고정**이다(340×116 · 폰은 화면 폭 − 16). 기온 11칸이든 풍속 8칸이든 칸이 같은 폭을 나눠 갖고,
//   kt 줄과 풀이 줄은 비어도 자리를 지킨다 → 레이어를 바꿔도 상자가 움직이지 않는다(W1 완료 기준 ③ 'reflow 없음').
//   position: fixed 라 다른 UI 의 흐름에 끼지 않는다. z-index 3 — 우측 패널·바텀시트(4)가 펼쳐지면 그 아래로 들어간다.
//   ⚠️ W5 에서 Inspector 가 생기면 mount(inspector 안의 자리) 로 옮기고 index.html 의 position 규칙을 걷는다.
//
// ── 쓰는 법 (아직 main.js 에 배선하지 않았다 — W1 FieldRenderer 가 한다) ─────────────────────────────────────
//   import { fieldLegend } from './field-legend.js?v=1';
//   import { scaleOf } from './field-scales.js?v=1';        // ⚠️ 질의문자열까지 이 파일의 import 와 똑같이(ES 모듈은 URL 전체로 구분된다)
//   fieldLegend.mount(document.body);                        // 한 번. 다시 불러도 상자는 하나다
//   fieldLegend.show({ scale: scaleOf('temp'), source: 'MODEL · GFS 0.5°',
//                      run: manifest.run, valid: step.valid });          // ISO 글자 · Date · ms 아무거나
//   fieldLegend.show({ scale: scaleOf('precip'), unitAlt: true, … });    // 누적을 고르면 단위가 mm 로
//   fieldLegend.hide();                                       // 색면을 끄면
//   fieldLegend.refresh();                                    // 언어를 바꾼 뒤(main.js applyI18n)
//   콘솔에서 한 번 보기:  (await import('./js/field-legend.js?v=1')).demo('wind')
//   타임라인을 밀 때마다 show() 를 불러도 된다 — 눈금·단위·언어가 같으면 칸을 다시 만들지 않고 시각 글자만 바꾼다.

import { i18n } from './i18n.js?v=11';
import { legendModel, scaleOf } from './field-scales.js?v=1';

const H = 3600_000;
// 런이 이보다 늙으면 '지연'을 붙인다(지시서 W3 범례). GFS 는 6시간마다 새 런이고 올라오는 데 4~6시간이 걸린다 —
// 정상이면 12시간을 넘지 않는다.
export const RUN_STALE_H = 12;

const TEXT = {
  ko: { run: '런', valid: '유효', stale: '지연', legend: '범례' },
  en: { run: 'run', valid: 'valid', stale: 'delayed', legend: 'Legend' },
};

// 입자 풀이 — 바람 눈금의 legendNote 와 같은 글이다. 기온·강수 색면 위에 입자를 켰을 때(W3) show({ note }) 로 넘기라고 내놓는다.
export const PARTICLE_NOTE = Object.freeze({ ...scaleOf('wind').legendNote });

const toMs = (t) => {
  if (t == null || t === '') return null;
  const ms = t instanceof Date ? t.getTime() : (typeof t === 'number' ? t : Date.parse(String(t)));
  return Number.isFinite(ms) ? ms : null;
};
const p2 = (n) => String(n).padStart(2, '0');
// 모델 런은 UTC 주기로 부른다('GFS 18Z') — 날짜가 붙은 'MM/DD HHZ'.
const fmtRun = (ms) => { const d = new Date(ms); return `${p2(d.getUTCMonth() + 1)}/${p2(d.getUTCDate())} ${p2(d.getUTCHours())}Z`; };
// 유효 시각: 한국어 화면은 KST(for-me-signal.js fmtKst 와 같은 꼴), 영어 화면은 UTC — 시간대를 늘 글자로 밝힌다.
const fmtValid = (ms, ko) => {
  const d = new Date(ms + (ko ? 9 * H : 0));
  return `${p2(d.getUTCMonth() + 1)}/${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} ${ko ? 'KST' : 'UTC'}`;
};

/**
 * 출처 · 런 · 유효시각 한 줄 (순수). now 를 주면 런의 나이를 재서 12시간이 넘을 때 '지연'을 붙인다.
 * 모르는 것은 적지 않는다 — run 이 없으면 런 자리를 비우고 '—' 같은 것으로 채우지 않는다.
 */
export const legendMetaLine = ({ source, run, valid, lang = 'ko', now } = {}) => {
  const ko = lang !== 'en';
  const T = TEXT[ko ? 'ko' : 'en'];
  const runMs = toMs(run);
  const validMs = toMs(valid);
  const nowMs = toMs(now);
  const stale = runMs != null && nowMs != null && (nowMs - runMs) > RUN_STALE_H * H;
  const parts = [];
  if (source) parts.push(String(source));
  if (runMs != null) parts.push(`${T.run} ${fmtRun(runMs)}${stale ? ` · ${T.stale}` : ''}`);
  if (validMs != null) parts.push(`${T.valid} ${fmtValid(validMs, ko)}`);
  return { text: parts.join(' · '), stale };
};

/**
 * 범례에 그릴 것 전부 (순수 — 시험이 이것을 본다).
 *   cells    칠하는 칸(legendModel 그대로) — 같은 폭으로 나눈다
 *   ticks    경계 숫자. pos = 띠 왼쪽 끝에서의 비율(0~1). 첫 칸의 아래 경계가 있으면(강수 0.1) pos 0 이다
 *   altTicks 둘째 단위 줄(풍속 kt) — mode 'both' 인 눈금만. 없으면 null 이고 줄은 비워 둔 채 자리를 지킨다
 */
export const legendView = ({ scale, title, source, run, valid, note, unitAlt, lang = 'ko', now } = {}) => {
  if (!scale) return null;
  const ko = lang !== 'en';
  const alt = scale.altUnit || null;
  const useAlt = !!(alt && alt.mode === 'switch' && unitAlt);      // 강수: 누적을 고르면 단위가 바뀐다
  const cells = legendModel(scale, { unitAlt: useAlt });
  const n = cells.length;
  const ticksOf = (model) => model
    .map((c, i) => (c.fromText == null ? null : { pos: i / n, text: c.fromText }))
    .filter(Boolean);
  const both = alt && alt.mode === 'both' ? legendModel(scale, { unitAlt: true }) : null;   // 풍속: m/s 와 kt 를 같이
  const pick = (o) => (o == null ? '' : (typeof o === 'string' ? o : (o[ko ? 'ko' : 'en'] || o.ko || '')));
  const meta = legendMetaLine({ source, run, valid, lang, now });
  return {
    key: `${scale.id}|${useAlt ? 'alt' : 'base'}|${ko ? 'ko' : 'en'}`,
    title: pick(title) || pick(scale.name),
    cells,
    ticks: ticksOf(cells),
    unit: cells.length ? cells[0].unit : scale.unit,
    altTicks: both ? ticksOf(both) : null,
    altUnit: both ? alt.unit : '',
    meta: meta.text,
    stale: meta.stale,
    note: pick(note) || pick(scale.legendNote),
  };
};

const el = (doc, tag, cls) => { const e = doc.createElement(tag); if (cls) e.className = cls; return e; };

/**
 * 범례 하나. doc 을 주면 그 문서로 만든다(시험의 가짜 DOM) — 안 주면 mount 한 자리의 ownerDocument, 그것도 없으면 전역 document.
 */
export const createFieldLegend = ({ doc, now = () => Date.now(), getLang = () => i18n.lang } = {}) => {
  let root = null;
  let parts = null;
  let lastKey = null;
  let lastArgs = null;

  const build = (d) => {
    root = el(d, 'section', 'field-legend');
    root.id = 'field-legend';
    root.setAttribute('role', 'group');
    root.hidden = true;
    parts = {
      title: el(d, 'b', 'fl-title'),
      bands: el(d, 'div', 'fl-bands'),
      ticks: el(d, 'div', 'fl-ticks'),
      alt: el(d, 'div', 'fl-ticks fl-alt'),
      meta: el(d, 'div', 'fl-meta'),
      note: el(d, 'div', 'fl-note'),
    };
    parts.bands.setAttribute('role', 'list');
    for (const k of ['title', 'bands', 'ticks', 'alt', 'meta', 'note']) root.appendChild(parts[k]);
  };

  const tickRow = (d, row, ticks, unit) => {
    row.replaceChildren();
    for (const t of ticks || []) {
      const s = el(d, 'span', t.pos === 0 ? 'fl-tick fl-tick0' : 'fl-tick');   // 맨 왼쪽 숫자는 가운데 맞춤하면 상자 밖으로 나간다
      s.style.left = `${Math.round(t.pos * 10000) / 100}%`;
      s.textContent = t.text;
      row.appendChild(s);
    }
    if (unit) { const u = el(d, 'em', 'fl-unit'); u.textContent = unit; row.appendChild(u); }
  };

  const paint = (args) => {
    const view = legendView({ ...args, lang: getLang(), now: now() });
    if (!view || !root) return null;
    const d = root.ownerDocument || doc || document;
    if (view.key !== lastKey) {                     // 눈금·단위·언어가 바뀔 때만 칸을 다시 만든다 — 타임라인 재생 중에는 글자 두 줄만 바뀐다
      parts.bands.replaceChildren();
      for (const c of view.cells) {
        const i = el(d, 'i', 'fl-band');
        i.style.background = c.color;               // 단색 하나 — 그라데이션 아님
        i.title = c.label;
        i.setAttribute('role', 'listitem');
        i.setAttribute('aria-label', c.label);
        parts.bands.appendChild(i);
      }
      tickRow(d, parts.ticks, view.ticks, view.unit);
      tickRow(d, parts.alt, view.altTicks, view.altUnit);
      lastKey = view.key;
    }
    parts.title.textContent = view.title;
    parts.meta.textContent = view.meta;
    parts.meta.className = view.stale ? 'fl-meta fl-stale' : 'fl-meta';
    parts.note.textContent = view.note;
    root.setAttribute('aria-label', `${TEXT[getLang() === 'en' ? 'en' : 'ko'].legend} — ${view.title} (${view.unit})`);
    root.hidden = false;
    return view;
  };

  return {
    /** 상자를 parent 끝에 붙인다. 두 번 불러도 상자는 하나다(자리만 옮긴다). */
    mount(parent) {
      const d = doc || (parent && parent.ownerDocument) || document;
      if (!root) build(d);
      (parent || d.body).appendChild(root);
      return root;
    },
    /** { scale, title?, source?, run?, valid?, note?, unitAlt? } — 눈금이 없으면 아무것도 지어내지 않고 숨는다. */
    show(args = {}) {
      if (!root) this.mount();
      if (!args.scale) { this.hide(); return null; }
      lastArgs = args;
      return paint(args);
    },
    /** 숨긴다(떼어 내지 않는다 — 다시 켤 때 같은 자리에 그대로 선다). */
    hide() { if (root) root.hidden = true; lastArgs = null; },
    /** 언어가 바뀐 뒤 같은 내용을 다시 그린다. */
    refresh() { return (lastArgs && root && !root.hidden) ? paint(lastArgs) : null; },
    get el() { return root; },
  };
};

// 앱이 쓰는 하나. window 에 걸지 않는다 — 쓰는 쪽이 import 한다.
export const fieldLegend = createFieldLegend();
export const mount = (parent) => fieldLegend.mount(parent);
export const show = (args) => fieldLegend.show(args);
export const hide = () => fieldLegend.hide();

/** 배선 전 눈으로 보기 — 콘솔에서 demo('temp') · demo('wind') · demo('precip', { unitAlt: true }). 런·유효시각은 **보기용 가짜가 아니라 비워 둔다.** */
export const demo = (id = 'temp', extra = {}) => {
  fieldLegend.mount(document.body);
  return fieldLegend.show({ scale: scaleOf(id), source: 'MODEL · GFS 0.5°', ...extra });
};
