// 2026-09-24 · D3 — v1 '명소'가 공용 Overpass 를 브라우저에서 직접 부르던 것을 정적 파일로 바꿨다.
//
// 무엇이 잘못돼 있었나: prototype/js/layers/travel.js 가 확대할 때마다 overpass-api.de 에 POST 를 보냈다.
//   공용 서버는 커뮤니티 운영이고(OSM 위키: 상업 이용은 자체·유료 서버), 앱 이용자 요청을 합산해 본다.
//   504 인 날엔 레이어가 조용히 비었다. 이제 aws/travel-poi 가 하루 1회 5°칸 파일을 만들고 브라우저는 그것만 읽는다.
//
// 결과로 잠근다('없어야 한다'만 보지 않는다):
//   ① 화면 안의 이름 있는 명소가 **나와야** 한다 — 칸 고르기·합치기·자르기가 맞다(날짜변경선 포함)
//   ② 덮지 않는 지역에서는 "아직 준비되지 않았다"를 **말해야** 한다
//   ③ OSM 출처(© OpenStreetMap contributors · ODbL)가 서버 산출물과 화면 출처 줄에 **있어야** 한다
//   ④ 브라우저 코드에 Overpass 호출이 없다 · 서버가 쓰는 S3 키와 브라우저가 읽는 주소가 같은 CloudFront 경로다
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { tilesForView, inCoverage, tileUrl, pickItems, KIND_ORDER } from '../../prototype/js/layers/poi-static.js';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const INDEX = {
  tilePath: 'tiles/{key}.json',
  coverage: [
    { iso: 'KR', bbox: { south: 33, west: 124, north: 39, east: 132 } },
    { iso: 'JP', bbox: { south: 24, west: 122, north: 46, east: 146 } },
  ],
  coverageNote: { ko: '한국·일본…만 덮습니다', en: 'KR, JP … only' },
  tiles: {
    n35_e125: { s: 35, w: 125, n: 40, e: 130, count: 3, fetchedAt: '2026-09-24T19:10:00Z' },
    n35_e120: { s: 35, w: 120, n: 40, e: 125, count: 0, fetchedAt: '2026-09-24T19:10:00Z' },
    n30_e125: { s: 30, w: 125, n: 35, e: 130, count: 1, fetchedAt: null },
  },
};

// 서울 도심을 도는 화면(0.3° 폭) — 칸 n35_e125 하나만 걸린다
const SEOUL = { west: 126.85, south: 37.45, east: 127.15, north: 37.65 };

test('서울 화면은 칸 하나를 받고, 화면 안의 이름 있는 명소가 나온다', () => {
  const want = tilesForView(INDEX, SEOUL).filter(t => t.count > 0).map(t => t.key);
  assert.deepEqual(want, ['n35_e125']);
  assert.equal(inCoverage(INDEX, SEOUL), true);
  const tile = {
    items: [
      { id: 1, n: '국립중앙박물관', la: 37.5238, lo: 126.9804, k: 'museum', w: 1 },
      { id: 2, n: '남산서울타워', la: 37.5512, lo: 126.9882, k: 'attraction', w: 1 },
      { id: 3, n: '화면 밖 박물관', la: 38.2, lo: 128.5, k: 'museum' },
    ],
  };
  const items = pickItems([tile], SEOUL, 120);
  assert.deepEqual(items.map(i => i.n), ['국립중앙박물관', '남산서울타워']);
});

test('칸이 겹쳐 같은 장소가 두 번 와도 한 번만 그린다 · 상한은 120', () => {
  const many = Array.from({ length: 300 }, (_, i) => ({ id: i + 10, n: `p${i}`, la: 37.5, lo: 127.0, k: 'attraction' }));
  const dup = { id: 10, n: 'p0', la: 37.5, lo: 127.0, k: 'attraction' };
  const items = pickItems([{ items: many }, { items: [dup] }], SEOUL, 120);
  assert.equal(items.length, 120);
  assert.equal(new Set(items.map(i => i.id)).size, 120);
});

