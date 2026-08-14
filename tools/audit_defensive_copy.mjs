import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const jsRoot = join(root, 'prototype/js');
const excluded = [
  /\/changelog\.js$/,
  /\/studio(?:-social)?\.js$/,
  /\/social-settings\.js$/,
  /\/ui-dev\.js$/,
  /\/ui-apikeys\.js$/,
  /\/research\.js$/,
  /\/lab-reports(?:-page)?\.js$/,
  /\/ui-lab-reports\.js$/,
  /\/verify\.js$/,
  /\/aetherus-device-qa\.js$/,
];
const suspect = /⚠️|저희|지어내|알고 있는 척|말하지 않습니다|판단하지 않습니다|단정하지 않습니다|대체하지 않습니다|대신하지 않습니다|다시 매기지 않습니다|(?:보여주|바꾸|계산|저장|사용|쓰|섞|평균내|그리|표시|포함|연결|공개|수집|전송|추적|번역|복제|게시|업로드|판매|결제|받|묻|노출|자동)[^.!?\n]{0,45}않습니다|보장(?:한 것은 아니|하지)|뜻하지 않습니다|의미하지 않습니다|참고용|이걸로 못 하는 것|(?:우리는|우리가|earthus\s*는)[^.!?\n]{0,80}(?:하지|않|못)|what this cannot do|\bwe\s+(?:do not|don't|cannot|never|will not)|earthus does not|does not pretend|do not (?:invent|fabricate|claim)|cannot (?:confirm|verify)|does not (?:mean|replace|guarantee)|not (?:a |an )?(?:forecast|official|live|real-time)/i;
const longDefence = /아니|않|못|없(?:습니다|다|으며|어서|는)|지 않|금지|제외|한계|참고|추정|오류|실패|cannot|could not|does not|do not|don't|never|\bnot\b|unavailable|failed|\blimit(?:ed|s)?\b/i;

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : path.endsWith('.js') ? [path] : [];
  });
}

function strings(source) {
  const found = [];
  let i = 0;
  let line = 1;
  let previous = 'start';

  const regexCanStartAfter = new Set([
    'start', '(', '[', '{', ',', ';', ':', '=', '!', '?', '&', '|', '+', '-',
    '*', '%', '~', '^', '<', '>', 'return', 'throw', 'case', 'delete', 'void',
    'typeof', 'instanceof', 'in', 'of', 'yield', 'await', 'else', 'do',
  ]);

  function skipQuoted(quote) {
    const startLine = line;
    let value = '';
    i += 1;
    const start = i;
    while (i < source.length) {
      const current = source[i];
      if (current === '\\') {
        value += current + (source[i + 1] || '');
        i += 2;
        continue;
      }
      if (current === quote) {
        found.push({ line: startLine, value, start, end: i });
        i += 1;
        previous = 'value';
        return;
      }
      if (current === '\n') line += 1;
      value += current;
      i += 1;
    }
    found.push({ line: startLine, value, start, end: i });
    previous = 'value';
  }

  function skipRegex() {
    i += 1;
    let inClass = false;
    while (i < source.length) {
      const current = source[i];
      if (current === '\\') { i += 2; continue; }
      if (current === '[') { inClass = true; i += 1; continue; }
      if (current === ']') { inClass = false; i += 1; continue; }
      if (current === '/' && !inClass) {
        i += 1;
        while (/[a-z]/i.test(source[i] || '')) i += 1;
        previous = 'value';
        return;
      }
      if (current === '\n') return;
      i += 1;
    }
  }

  function skipTemplate() {
    let chunkLine = line;
    let value = '';
    i += 1;
    let chunkStart = i;
    while (i < source.length) {
      const current = source[i];
      if (current === '\\') {
        value += current + (source[i + 1] || '');
        i += 2;
        continue;
      }
      if (current === '`') {
        if (value) found.push({ line: chunkLine, value, start: chunkStart, end: i });
        i += 1;
        previous = 'value';
        return;
      }
      if (current === '$' && source[i + 1] === '{') {
        if (value) found.push({ line: chunkLine, value, start: chunkStart, end: i });
        value = '';
        i += 2;
        let depth = 1;
        const savedPrevious = previous;
        previous = '{';
        while (i < source.length && depth > 0) {
          const c = source[i];
          const n = source[i + 1];
          if (c === '\n') { line += 1; i += 1; continue; }
          if (c === '/' && n === '/') {
            i += 2;
            while (i < source.length && source[i] !== '\n') i += 1;
            continue;
          }
          if (c === '/' && n === '*') {
            i += 2;
            while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
              if (source[i] === '\n') line += 1;
              i += 1;
            }
            i += 2;
            continue;
          }
          if (c === "'" || c === '"') { skipQuoted(c); continue; }
          if (c === '`') { skipTemplate(); continue; }
          if (c === '/' && regexCanStartAfter.has(previous)) { skipRegex(); continue; }
          if (c === '{') { depth += 1; previous = '{'; i += 1; continue; }
          if (c === '}') { depth -= 1; previous = '}'; i += 1; continue; }
          if (/[$A-Z_a-z]/.test(c)) {
            const start = i;
            i += 1;
            while (/[$\w]/.test(source[i] || '')) i += 1;
            previous = source.slice(start, i);
            continue;
          }
          if (!/\s/.test(c)) previous = c;
          i += 1;
        }
        previous = savedPrevious;
        chunkLine = line;
        chunkStart = i;
        continue;
      }
      if (current === '\n') line += 1;
      value += current;
      i += 1;
    }
  }

  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];
    if (char === '\n') { line += 1; i += 1; continue; }
    if (char === '/' && next === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') line += 1;
        i += 1;
      }
      i += 2;
      continue;
    }
    if (char === "'" || char === '"') { skipQuoted(char); continue; }
    if (char === '`') { skipTemplate(); continue; }
    if (char === '/' && regexCanStartAfter.has(previous)) { skipRegex(); continue; }
    if (/[$A-Z_a-z]/.test(char)) {
      const start = i;
      i += 1;
      while (/[$\w]/.test(source[i] || '')) i += 1;
      previous = source.slice(start, i);
      continue;
    }
    if (!/\s/.test(char)) previous = char;
    i += 1;
  }
  return found;
}

