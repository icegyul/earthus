// FOR ME 공용 부품 검사 (2026-09-06). 브라우저 없이 node 로 돈다.
//   node tools/v1/test_for_me_row.mjs
// 검사하는 것
//   1. 동네 저장: 키 하나(earthus.myplace), 형식, overwrite:false 규칙, 잘못된 좌표 거부
//   2. 세 상태와 글자: unset / signal / quiet — 무료 줄에 시각·거리·원인이 없는지
//   3. 딥링크·from 파라미터 왕복
//   4. 계측 이름 43개, 서버 SQL 허용 목록과 완전히 같은지, usage 허용 목록에 들어갔는지
//   5. mount: shown/signal/clicked 순서로 찍히는지, unset 은 onPick 으로 가는지
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = process.env.EARTHUS_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const mod = rel => pathToFileURL(path.join(repo, rel)).href;

// 최소 브라우저 흉내 — localStorage 와 DOM 한 조각
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.location = { search: '', assigned: null, assign(h) { this.assigned = h; } };

const m = await import(mod('prototype/js/for-me-row.js'));
const out = {};

/* 1. 동네 저장 */
assert.equal(m.getMyPlace(), null);
assert.equal(m.setMyPlace({ lat: 'x', lon: 1 }), null, '잘못된 좌표는 저장하지 않는다');
assert.equal(m.setMyPlace({ lat: 91, lon: 1 }), null);
const p1 = m.setMyPlace({ lat: 37.751234, lon: 128.876543, name: ' 강릉 ' });
assert.deepEqual(p1, { lat: 37.7512, lon: 128.8765, name: '강릉' });
assert.deepEqual(JSON.parse(store.get('earthus.myplace')), p1, 'v2 MY EARTH 가 읽는 키·형식 그대로');
const p2 = m.setMyPlace({ lat: 35.1, lon: 129.0 }, { overwrite: false });
assert.equal(p2.name, '강릉', 'overwrite:false 면 이미 고른 동네를 지키지 않으면 안 된다');
out.place = 'ok';

/* 2. 세 상태 */
store.clear();
let h = m.forMeRowHtml({ kind: 'cyclone', id: 'TC-2026-13' });
assert.match(h, /forme-unset/); assert.match(h, /내 동네 고르기/); assert.match(h, /이 태풍이 내 위치에/);
m.setMyPlace({ lat: 37.75, lon: 128.88, name: '강릉' });
h = m.forMeRowHtml({ kind: 'cyclone', id: 'TC-2026-13', signal: true });
assert.match(h, /forme-signal/); assert.match(h, /⚠️ 강릉 · 영향 가능성 있음/); assert.match(h, /🔒 EXPLORER/);
assert.doesNotMatch(h, /\d+\s*시간|km|m\/s|원인/, '무료 줄에는 시각·거리·원인을 쓰지 않는다 (Paywall 원칙)');
h = m.forMeRowHtml({ kind: 'wave', signal: false });
assert.match(h, /forme-quiet/); assert.match(h, /지금은 영향 신호 없음/); assert.doesNotMatch(h, /🔒/);
h = m.forMeRowHtml({ kind: 'tsunami', signal: true, text: '기관 발표 구역에 포함' });
assert.match(h, /기관 발표 구역에 포함/); assert.doesNotMatch(h, /영향 가능성 있음/, '쓰나미는 호출자 문구를 그대로 쓴다(우리 해석 금지)');
h = m.forMeRowHtml({ kind: 'quake', ko: false, signal: true });
assert.match(h, /possible impact/);
assert.equal(m.placeLabel({ lat: -33.9, lon: 151.2 }), '33.90S 151.20E');
out.states = 'ok';

