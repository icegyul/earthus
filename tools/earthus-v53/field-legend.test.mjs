// DEV-DIRECTIVE 2026-09-20 · W1 §6 — 늘 떠 있는 범례(prototype/v2-three/js/field-legend.js)의 시험.
//
// 잠그는 결과: 범례의 칸 수·색·숫자·단위가 field-scales.js 의 표에서 그대로 나온다 · 색만으로 말하지 않는다(숫자·단위·글자 라벨) ·
// 출처·런·유효시각 한 줄 · 풍속은 m/s 와 kt 두 줄 + 입자 풀이 · 강수는 누적에서 단위가 mm 로 · 레이어를 바꿔도 상자의 뼈대가 같다 ·
// 범례 어디에도 색 번짐 띠(CSS 그라데이션)가 없다.
// 브라우저는 노드에서 못 돌리므로 DOM 은 가짜로 세우고(이 파일 아래), 자리(CSS)는 index.html 에서 글자로 확인한다(기존 관례).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PARTICLE_NOTE,
  RUN_STALE_H,
  createFieldLegend,
  legendMetaLine,
  legendView,
} from '../../prototype/v2-three/js/field-legend.js';
import { SCALE_IDS, legendModel, scaleOf } from '../../prototype/v2-three/js/field-scales.js';

// ⚠️ 줄바꿈을 LF 로 맞춰 읽는다(core.autocrlf=true 워크트리는 CRLF 로 풀린다).
const lf = (s) => s.replace(/\r\n/g, '\n');
const read = (rel) => lf(readFileSync(new URL(rel, import.meta.url), 'utf8'));

// ── 가짜 DOM — field-legend.js 가 쓰는 것만: createElement · appendChild · replaceChildren · setAttribute · style · textContent · hidden
const fakeDoc = () => {
  const doc = {
    created: 0,
    createElement(tag) {
      doc.created += 1;
      const node = {
        tagName: tag.toUpperCase(), ownerDocument: doc, parentNode: null, children: [], attrs: {}, style: {},
        className: '', id: '', textContent: '', title: '', hidden: false,
        setAttribute(k, v) { this.attrs[k] = String(v); },
        getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
        appendChild(c) {
          if (c.parentNode) c.parentNode.children = c.parentNode.children.filter((x) => x !== c);   // 진짜 DOM 처럼 '옮긴다'
          c.parentNode = this; this.children.push(c); return c;
        },
        replaceChildren(...kids) { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; kids.forEach((k) => this.appendChild(k)); },
      };
      return node;
    },
  };
  doc.body = doc.createElement('body');
  return doc;
};
const byClass = (root, cls) => root.children.find((c) => c.className.split(' ').includes(cls));
const RUN = '2026-09-20T00:00:00Z';
const VALID = '2026-09-20T06:00:00Z';
const mk = (lang = 'ko', nowIso = '2026-09-20T05:00:00Z') => {
  const doc = fakeDoc();
  const legend = createFieldLegend({ doc, getLang: () => lang, now: () => Date.parse(nowIso) });
  return { doc, legend };
};

