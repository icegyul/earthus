#!/usr/bin/env node
// v1(earthus.net/) 정적 모듈 modulepreload 목록 — 만들고, 어긋났는지 검사한다. (2026-09-23, docs/PERF-LTE-PLAN-2026-09-23.md V1-5)
//
//   node tools/v1-modulepreload.mjs --write    prototype/index.html 의 표식 사이를 다시 쓴다(같으면 안 건드린다)
//   node tools/v1-modulepreload.mjs --check    index.html 목록이 지금 import 그래프와 다르면 1 로 끝난다
//   node tools/v1-modulepreload.mjs --json     계산한 그래프를 JSON 으로(시험·측정 스크립트가 쓴다)
//   (--check·--json 에 --index=<사본> 을 주면 그 HTML 을 읽는다)
//
// ── 왜 ─────────────────────────────────────────────────────────────────────────────────────────────
//   v1 은 빌드 없이 배포한다(HANDOVER §3). 그래서 main.js 가 부르는 모듈 108개를 브라우저가
//   문서 → main.js → 1단 37개 → 2단 51개 → 3단 19개 순서로 **받아 봐야 다음을 안다** — 왕복 5번이 줄을 선다.
//   (실측: 재방문 0.85 s 를 이 사슬이 거의 다 설명한다 — PERF-LTE-PLAN §2 원인 3)
//   <link rel="modulepreload"> 로 전부를 문서에 적어 두면 첫 왕복에 한꺼번에 받는다.
//
// ── 지킬 것 ────────────────────────────────────────────────────────────────────────────────────────
//   ⚠️ href 는 import 문자열이 가리키는 주소와 **글자 하나까지** 같아야 한다(?v= 포함).
//      main.js:2-3 — "viewer.js 는 싱글턴이다. 한 import 에만 ?v= 를 붙이면 인스턴스가 둘로 갈라진다."
//      modulepreload 가 다른 주소를 받아 두면 그건 쓰이지 않는 중복 다운로드일 뿐 옛 코드가 뜨지는 않지만,
//      이득이 사라진다. 그래서 목록은 손으로 쓰지 않고 이 도구가 그래프에서 만든다.
//   ⚠️ 배포 때 만들지 않는다. 소스(index.html)에 박아 두고 npm test(tools/earthus-v53/v1-modulepreload.test.mjs)가
//      그래프와 어긋나면 떨어뜨린다. import 를 더하거나 ?v= 를 바꾸면 `--write` 한 번이면 된다.
//   ⚠️ 파일 이름을 바꾸지 않는다 — v2 가 v1 모듈을 /js/ 절대경로로 빌려 쓴다(v2-deploy/js/ext/CONTRACT.md:38).
//
// ── 어떻게 읽나 ────────────────────────────────────────────────────────────────────────────────────
//   정규식으로 import 를 긁지 않는다(주석·문자열 안의 'import' 에 속는다). V8 이 모듈로 파싱해 준 요청 목록
//   (vm.SourceTextModule#moduleRequests)을 그대로 쓴다 — 동적 import() 는 여기 안 들어온다(늦게 받는 것이 맞다).
//   이 API 는 --experimental-vm-modules 가 있어야 열린다. 없이 부르면 스스로 그 플래그를 붙여 다시 돈다.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(SELF), '..');
export const V1_ROOT = path.join(REPO, 'prototype');
export const V1_INDEX = path.join(V1_ROOT, 'index.html');
// v1 문서는 사이트 뿌리(/)에 있다. 상대 href 는 이 주소를 기준으로 푼다.
export const DOC_URL = 'https://earthus.net/';
export const BEGIN = '<!-- modulepreload:begin -->';
export const END = '<!-- modulepreload:end -->';
/* 읽지 않고 잎(leaf)으로 두는 파일.
   ⚠️ js/config.local.js 는 git 제외 대상이고 키 값이 들어 있다 — 도구가 내용을 읽지 않는다.
      2026-09-23 기준 이 파일에는 import 가 없다. import 가 생기면 그 모듈은 목록에서 빠질 뿐
      (미리 받지 않을 뿐) 동작은 그대로다. 깨끗한 저장소(파일 없음)에서도 시험이 돈다. */
