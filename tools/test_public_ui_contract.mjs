import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = path => readFileSync(join(root, path), 'utf8');
const html = read('prototype/index.html');
const appCss = read('prototype/css/app.css');
const account = read('prototype/js/ui-account.js');
const main = read('prototype/js/main.js');
const ui = read('prototype/js/ui.js');
const scene = read('prototype/js/scene.js');
const i18n = read('prototype/js/i18n.js');
const outdoor = read('prototype/js/ui-outdoor.js');
const wildfire = read('prototype/js/layers/wildfire.js');

const publicAuthText = html + '\n' + account;
for (const leak of [
  /아직 Supabase 키/,
  /Supabase 키가 아직/,
  /config\.local\.js\)/,
  /로그인 실패:\s*['"]?\s*\+\s*e\.message/,
]) {
  assert.equal(leak.test(publicAuthText), false, `public auth text leaks developer detail: ${leak}`);
}
assert.match(html, /id="loginNotice"[^>]*hidden[^>]*>[\s\S]*?공개 자료는 로그인 없이/);
assert.match(account, /button\.disabled = !configured/);
assert.match(account, /authConsentIntent\.mark\(\)/,
  'explicit login must mark the consent continuation intent');
assert.match(account, /!authConsentIntent\.consume\(\)/,
  'restored sessions must not be treated as explicit signup');
assert.equal(/if \(user && consentSheet\.needed\(\)\)/.test(account), false,
  'restored sessions still auto-open the consent sheet');
assert.match(main, /\['changelogSheet', 'settings', 'waitlistSheet', 'consentSheet'\]/,
  'boot safety must close a stale consent sheet');
assert.match(main, /if \(consent\) consent\.style\.display = on \? '' : 'none'/,
  'guest settings still expose consent management');

const legalLinks = [...html.matchAll(/<a href="([^"]+)" data-legal="(terms|privacy)"/g)];
assert.ok(legalLinks.length >= 6, 'all legal entry points must have real fallback links');
for (const [, href, kind] of legalLinks) {
  assert.equal(href, `legal/${kind}.ko.md`, `legal fallback href mismatch for ${kind}`);
}
assert.equal(/href="#" data-legal=/.test(html), false, 'dead legal # link remains');

assert.match(html, /<h1 class="sr-only">earthus — 지금 지구의 날씨·바다·재난/);
assert.match(html, /id="sceneRoot"[^>]*aria-hidden="true"[^>]*hidden[^>]*inert[^>]*data-nosnippet/);
assert.match(scene, /root\.hidden = false; root\.inert = false/);
assert.match(scene, /root\.hidden = true; root\.inert = true/);
assert.ok(html.indexOf('지금 지구의 날씨·바다·재난') < html.indexOf('id="sceneRoot"'),
  'Earth core purpose must precede optional scenes');

for (const legacy of ['SPACE / SCALE DEMO', 'OCEAN / SCALE DEMO', 'SOLAR SYSTEM / JPL APPROXIMATION']) {
  assert.equal(html.includes(legacy), false, `English-only initial label remains: ${legacy}`);
}
assert.match(i18n, /'explore\.solar\.kicker'/);
assert.match(i18n, /'explore\.dive\.kicker'/);

for (const placeholder of ['—:—', '>—<']) {
  assert.equal(html.includes(placeholder), false, `initial dash placeholder remains: ${placeholder}`);
}
for (const id of ['hhmm', 'ambDate', 'ambCity', 'ambCond', 'ambTemp', 'ambHi', 'ambLo']) {
  const tag = html.match(new RegExp(`<[^>]+id="${id}"[^>]*>`))?.[0] || '';
  assert.ok(tag.includes('amb-loading'), `${id} has no loading state`);
}
assert.match(ui, /amb-unavailable/);
assert.match(ui, /날씨 자료를 불러오지 못했습니다/);