test('가짜 DOM — 범례가 구간 수만큼 칸을 그리고, 칸마다 단색과 글자 라벨이 있다', () => {
  for (const id of SCALE_IDS) {
    const { doc, legend } = mk();
    const root = legend.mount(doc.body);
    legend.show({ scale: scaleOf(id), source: 'MODEL · GFS 0.5°', run: RUN, valid: VALID });
    const model = legendModel(scaleOf(id));
    const cells = byClass(root, 'fl-bands').children;
    assert.equal(cells.length, model.length, `${id}: 칸 수`);
    cells.forEach((c, i) => {
      assert.equal(c.style.background, model[i].color, `${id}[${i}] 색이 표에서 나온다`);
      assert.match(c.style.background, /^rgba?\(/, '단색');
      assert.equal(c.title, model[i].label);
      assert.equal(c.attrs['aria-label'], model[i].label);
      assert.ok(c.title.endsWith(scaleOf(id).unit) && /\d/.test(c.title), '색만으로 말하지 않는다');
    });
    assert.equal(root.hidden, false);
  }
  const { doc, legend } = mk();
  const root = legend.mount(doc.body);
  legend.show({ scale: scaleOf('temp') });
  assert.equal(byClass(root, 'fl-bands').children.length, 11);
  legend.show({ scale: scaleOf('precip') });
  assert.equal(byClass(root, 'fl-bands').children.length, 8, '0.1 미만은 안 칠하므로 범례에도 없다');
});

test('경계 숫자와 단위 — 칸 사이 경계 자리에 숫자가 서고 줄 끝에 단위가 선다', () => {
  const { doc, legend } = mk();
  const root = legend.mount(doc.body);
  legend.show({ scale: scaleOf('temp') });
  const row = byClass(root, 'fl-ticks');
  const ticks = row.children.filter((c) => c.className.includes('fl-tick'));
  assert.deepEqual(ticks.map((t) => t.textContent), ['−10', '−5', '0', '5', '10', '15', '20', '25', '30', '35']);
  assert.equal(ticks[0].style.left, '9.09%', '첫 경계는 첫 칸(< −10)의 오른쪽 끝 = 1/11');
  assert.equal(ticks.at(-1).style.left, '90.91%');
  assert.equal(row.children.at(-1).className, 'fl-unit'); assert.equal(row.children.at(-1).textContent, '°C');

  // 강수는 첫 칸의 아래 경계(0.1)가 띠의 왼쪽 끝에 선다 — 가운데 맞춤하면 상자 밖으로 나가므로 따로 표시한다
  const v = legendView({ scale: scaleOf('precip') });
  assert.deepEqual(v.ticks.map((t) => t.text), ['0.1', '0.5', '1', '2', '5', '10', '20', '50']);
  assert.equal(v.ticks[0].pos, 0); assert.equal(v.ticks[1].pos, 1 / 8);
  legend.show({ scale: scaleOf('precip') });
  assert.equal(byClass(root, 'fl-ticks').children[0].className, 'fl-tick fl-tick0');
});

test('풍속 — m/s 와 kt 두 줄, 그리고 입자 과장 풀이', () => {
  const { doc, legend } = mk();
  const root = legend.mount(doc.body);
  const view = legend.show({ scale: scaleOf('wind'), source: 'MODEL · GFS 0.5°', run: RUN, valid: VALID });
  const rows = root.children.filter((c) => c.className.includes('fl-ticks'));
  assert.equal(rows.length, 2);
  const texts = (row) => row.children.map((c) => c.textContent);
  assert.deepEqual(texts(rows[0]), ['1', '5', '10', '20', '30', '40', '50', 'm/s']);
  assert.deepEqual(texts(rows[1]), ['2', '10', '19', '39', '58', '78', '97', 'kt']);
  assert.deepEqual(rows[1].children.map((c) => c.style.left), rows[0].children.map((c) => c.style.left), '두 줄의 숫자가 같은 경계 아래 선다');
  assert.match(view.note, /과장 표현/);
  assert.equal(byClass(root, 'fl-note').textContent, '입자 속도·꼬리 길이는 방향과 상대 세기를 보이기 위한 과장 표현입니다');
  assert.equal(PARTICLE_NOTE.ko, view.note, '기온 색면 위에 입자를 켤 때 W3 이 넘길 같은 글');
  // 다른 눈금에는 kt 줄이 비지만 **자리는 지킨다**
  legend.show({ scale: scaleOf('temp') });
  assert.equal(rows[1].children.length, 0);
  assert.equal(rows[1].parentNode, root);
});

test('강수 — 누적을 고르면 단위가 mm 로 바뀌고 칸과 숫자는 그대로다', () => {
  const rate = legendView({ scale: scaleOf('precip') });
  const acc = legendView({ scale: scaleOf('precip'), unitAlt: true });
  assert.equal(rate.unit, 'mm/h'); assert.equal(acc.unit, 'mm');
  assert.deepEqual(acc.ticks, rate.ticks);
  assert.deepEqual(acc.cells.map((c) => c.color), rate.cells.map((c) => c.color));
  assert.notEqual(acc.key, rate.key, '단위가 바뀌면 칸의 라벨을 다시 만든다');
  assert.equal(acc.altTicks, null, '두 줄로 보이는 것은 풍속뿐');
  assert.match(rate.note, /0\.1 미만/);
  // 풍속에 unitAlt 를 줘도 줄이 바뀌지 않는다 — 풍속은 늘 두 줄이다
  assert.equal(legendView({ scale: scaleOf('wind'), unitAlt: true }).unit, 'm/s');
});

test('출처 · 런 · 유효시각 한 줄 — 모르는 것은 적지 않고, 런이 12시간 넘게 늙으면 지연', () => {
  const at = (h) => Date.parse(RUN) + h * 3600_000;
  assert.equal(legendMetaLine({ source: 'MODEL · GFS 0.5°', run: RUN, valid: VALID, lang: 'ko', now: at(5) }).text,
    'MODEL · GFS 0.5° · 런 09/20 00Z · 유효 09/20 15:00 KST');
  assert.equal(legendMetaLine({ source: 'MODEL · GFS 0.5°', run: RUN, valid: VALID, lang: 'en', now: at(5) }).text,
    'MODEL · GFS 0.5° · run 09/20 00Z · valid 09/20 06:00 UTC', '영어 화면은 UTC — 시간대를 늘 글자로 밝힌다');
  assert.equal(RUN_STALE_H, 12);
  assert.equal(legendMetaLine({ run: RUN, now: at(12) }).stale, false);
  const late = legendMetaLine({ source: 'MODEL · GFS 0.5°', run: RUN, valid: VALID, now: at(12.5) });
  assert.equal(late.stale, true); assert.match(late.text, /런 09\/20 00Z · 지연/);
  // Date · ms 도 받는다
  assert.equal(legendMetaLine({ run: new Date(RUN), valid: Date.parse(VALID) }).text, '런 09/20 00Z · 유효 09/20 15:00 KST');
  // 없는 것을 '—' 로 채우지 않는다
  assert.equal(legendMetaLine({ source: 'MODEL · GFS 0.5°' }).text, 'MODEL · GFS 0.5°');
  assert.equal(legendMetaLine({ source: 'OBS', run: 'not a date', valid: '' }).text, 'OBS');
  assert.equal(legendMetaLine({}).text, '');

  const { doc, legend } = mk('ko', '2026-09-21T00:00:00Z');   // 런에서 24시간 뒤
  const root = legend.mount(doc.body);
  legend.show({ scale: scaleOf('temp'), source: 'MODEL · GFS 0.5°', run: RUN, valid: VALID });
  assert.match(byClass(root, 'fl-meta').textContent, /지연/);
  assert.ok(byClass(root, 'fl-stale'), '지연은 색으로도 글자로도');
});

test('한국어 / 영어 — 제목은 눈금 이름에서, 풀이도 같은 언어로. refresh 가 다시 그린다', () => {
  let lang = 'ko';
  const doc = fakeDoc();
  const legend = createFieldLegend({ doc, getLang: () => lang, now: () => Date.parse(RUN) });
  const root = legend.mount(doc.body);
  legend.show({ scale: scaleOf('wind'), run: RUN, valid: VALID });
  assert.equal(byClass(root, 'fl-title').textContent, '풍속');
  assert.match(root.attrs['aria-label'], /^범례 — 풍속 \(m\/s\)$/);
  lang = 'en';
  legend.refresh();
  assert.equal(byClass(root, 'fl-title').textContent, 'Wind speed');
  assert.match(byClass(root, 'fl-note').textContent, /^Particle speed and tail length are exaggerated/);
  assert.match(byClass(root, 'fl-meta').textContent, /^run 09\/20 00Z · valid 09\/20 06:00 UTC$/);
  // 부르는 쪽이 준 제목·풀이가 이긴다 — 두 언어 객체도 글자 하나도 받는다
  legend.show({ scale: scaleOf('temp'), title: { ko: '기온 2 m', en: 'Temperature 2 m' }, note: '0.5° grid mean' });
  assert.equal(byClass(root, 'fl-title').textContent, 'Temperature 2 m');
  assert.equal(byClass(root, 'fl-note').textContent, '0.5° grid mean');
});

test('레이어를 바꿔도 상자의 뼈대가 같다 — 줄 여섯 개가 늘 제자리에 있고, 같은 눈금이면 칸을 다시 만들지 않는다', () => {
  const { doc, legend } = mk();
  const root = legend.mount(doc.body);
  const skeleton = () => root.children.map((c) => c.className.replace(' fl-stale', ''));
  legend.show({ scale: scaleOf('temp'), run: RUN, valid: VALID });
  const first = skeleton();
  assert.deepEqual(first, ['fl-title', 'fl-bands', 'fl-ticks', 'fl-ticks fl-alt', 'fl-meta', 'fl-note']);
  const rowsBefore = [...root.children];
  for (const id of SCALE_IDS) {
    legend.show({ scale: scaleOf(id), run: RUN, valid: VALID });
    assert.deepEqual(skeleton(), first, id);
    root.children.forEach((c, i) => assert.equal(c, rowsBefore[i], `${id}: 줄 요소를 새로 만들지 않는다`));
  }
  // 타임라인을 밀 때: 같은 눈금 · 다른 유효시각 → 글자 한 줄만 바뀐다
  legend.show({ scale: scaleOf('temp'), run: RUN, valid: VALID });
  const cell0 = byClass(root, 'fl-bands').children[0];
  const made = doc.created;
  legend.show({ scale: scaleOf('temp'), run: RUN, valid: '2026-09-20T09:00:00Z' });
  assert.equal(byClass(root, 'fl-bands').children[0], cell0);
  assert.equal(doc.created, made, '요소를 하나도 새로 만들지 않았다');
  assert.match(byClass(root, 'fl-meta').textContent, /유효 09\/20 18:00 KST/);
});

test('mount 는 상자를 하나만 만들고, hide 는 떼지 않고 숨기며, 눈금이 없으면 아무것도 지어내지 않는다', () => {
  const { doc, legend } = mk();
  const a = legend.mount(doc.body);
  const b = legend.mount(doc.body);
  assert.equal(a, b); assert.equal(doc.body.children.length, 1);
  assert.equal(a.id, 'field-legend'); assert.equal(a.attrs.role, 'group'); assert.equal(a.hidden, true, '눈금을 받기 전에는 안 보인다');
  legend.show({ scale: scaleOf('sst') });
  assert.equal(a.hidden, false);
  legend.hide();
  assert.equal(a.hidden, true); assert.equal(a.parentNode, doc.body);
  assert.equal(legend.refresh(), null, '숨긴 뒤 refresh 가 다시 띄우지 않는다');
  legend.show({ scale: scaleOf('sst') });
  assert.equal(legend.show({ scale: null }), null);
  assert.equal(a.hidden, true, '눈금 없이 부르면 숨는다');
  assert.equal(legendView({}), null);
  // 다른 자리로 옮겨 달 수 있다(W5 Inspector)
  const slot = doc.createElement('div');
  legend.mount(slot);
  assert.equal(doc.body.children.length, 0); assert.equal(slot.children[0], a);
});

test('범례에 색 번짐 띠가 없다 — 모듈에도 index.html 의 범례 CSS 에도', () => {
  const js = read('../../prototype/v2-three/js/field-legend.js');
  assert.ok(!/gradient/i.test(js));
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(js), '글자는 textContent 로만 — 출처·제목이 HTML 로 해석되지 않는다');
  const html = read('../../prototype/v2-three/index.html');
  // 범례 절 전체 — 머리 주석부터 다음 절 머리 주석 앞까지(여러 줄에 걸친 규칙의 본문까지 본다)
  const from = html.indexOf('/* ---------- 색면 범례');
  const to = html.indexOf('/* ---------- ', from + 10);
  assert.ok(from > 0 && to > from, 'index.html 에 범례 절이 있다');
  const css = html.slice(from, to);
  assert.ok((css.match(/#field-legend/g) || []).length >= 10, '범례 규칙이 그 절 안에 있다');
  assert.ok(!/gradient/i.test(css));
  assert.equal((html.match(/#field-legend/g) || []).length, (css.match(/#field-legend/g) || []).length, '범례 규칙은 그 절 한 곳에만 있다(hunk 하나)');
});

test('자리와 크기 — 상자는 고정 크기이고, 폰에서는 아래 줄(타임스트립·hud·하단 바)이 아니라 위에 선다', () => {
  const html = read('../../prototype/v2-three/index.html');
  const base = /\n {2}#field-legend \{([^}]*)\}/.exec(html);
  assert.ok(base, '기본 규칙');
  assert.match(base[1], /position: fixed;/);
  assert.match(base[1], /width: 340px; height: 116px;/, '폭·높이 고정 — 칸 수가 달라도 상자가 안 움직인다');
  // 줄 높이 합 + 줄 간격 + 안쪽 여백 + 테두리 = 상자 높이 (14+10+12+12+12+24) + 5×3 + (8+7) + 2 = 116
  const rows = /grid-template-rows: ([\d px]+);/.exec(base[1])[1].trim().split(/\s+/).map((x) => parseInt(x, 10));
  assert.equal(rows.length, 6, 'field-legend.js 가 붙이는 줄 여섯 개');
  assert.equal(rows.reduce((a, b) => a + b, 0) + 5 * 3 + 8 + 7 + 2, 116);
  assert.match(base[1], /z-index: 3;/, '우측 패널·바텀시트(z 4) 아래');
  assert.match(html, /#field-legend\[hidden\] \{ display: none; \}/, 'display:grid 가 hidden 을 이기지 못하게');
  const phone = /@media \(max-width: 720px\) \{\n {4}#field-legend \{([^}]*)\}/.exec(html);
  assert.ok(phone, '폰 규칙');
  assert.match(phone[1], /left: 8px; right: 8px; width: auto;/);
  assert.match(phone[1], /top: calc\(108px \+ env\(safe-area-inset-top\)\)/, '전환기(8~48)·상단 줄(56~102) 아래');
  const mid = /@media \(max-width: 1109px\) \{\n {4}#field-legend \{([^}]*)\}/.exec(html);
  assert.match(mid[1], /top: 66px; bottom: auto;/, '가운데 타임스트립·하단 바와 겹치는 폭에서는 위로');
  assert.ok(!/bottom: (?!auto)/.test(phone[1]), '폰에서 아래 줄에 서지 않는다');
});

test('i18n 은 main.js 와 같은 URL 로 들인다 — 질의문자열이 다르면 모듈이 둘이 되어 언어가 따로 논다', () => {
  const js = read('../../prototype/v2-three/js/field-legend.js');
  const main = read('../../prototype/v2-three/js/main.js');
  const url = /import \{ i18n \} from '(\.\/i18n\.js[^']*)';/.exec(js);
  assert.ok(url, 'field-legend.js 의 i18n import');
  assert.ok(main.includes(`import { i18n } from '${url[1]}';`), `main.js 는 ${url[1]} 로 들이지 않는다`);
  assert.ok(!/window\./.test(js.replace(/\/\/.*$/gm, '')), 'window 에 걸지 않는다');
});
