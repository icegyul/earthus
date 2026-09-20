# -*- coding: utf-8 -*-
"""개발지시서 §6 '실행 기록' 표를 progress.md 로 갈아 끼운다.

사용: python fill_progress.py <progress.md> <DEV-DIRECTIVE.md>

fill_directive.py · fill_grammar.py 는 분석 결과 JSON 과 워크플로 journal 이 있어야 돈다(세션 임시 폴더에 있다).
실행 기록은 작업이 끝날 때마다 바뀌므로, 그 둘 없이도 표 하나만 다시 쓸 수 있게 따로 둔다.
틀(DEV-DIRECTIVE.template.md)에서 새로 만들 때는 <!-- PROGRESS --> 자리를, 이미 만들어진 문서에서는
'### 실행 기록' 아래의 표를 찾아 바꾼다 — 손으로 표를 고치지 않는다.
"""
import io
import re
import sys

progress_path, doc_path = sys.argv[1:3]
table = io.open(progress_path, encoding="utf-8").read().strip()
text = io.open(doc_path, encoding="utf-8").read()

if "<!-- PROGRESS -->" in text:
    text = text.replace("<!-- PROGRESS -->", table)
else:
    m = re.search(r"(### 실행 기록\n\n)((?:\|.*\n)+)", text)
    if not m:
        sys.exit("'### 실행 기록' 표를 찾지 못했다")
    text = text[: m.start(2)] + table + "\n" + text[m.end(2):]

io.open(doc_path, "w", encoding="utf-8", newline="\n").write(text)
print("실행 기록 %d줄 → %s" % (len(table.splitlines()) - 2, doc_path))
