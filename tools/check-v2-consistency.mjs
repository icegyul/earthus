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
const extScene = read('ext-scene.js');

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
// 중복 선언은 조용히 앞선 줄을 덮어쓴다(객체 리터럴은 뒤가 이긴다). 2026-09-08 에 eqdepth·plates 가
// 그렇게 HISTORY → OFFICIAL_OBSERVATION 으로 뒤집혀 사료를 '공식 관측'으로 배지하고 있었다. 다시는 못 하게 막는다.
const truthKeys = new Set();
const truthDupes = [];
const truthRe = /'([a-z]+\/[a-z0-9-]+)':\s*\{\s*kind:/g;
while ((m = truthRe.exec(bridge))) {
  if (truthKeys.has(m[1])) truthDupes.push(m[1]);
  truthKeys.add(m[1]);
}
for (const k of truthDupes) {
  problems.push(`[진리등급 중복] ${k} — LAYER_TRUTH에 두 번 선언됐다. 뒤의 줄이 조용히 이겨서 등급이 뒤집힌다`);
}

// ---- 5) LAB · 취미는 ext-scene 이 모듈로 연다 (main.js 의 sid === 'lab' || sid === 'hobby' 분기) ----
// 이 표를 보지 않으면 lab·hobby 16개가 전부 '핸들러 없음'으로 잘못 잡힌다.
const extKeys = new Set();
const extRe = /'([a-z]+\/[a-z0-9-]+)':\s*'\.\/ext\//g;
while ((m = extRe.exec(extScene))) extKeys.add(m[1]);

// ---- 검사 ----
const specialKeys = [...main.matchAll(/key === '([a-z]+\/[a-z0-9-]+)'/g)].map((x) => x[1]);
const caseKeys = [...main.matchAll(/case '([a-z]+\/[a-z0-9-]+)':/g)].map((x) => x[1]);
const idBranches = [...main.matchAll(/id === '([a-z0-9-]+)'/g)].map((x) => x[1]);
const handled = new Set([...specialKeys, ...caseKeys]);

for (const l of layers) {
  const key = `${l.scene}/${l.id}`;
  if (l.state === 'LOCKED') continue;
  const isRouted = routed.has(key);
  const isSpecial = handled.has(key) || idBranches.includes(l.id) || extKeys.has(key);
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
for (const key of extKeys) {
  if (!menuKeys.has(key)) problems.push(`[유령 모듈] ${key} — 메뉴에 없는데 ext-scene MODULES 에만 있다`);
}

// 같은 bare id 가 두 씬에 있으면, bare id 로 조회하는 표(MENU_QUESTIONS · i18n L_EN)는 한쪽 답을 다른 쪽에 준다.
// 2026-09-08 현재 surf · vessel 이 그렇다: hobby 가 ocean 의 질문과 영문 이름을 그대로 표시한다.
// PHASE 2 에서 조회 키를 복합키로 옮기면 사라진다. 그때 이 경고를 실패로 올린다.
const byBareId = new Map();
for (const l of layers) {
  if (!byBareId.has(l.id)) byBareId.set(l.id, []);
  byBareId.get(l.id).push(l.scene);
}
for (const [id, scenesWith] of byBareId) {
  if (scenesWith.length > 1) {
    notes.push(`[id 충돌] '${id}' 가 ${scenesWith.join(' · ')} 에 중복 선언됐다 — bare id 로 찾는 질문·영문이름이 서로 섞인다`);
  }
}

// ---- 현상 레지스트리(PHASE 1) 커버리지 ----
// 레지스트리가 SCENES 와 어긋나면 조용히 틀린 질문이 뜬다. 여기서 1:1 을 강제한다.
let reg = null;
try {
  reg = readFileSync(join(APP, 'phenomenon-registry.js'), 'utf8');
} catch { /* PHASE 1 이전 체크아웃 — 레지스트리가 없으면 이 검사만 건너뛴다 */ }
if (reg) {
  const regKeys = new Set();
  const regDupes = [];
  const regRe = /^\s{2}'([a-z]+\/[a-z0-9-]+)':\s*Object\.freeze\(\{\s*phenomenon:/gm;
  while ((m = regRe.exec(reg))) {
    if (regKeys.has(m[1])) regDupes.push(m[1]);
    regKeys.add(m[1]);
  }
  for (const k of regDupes) problems.push(`[레지스트리 중복] ${k} — LAYER_PHENOMENON 에 두 번 있다`);
  for (const key of menuKeys) {
    if (!regKeys.has(key)) problems.push(`[레지스트리 누락] ${key} — 메뉴에 있는데 현상 레지스트리에 없다`);
  }
  for (const key of regKeys) {
    if (!menuKeys.has(key)) problems.push(`[레지스트리 유령] ${key} — 메뉴에 없는데 레지스트리에만 있다`);
  }
  // 참조된 현상 id 가 실제로 정의돼 있는지
  const defined = new Set();
  const defRe = /^\s{2}'([a-z_]+\.[a-z0-9_]+)':\s*Object\.freeze\(\{\s*$/gm;
  while ((m = defRe.exec(reg))) defined.add(m[1]);
  const referenced = [...reg.matchAll(/phenomenon:\s*'([a-z_]+\.[a-z0-9_]+)'/g)].map((x) => x[1]);
  for (const pid of new Set(referenced)) {
    if (!defined.has(pid)) problems.push(`[레지스트리 미정의] 현상 '${pid}' 이 참조되는데 PHENOMENA 에 없다`);
  }
  notes.push(`[레지스트리] 현상 ${defined.size} · 레이어 ${regKeys.size}`);

  // PHASE 2 STEP 2.3 — 리포트 종류 ↔ 현상 대응. capabilities.report 가 실제 생성기와 어긋나면 잡는다.
  // 종류 정본은 aws/lab-report-index/handler.py 의 SOURCES 다.
  const kindMap = new Map();
  const kindRe = /^\s{2}'([a-z-]+)':\s*Object\.freeze\(\{\s*phenomenon:\s*(?:'([a-z_]+\.[a-z0-9_]+)'|null)/gm;
  while ((m = kindRe.exec(reg))) kindMap.set(m[1], m[2] || null);
  if (kindMap.size) {
    let srcKinds = [];
    try {
      const idx = readFileSync(join(APP, '..', '..', '..', 'aws', 'lab-report-index', 'handler.py'), 'utf8');
      const block = idx.match(/SOURCES\s*=\s*\(([\s\S]*?)\n\)/);
      if (block) srcKinds = [...block[1].matchAll(/\(\s*"([a-z-]+)"/g)].map((x) => x[1]);
    } catch { /* 색인 핸들러를 못 읽으면 이 대조만 건너뛴다 */ }
    for (const k of srcKinds) {
      if (!kindMap.has(k)) problems.push(`[리포트 종류 누락] '${k}' — 색인 SOURCES 에 있는데 REPORT_KIND_PHENOMENON 에 없다`);
    }
    for (const k of kindMap.keys()) {
      if (srcKinds.length && !srcKinds.includes(k)) problems.push(`[리포트 종류 유령] '${k}' — 색인 SOURCES 에 없는 종류를 잇고 있다`);
    }
    // 현상이 report:true 라고 말하려면 실제 생성기가 있어야 한다. 반대도 마찬가지다.
    const claimed = new Set([...kindMap.values()].filter(Boolean));
    const repTrue = [...reg.matchAll(/^\s{2}'([a-z_]+\.[a-z0-9_]+)':\s*Object\.freeze\(\{[\s\S]*?report:\s*(true|false)/gm)]
      .filter((x) => x[2] === 'true').map((x) => x[1]);
    for (const p of repTrue) {
      if (!claimed.has(p)) problems.push(`[리포트 근거 없음] 현상 '${p}' 이 report:true 인데 대응하는 리포트 종류가 없다`);
    }
    for (const p of claimed) {
      if (!repTrue.includes(p)) problems.push(`[리포트 능력 누락] 현상 '${p}' 에 리포트 종류가 있는데 report:false 다`);
    }
    const unmapped = [...kindMap.entries()].filter(([, v]) => !v).map(([k]) => k);
    if (unmapped.length) notes.push(`[리포트] 대응 현상 없는 종류 ${unmapped.length}건: ${unmapped.join(' · ')}`);
  }
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
