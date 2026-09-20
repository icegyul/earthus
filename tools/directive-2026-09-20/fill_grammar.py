# -*- coding: utf-8 -*-
"""개발지시서의 <!-- GRAMMAR --> 자리를 9개 메뉴 x 7단계 매트릭스 결과로 채운다.

사용: python fill_grammar.py <grammar-matrix 결과.json> <DEV-DIRECTIVE.md>
fill_directive.py 를 먼저 돌린 뒤에 돌린다(그쪽은 <!-- GRAMMAR --> 를 건드리지 않는다).
손으로 표를 고치지 않는다 — 결과 JSON 이 바뀌면 다시 돌린다.
"""
import collections
import json
import re
import sys

src, doc_path = sys.argv[1:3]
extra_src = sys.argv[3] if len(sys.argv) > 3 else None   # Life · Travel 매트릭스(따로 돌린 결과)
STEP = {1: "① 극적으로 보인다", 2: "② 정확한 값", 3: "③ 출처", 4: "④ 시간축", 5: "⑤ 비교", 6: "⑥ Intelligence", 7: "⑦ Simulation"}
MARK = {"EXISTS": "✅", "PARTIAL": "🟡", "MISSING": "❌"}


def cell(s, limit=None):
    s = "" if s is None else str(s)
    s = s.replace("|", "\\|").replace("\r", "").strip()
    s = re.sub(r"\n+", "<br>", s)
    if limit and len(s) > limit:
        s = s[: limit - 1].rstrip() + "…"
    return s


d = json.load(open(src, encoding="utf-8"))
d = d.get("result", d)
rows = sorted(d["rows"], key=lambda r: r["no"])
if extra_src:
    e = json.load(open(extra_src, encoding="utf-8")); e = e.get("result", e)
    RENAME = {"10": ("L", "Life 생명·사람"), "11": ("T", "Travel 여행(한국)")}   # PD 정본의 작업 공간 번호(10~12)와 겹치지 않게
    for r in sorted(e["rows"], key=lambda r: r["no"]):
        r["no"], r["name"] = RENAME.get(r["no"], (r["no"], r["name"]))
        rows.append(r)
critic = d.get("critic") or {}
L = []

# ── 1-1 지금 상태 한눈에 ────────────────────────────────────────────
L.append("### 1-1. 지금 상태 — %d칸 중 몇 칸이 채워져 있나" % (len(rows) * 7))
L.append("")
cnt = collections.Counter(c["now"] for r in rows for c in r["cells"])
total = sum(cnt.values())
L.append("코드를 열어 확인한 결과다. ✅ 된다 **%d** · 🟡 있긴 한데 목표에 못 미친다 **%d** · ❌ 없다 **%d** (총 %d칸)." % (cnt["EXISTS"], cnt["PARTIAL"], cnt["MISSING"], total))
L.append("")
L.append("| 메뉴 | " + " | ".join(STEP[i] for i in range(1, 8)) + " |")
L.append("|---|" + "---|" * 7)
for r in rows:
    by = {c["step"]: c for c in r["cells"]}
    L.append("| **%s %s** | %s |" % (r["no"], cell(r["name"]), " | ".join(MARK.get(by[i]["now"], "?") if i in by else "?" for i in range(1, 8))))
col = ["**단계별 ✅**"]
for i in range(1, 8):
    col.append("%d/%d" % (sum(1 for r in rows for c in r["cells"] if c["step"] == i and c["now"] == "EXISTS"), len(rows)))
L.append("| " + " | ".join(col) + " |")
L.append("")

# ── 1-2 통합 계약 ───────────────────────────────────────────────────
if critic.get("contract"):
    L.append("### 1-2. `PhenomenonDescriptor` — 메뉴가 공용 부품에 공급하는 설정 하나")
    L.append("")
    L.append(critic["contract"].strip())
    L.append("")

# ── 1-3 첫 관통 · 만드는 순서 ───────────────────────────────────────
L.append("### 1-3. 첫 관통과 공용 부품을 만드는 순서")
L.append("")
if critic.get("firstVertical"):
    L.append("**첫 관통(First Vertical).** " + critic["firstVertical"].strip())
    L.append("")
