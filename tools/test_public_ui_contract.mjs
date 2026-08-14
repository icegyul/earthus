import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = path => readFileSync(join(root, path), 'utf8');
const html = read('prototype/index.html');
const account = read('prototype/js/ui-account.js');
const main = read('prototype/js/main.js');
const ui = read('prototype/js/ui.js');
const scene = read('prototype/js/scene.js');
const i18n = read('prototype/js/i18n.js');
const outdoor = read('prototype/js/ui-outdoor.js');

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
const moreIndex = html.indexOf('id="menuMore"');
const newsIndex = html.indexOf('data-act="news"');
assert.ok(coreIndex >= 0 && coreIndex < alertIndex && alertIndex < moreIndex && moreIndex < newsIndex,
  'core Earth menu must precede secondary exploration actions');
assert.match(html, /id="menuMore"[\s\S]*?data-act="news"[\s\S]*?data-act="outdoor"[\s\S]*?<\/details>/);
assert.equal(/<p class="out-note">/.test(outdoor), false,
  'hobby picker must not render a footer disclaimer block');
assert.equal(outdoor.includes('We report conditions. We never tell you it is safe to go.'), false,
  'English hobby footer disclaimer remains');

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
