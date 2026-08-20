import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const path = new URL('../prototype/data/tourism/seoul-121-catalog.v1.json', import.meta.url);
const catalog = JSON.parse(await readFile(path, 'utf8'));

assert.equal(catalog.schemaVersion, 'earthus.tourism-place-catalog.v1');
assert.equal(catalog.source.publisher, '서울특별시');
assert.equal(catalog.source.license, '공공누리 제1유형');
assert.equal(catalog.places.length, 121);
assert.equal(new Set(catalog.places.map(place => place.code)).size, 121);
assert.ok(catalog.places.every(place => /^POI\d{3}$/.test(place.code)));
assert.ok(catalog.places.every(place => Number.isFinite(place.lat) && Number.isFinite(place.lon)));
assert.ok(catalog.places.every(place => place.lat > 37.3 && place.lat < 37.8));
assert.ok(catalog.places.every(place => place.lon > 126.7 && place.lon < 127.3));
assert.ok(catalog.places.every(place => place.geometrySource === '서울시 주요 121장소 영역'));

const gwanghwamun = catalog.places.find(place => place.code === 'POI009');
assert.equal(gwanghwamun.nameKo, '광화문·덕수궁');
assert.match(gwanghwamun.nameEn, /Gwanghwamun/);
assert.ok(Math.abs(gwanghwamun.lat - 37.572) < 0.03);
assert.ok(Math.abs(gwanghwamun.lon - 126.977) < 0.03);

console.log('tourism official 121-place catalog: PASS');