function iconCleanupPatch(onlyFile = null) {
  const patches = [];
  for (const path of files(jsRoot)) {
    if (excluded.some(pattern => pattern.test(path))) continue;
    if (onlyFile && relative(root, path) !== onlyFile) continue;
    const source = readFileSync(path, 'utf8');
    const ranges = strings(source).filter(item => /⚠️/.test(item.value));
    if (!ranges.length) continue;
    let cleaned = source;
    for (const item of ranges.slice().sort((a, b) => b.start - a.start)) {
      const value = cleaned.slice(item.start, item.end).replace(/⚠️+/g, '');
      cleaned = cleaned.slice(0, item.start) + value + cleaned.slice(item.end);
    }
    if (cleaned === source) continue;
    const before = source.split('\n');
    const after = cleaned.split('\n');
    const changed = [];
    for (let line = 0; line < before.length; line += 1) {
      if (before[line] !== after[line]) changed.push(line);
    }
    if (!changed.length) continue;
    patches.push(`*** Update File: ${path}`);
    const first = changed[0];
    const last = changed[changed.length - 1];
    const from = Math.max(0, first - 1);
    const to = Math.min(before.length - 1, last + 1);
    patches.push('@@');
    for (let line = from; line <= to; line += 1) {
      if (before[line] !== after[line]) {
        patches.push(`-${before[line]}`);
        patches.push(`+${after[line]}`);
      } else {
        patches.push(` ${before[line]}`);
      }
    }
  }
  console.log(['*** Begin Patch', ...patches, '*** End Patch'].join('\n'));
}

const patchIconsArg = process.argv.find(arg => arg === '--patch-icons' || arg.startsWith('--patch-icons='));
if (patchIconsArg) {
  iconCleanupPatch(patchIconsArg.includes('=') ? patchIconsArg.slice(patchIconsArg.indexOf('=') + 1) : null);
  process.exit(0);
}

const findings = [];
for (const path of files(jsRoot)) {
  if (excluded.some(pattern => pattern.test(path))) continue;
  for (const item of strings(readFileSync(path, 'utf8'))) {
    const plain = item.value.replace(/\\n|\s+/g, ' ').trim();
    if (!suspect.test(item.value) && !(plain.length >= 120 && longDefence.test(plain))) continue;
    findings.push({
      file: relative(root, path),
      line: item.line,
      text: plain,
    });
  }
}

for (const finding of findings) {
  console.log(`${finding.file}:${finding.line}: ${finding.text}`);
}
console.log(`defensive-copy findings: ${findings.length}`);
if (process.argv.includes('--check') && findings.length) process.exitCode = 1;
