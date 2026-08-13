import assert from 'node:assert/strict';
import fs from 'node:fs';

const cyclone = fs.readFileSync(new URL('../prototype/js/layers/cyclone.js', import.meta.url), 'utf8');
const timeline = fs.readFileSync(new URL('../prototype/js/ui-timeline.js', import.meta.url), 'utf8');

/* 태풍 레이어와 경로 타임라인은 한 기능 묶음이다. 실제 Cesium/DOM 화면 시험 전에
   OFF 경로에서 선택·예보·재생 상태를 모두 정리하고, 늦은 비동기 응답이 UI를
   되살리지 못하게 하는 계약이 코드에서 빠지지 않았는지 고정한다. */
assert.match(cyclone, /if \(!this\._enabled\) \{[\s\S]*?this\.clearTrack\(\);[\s\S]*?\}/,
  '태풍 OFF가 펼친 경로와 타임라인을 정리해야 한다');
assert.match(cyclone, /const trackToken = this\._trackToken;/,
  '경로 요청은 세대 token을 가져야 한다');
assert.match(cyclone, /if \(!this\._enabled \|\| trackToken !== this\._trackToken\) return;/,
  'OFF 뒤 도착한 경로 응답을 폐기해야 한다');
assert.match(cyclone, /if \(this\._enabled && trackToken === this\._trackToken\) m\.fxTimeline\.show\(s\);/,
  '현재 선택의 경로만 플레이바를 열어야 한다');
assert.match(cyclone, /clearTrack\(\) \{\s*this\._trackToken \+= 1;/,
  '경로 해제가 진행 중 요청을 무효화해야 한다');

assert.match(timeline, /async set\(i\) \{\s*const setToken = \+\+this\._setToken;/,
  '예보 시각 적용도 세대 token을 가져야 한다');
assert.match(timeline, /hide\(\) \{[\s\S]*?this\._setToken \+= 1;[\s\S]*?classList\.remove\('on'\)/,
  '타임라인 해제가 비동기 적용을 무효화한 뒤 바를 닫아야 한다');
assert.match(timeline, /this\.pause\(\);/,
  '타임라인 해제는 재생 타이머를 중단해야 한다');

console.log('cyclone timeline lifecycle: 8/8 passed');
