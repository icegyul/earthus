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
assert.match(layer, /new Cesium\.CustomDataSource\('tourism-density-labels'\)/);
assert.match(layer, /buildTourismDensityGrid/);
assert.match(layer, /buildTourismLabelCandidates/);
assert.match(layer, /selectNonOverlappingLabels/);
assert.match(layer, /box:\s*\{/);
assert.doesNotMatch(layer, /cylinder:\s*\{/);
assert.doesNotMatch(layer, /towerVisual|CallbackProperty|clampToGround|heightReference/);
assert.match(layer, /if \(!store\.isOn\('tourism'\)\) return/);
assert.match(layer, /this\._abort\?\.abort\(\)/);
assert.match(layer, /earthus:tourism-time/);
assert.match(layer, /id="tourismMapUi"/);
assert.match(layer, /tourismMapStyle/);
assert.match(layer, /tourismMapStyle\.set\(true\)/);
assert.match(layer, /tourismMapStyle\.set\(false\)/);
assert.match(layer, /data-tourism-map-time/);
assert.match(layer, /currentEvidenceLabel/);
assert.doesNotMatch(layer, /\.slice\(0, 7\)/);
assert.match(layer, /_tourism:/);
assert.match(layer, /_tourismContributors:/);
assert.match(layer, /kto\/summary\.json/);
assert.match(layer, /validateKtoSummary/);
assert.match(layer, /auxiliary:\s*Object\.freeze\(\{ health: null, ktoSummary: null \}\)/);
assert.match(layer, /earthus:tourism-auxiliary/);
assert.doesNotMatch(layer, /snapshot\.(?:health|ktoSummary)\s*=/);

assert.match(html, /css\/tourism-flow\.css/);
assert.match(html, /id="tourismSheet"/);
assert.match(html, /id="tourismBody"/);
assert.match(main, /picked\?\.id\?\._tourism/);
assert.match(main, /tourismSheet\.open/);
assert.match(source, /tourism:/);

assert.match(ui, /BEST TIME/);
assert.match(ui, /OD|이동 경로/);
assert.match(ui, /DATA STATUS/);
assert.match(ui, /KTO DATASETS/);
assert.match(ui, /ktoSummaryRows/);
assert.match(ui, /earthus:tourism-auxiliary/);
assert.match(ui, /this\.auxiliary\?\.health/);
assert.match(ui, /this\.auxiliary\?\.ktoSummary/);
assert.match(ui, /withDirectionEvidence/);
assert.doesNotMatch(ui, /3D 기둥/);
assert.doesNotMatch(ui, /안전합니다|가도 됩니다|수용 가능/);
assert.match(css, /min-height:\s*44px/);
assert.match(css, /#tourismMapUi/);
assert.match(css, /#tourismMapUi::before/);
assert.match(css, /\.tm-timeline/);
assert.match(css, /#d93222/);
assert.match(css, /#ef672e/);
assert.match(css, /#f7aa45/);
assert.match(css, /#f5d58a/);
assert.doesNotMatch(css, /#48d7a0/);
assert.match(css, /@media \(max-width:\s*640px\)/);
assert.match(analytics, /tourism\.place_viewed/);
assert.match(analytics, /tourism\.forecast_selected/);
assert.match(analytics, /tourism\.watch_changed/);

console.log('tourism flow public UI wiring: PASS');
