// tools/build-legal-html.mjs 시험 (2026-09-24)
// 결과 기준: 표·목록·인용이 HTML 구조로 나와야 통과, 초안이면 DRAFT 띠와 자리표시자 표시가 **보여야** 통과,
//           만들어 둔 prototype/legal/*.html 이 원문과 같아야 통과(--check).
// 실행: node --test tools/test_build_legal_html.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renderMarkdown, inline, buildPage, isDraftName, langOf, outName, LEGAL_DIR } from './build-legal-html.mjs';

test('표 — thead/th scope, 셀 수는 머리줄을 따른다, 표마다 스크롤 영역', () => {
  const html = renderMarkdown('| 구분 | 내용 |\n|---|---|\n| 상호 | {{상호}} |\n| 이메일 | a@b.c |');
  assert.match(html, /<div class="table-wrap" role="region" aria-label="표 1" tabindex="0"><table>/);
  assert.match(html, /<th scope="col">구분<\/th><th scope="col">내용<\/th>/);
  assert.match(html, /<td>상호<\/td><td><mark class="ph"[^>]*>\{\{상호\}\}<\/mark><\/td>/);
  assert.equal((html.match(/<tr>/g) || []).length, 3);
});

test('목록 — 번호 목록 안의 중첩 글머리, 들여쓴 이어지는 줄은 앞 항목에 붙는다', () => {
  const md = '1. 첫째 항목이\n   이어진다\n2. 둘째\n   - 가\n   - 나\n3. 셋째';
  const html = renderMarkdown(md);
  assert.match(html, /^<ol>/);
  assert.match(html, /<li>첫째 항목이 이어진다<\/li>/);
  assert.match(html, /<li>둘째\n<ul>\n<li>가<\/li>\n<li>나<\/li>\n<\/ul><\/li>/);
  assert.match(html, /<li>셋째<\/li>\n<\/ol>$/);
});

test('인용 — 여러 줄 인용, 안쪽 굵게', () => {
  const html = renderMarkdown('> 첫 줄 **굵게**\n>\n> 둘째 문단');
  assert.match(html, /^<blockquote>\n<p>첫 줄 <strong>굵게<\/strong><\/p>\n<p>둘째 문단<\/p>\n<\/blockquote>$/);
});

test('이스케이프 — 원문 HTML·스크립트는 글자로, javascript: 링크는 만들지 않는다', () => {
  const html = renderMarkdown('<script>alert(1)</script> [x](javascript:alert(1)) [ok](https://earthus.net/a?b=1&c=2)');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /<a href="https:\/\/earthus\.net\/a\?b=1&amp;c=2">ok<\/a>/);
});

test('HTML 주석(초안 메모)은 게시 화면에 나오지 않는다', () => {
  assert.doesNotMatch(renderMarkdown('<!-- 비밀 메모 -->\n# 제목'), /비밀 메모/);
});

test('근거 꼬리표 — 초안에서만 보이고 정본에서는 지운다', () => {
  assert.equal(inline('문장 〔C03〕', { draft: true }), '문장 <sup class="ref">C03</sup>');
  assert.equal(inline('문장 〔C03〕', { draft: false }), '문장');
});

test('굵게가 자리표시자·링크를 감싸도 풀린다(화면 확인에서 잡은 결함)', () => {
  assert.equal(inline('**공고일 {{공고일}} · 시행일 {{시행일}}**'),
    '<strong>공고일 <mark class="ph" title="채울 값">{{공고일}}</mark> · 시행일 <mark class="ph" title="채울 값">{{시행일}}</mark></strong>');
  assert.doesNotMatch(inline('**앞 https://earthus.net 뒤**'), /\*\*/);
});

test('맨 URL — 괄호·한글 조사 앞에서 끊는다', () => {
  assert.equal(inline('사이트(https://earthus.net)와'), '사이트(<a href="https://earthus.net">https://earthus.net</a>)와');
  assert.equal(inline('https://earthus.net과'), '<a href="https://earthus.net">https://earthus.net</a>과');
});