const LEAF_UNREAD = new Set(['js/config.local.js']);

const lf = (s) => s.replace(/\r\n/g, '\n');

/** index.html 의 <script type="module" src> — 진입점. 여러 개면 모두. */
export function moduleEntries(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = m[1];
    if (!/\btype\s*=\s*["']module["']/i.test(attrs)) continue;
    const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (src) out.push(src[1]);
  }
  return out;
}

/** 문서 기준 상대 href — 문서가 뿌리에 있으므로 경로 앞 '/' 만 떼고 쿼리는 그대로 둔다. */
export function hrefFor(url) {
  const u = new URL(url);
  const doc = new URL(DOC_URL);
  if (u.origin !== doc.origin) throw new Error(`다른 출처 모듈: ${url}`);
  return u.pathname.replace(/^\//, '') + u.search;
}

function fileFor(url) {
  const rel = decodeURIComponent(new URL(url).pathname).replace(/^\//, '');
  const abs = path.resolve(V1_ROOT, rel);
  if (!abs.startsWith(V1_ROOT + path.sep)) throw new Error(`prototype/ 밖을 가리킨다: ${url}`);
  return { rel, abs };
}

function requireVmModules() {
  if (typeof vm.SourceTextModule !== 'function') {
    throw new Error('vm.SourceTextModule 이 없다 — node --experimental-vm-modules 로 실행해야 한다');
  }
}

/** 정적 import 그래프를 너비 우선으로 훑는다. 진입점 → 1단 → 2단 … 순서가 곧 목록 순서다. */
export function computeGraph(html = lf(fs.readFileSync(V1_INDEX, 'utf8'))) {
  requireVmModules();
  const entries = moduleEntries(html).map((s) => new URL(s, DOC_URL).href);
  if (!entries.length) throw new Error('index.html 에 <script type="module" src> 가 없다');
  const seen = new Map();            // url → { url, href, file, depth }
  const external = [];
  const queue = entries.map((url) => ({ url, depth: 1, from: DOC_URL }));
  while (queue.length) {
    const { url, depth, from } = queue.shift();
    if (seen.has(url)) continue;
    const { rel, abs } = fileFor(url);
    const node = { url, href: hrefFor(url), file: rel, depth };
    seen.set(url, node);
    if (LEAF_UNREAD.has(rel)) { node.unread = true; continue; }
    let src;
    try { src = fs.readFileSync(abs, 'utf8'); }
    catch (_) { throw new Error(`없는 모듈: ${rel} (${from} 가 부른다)`); }
    let mod;
    try { mod = new vm.SourceTextModule(src, { identifier: url }); }
    catch (e) { throw new Error(`모듈로 파싱되지 않는다: ${rel} — ${e.message}`); }
    const specs = mod.moduleRequests ? mod.moduleRequests.map((r) => r.specifier) : mod.dependencySpecifiers;
    for (const spec of specs) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(spec)) { external.push({ from: rel, spec }); continue; }
      if (!/^(\.{1,2}\/|\/)/.test(spec)) throw new Error(`브라우저가 못 푸는 bare 지정자: '${spec}' (${rel})`);
      queue.push({ url: new URL(spec, url).href, depth: depth + 1, from: rel });
    }
  }
  const modules = [...seen.values()];
  // 같은 파일이 두 주소(?v= 가 다르거나 없거나)로 불리면 브라우저에는 인스턴스가 둘 생긴다 — main.js:2-3 의 함정.
  const byFile = new Map();
  for (const m of modules) byFile.set(m.file, [...(byFile.get(m.file) || []), m.href]);
  const dupFiles = [...byFile].filter(([, hrefs]) => hrefs.length > 1).map(([file, hrefs]) => ({ file, hrefs }));
  return { doc: DOC_URL, entries, modules, external, dupFiles };
}

export function renderBlock(modules, eol = '\n') {
  return [BEGIN, ...modules.map((m) => `<link rel="modulepreload" href="${m.href}">`), END].join(eol);
}

/** index.html 안의 표식 사이 목록(글자 그대로). 표식이 없거나 둘 이상이면 null. */
export function currentBlock(html) {
  const a = html.indexOf(BEGIN), b = html.indexOf(END);
  if (a < 0 || b < 0 || b < a || html.indexOf(BEGIN, a + 1) >= 0 || html.indexOf(END, b + 1) >= 0) return null;
  return html.slice(a, b + END.length);
}

function main(argv) {
  const mode = argv.includes('--write') ? 'write' : argv.includes('--json') ? 'json' : 'check';
  // --index=<파일> : 다른 사본을 검사한다(시험이 일부러 어긋난 사본으로 '떨어지는지'를 본다). 모듈은 늘 prototype/ 에서 읽는다.
  const indexArg = argv.find((a) => a.startsWith('--index='));
  const indexFile = indexArg ? path.resolve(indexArg.slice('--index='.length)) : V1_INDEX;
  if (mode === 'write' && indexFile !== V1_INDEX) { console.error('✗ --write 는 prototype/index.html 에만 쓴다'); return 1; }
  const raw = fs.readFileSync(indexFile, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const g = computeGraph(lf(raw));
  if (mode === 'json') { process.stdout.write(JSON.stringify(g, null, 1) + '\n'); return 0; }
  if (g.dupFiles.length) {
    console.error('✗ 같은 모듈이 두 주소로 불린다(싱글턴이 갈라진다 — main.js:2-3):');
    for (const d of g.dupFiles) console.error(`   ${d.file}: ${d.hrefs.join(' · ')}`);
    if (mode === 'check') return 1;
  }
  const want = renderBlock(g.modules, eol);
  const have = currentBlock(raw);
  if (mode === 'write') {
    if (have == null) {
      console.error(`✗ index.html 에 표식이 없다(또는 둘 이상이다) — ${BEGIN} … ${END} 를 <head> 안 스타일시트 뒤에 한 번 넣고 다시 돌린다`);
      return 1;
    }
    if (have === want) { console.log(`= 그대로다 (${g.modules.length}개)`); return 0; }
    fs.writeFileSync(V1_INDEX, raw.replace(have, () => want));
    console.log(`✓ 다시 썼다 — modulepreload ${g.modules.length}개 (깊이 ${Math.max(...g.modules.map((m) => m.depth))}단)`);
    return 0;
  }
  if (have == null) { console.error('✗ index.html 에 modulepreload 표식이 없다'); return 1; }
  if (have !== want) {
    const cur = new Set([...have.matchAll(/href="([^"]+)"/g)].map((m) => m[1]));
    const need = new Set(g.modules.map((m) => m.href));
    const missing = [...need].filter((h) => !cur.has(h));
    const extra = [...cur].filter((h) => !need.has(h));
    console.error('✗ modulepreload 목록이 지금 import 그래프와 다르다 → node tools/v1-modulepreload.mjs --write');
    if (missing.length) console.error('   빠짐: ' + missing.join(', '));
    if (extra.length) console.error('   남음: ' + extra.join(', '));
    if (!missing.length && !extra.length) console.error('   (순서만 다르다)');
    return 1;
  }
  console.log(`✓ modulepreload ${g.modules.length}개가 import 그래프와 같다`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  if (typeof vm.SourceTextModule !== 'function') {
    // 플래그 없이 불렸다 — 같은 인자로 플래그를 붙여 다시 돈다.
    const r = spawnSync(process.execPath, ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning', SELF, ...process.argv.slice(2)], { stdio: 'inherit' });
    process.exit(r.status ?? 1);
  }
  process.exit(main(process.argv.slice(2)));
}
