import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = async path => readFile(new URL(path, root), 'utf8');
const readability = await source('prototype/js/readability.js');
const css = await source('prototype/css/readability.css');
const index = await source('prototype/index.html');
const grid = await source('prototype/js/gridoverlay.js');

assert.match(readability, /nearestGridValue\(this\.grid, this\.field/,
  '도시·지점 숫자는 원격자 함수로 읽어야 한다');
assert.match(readability, /new Cesium\.LabelCollection/,
  '지도 위 충돌 제한 숫자 라벨이 있어야 한다');
assert.match(readability, /cartesianToCanvasCoordinates/,
  '라벨 충돌은 화면 좌표에서 판단해야 한다');
assert.match(readability, /placement: this\._screenPlacement\(place\)[\s\S]*filter\(place => place\.placement\)/,
  '반대편 도시를 현재 화면 숫자로 부르지 않아야 한다');
assert.match(readability, /gridBounds\(this\.grid\)/,
  '범례에는 실제 격자 범위가 연결돼야 한다');
assert.match(readability, /n=\$\{cells\.toLocaleString\(\)\}/,
  '범례에는 결측을 숨기지 않는 유효 표본 수가 있어야 한다');
assert.match(readability, /this\.grid\.attribution \|\| this\.grid\.source \|\| this\.sourceName/,
  '도시값 범례 자체에도 자료 출처가 있어야 한다');
assert.match(readability, /MODEL ANALYSIS|MODEL FORECAST|COMPUTED/,
  '자료 종류 배지가 있어야 한다');
assert.match(readability, /MapServer\/tile\/\{z\}\/\{y\}\/\{x\}/,
  '판독 모드 참조 지도는 출처 있는 타일이어야 한다');
assert.match(readability, /this\._setReference\(true, state\.read === true\)/,
  '수치 Data View에 들어오면 국가 경계·해안선이 자동으로 켜져야 한다');
assert.match(readability, /REFERENCE_ALPHA = Object\.freeze\(\{ data: 0\.78, read: 0\.96 \}\)/,
  '기본 Data와 판독 모드의 경계 대비가 구분돼야 한다');
assert.match(readability, /Country borders, coastlines and places|국가 경계·해안선·지명/,
  '자동 경계가 무엇인지 화면에 밝혀야 한다');
assert.match(readability, /rd-reference-credit[\s\S]*(Country borders|국가 경계)/,
  '숨겨진 Cesium credit에 의존하지 않고 참조 지도 출처가 화면에 보여야 한다');
assert.doesNotMatch(readability, /setInterval|requestAnimationFrame/,
  '판독 기반에 무한 타이머나 애니메이션을 만들지 않는다');
assert.match(css, /body\.earth-data-view #ambient\{opacity:0/,
  'Data View에서만 첫 화면 정보가 물러나야 한다');
assert.match(index, /id="readabilityPanel"[\s\S]*hidden/,
  '첫 Earth View에는 판독 패널이 숨겨져 있어야 한다');
assert.match(grid, /earthus:grid-ready/,
  '화면이 실제로 그린 격자를 UI에 전달해야 한다');
assert.match(grid, /_rendered\[key\]/,
  '복원 직후에도 그린 격자를 재사용해야 한다');
assert.match(grid, /getElementById\('readabilityPanel'\)[\s\S]*_clearValueLabels\(\)/,
  'TPW 전용 숫자와 공통 숫자가 중복되면 안 된다');

console.log('Readability foundation: 19/19 passed');
