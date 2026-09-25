// Pleos 시험 공용 도우미. 모든 경로는 이 파일 위치 기준(저장소 상대)이다.
//
// - moduleGraph(): 진입 파일에서 상대 import(정적·동적)를 따라가 모듈 그래프를 만든다.
// - importPrototype(): prototype/js 를 임시 폴더에 복사하고 {"type":"module"} 을 붙여 import 한다.
//   (.js 가 CommonJS 로 해석되는 Node 버전에서도 같은 결과를 내기 위해서다 — 기존 시험의 data: URL 방식과 같은 목적)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROTOTYPE = path.join(ROOT, 'prototype');
export const rel = p => path.relative(ROOT, p).split(path.sep).join('/');

const IMPORT_RE = /(?:^|[;\s])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:^|[;\s])import\s*['"]([^'"]+)['"]/gm;

/** 진입 파일에서 닿는 모든 모듈. { files: Map<abs, {deps:[abs], missing:bool, nonRelative:[spec], computedImport:bool}> } */
export function moduleGraph(entryAbs) {
  const files = new Map();
  const stack = [path.resolve(entryAbs)];
  while (stack.length) {
    const file = stack.pop();
    if (files.has(file)) continue;
    let src;
    try { src = fs.readFileSync(file, 'utf8'); } catch { files.set(file, { deps: [], missing: true, nonRelative: [], computedImport: false }); continue; }
    const deps = []; const nonRelative = [];
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1] || m[2] || m[3];
      if (!spec.startsWith('.')) { nonRelative.push(spec); continue; }
      const target = path.resolve(path.dirname(file), spec.split('?')[0]);
      deps.push(target); stack.push(target);
    }
    // import(변수) 처럼 정적으로 따라갈 수 없는 동적 import 는 따로 표시한다.
    const computedImport = /import\s*\(\s*(?!['"])/.test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''));
    files.set(file, { deps, missing: false, nonRelative, computedImport });
  }
  return files;
}

/** HTML 안의 module script src (상대 경로) */
export function htmlModuleEntries(htmlAbs) {
  const html = fs.readFileSync(htmlAbs, 'utf8');
  return [...html.matchAll(/<script[^>]*type=["']module["'][^>]*src=["']([^"'?]+)[^"']*["']/g)]
    .map(m => path.resolve(path.dirname(htmlAbs), m[1]));
}

let tmpRoot = null;
function ensureCopy() {
  if (tmpRoot) return tmpRoot;
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'earthus-pleos-'));
  fs.cpSync(path.join(PROTOTYPE, 'js'), path.join(tmpRoot, 'js'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'package.json'), '{"type":"module"}');
  process.on('exit', () => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {} });
  return tmpRoot;
}

/** 브라우저 전역 중 import 순간에 읽히는 것만 최소로 채운다 (config.js 의 location, i18n.js 의 localStorage). */
export function stubBrowserGlobals() {
  if (!globalThis.location) globalThis.location = { hostname: 'localhost', search: '', href: 'http://localhost/prototype/pleos.html' };
  if (!globalThis.localStorage) {
    const m = new Map();
    globalThis.localStorage = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  }
}

export async function importPrototype(relPath) {
  stubBrowserGlobals();
  const root = ensureCopy();
  return import(pathToFileURL(path.join(root, relPath.replace(/^prototype\//, ''))).href);
}

/** 확인할 수 없는 항목은 PASS 가 아니라 SKIP 으로 적는다 (V38.1 §16 "확인하지 않은 항목을 PASS 라고 쓰지 마라"). */
export class Skip extends Error {}

/** 작은 시험 러너 (기존 tools/test_*.mjs 와 같은 모양) */
export function createRunner(title) {
  const tests = [];
  return {
    test: (name, fn) => tests.push({ name, fn }),
    async run() {
      let failed = 0; let skipped = 0;
      for (const t of tests) {
        try { await t.fn(); console.log(`  PASS  ${t.name}`); } catch (e) {
          if (e instanceof Skip) { skipped++; console.log(`  SKIP  ${t.name} — ${e.message}`); continue; }
          failed++; console.log(`  FAIL  ${t.name}\n        ${e?.stack?.split('\n').slice(0, 3).join('\n        ')}`);
        }
      }
      const passed = tests.length - failed - skipped;
      console.log(`${title}: ${passed}/${tests.length} PASS${skipped ? ` · ${skipped} SKIP` : ''}${failed ? ` · ${failed} FAIL` : ''}`);
      if (failed) process.exitCode = 1;
      return { total: tests.length, failed, skipped };
    },
  };
}