/* 3. 딥링크 왕복 */
const link = m.forMeDeepLink({ kind: 'quake', id: 'us7000abcd' });
assert.equal(link, '/v2/?tab=my&event=us7000abcd&from=forme.quake');
assert.equal(m.readFromParam('?tab=my&event=x&from=forme.quake'), 'quake');
assert.equal(m.readFromParam('?from=forme.nope'), null, '목록 밖 메뉴는 버린다');
assert.equal(m.readFromParam(''), null);
assert.doesNotMatch(m.forMeDeepLink({ kind: 'zzz' }), /from=/, '목록 밖 kind 는 from 을 붙이지 않는다');
out.deeplink = 'ok';

/* 4. 계측 이름 ↔ SQL ↔ usage 허용 목록 */
const names = m.formeEventNames();
assert.equal(names.length, 43);
assert.equal(new Set(names).size, 43);
const sql = fs.readFileSync(path.join(repo, 'supabase/migrations/20260906_forme_funnel_events.sql'), 'utf8');
for (const n of names) assert.ok(sql.includes(`'${n}'`), `SQL 허용 목록에 없음: ${n}`);
for (const n of ['app.opened', 'travel.discover_opened', 'travel.region_opened', 'travel.purpose_opened', 'travel.related_opened', 'event.room_opened', 'event.layer_from_room'])
  assert.ok(sql.includes(`'${n}'`), `옛 이벤트가 SQL 에서 빠졌다: ${n}`);
for (const mn of m.FORME_MENUS) assert.ok(sql.includes(`${mn}_click_pct`), `뷰에 클릭률 없음: ${mn}`);
globalThis.document = { addEventListener() {} }; globalThis.window = { addEventListener() {} };
const u = await import(mod('prototype/js/usage.js'));
for (const n of names) assert.ok(u.USAGE_EVENTS.includes(n), `usage 허용 목록에 없음: ${n}`);
assert.equal(u.USAGE_EVENTS.length, 7 + 43);
out.events = { names: names.length, usage: u.USAGE_EVENTS.length };

/* 5. mount — shown/signal/clicked 순서, unset 은 onPick */
function fakeContainer() {
  const c = { children: [], get lastElementChild() { return this.children[this.children.length - 1]; } };
  c.insertAdjacentHTML = (_, html) => {
    const el = { dataset: {}, handlers: {}, addEventListener(t, f) { this.handlers[t] = f; }, click() { this.handlers.click(); } };
    for (const [, k, v] of html.matchAll(/data-forme-([a-z]+)="([^"]*)"/g)) el.dataset[k === 'href' ? 'formeHref' : k === 'kind' ? 'formeKind' : 'formeState'] = v.replace(/&amp;/g, '&');
    c.children.push(el);
  };
  return c;
}
let hits = [];
const track = e => hits.push(e);
let c = fakeContainer();
let el = m.mountForMeRow(c, { kind: 'cyclone', id: 'T13', signal: true }, { track });
assert.deepEqual(hits, ['forme.shown.cyclone', 'forme.signal.cyclone']);
el.click();
assert.deepEqual(hits, ['forme.shown.cyclone', 'forme.signal.cyclone', 'forme.clicked.cyclone']);
assert.equal(globalThis.location.assigned, '/v2/?tab=my&event=T13&from=forme.cyclone');
hits = []; store.clear(); c = fakeContainer(); let picked = null;
el = m.mountForMeRow(c, { kind: 'wave' }, { track, onPick: k => { picked = k; } });
assert.deepEqual(hits, ['forme.shown.wave'], 'unset 은 signal 을 찍지 않는다');
el.click();
assert.equal(picked, 'wave', 'unset 에서 누르면 동네 고르기로 간다');
assert.deepEqual(hits, ['forme.shown.wave', 'forme.clicked.wave']);
hits = []; c = fakeContainer();
m.mountForMeRow(c, { kind: 'not-a-menu' }, { track });
assert.deepEqual(hits, [], '목록 밖 kind 는 이벤트를 만들지 않는다');
out.mount = 'ok';

console.log(JSON.stringify(out));
console.log('PASS test_for_me_row');
