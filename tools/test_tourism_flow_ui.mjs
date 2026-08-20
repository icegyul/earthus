import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');
const [config, layerbar, registry, layer, ui, css, html, main, source, analytics] = await Promise.all([
  read('prototype/js/config.js'), read('prototype/js/layerbar.js'),
  read('prototype/js/layers/registry.js'), read('prototype/js/layers/tourism-flow.js'),
  read('prototype/js/ui-tourism.js'), read('prototype/css/tourism-flow.css'),
  read('prototype/index.html'), read('prototype/js/main.js'), read('prototype/js/ui-source.js'),
  read('prototype/js/analytics-contract.js'),
]);

assert.match(config, /TOURISM:\s*CDN \+ '\/tourism'/);
assert.match(config, /id:'tourism',[\s\S]{0,120}kind:'tower'[\s\S]{0,120}tier:TIER\.FREE/);
assert.match(layerbar, /id:'tourism'[\s\S]{0,220}ready:true/);
assert.match(layerbar, /ids:\s*\['tourism',\s*'poi'\]/);
assert.match(registry, /tourismFlow\.init\(\)/);
assert.match(registry, /tourism:\s*\(\) => tourismFlow\.refresh\(\)/);
assert.match(registry, /on\('tourism',[\s\S]{0,80}REFRESH\.tourism/);

assert.match(layer, /new Cesium\.CustomDataSource\('tourism-flow'\)/);
assert.match(layer, /cylinder:\s*\{/);
assert.doesNotMatch(layer, /CallbackProperty|clampToGround|heightReference/);
assert.match(layer, /if \(!store\.isOn\('tourism'\)\) return/);
assert.match(layer, /this\._abort\?\.abort\(\)/);
assert.match(layer, /earthus:tourism-time/);
assert.match(layer, /id="tourismMapUi"/);
assert.match(layer, /data-tourism-map-time/);
assert.match(layer, /공식 관측/);
assert.match(layer, /기둥 높이·색/);
assert.match(layer, /currentEvidenceLabel/);
assert.match(layer, /지난 공식 관측/);
assert.doesNotMatch(layer, /\.slice\(0, 7\)/);
assert.match(layer, /label:[\s\S]{0,400}show:\s*false/);
assert.match(layer, /_tourism:/);
assert.match(layer, /kto\/summary\.json/);
assert.match(layer, /validateKtoSummary/);

assert.match(html, /css\/tourism-flow\.css/);
assert.match(html, /id="tourismSheet"/);
assert.match(html, /id="tourismBody"/);
assert.match(main, /picked\?\.id\?\._tourism/);
assert.match(main, /tourismSheet\.open/);
assert.match(source, /tourism:/);

assert.match(ui, /서울특별시 실시간 인구데이터/);
assert.match(ui, /공식 현재/);
assert.match(ui, /공식 예측/);
assert.match(ui, /BEST TIME/);
assert.match(ui, /OD|이동 경로/);
assert.match(ui, /운영시간·입장 가능 여부/);
assert.match(ui, /DATA STATUS/);
assert.match(ui, /KTO DATASETS/);
assert.match(ui, /ktoSummaryRows/);
assert.match(ui, /관광지 상대 집중률 예측/);
assert.match(ui, /실시간 인구가 아닙니다/);
assert.match(ui, /withDirectionEvidence/);
assert.match(ui, /지켜보기/);
assert.match(ui, /실시간 이동 방향은 만들지 않습니다/);
assert.doesNotMatch(ui, /안전합니다|가도 됩니다|수용 가능/);
assert.match(css, /min-height:\s*44px/);
assert.match(css, /#tourismMapUi/);
assert.match(css, /#tourismMapUi::before/);
assert.match(css, /\.tm-timeline/);
assert.match(css, /@media \(max-width:\s*640px\)/);
assert.match(analytics, /tourism\.place_viewed/);
assert.match(analytics, /tourism\.forecast_selected/);
assert.match(analytics, /tourism\.watch_changed/);

console.log('tourism flow public UI wiring: PASS');
