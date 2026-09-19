// 배포 엔진 ↔ 프런트 계약 시험.
//
// 왜: 파이썬은 phenomenon-registry.js 를 읽을 수 없어서 종류↔현상 표의 사본이
//     aws/distribution/sources/lab_report.py 에 있다. 사본은 언젠가 어긋난다.
//     이 시험이 매번 두 표를 대조한다 — 손으로만 맞추지 않는다.
//
// 그리고 관리 화면이 실제로 쓰는 계약(플랫폼 어휘·글자 한도·상태 어휘)이
// 파이썬 쪽과 같은지 확인한다. 두 곳이 다르면 초안은 통과하고 발행이 잘린다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const reg = await import('../prototype/v2-three/js/phenomenon-registry.js');
const labPy = read('../aws/distribution/sources/lab_report.py');
const contractPy = read('../aws/_shared/content_contract.py');
const adminJs = read('../prototype/js/distribution-admin.js');
const socialTs = read('../prototype/supabase/functions/social-admin/index.ts');
const studioJs = read('../prototype/js/studio-social.js');

const BACKSLASH = 92;
const NL = String.fromCharCode(10);

/** 괄호를 세어 리터럴 한 덩어리를 잘라낸다.
 *
 *  ⚠️ 정규식으로 닫는 괄호를 찾으면 한 줄짜리 리터럴에서 파일 끝까지 삼킨다.
 *     실제로 삼켰다 — PLATFORMS 가 한 줄이라 파일 전체가 '플랫폼 이름'이 됐다. */
function literal(src, name, open) {
  const close = open === '{' ? '}' : ')';
  const at = src.indexOf(`${name} = ${open}`);
  assert.notEqual(at, -1, `${name} 을 못 찾았다`);
  const i = src.indexOf(open, at);
  let depth = 0;
  let quote = null;
  for (let j = i; j < src.length; j += 1) {
    const ch = src[j];
    if (quote) {
      if (ch === quote && src.charCodeAt(j - 1) !== BACKSLASH) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === open) depth += 1;
    else if (ch === close) { depth -= 1; if (depth === 0) return src.slice(i + 1, j); }
  }
  throw new Error(`${name} 리터럴이 닫히지 않았다`);
}

/** 파이썬 사전 — 값이 문자열이거나 None 인 얕은 표만 읽는다. */
function pyDict(src, name) {
  const out = {};
  for (const line of literal(src, name, '{').split(NL)) {
    const m = line.match(/^\s*"([^"]+)"\s*:\s*(?:"([^"]*)"|(None))\s*,?/);
    if (m) out[m[1]] = m[3] ? null : m[2];
  }
  return out;
}