test('자를 때 위키 연결 → 드문 종류 순서를 지킨다(서버 순위와 같다)', () => {
  const items = pickItems([{ items: [
    { id: 5, n: 'a', la: 37.5, lo: 127.0, k: 'attraction' },
    { id: 4, n: 'obs', la: 37.5, lo: 127.0, k: 'observatory' },
    { id: 6, n: 'linked', la: 37.5, lo: 127.0, k: 'attraction', w: 1 },
  ] }], SEOUL, 2);
  assert.deepEqual(items.map(i => i.n), ['linked', 'obs']);
  const py = read('aws/travel-poi/handler.py');
  for (const [k, v] of Object.entries(KIND_ORDER)) assert.match(py, new RegExp(`"${k}": ${v}`));
});

test('덮지 않는 지역(파리)에서는 준비되지 않았다고 말할 근거가 있다', () => {
  const PARIS = { west: 2.2, south: 48.8, east: 2.5, north: 48.95 };
  assert.equal(inCoverage(INDEX, PARIS), false);
  assert.deepEqual(tilesForView(INDEX, PARIS), []);
  const src = read('prototype/js/layers/travel.js');
  assert.match(src, /inCoverage\(index, r\)/);
  assert.match(src, /_tellCoverage\(index\)/);
  assert.match(src, /coverageNote/);
});

test('덮는 나라 안이라도 서버가 아직 받지 못한 칸이면 비어 있는 이유를 말한다', () => {
  const JEJU = { west: 126.2, south: 33.2, east: 126.9, north: 33.6 };
  const view = tilesForView(INDEX, JEJU);
  assert.deepEqual(view.map(t => t.key), ['n30_e125']);
  assert.equal(view.every(t => !t.fetchedAt), true);
  const src = read('prototype/js/layers/travel.js');
  assert.match(src, /view\.every\(t => !t\.fetchedAt\)/);
});

test('날짜변경선을 넘는 화면도 칸을 찾는다', () => {
  const idx = { tiles: { n50_e175: { s: 50, w: 175, n: 55, e: 180, count: 1 }, n50_w180: { s: 50, w: -180, n: 55, e: -175, count: 1 } } };
  const view = { west: 178, south: 51, east: -178, north: 53 };
  assert.deepEqual(tilesForView(idx, view).map(t => t.key).sort(), ['n50_e175', 'n50_w180']);
  const items = pickItems([{ items: [{ id: 1, n: 'e', la: 52, lo: 179.5, k: 'museum' }, { id: 2, n: 'w', la: 52, lo: -179.5, k: 'museum' }] }], view);
  assert.equal(items.length, 2);
});

test('칸 주소는 색인이 준 틀을 따른다', () => {
  assert.equal(tileUrl('/tourism/poi', INDEX, 'n35_e125'), '/tourism/poi/tiles/n35_e125.json');
});

test('브라우저 코드에 Overpass 호출이 없다 — 정적 파일만 읽는다', () => {
  const code = stripComments(read('prototype/js/layers/travel.js'));
  assert.doesNotMatch(code, /OVERPASS/);
  assert.doesNotMatch(code, /overpass-api\.de/);
  assert.doesNotMatch(code, /method:\s*'POST'/);
  assert.match(code, /API\.TRAVEL_POI\}\/index\.json/);
  assert.match(code, /from '\.\/poi-static\.js'/);
});

test('서버가 쓰는 키와 브라우저가 읽는 주소가 같은 CloudFront 경로다(/tourism/* → 오하이오 app/tourism/)', () => {
  const cfg = read('prototype/js/config.js');
  assert.match(cfg, /TRAVEL_POI:\s*CDN \+ '\/tourism\/poi'/);
  const py = read('aws/travel-poi/handler.py');
  assert.match(py, /"TRAVEL_POI_PREFIX", "app\/tourism\/poi"/);
  const origin = read('aws/_shared/app-origin.sh');
  assert.match(origin, /APP_KEEP_OHIO=\([^)]*"tourism\/"/);
});

test('OSM 출처가 서버 산출물과 화면 출처 줄에 있다', () => {
  const py = read('aws/travel-poi/handler.py');
  assert.match(py, /"attribution": "© OpenStreetMap contributors"/);
  assert.match(py, /"license": "ODbL-1\.0"/);
  const src = read('prototype/js/ui-source.js');
  assert.match(src, /poi:\s*\{ ko: '© OpenStreetMap contributors · ODbL 1\.0'/);
});
