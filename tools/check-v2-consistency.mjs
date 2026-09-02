// EARTHUS v2 정합성 검사 — 메뉴·라우팅·빌더·진리등급이 서로 어긋나지 않는지 본다.
//
// 왜: 레이어를 늘릴 때마다 (1) 메뉴에만 넣고 라우팅을 빼먹거나 (2) 라우팅만 넣고
//     빌더를 안 만들거나 (3) 진리등급표에서 빠지는 일이 반복됐다. 화면에는
//     '눌러도 아무 일 없음' 또는 '배지 없음'으로만 나타나 눈에 잘 안 띈다.
//
// 사용: node tools/check-v2-consistency.mjs   (문제 있으면 종료코드 1)

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', 'prototype', 'v2-three', 'js');
const read = (f) => readFileSync(join(APP, f), 'utf8');

const shell = read('ui-shell.js');
const main = read('main.js');
const live = read('live-layers.js');
const bridge = read('engine-bridge.js');

const problems = [];
const notes = [];

// ---- 1) 메뉴의 모든 레이어 수집 ----
const scenes = [];
const sceneRe = /id:\s*'([a-z]+)',\s*\n\s*label:\s*'([^']+)'/g;
let m;
while ((m = sceneRe.exec(shell))) scenes.push({ id: m[1], label: m[2], at: m.index });

const layers = [];
const layerRe = /\{\s*id:\s*'([a-z0-9-]+)',\s*name:\s*'([^']*)',\s*state:\s*'([A-Z_]+)'/g;
while ((m = layerRe.exec(shell))) {
  const scene = [...scenes].reverse().find((s) => s.at < m.index);
  if (scene) layers.push({ scene: scene.id, id: m[1], name: m[2], state: m[3] });
}
if (layers.length < 40) problems.push(`메뉴 레이어를 ${layers.length}개밖에 못 읽었다 — 파서가 깨졌을 수 있다`);

// ---- 2) 라우팅(LIVE_LAYER_KEYS) 파싱 ----
const routed = new Map();
const routeRe = /'([a-z]+)\/([a-z0-9-]+)':\s*\['([a-z0-9]+)'/g;
while ((m = routeRe.exec(main))) routed.set(`${m[1]}/${m[2]}`, m[3]);

// ---- 3) live-layers가 실제로 다룰 수 있는 id ----
const caseIds = new Set();
const caseRe = /case '([a-z0-9]+)':/g;
while ((m = caseRe.exec(live))) caseIds.add(m[1]);

// ---- 4) 진리등급표 ----
const truthKeys = new Set();
const truthRe = /'([a-z]+\/[a-z0-9-]+)':\s*\{\s*kind:/g;
while ((m = truthRe.exec(bridge))) truthKeys.add(m[1]);

// ---- 검사 ----
const specialKeys = [...main.matchAll(/key === '([a-z]+\/[a-z0-9-]+)'/g)].map((x) => x[1]);
const caseKeys = [...main.matchAll(/case '([a-z]+\/[a-z0-9-]+)':/g)].map((x) => x[1]);
const idBranches = [...main.matchAll(/id === '([a-z0-9-]+)'/g)].map((x) => x[1]);
const handled = new Set([...specialKeys, ...caseKeys]);

for (const l of layers) {
  const key = `${l.scene}/${l.id}`;
  if (l.state === 'LOCKED') continue;
  const isRouted = routed.has(key);
  const isSpecial = handled.has(key) || idBranches.includes(l.id);
  if (!isRouted && !isSpecial) {
    problems.push(`[핸들러 없음] ${key} (${l.name}) — 메뉴에 있는데 눌러도 아무 일이 없다`);
  }
  if (isRouted && !caseIds.has(routed.get(key))) {
    problems.push(`[빌더 없음] ${key} → live-layers '${routed.get(key)}' case가 없다`);
  }
  if (!truthKeys.has(key)) {
    notes.push(`[배지 없음] ${key} (${l.name}) — LAYER_TRUTH에 없어 신선도 배지가 안 뜬다`);
  }
}

// 라우팅에만 있고 메뉴에 없는 유령 항목
const menuKeys = new Set(layers.map((l) => `${l.scene}/${l.id}`));
for (const key of routed.keys()) {
  if (!menuKeys.has(key)) problems.push(`[유령 라우팅] ${key} — 메뉴에 없는데 라우팅만 있다`);
}

const live0 = layers.filter((l) => l.state !== 'LOCKED').length;
console.log(`씬 ${scenes.length} · 레이어 ${layers.length} (연결 ${live0} · 잠금 ${layers.length - live0})`);
console.log(`라우팅 ${routed.size} · live-layers case ${caseIds.size} · 진리등급 ${truthKeys.size}`);

if (notes.length) {
  console.log(`\n경고 ${notes.length}건 (배지 누락 — 동작은 하지만 신선도가 안 보인다):`);
  for (const n of notes.slice(0, 40)) console.log('  ' + n);
  if (notes.length > 40) console.log(`  … 외 ${notes.length - 40}건`);
}
if (problems.length) {
  console.error(`\n실패 ${problems.length}건:`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log('\nPASS 메뉴·라우팅·빌더가 서로 맞습니다');