test('페이지 — 초안이면 DRAFT 띠 + 자리표시자 개수 + noindex, 언어는 파일 이름에서', () => {
  const md = '<!-- 메모 {{무시}} -->\n# 개인정보처리방침 (개정안 초안)\n\n| a | b |\n|---|---|\n| 주소 | {{사업장 주소}} |\n\n전화 {{전화번호}} 〔C01〕';
  const page = buildPage('privacy.ko.revised-draft-2026-09-24.md', md);
  assert.match(page, /<html lang="ko">/);
  assert.match(page, /DRAFT — 게시 전 PD 법무 확인/);
  assert.match(page, /채우지 않은 자리표시자 2개/);          // 주석 안의 {{무시}} 는 세지 않는다
  assert.match(page, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(page, /<title>개인정보처리방침 \(개정안 초안\) \(DRAFT\) — EARTHUS<\/title>/);
  assert.match(page, /<sup class="ref">C01<\/sup>/);
  assert.match(page, /<a class="skip" href="#main">/);
  // 외부 자원을 부르지 않는다(글꼴·스크립트 CDN 없음) — 정적 파일 한 장
  assert.doesNotMatch(page, /<script|<link |src="http/);

  const en = buildPage('account-deletion.en.draft-2026-09-24.md', '# Delete\n\n{{x}}');
  assert.match(en, /<html lang="en">/);
  assert.match(en, /1 unfilled placeholder/);

  const pub = buildPage('terms.ko.md', '# 약관\n\n본문 〔C01〕');
  assert.doesNotMatch(pub, /DRAFT|noindex|sup class="ref"/);
});

test('이름 규칙 — .html 출력, 초안 판정, 언어', () => {
  assert.equal(outName('privacy.ko.md'), 'privacy.ko.html');
  assert.equal(outName('account-deletion.en.draft-2026-09-24.md'), 'account-deletion.en.draft-2026-09-24.html');
  assert.equal(isDraftName('privacy.ko.md'), false);
  assert.equal(isDraftName('privacy.ko.revised-draft-2026-09-24.md'), true);
  assert.equal(langOf('privacy.en.revised-draft-2026-09-24.md'), 'en');
  assert.equal(langOf('terms.ko.md'), 'ko');
});

test('만들어 둔 prototype/legal/*.html 이 원문과 같다(--check) · README.md 는 만들지 않는다', async () => {
  const script = fileURLToPath(new URL('./build-legal-html.mjs', import.meta.url));
  const out = execFileSync(process.execPath, [script, '--check']).toString();
  assert.doesNotMatch(out, /STALE/);
  const files = await readdir(LEGAL_DIR);
  assert.ok(!files.includes('README.html'));
  for (const need of ['privacy.ko.html', 'terms.ko.html', 'data-license.ko.html',
    'privacy.ko.revised-draft-2026-09-24.html', 'privacy.en.revised-draft-2026-09-24.html',
    'account-deletion.ko.draft-2026-09-24.html', 'account-deletion.en.draft-2026-09-24.html']) {
    assert.ok(files.includes(need), need);
  }
});

test('실제 개정안 — 사업자 자리표시자 6종이 노란 표시로 보이고, 모든 절에 근거 꼬리표가 있다', async () => {
  const md = await readFile(path.join(LEGAL_DIR, 'privacy.ko.revised-draft-2026-09-24.md'), 'utf8');
  const page = buildPage('privacy.ko.revised-draft-2026-09-24.md', md);
  for (const ph of ['상호', '대표자', '사업자등록번호', '사업장 주소', '전화번호', '통신판매업 신고번호']) {
    assert.ok(page.includes(`<mark class="ph" title="채울 값">{{${ph}}}</mark>`), ph);
  }
  // 본문의 모든 ## 절(제목 줄 제외)에 〔…〕 꼬리표가 적어도 하나 — 근거 없는 절이 없다
  const sections = md.replace(/<!--[\s\S]*?-->/g, '').split(/\n## /).slice(1);
  for (const s of sections) assert.match(s, /〔(C\d{2}|법정)〕/, s.split('\n')[0]);
});

// (2026-09-24 적대적 검토) 공개 거름망(aws/_shared/public_build.py)은 '*.md' 만 막고 .html 은 통과시켰다.
//   그래서 이 변환기가 만든 초안 .html 이 aws/deploy-app.sh 의 전체 동기화 한 번에 공개될 수 있었다.
//   결과 기준: legal/ 의 모든 초안(.md·.html)은 거름망에 **막혀야** 통과, 앱이 여는 정본 .md 는 **통과해야** 통과.
test('공개 거름망 — 초안(draft)은 .md·.html 모두 막히고, 정본 legal/*.ko.md 는 공개된다', async (t) => {
  const repo = path.resolve(LEGAL_DIR, '..', '..');
  const files = (await readdir(LEGAL_DIR)).filter((f) => /\.(md|html)$/.test(f)).map((f) => `legal/${f}`);
  let out;
  try {
    out = execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c',
      'import sys, json; sys.path.insert(0, sys.argv[1]); import public_build as pb; '
      + 'print(json.dumps({r: bool(pb.denial_for(r)) for r in sys.argv[2:]}))',
      path.join(repo, 'aws', '_shared'), ...files], { encoding: 'utf8' });
  } catch (e) {
    t.skip(`python 을 실행하지 못했다: ${e.message}`);
    return;
  }
  const denied = JSON.parse(out);
  const drafts = files.filter((f) => /draft/i.test(f));
  assert.ok(drafts.length >= 8, `초안 파일이 너무 적다: ${drafts}`);
  for (const f of drafts) assert.equal(denied[f], true, `초안이 공개 빌드에 실린다: ${f}`);
  for (const f of ['legal/privacy.ko.md', 'legal/terms.ko.md', 'legal/data-license.ko.md']) {
    assert.equal(denied[f], false, `앱이 여는 정본이 막혔다: ${f}`);
  }
});
