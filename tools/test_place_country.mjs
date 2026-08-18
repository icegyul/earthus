#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* 저장소 package가 CommonJS라 .js 브라우저 모듈을 Node가 그대로 import하지 못한다.
   원본 소스를 data URL 모듈로 읽어 같은 코드를 검사하고, JSON 경로만 실제 파일로 고정한다. */
const importSource = async (url, transform = source => source) => {
  const source = transform(await readFile(url, 'utf8'));
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};
const dataUrl = new URL('../prototype/data/country-reference.json', import.meta.url).href;
const [{ countryAt }, { describePlace }] = await Promise.all([
  importSource(new URL('../prototype/js/country-reference.js', import.meta.url), source => source.replace(
    /const DATA_URL = new URL\([^;]+;/,
    `const DATA_URL = ${JSON.stringify(dataUrl)};`,
  )),
  importSource(new URL('../prototype/js/geoname.js', import.meta.url)),
]);

globalThis.fetch = async input => {
  const data = await readFile(new URL(String(input)));
  return new Response(data, { status: 200, headers: { 'content-type': 'application/json' } });
};

const cases = [
  [35.452, 133.362, 'JP', '일본'],       // 신고 좌표 · 일본 시마네현
  [35.681, 139.767, 'JP', '일본'],       // 도쿄
  [43.062, 141.354, 'JP', '일본'],       // 삿포로
  [26.212, 127.681, 'JP', '일본'],       // 오키나와
  [37.566, 126.978, 'KR', '대한민국'],   // 서울
  [35.179, 129.075, 'KR', '대한민국'],   // 부산
  [33.499, 126.531, 'KR', '대한민국'],   // 제주
  [40.000, 125.750, 'KP', '조선민주주의인민공화국'], // 평안북도
  [48.857, 2.352, 'FR', '프랑스'],       // 파리
  [40.713, -74.006, 'US', '미국'],       // 뉴욕
];

for (const [lat, lon, code, nameKo] of cases) {
  const country = await countryAt(lat, lon);
  assert.equal(country?.code, code, `${lat},${lon} country code`);
  assert.equal(country?.nameKo, nameKo, `${lat},${lon} Korean country name`);
}

const japan = await countryAt(35.452, 133.362);
const labelKo = describePlace(35.452, 133.362, true, japan);
const labelEn = describePlace(35.452, 133.362, false, japan);
assert.equal(labelKo.country, '일본');
assert.equal(labelEn.country, 'Japan');
assert.doesNotMatch(labelKo.text, /대한민국|부산/);
assert.doesNotMatch(labelEn.text, /South Korea|Busan/);
assert.equal(await countryAt(37.0, 135.0), null, '동해 바다를 육지 국가로 지어내지 않는다');

const placeSource = await readFile(new URL('../prototype/js/place.js', import.meta.url), 'utf8');
const decisionSource = await readFile(new URL('../prototype/js/decision-rail.js', import.meta.url), 'utf8');
assert.match(placeSource, /await countryAt\(lat, lon\)/);
assert.doesNotMatch(placeSource, /p\.km\s*<=\s*600\s*\?\s*p\.country/);
assert.match(placeSource, /countryCode:\s*boundaryCountry\?\.code/);
assert.match(decisionSource, /await lookupPlace\(point\.lat, point\.lon\)/);
assert.doesNotMatch(decisionSource, /describePlace\(this\.point\.lat/);
assert.match(decisionSource, /Natural Earth 국가 경계 참조/);

console.log(`PASS: ${cases.length} land coordinates use country geometry; reported Japan coordinate is JP`);
