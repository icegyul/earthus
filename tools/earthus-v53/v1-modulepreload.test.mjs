// v1(earthus.net/) modulepreload 목록 잠금 — 2026-09-23, docs/PERF-LTE-PLAN-2026-09-23.md V1-5.
//
// prototype/index.html 의 <link rel="modulepreload"> 는 main.js 가 **정적으로** 부르는 모듈 전부와 같아야 한다.
//   · 빠지면: 그 모듈은 옛날처럼 사슬 끝에서야 요청된다(왕복이 다시 준다).
//   · 남거나 주소가 다르면: 쓰이지 않는 중복 다운로드다 — 특히 ?v= 가 다르면 같은 파일이 다른 모듈로 받아진다
//     (main.js:2-3 — viewer.js 싱글턴이 갈라지는 함정과 같은 뿌리).
// 그래프는 시험 때마다 새로 계산한다(스냅샷을 비교하지 않는다). import 를 바꿨으면:
//     node tools/v1-modulepreload.mjs --write
// 결과로 본다: 목록이 **있어야** 하고(108개 전후), 각 href 가 import 가 푸는 주소와 글자 그대로 같아야 통과다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const GEN = path.join(REPO, 'tools', 'v1-modulepreload.mjs');
const INDEX = path.join(REPO, 'prototype', 'index.html');
const DOC = 'https://earthus.net/';
const NODE_FLAGS = ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'];

// 생성기는 V8 파서(vm.SourceTextModule)를 쓴다 — npm test 에는 그 플래그가 없으므로 자식 프로세스로 부른다.
const graph = JSON.parse(execFileSync(process.execPath, [...NODE_FLAGS, GEN, '--json'], { encoding: 'utf8' }));
const html = readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');
const links = [...html.matchAll(/<link\b[^>]*\brel\s*=\s*["']modulepreload["'][^>]*>/gi)].map((m) => m[0]);
const hrefs = links.map((l) => (l.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1]);

test('정적 import 그래프를 실제로 읽었다 — 진입점은 index.html 의 main.js 이고 모듈이 여러 단이다', () => {
  assert.deepEqual(graph.entries.length, 1, 'v1 의 module 스크립트는 main.js 하나');
  assert.match(graph.entries[0], /\/js\/main\.js(\?|$)/);
  assert.ok(graph.modules.length >= 80, `모듈이 너무 적다(${graph.modules.length}) — 그래프를 못 읽었다`);
  assert.ok(Math.max(...graph.modules.map((m) => m.depth)) >= 3, '사슬이 여러 단이어야 이 목록이 의미가 있다');
  assert.deepEqual(graph.external, [], '다른 출처 정적 import 가 생겼다 — 목록 규칙을 다시 볼 것');
});

test('index.html 의 modulepreload 가 import 그래프와 정확히 같다 (?v= 까지)', () => {
  assert.ok(links.length > 0, 'modulepreload 목록이 없다 → node tools/v1-modulepreload.mjs --write');
  assert.equal(new Set(hrefs).size, hrefs.length, '같은 href 가 두 번 있다');
  // 비교는 브라우저가 실제로 푸는 절대 주소로 한다.
  const have = hrefs.map((h) => new URL(h, DOC).href).sort();
  const want = graph.modules.map((m) => m.url).sort();
  const missing = want.filter((u) => !have.includes(u));
  const extra = have.filter((u) => !want.includes(u));
  assert.deepEqual({ missing, extra }, { missing: [], extra: [] },
    'modulepreload 목록이 그래프와 다르다 → node tools/v1-modulepreload.mjs --write');
  // 글자 그대로도 같아야 한다 — 쿼리 순서·인코딩이 달라도 주소가 달라진다.
  for (const m of graph.modules) assert.ok(hrefs.includes(m.href), `href 글자 불일치: ${m.href}`);
  // ?v= 가 붙은 import 는 그 쿼리째 적혀 있어야 한다.
  const versioned = graph.modules.filter((m) => m.href.includes('?'));
  assert.ok(versioned.length >= 1);
  for (const m of versioned) assert.ok(hrefs.includes(m.href), `?v= 가 빠졌다: ${m.href}`);
});

test('목록은 표식 한 쌍 안에만 있고, 생성기 검사(--check)도 통과한다', () => {
  const a = html.indexOf('<!-- modulepreload:begin -->');
  const b = html.indexOf('<!-- modulepreload:end -->');
  assert.ok(a >= 0 && b > a, '표식이 없다');
  assert.equal(html.indexOf('<!-- modulepreload:begin -->', a + 1), -1, '표식이 둘 이상');
  const head = html.slice(0, html.indexOf('</head>'));
  assert.ok(b < head.length, '목록은 <head> 안에 있어야 한다');
  for (const l of links) {
    const at = html.indexOf(l);
    assert.ok(at > a && at < b, `표식 밖의 modulepreload: ${l}`);
    // 같은 출처 모듈이라 속성이 필요 없다. use-credentials 가 붙으면 <script type=module> 과 자격 증명 방식이 달라
    // 모듈 맵에서 다른 항목이 된다(미리 받은 것을 안 쓴다) — 아예 두지 않는다.
    assert.doesNotMatch(l, /crossorigin/i, `modulepreload 에 crossorigin 이 붙었다: ${l}`);
  }
  const r = spawnSync(process.execPath, [...NODE_FLAGS, GEN, '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test('목록이 그래프에서 어긋나면 검사가 떨어진다 — 한 줄 빠짐 · ?v= 바뀜', () => {
  // 운영 index.html 은 건드리지 않는다. 임시 사본을 일부러 어긋나게 만들어 --check 가 1 로 끝나는지 본다.
  const dir = mkdtempSync(path.join(tmpdir(), 'v1-mp-'));
  try {
    const versioned = graph.modules.find((m) => m.href.includes('?v=') && m.depth > 1);
    const dropped = graph.modules.find((m) => m.depth > 2 && !m.href.includes('?'));
    const cases = {
      dropped: html.replace(`<link rel="modulepreload" href="${dropped.href}">\n`, ''),
      version: html.replace(`href="${versioned.href}"`, `href="${versioned.href.replace(/\?v=[^"]*/, '?v=stale')}"`),
    };
    for (const [name, text] of Object.entries(cases)) {
      assert.notEqual(text, html, `${name}: 사본이 안 바뀌었다`);
      const file = path.join(dir, `${name}.html`);
      writeFileSync(file, text);
      const r = spawnSync(process.execPath, [...NODE_FLAGS, GEN, '--check', `--index=${file}`], { encoding: 'utf8' });
      assert.equal(r.status, 1, `${name}: 어긋났는데 통과했다`);
      assert.match(r.stderr, /빠짐|남음/, `${name}: 무엇이 어긋났는지 말하지 않는다`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('같은 파일이 두 주소로 불리지 않는다 (main.js:2-3 싱글턴 함정)', () => {
  assert.deepEqual(graph.dupFiles, [], `같은 모듈이 다른 주소로 불린다: ${JSON.stringify(graph.dupFiles)}`);
});

test('목록의 모든 파일이 실제로 있다 (config.local.js 는 git 제외 파일이라 없어도 된다)', () => {
  for (const m of graph.modules) {
    if (m.unread) continue;
    assert.ok(existsSync(path.join(REPO, 'prototype', m.file)), `없는 파일: ${m.file}`);
  }
});