const coreIndex = html.indexOf('data-open="earth"');
const alertIndex = html.indexOf('data-open="alert"');
const discoverIndex = html.indexOf('id="mmDiscoverTitle"');
const newsIndex = html.indexOf('data-act="news"');
const activitiesIndex = html.indexOf('id="mmActivitiesTitle"');
const outdoorIndex = html.indexOf('data-act="outdoor"');
const flightIndex = html.indexOf('data-act="flight"');
const moveIndex = html.indexOf('id="mmMoveTitle"');
assert.ok(coreIndex >= 0 && coreIndex < alertIndex && alertIndex < discoverIndex && discoverIndex < newsIndex,
  'Earth viewing actions must precede reading and analysis');
assert.ok(newsIndex < activitiesIndex && activitiesIndex < outdoorIndex
  && outdoorIndex < flightIndex && flightIndex < moveIndex,
  'reading, activities, and movement groups must stay distinct');
assert.match(html, /id="mmActivitiesTitle"[^>]*data-i18n="m\.menuActivities">활동</);
assert.match(html, /data-act="outdoor"[\s\S]*?data-i18n="m\.outdoor">취미</);
assert.equal((html.match(/data-act="ocean"/g) || []).length, 1,
  'OCEAN must have one independent first-class main-menu entry');
const mainMenuMarkup = html.slice(html.indexOf('<nav id="menuMain"'), html.indexOf('</nav>'));
assert.equal(/무료|\bFREE\b|\bFree\b/.test(mainMenuMarkup), false,
  'access-price copy remains in the main menu');
for (const group of ["id: 'ocean'", "id: 'life'", "id: 'land-sky'"]) {
  assert.ok(outdoor.includes(group), `hobby category missing: ${group}`);
}
assert.match(outdoor, /acts: \['ocean-layers', 'surf', 'fishing', 'trench', 'vessel'\]/);
assert.match(outdoor, /acts: \['turtle', 'seabird', 'migbird', 'ecobird'\]/);
assert.match(outdoor, /acts: \['para', 'mountain', 'sky'\]/);
assert.match(html, /id="menuClose"[^>]*aria-label="메뉴 닫기"/);
assert.match(html, /class="mm-move-grid"[\s\S]*?data-act="earth-home"[\s\S]*?data-act="locate"[\s\S]*?data-act="globe"/);
assert.equal(html.includes('id="menuMore"'), false, 'secondary actions are still hidden in an accordion');
assert.match(appCss, /\.mm-close\{[\s\S]*?width:44px;height:44px/,
  'menu close control is smaller than the touch target contract');
assert.match(appCss, /\.mm-move-item\{[\s\S]*?min-height:58px/,
  'movement controls do not preserve a comfortable touch target');
assert.match(appCss, /\.out-card\{[\s\S]*?min-height:92px/,
  'hobby controls do not preserve a comfortable touch target');
assert.match(appCss, /#menuTab\.open \+ #aetherusTab:not\(\.open\)\{opacity:0;pointer-events:none\}/,
  'AETHERUS handle still overlays the open EARTHUS menu');
assert.equal(/<p class="out-note">/.test(outdoor), false,
  'hobby picker must not render a footer disclaimer block');
assert.equal(outdoor.includes('We report conditions. We never tell you it is safe to go.'), false,
  'English hobby footer disclaimer remains');
assert.equal((ui + wildfire).includes('열점이 모두 산불은 아닙니다'), false,
  'wildfire detail still renders the rejected hotspot disclaimer');
assert.equal(ui.includes('wildfires.note()'), false,
  'wildfire detail still appends a global disclaimer block');

const panels = [...html.matchAll(/<div id="[^"]+" class="sheet-panel[^"]*"([^>]*)>/g)];
assert.ok(panels.length >= 30, 'expected all public sheet panels in the contract');
for (const [, attrs] of panels) {
  assert.match(attrs, /aria-hidden="true"/, 'closed sheet missing aria-hidden');
  assert.match(attrs, /\binert\b/, 'closed sheet missing inert');
  assert.match(attrs, /data-nosnippet/, 'closed sheet missing data-nosnippet');
}

assert.match(html, /id="hud" hidden aria-hidden="true"/);
assert.match(html, /id="hudShow" hidden aria-hidden="true"/);
assert.match(ui, /location\.hash === '#dev'/);

console.log(`public UI contract OK · legal links ${legalLinks.length} · sealed panels ${panels.length}`);