if critic.get("sharedBuildOrder"):
    L.append("**공용 부품을 만드는 순서.**")
    L.append("")
    for n, x in enumerate(critic["sharedBuildOrder"], 1):
        L.append("%d. %s" % (n, x.strip()))
    L.append("")

# ── 1-4 메뉴별 7단계 ────────────────────────────────────────────────
L.append("### 1-4. 메뉴별 7단계")
L.append("")
for r in rows:
    by = {c["step"]: c for c in r["cells"]}
    L.append("#### %s %s" % (r["no"], r["name"]))
    L.append("")
    L.append("| 단계 | 지금 | 끝났을 때 사용자가 보고 하는 것 | 이 메뉴가 공급할 것 | 선행 | 요금 |")
    L.append("|---|---|---|---|---|---|")
    for i in range(1, 8):
        c = by.get(i)
        if not c:
            L.append("| %s | ? | (분석 누락) | | | |" % STEP[i])
            continue
        now = "%s %s" % (MARK.get(c["now"], "?"), cell(c.get("nowEvidence"), 170))
        tgt = cell(c.get("target"))
        if c.get("honestLimit"):
            tgt += "<br>⚠️ *말하면 안 되는 것:* " + cell(c["honestLimit"], 220)
        L.append("| **%s** | %s | %s | %s | %s | %s |" % (STEP[i], now, tgt, cell(c.get("menuSupplies"), 260), cell(c.get("dependsOn"), 160), c.get("tier", "")))
    L.append("")
    L.append("- **⑤ 비교 짝:** " + cell(r.get("compareChoice")))
    L.append("- **⑦ 시나리오:** " + cell(r.get("simulationChoice")))
    L.append("- **첫 단면(7단계를 전부 관통하는 가장 얇은 출시):** " + cell(r.get("firstSlice")))
    if r.get("notes"):
        L.append("- 비고: " + cell(r["notes"]))
    L.append("")
    if r.get("descriptor"):
        L.append("<details><summary>descriptor 초안</summary>")
        L.append("")
        L.append("```js")
        L.append(r["descriptor"].strip())
        L.append("```")
        L.append("")
        L.append("</details>")
        L.append("")

# ── 1-5 비평 ────────────────────────────────────────────────────────
L.append("### 1-5. 비평 — 같은 문법이 깨지는 곳과 위험")
L.append("")
L.append("> 이 비평은 현상 9개 메뉴의 63칸을 읽고 쓴 것이다. Life · Travel(14칸)은 그 뒤에 추가됐고 같은 규칙을 적용한다 — 두 메뉴의 ②·③ 은 무료, ④ 는 자료가 가진 시간만, ⑤·⑦ 은 입구 + 사유.")
L.append("")
if critic.get("inconsistencies"):
    L.append("**메뉴마다 다르게 적힌 곳(같은 문법이 깨지는 곳).**")
    L.append("")
    for x in critic["inconsistencies"]:
        L.append("- " + cell(x))
    L.append("")
if critic.get("cellFixes"):
    L.append("**고쳐야 하는 칸.**")
    L.append("")
    L.append("| 메뉴 | 단계 | 어떻게 |")
    L.append("|---|---|---|")
    for f in critic["cellFixes"]:
        L.append("| %s | %s | %s |" % (cell(f.get("menu")), STEP.get(f.get("step"), f.get("step")), cell(f.get("fix"))))
    L.append("")
if critic.get("risks"):
    L.append("**이 문법을 모든 메뉴에 강제할 때의 위험.**")
    L.append("")
    for x in critic["risks"]:
        L.append("- " + cell(x))
    L.append("")

text = open(doc_path, encoding="utf-8").read()
if "<!-- GRAMMAR -->" not in text:
    sys.exit("자리 표시가 없다: <!-- GRAMMAR -->")
text = text.replace("<!-- GRAMMAR -->", "\n".join(L))
open(doc_path, "w", encoding="utf-8", newline="\n").write(text)
print("채움: 메뉴 %d · 칸 %d (✅ %d · 🟡 %d · ❌ %d) · 비평 %s · 문서 %d자" % (
    len(rows), total, cnt["EXISTS"], cnt["PARTIAL"], cnt["MISSING"], "있음" if critic else "없음", len(text)))