function pyTuple(src, name) {
  return [...literal(src, name, '(').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** JS 객체 리터럴의 최상위 키. 중첩 값 안은 건너뛴다. */
function jsKeys(src, name) {
  const body = literal(src, `const ${name}`, '{');
  const keys = [];
  let depth = 0;
  let quote = null;
  let token = '';
  for (let j = 0; j < body.length; j += 1) {
    const ch = body[j];
    if (quote) {
      if (ch === quote && body.charCodeAt(j - 1) !== BACKSLASH) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '[' || ch === '{' || ch === '(') { depth += 1; continue; }
    if (ch === ']' || ch === '}' || ch === ')') { depth -= 1; continue; }
    if (depth > 0) continue;
    if (ch === ':') { const k = token.trim(); if (k) keys.push(k); token = ''; continue; }
    if (ch === ',') { token = ''; continue; }
    token += ch;
  }
  return keys;
}

test('종류↔현상 표가 프런트 정본과 같다', () => {
  const py = pyDict(labPy, 'KIND_PHENOMENON');
  const js = Object.fromEntries(Object.entries(reg.REPORT_KIND_PHENOMENON)
    .map(([k, v]) => [k, v.phenomenon ?? null]));
  assert.deepEqual(py, js,
    'aws/distribution/sources/lab_report.py 의 사본이 phenomenon-registry.js 와 어긋났다');
});

test('대응 현상이 없는 두 종류를 억지로 잇지 않았다', () => {
  const py = pyDict(labPy, 'KIND_PHENOMENON');
  assert.equal(py['ocean-drift'], null);
  assert.equal(py['marine-bloom'], null);
});

test('파이썬이 가리키는 현상이 전부 레지스트리에 있다', () => {
  for (const [kind, pid] of Object.entries(pyDict(labPy, 'KIND_PHENOMENON'))) {
    if (!pid) continue;
    assert.ok(reg.PHENOMENA[pid], `${kind} → ${pid} 이 레지스트리에 없다`);
  }
});

test('플랫폼 어휘가 실제 게시 함수와 같다', () => {
  const py = pyTuple(contractPy, 'PLATFORMS');
  // social-admin 의 PROVIDERS 가 실제로 게시할 수 있는 것의 정본이다.
  const ts = socialTs.match(/const PROVIDERS = \[([^\]]+)\]/);
  assert.ok(ts, 'social-admin 에서 PROVIDERS 를 못 찾았다');
  const providers = [...ts[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...py].sort(), [...providers].sort(),
    '배포 엔진이 아는 플랫폼과 실제 게시 함수가 아는 플랫폼이 다르다');
});

test('글자 한도가 실제로 게시하는 쪽과 같다', () => {
  // studio-social.js 의 LIMITS 가 사람이 누르는 화면의 값이다. 그쪽을 따른다.
  const ui = {};
  for (const [, k, v] of literal(studioJs, 'const LIMITS', '{')
    .matchAll(/(\w+)\s*:\s*(\d+)/g)) ui[k] = Number(v);

  const py = {};
  for (const [, k, v] of literal(contractPy, 'PLATFORM_LIMITS', '{')
    .matchAll(/"(\w+)"\s*:\s*(\d+)/g)) py[k] = Number(v);

  assert.deepEqual(py, ui, '초안이 통과하고 발행이 잘리는 상태다');
});

test('관리 화면 어휘가 계약의 값만 쓴다', () => {
  const elig = pyTuple(contractPy, 'ELIGIBILITY');
  const conf = pyTuple(contractPy, 'CONFIDENCE');
  const types = pyTuple(contractPy, 'CONTENT_TYPES');
  for (const k of jsKeys(adminJs, 'ELIG_KO')) assert.ok(elig.includes(k), `계약에 없는 자격: ${k}`);
  for (const k of jsKeys(adminJs, 'CONF_KO')) assert.ok(conf.includes(k), `계약에 없는 신뢰도: ${k}`);
  for (const k of jsKeys(adminJs, 'TYPE_KO')) assert.ok(types.includes(k), `계약에 없는 유형: ${k}`);
  // 반대 방향 — 계약에 있는데 화면이 모르는 값이 있으면 원문 그대로 나온다.
  const shownElig = new Set(jsKeys(adminJs, 'ELIG_KO'));
  for (const e of elig) assert.ok(shownElig.has(e), `관리 화면이 모르는 자격: ${e}`);
  const shownType = new Set(jsKeys(adminJs, 'TYPE_KO'));
  for (const t of types) assert.ok(shownType.has(t), `관리 화면이 모르는 유형: ${t}`);
  // 차단 사유도 화면이 전부 알아야 한다 — 모르면 영문 코드가 그대로 나간다.
  const blocks = Object.keys(pyDict(contractPy, 'BLOCK_REASONS'));
  const shownBlock = new Set(jsKeys(adminJs, 'BLOCK_KO'));
  for (const b of blocks) assert.ok(shownBlock.has(b), `관리 화면이 모르는 차단 사유: ${b}`);
});

test('관리 화면에 게시 버튼이 없다', () => {
  // ⚠️ 이 시험이 지키는 것: 이 화면은 자격증명을 만지지 않고 게시하지 않는다.
  assert.ok(!/action:\s*['"]publish['"]/.test(adminJs),
    '배포 관리 화면이 게시 함수를 부르고 있다');
  assert.ok(!/accessToken|SOCIAL_VAULT_KEY|pageAccessToken/.test(adminJs),
    '배포 관리 화면에 자격증명을 다루는 코드가 생겼다');
});

test('후보 생성 Lambda 는 후보라고 말하고 게시하지 않는다', () => {
  const handler = read('../aws/distribution/handler.py');
  assert.match(handler, /아무 곳에도 올라가지 않았습니다/,
    '후보를 게시물로 오해할 수 있는 색인이다');
  assert.ok(!/social-admin/.test(handler), '후보 생성 Lambda 에 게시 경로가 생겼다');
});

test('배포 관리 화면이 여는 파일 경로가 Lambda 가 쓰는 경로와 같다', () => {
  const handler = read('../aws/distribution/handler.py');
  const key = handler.match(/INDEX_KEY = "([^"]+)"/);
  const prefix = handler.match(/BODY_PREFIX = "([^"]+)"/);
  assert.ok(key && prefix);
  assert.ok(adminJs.includes(key[1]), `화면이 ${key[1]} 를 읽지 않는다`);
  assert.ok(adminJs.includes(prefix[1]), `화면이 ${prefix[1]} 를 읽지 않는다`);
});
