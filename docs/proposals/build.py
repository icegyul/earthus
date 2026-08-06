#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""OI-2026.md → PDF (제출용)

쓰는 법:  python3 docs/proposals/build.py
          내용은 OI-2026.md 만 고치면 된다. 이 파일은 모양만 담당한다.

⚠️ pandoc·weasyprint 가 이 기계에 없어서 헤드리스 크롬의 --print-to-pdf 를 쓴다.
   한글은 시스템 폰트(Apple SD Gothic Neo)로 임베드된다 — 확인함.
⚠️ marked 는 jsdelivr 에서 받는다. 인터넷이 없으면 본문이 빈다.
   그래서 만든 뒤 쪽수를 반드시 확인한다 (아래 자동 확인).
"""
import io, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
MD   = os.path.join(HERE, 'OI-2026.md')
HTML = os.path.join(HERE, 'OI-2026.html')
PDF  = os.path.join(HERE, 'earthus-협업제안서-2026.pdf')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

CSS = '''
@page { size: A4; margin: 18mm 16mm 16mm; }
:root{ --ink:#12161c; --mut:#5b6472; --line:#dfe4ea; --key:#0f5f8f; --warn:#a8500f; }
*{ box-sizing:border-box }
body{ margin:0; padding:0 4pt;
      font-family:"Apple SD Gothic Neo","AppleSDGothicNeo-Regular",sans-serif;
      font-size:10.1pt; line-height:1.78; color:var(--ink);
      font-weight:350; letter-spacing:-.01em; }
h1{ font-size:22pt; font-weight:700; letter-spacing:-.03em; margin:0 0 4pt; }
h2{ font-size:13.5pt; font-weight:700; letter-spacing:-.02em;
    margin:26pt 0 9pt; padding-top:10pt; border-top:1.6pt solid var(--ink);
    page-break-after:avoid; }
h3{ font-size:11.4pt; font-weight:700; color:var(--key);
    margin:17pt 0 6pt; page-break-after:avoid; }
h4{ font-size:10.4pt; font-weight:700; margin:12pt 0 4pt; page-break-after:avoid }
p{ margin:0 0 7pt; }
strong{ font-weight:650 }
em{ color:var(--mut); font-style:normal; font-size:9.4pt }
hr{ border:0; border-top:1px solid var(--line); margin:14pt 0 }
/* ⚠️ markdown 의 --- 와 h2 윗선이 겹쳐 두 줄로 보였다 */
hr:has(+ h2){ display:none }
.head + hr{ display:none }
h2:first-of-type{ border-top:0; padding-top:0 }
ul,ol{ margin:0 0 8pt; padding-left:16pt }
li{ margin-bottom:4pt }
table{ border-collapse:collapse; width:100%; margin:6pt 0 12pt;
       font-size:9.4pt; page-break-inside:avoid }
th{ text-align:left; font-weight:650; background:#f2f5f8;
    border-bottom:1.4pt solid var(--ink); padding:5pt 8pt; }
td{ border-bottom:1px solid var(--line); padding:5pt 8pt; vertical-align:top }
td:first-child{ font-weight:500; color:var(--mut) }
a{ color:var(--key); text-decoration:none }
blockquote{ margin:10pt 0; padding:8pt 12pt; background:#f2f5f8;
            border-left:3pt solid var(--key); font-weight:600; }
blockquote p{ margin:0 }
/* ⚠️ 로 시작하는 문단 — 이 제안서의 태도가 여기 있다 */
p.warn{ background:#fdf6ee; border-left:2.5pt solid var(--warn);
        padding:6pt 9pt; margin:8pt 0 10pt; }
/* 화면캡처 — 실제 서비스에서 찍은 것이다. 설명(이탤릭)이 바로 밑에 붙는다. */
img{ display:block; width:100%; height:auto; margin:10pt 0 3pt;
     border:1px solid var(--line); border-radius:3pt; page-break-inside:avoid }
img + em, p > img + em{ display:block }
p:has(img){ page-break-inside:avoid; margin-bottom:4pt }
p:has(img) + p em{ font-size:8.8pt; line-height:1.55; color:var(--mut) }
.head{ border-bottom:2.4pt solid var(--ink); padding-bottom:10pt; margin-bottom:6pt }
.sub{ color:var(--mut); font-size:9.6pt; line-height:1.6 }
'''

JS = '''
document.getElementById('out').innerHTML = marked.parse(MD);
document.querySelectorAll('#out p').forEach(p => {
  if (p.textContent.trim().startsWith('\\u26a0')) p.className = 'warn';
});
const h1 = document.querySelector('#out h1');
if (h1) { const w=document.createElement('div'); w.className='head';
  h1.parentNode.insertBefore(w, h1); w.appendChild(h1);
  let n=w.nextElementSibling;
  while(n && n.tagName!=='HR'){ const x=n.nextElementSibling; n.classList.add('sub'); w.appendChild(n); n=x; } }
document.title='earthus 협업제안서';
'''


def main():
    md = io.open(MD, encoding='utf-8').read()
    html = ('<meta charset="utf-8">\n'
            '<script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></script>\n'
            f'<style>{CSS}</style>\n<div id="out"></div>\n'
            f'<script>\nconst MD = {json.dumps(md, ensure_ascii=False)};\n{JS}</script>')
    io.open(HTML, 'w', encoding='utf-8').write(html)

    subprocess.run([CHROME, '--headless=new', '--disable-gpu-sandbox',
                    '--no-pdf-header-footer', '--allow-file-access-from-files',
                    '--virtual-time-budget=14000',
                    f'--print-to-pdf={PDF}', 'file://' + HTML],
                   capture_output=True)

    d = io.open(PDF, 'rb').read()
    pages = len(re.findall(rb'/Type\s*/Page[^s]', d))
    kb = len(d) / 1024
    print(f'PDF  {kb:.0f} KB · {pages}쪽')
    # ⚠️ marked 를 못 받으면 본문이 비어 1쪽짜리가 나온다. 그걸 잡는다.
    if pages < 2 or kb < 50:
        print('❌ 본문이 비었을 수 있다 — 인터넷 연결과 marked 로딩을 확인할 것')
        sys.exit(1)
    print(f'원본 {len(md):,}자')


if __name__ == '__main__':
    main()
