import assert from 'node:assert/strict';
import fs from 'node:fs';

const imagery = fs.readFileSync(new URL('../prototype/js/layers/imagery.js', import.meta.url), 'utf8');
const layerbar = fs.readFileSync(new URL('../prototype/js/layerbar.js', import.meta.url), 'utf8');
const gmgsi = fs.readFileSync(new URL('../aws/gmgsi-clouds/handler.py', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../prototype/css/app.css', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../prototype/index.html', import.meta.url), 'utf8');

assert.doesNotMatch(imagery, /const day = this\._ymdBack\(2\)/,
  '수오미를 무조건 이틀 전으로 먼저 표시하면 안 된다');
assert.match(imagery, /back === 1 && avg <= 18/,
  '최신 완성일은 실제 타일 공백 품질 gate로 선택해야 한다');
assert.match(imagery, /this\._imgLoading\(true, '수오미 최신 촬영일 확인', true\)/,
  '수오미 최신일 검사 중 로딩 상태가 보여야 한다');
assert.match(imagery, /for \(const y of \[3, 4\]\) for \(const x of \[0, 2, 4, 6\]\)/,
  '수오미 날짜 확인은 대표 8타일로 제한해야 한다');
assert.match(imagery, /_imgLoading\(show, label, hold = false\)/,
  '타일 큐 밖 날짜 확인은 로딩 표시를 유지할 수 있어야 한다');
assert.match(layerbar, /VIIRS 최신 완성일 낮 참고/,
  '메뉴는 고정 전날이 아니라 화면에 실제 선택된 완성일을 설명해야 한다');
assert.doesNotMatch(css, /body\.panel-open #tcLoading\.on/,
  '위성 선택 시트가 열린 동안 로딩바를 숨기면 안 된다');
assert.match(index, /app\.css\?v=20260813-publicui1/,
  '운영 브라우저가 로딩바를 포함한 현재 공개 UI CSS를 즉시 받아야 한다');
assert.match(imagery, /if \(on\) this\._imgLoading\(true, 'NOAA 전지구 구름'\)/,
  '이미 받은 NOAA로 복귀할 때도 전환 표시가 필요하다');

for (const label of ['히마와리', '구름 꼭대기 온도', '천리안2A 구름', '천리안2A 자동 영상', '천리안2A 영상']) {
  assert.ok(imagery.includes(`_imgLoading(true, '${label}')`), `${label} 전환에 로딩 표시가 필요하다`);
}
assert.match(imagery, /const broad = daylight \? 'vi006ea' : 'ir112ea'/,
  '천리안 자동 선택은 동아시아 2km 상세 채널을 결합해야 한다');
assert.match(imagery, /Math\.pow\(d\[i \+ 3\] \/ 255, 0\.78\)/,
  'NOAA 관측 알파의 0과 1을 보존하는 표시 감마가 유지돼야 한다');
assert.match(gmgsi, /^OUT_W = 3072$/m,
  'NOAA GMGSI 산출물은 Retina 대응 3072px이어야 한다');

console.log('satellite imagery requests: 14/14 passed');
