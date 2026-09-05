// v2-three 모듈을 node:test 에서 import 하기 위한 최소 DOM 스텁.
// intel-feed 는 생성자에서 마커 풀을 document 에 붙이고, i18n 은 localStorage·navigator 를 읽는다.
// 화면을 흉내내는 것이 아니라 "import 가 되게" 만드는 것뿐이다 — 렌더 결과는 HTML 문자열로만 검사한다.
const el = () => ({
  style: {}, dataset: {}, className: '', textContent: '', innerHTML: '', hidden: false, children: [],
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  appendChild(child) { this.children.push(child); return child; }, setAttribute() {}, getAttribute: () => null,
  querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
});
if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
try { Object.defineProperty(globalThis, 'navigator', { value: { languages: ['ko'], language: 'ko' }, configurable: true }); } catch { /* 이미 정의됨 */ }
if (!globalThis.document) globalThis.document = { createElement: el, body: el(), documentElement: el(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
if (!globalThis.window) globalThis.window = globalThis;
if (!globalThis.location) globalThis.location = { search: '', hostname: 'localhost', origin: 'http://localhost', href: 'http://localhost/' };
export const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
