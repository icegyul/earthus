#!/usr/bin/env node
// 법적 문서 Markdown → 정적 HTML (2026-09-24, 앱 지시서 §2-1 법적 페이지 ①④ · §3-6 · §3-7)
//
// 왜 필요한가
//   처리방침·약관이 운영에서 `text/markdown` 으로 나간다(HTML 이 아니다). `/privacy`·`/privacy.html` 은 403.
//   Play 스토어 등록정보·앱 안·CWS 개인정보 관행 탭은 **HTML 페이지 URL** 을 요구한다. 계정 삭제 웹 링크도 필요하다.
//   그래서 prototype/legal/*.md 를 같은 폴더의 *.html 로 만든다 — 확장자가 .html 이라 S3 업로드 때
//   Content-Type 을 `text/html; charset=utf-8` 로 줄 수 있다(HANDOVER §3 — Content-Type 필수).
//
// ⚠️ 이 스크립트는 **파일만 만든다.** 올리지 않는다. 게시 여부·시점은 PD 가 정한다(초안은 법무 확인 전 게시 금지).
// ⚠️ 외부 라이브러리 없음(워크트리에 node_modules 가 없다) — 법적 문서에 쓰인 문법만 다루는 작은 변환기다:
//    제목 · 표 · 목록(중첩·이어지는 줄) · 인용 · 가로줄 · 굵게 · 기울임 · 인라인 코드 · 링크 · 맨 URL · HTML 주석(버림).
//    원문 HTML 은 **전부 이스케이프**한다(문서에 <script> 가 있어도 글자로 보인다).
// ⚠️ 초안(파일 이름에 `draft`)이면 맨 위에 'DRAFT — 게시 전 PD 법무 확인' 띠를 붙이고, 〔C01〕 같은 근거 꼬리표를 작게 보인다.
//    초안이 아니면 꼬리표를 지운다. 채우지 않은 {{자리표시자}} 는 초안·정본 모두 노란 표시 + 띠에 개수.
// ⚠️ 어두운 화면 전용(앱 지시서 §3-8 5 — 앱과 새 탭은 다크 전용). 글자 대비는 WCAG AA 이상 색만 쓴다.
//
// 실행
//   node tools/build-legal-html.mjs           # prototype/legal/*.md → *.html (README.md 제외)
//   node tools/build-legal-html.mjs --check   # 만들어 둔 .html 이 원문과 맞는지만 확인(다르면 종료 코드 1)

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LEGAL_DIR = path.resolve(HERE, '..', 'prototype', 'legal');
const SKIP = new Set(['README.md']);        // 개발자용 체크리스트 — 공개 법적 문서가 아니다

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ── 인라인 ─────────────────────────────────────────────────────
export function inline(text, { draft = false } = {}) {
  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;
  let s = String(text);
  // 인라인 코드 — 안쪽은 다른 규칙을 적용하지 않는다
  s = s.replace(/`([^`]+)`/g, (_, c) => keep(`<code>${esc(c)}</code>`));
  // 자리표시자
  s = s.replace(/\{\{([^{}]+)\}\}/g, (_, c) => keep(`<mark class="ph" title="채울 값">{{${esc(c)}}}</mark>`));
  // 링크 — http(s)·mailto·상대 경로만. javascript: 등은 글자로 둔다
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
    if (!/^(https?:\/\/|mailto:|\/|\.{0,2}\/|#|[\w.-]+\.html?\b)/i.test(href)) return m;
    return keep(`<a href="${esc(href)}">${inlineBasic(label)}</a>`);
  });
  // 맨 URL
  //   한글·전각 문장부호가 URL 바로 뒤에 붙어도(예: "earthus.net과") 주소에 넣지 않는다.
  s = s.replace(/https?:\/\/[^\s<>()|　-〿㄰-㆏가-힣，]+[^\s<>()|.,;:!?　-〿㄰-㆏가-힣，]/g,
    (u) => keep(`<a href="${esc(u)}">${esc(u)}</a>`));
  // 근거 꼬리표 〔C01〕·〔법정〕 — 초안에서만 보인다
  s = s.replace(/\s*〔([^〕]{1,20})〕/g, (_, r) => (draft ? keep(` <sup class="ref">${esc(r)}</sup>`) : ''));
  s = inlineBasic(s);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)]);
}

function inlineBasic(s) {
  // 이미 보관된 토큰(\u0000n\u0000)은 이스케이프 대상이 아니다 — 나머지만 이스케이프한다
  // (2026-09-24 정정) 처음엔 조각마다 굵게를 적용해 `**공고일 {{…}} · 시행일 {{…}}**` 처럼
  //   자리표시자를 감싼 굵게가 풀리지 않았다 → 이스케이프만 조각별로, 굵게·기울임은 이어 붙인 뒤 한 번에.
  let t = String(s).split(/(\u0000\d+\u0000)/)
    .map((part) => (/^\u0000\d+\u0000$/.test(part) ? part : esc(part))).join('');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
  return t;
}

// ── 블록 ───────────────────────────────────────────────────────
const RE_LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const RE_TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function splitRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
}

export function renderMarkdown(md, opts = {}) {
  // HTML 주석은 통째로 버린다(초안 머리 메모 — 게시 화면에 나오지 않는다)
  const src = String(md).replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  let tableNo = 0;

  const isBlank = (l) => !l || !l.trim();
  const startsBlock = (l, next) => /^#{1,6}\s/.test(l) || /^\s*>/.test(l) || RE_LIST.test(l)
    || /^\s*(-{3,}|\*{3,})\s*$/.test(l) || (/^\s*\|/.test(l) && next !== undefined && RE_TABLE_SEP.test(next));

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) { const n = h[1].length; out.push(`<h${n}>${inline(h[2], opts)}</h${n}>`); i++; continue; }

    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    if (/^\s*\|/.test(line) && RE_TABLE_SEP.test(lines[i + 1] || '')) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      tableNo++;
      const th = head.map((c) => `<th scope="col">${inline(c, opts)}</th>`).join('');
      const body = rows.map((r) => `<tr>${head.map((_, k) => `<td>${inline(r[k] ?? '', opts)}</td>`).join('')}</tr>`).join('\n');
      out.push(`<div class="table-wrap" role="region" aria-label="표 ${tableNo}" tabindex="0"><table>\n<thead><tr>${th}</tr></thead>\n<tbody>\n${body}\n</tbody></table></div>`);
      continue;
    }

    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      out.push(`<blockquote>\n${renderMarkdown(buf.join('\n'), opts)}\n</blockquote>`);
      continue;
    }

    if (RE_LIST.test(line)) {
      const { html, next } = parseList(lines, i, opts);
      out.push(html);
      i = next;
      continue;
    }

    // 문단 — 다음 빈 줄이나 다른 블록 시작까지
    const buf = [line.trim()];
    i++;
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i], lines[i + 1])) { buf.push(lines[i].trim()); i++; }
    out.push(`<p>${inline(buf.join(' '), opts)}</p>`);
  }
  return out.join('\n');
}

/** 목록: 들여쓰기로 중첩, 표시 없는 들여쓴 줄은 앞 항목에 이어 붙인다, 빈 줄 하나로는 끝나지 않는다. */
function parseList(lines, start, opts) {
  const items = [];      // { indent, ordered, text, children: [] }
  let i = start;
  const root = { indent: -1, children: items };
  const stack = [root];
  let last = null;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      // 빈 줄 뒤에 목록 항목이나 들여쓴 줄이 오면 같은 목록이다
      const nx = lines[i + 1];
      if (nx !== undefined && (RE_LIST.test(nx) || (/^\s{2,}\S/.test(nx) && last))) { i++; continue; }
      break;
    }
    const m = l.match(RE_LIST);
    if (m) {
      const indent = m[1].replace(/\t/g, '    ').length;
      const item = { indent, ordered: /\d/.test(m[2]), num: parseInt(m[2], 10), text: m[3], children: [] };
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
      stack[stack.length - 1].children.push(item);
      stack.push(item);
      last = item;
      i++;
      continue;
    }
    if (/^\s+\S/.test(l) && last) { last.text += ' ' + l.trim(); i++; continue; }
    break;
  }
  const render = (list) => {
    if (!list.length) return '';
    const ordered = list[0].ordered;
    const tag = ordered ? 'ol' : 'ul';
    const startAttr = ordered && list[0].num && list[0].num !== 1 ? ` start="${list[0].num}"` : '';
    return `<${tag}${startAttr}>\n${list.map((it) => `<li>${inline(it.text, opts)}${it.children.length ? '\n' + render(it.children) : ''}</li>`).join('\n')}\n</${tag}>`;
  };
  return { html: render(items), next: i };
}

// ── 페이지 ─────────────────────────────────────────────────────
const CSS = `
:root{color-scheme:dark;--bg:#0a0c10;--fg:#e8ebf0;--muted:#a9b1bd;--line:#2a313b;--card:#12161c;--link:#8cc8ff;--mark-bg:#ffd84d;--mark-fg:#111;--draft-bg:#5a1414;--draft-fg:#fff3f3;--code:#1b212a}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.7 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",system-ui,sans-serif;word-break:keep-all;overflow-wrap:anywhere}
.skip{position:absolute;left:-9999px;top:0;background:var(--fg);color:var(--bg);padding:8px 12px;z-index:10}
.skip:focus{left:16px;top:8px}
.draft{background:var(--draft-bg);color:var(--draft-fg);padding:12px 16px;border-bottom:2px solid #ff8a8a;font-weight:700}
.draft p{margin:0}
.draft small{display:block;font-weight:400;opacity:.95}
main{max-width:860px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:1.7rem;line-height:1.3;margin:.2em 0 .6em}
h2{font-size:1.3rem;margin:2em 0 .6em;padding-top:.6em;border-top:1px solid var(--line)}
h3,h4{font-size:1.08rem;margin:1.6em 0 .5em}
a{color:var(--link);text-underline-offset:2px}
a:focus-visible,.table-wrap:focus-visible{outline:3px solid var(--link);outline-offset:2px}
blockquote{margin:1em 0;padding:.6em 1em;border-left:4px solid var(--line);background:var(--card);color:var(--fg)}
blockquote p{margin:.3em 0}
.table-wrap{overflow-x:auto;margin:1em 0;border:1px solid var(--line);border-radius:6px}
table{border-collapse:collapse;width:100%;min-width:480px;font-size:.94rem}
th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
thead th{background:var(--card);color:var(--fg)}
tbody tr:last-child td{border-bottom:0}
code{background:var(--code);padding:1px 5px;border-radius:4px;font-size:.92em}
mark.ph{background:var(--mark-bg);color:var(--mark-fg);padding:0 3px;border-radius:3px}
sup.ref{color:var(--muted);font-size:.7em;margin-left:2px}
hr{border:0;border-top:1px solid var(--line);margin:2em 0}
footer{color:var(--muted);font-size:.85rem;margin-top:3em;border-top:1px solid var(--line);padding-top:1em}
`.trim();

export function isDraftName(file) { return /draft/i.test(path.basename(file)); }
export function langOf(file) { return /\.en[.-]/i.test(path.basename(file)) ? 'en' : 'ko'; }
export function outName(file) { return path.basename(file).replace(/\.md$/i, '.html'); }

export function buildPage(file, md) {
  const draft = isDraftName(file);
  const lang = langOf(file);
  const clean = String(md).replace(/<!--[\s\S]*?-->/g, '');
  const placeholders = (clean.match(/\{\{[^{}]+\}\}/g) || []).length;
  const h1 = clean.match(/^#\s+(.+)$/m);
  const title = h1 ? h1[1].replace(/[*`]/g, '').trim() : path.basename(file);
  const body = renderMarkdown(md, { draft });
  const ko = lang === 'ko';
  const banner = draft
    ? `<div class="draft" role="note"><p>DRAFT — 게시 전 PD 법무 확인 · Not published — pending legal review</p>`
      + `<small>${ko ? '이 페이지는 초안입니다. 법적 효력이 없습니다.' : 'This page is a draft and has no legal effect.'}`
      + `${placeholders ? (ko ? ` 채우지 않은 자리표시자 ${placeholders}개(노란 표시).` : ` ${placeholders} unfilled placeholder(s) highlighted in yellow.`) : ''}`
      + `${ko ? ' 작은 회색 꼬리표(C01 등)는 근거가 된 수집 목록 표의 행 번호입니다.' : ' Small grey tags (C01 etc.) are rows of the data inventory this text is based on.'}</small></div>`
    : (placeholders ? `<div class="draft" role="note"><p>${ko ? `채우지 않은 자리표시자 ${placeholders}개` : `${placeholders} unfilled placeholder(s)`}</p></div>` : '');
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0a0c10">
${draft ? '<meta name="robots" content="noindex, nofollow">\n' : ''}<title>${esc(title)}${draft ? ' (DRAFT)' : ''} — EARTHUS</title>
<style>
${CSS}
</style>
</head>
<body>
<a class="skip" href="#main">${ko ? '본문 바로가기' : 'Skip to content'}</a>
${banner}
<main id="main">
${body}
<footer>${ko ? '원문' : 'Source'}: <code>prototype/legal/${esc(path.basename(file))}</code> · ${ko ? '이 페이지는 tools/build-legal-html.mjs 가 만든 것입니다. 직접 고치지 말고 원문 .md 를 고치세요.' : 'Generated by tools/build-legal-html.mjs — edit the .md source, not this file.'}</footer>
</main>
</body>
</html>
`;
}

export async function listSources(dir = LEGAL_DIR) {
  return (await readdir(dir)).filter((f) => f.endsWith('.md') && !SKIP.has(f)).sort();
}

async function main(argv) {
  const check = argv.includes('--check');
  const files = await listSources();
  let stale = 0;
  for (const f of files) {
    const md = await readFile(path.join(LEGAL_DIR, f), 'utf8');
    const html = buildPage(f, md);
    const target = path.join(LEGAL_DIR, outName(f));
    if (check) {
      let cur = null;
      try { cur = await readFile(target, 'utf8'); } catch { /* 없음 */ }
      if (cur !== html) { stale++; console.log(`STALE ${outName(f)}`); } else console.log(`ok    ${outName(f)}`);
    } else {
      await writeFile(target, html, 'utf8');
      const ph = (md.replace(/<!--[\s\S]*?-->/g, '').match(/\{\{[^{}]+\}\}/g) || []).length;
      console.log(`wrote ${outName(f)}  ${isDraftName(f) ? 'DRAFT ' : '      '}lang=${langOf(f)} placeholders=${ph} bytes=${Buffer.byteLength(html)}`);
    }
  }
  if (check && stale) { console.log(`${stale} file(s) out of date — run: node tools/build-legal-html.mjs`); process.exitCode = 1; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
