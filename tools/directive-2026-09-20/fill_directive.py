# -*- coding: utf-8 -*-
"""개발지시서의 <!-- MENU_TABLE --> · <!-- DECISIONS --> · <!-- AUDIT_TABLE --> 자리를 분석 결과로 채운다.

사용: python fill_directive.py <workflow-output.json> <journal.jsonl> <spec-audit.json> <DEV-DIRECTIVE.md>
  workflow-output : 전 메뉴 분석 최종 결과(result.groups[] — Red Team 을 거친 항목)
  journal         : 같은 워크플로의 journal — Before 단계의 등급(grade)·subscriberView 를 여기서 꺼낸다
  spec-audit      : 기획 대비 미반영 감사 결과(all[])
손으로 표를 고치지 않는다 — 결과 JSON 이 바뀌면 다시 돌린다.
"""
import collections
import json
import re
import sys

out_path, journal_path, audit_path, tpl_path, doc_path = sys.argv[1:6]   # 틀(자리 표시가 든 원본)에서 읽어 문서로 쓴다 — 다시 돌릴 수 있게


def cell(s, limit=None):
    s = "" if s is None else str(s)
    s = s.replace("|", "\\|").replace("\r", "").strip()
    s = re.sub(r"\n+", "<br>", s)
    if limit and len(s) > limit:
        s = s[: limit - 1].rstrip() + "…"
    return s


def bullets(xs):
    xs = [x for x in (xs or []) if x]
    return "<br>".join("· " + cell(x) for x in xs)


# 결과 파일은 쉼표로 여럿 줄 수 있다 — 첫째가 본 실행, 나머지는 빠진 항목의 재검증분.
# (본 실행은 단계 사이에 JSON 을 16,000자로 잘라 11항목이 Red Team 을 못 받았다. 재검증분을 원래 묶음에 합친다.)
PARENT = {"atmosphere2": "atmosphere", "obs2": "cryo_obs", "life2": "society"}
paths = out_path.split(",")
doc = json.load(open(paths[0], encoding="utf-8"))
res = doc.get("result", doc)
groups = res["groups"]
by_key = {g["group"]: g for g in groups}
for extra in paths[1:]:
    e = json.load(open(extra, encoding="utf-8"))
    e = e.get("result", e)
    for g in e["groups"]:
        parent = by_key.get(PARENT.get(g["group"], g["group"]))
        if parent is None:
            groups.append(g)
            continue
        have = {i["phenomenonId"] for i in parent["items"]}
        parent["items"].extend(i for i in g.get("items", []) if i["phenomenonId"] not in have)
        parent.setdefault("corrections", []).extend(g.get("corrections", []))
        if g.get("groupNotes"):
            parent["groupNotes"] = (parent.get("groupNotes") or "") + "\n\n【재검증분 — " + g["groupName"] + "】 " + g["groupNotes"]

# Before 단계의 등급 — journal 의 result 중 items[*].grade 를 가진 것
grade, view = {}, {}
for line in open(journal_path, encoding="utf-8"):
    try:
        e = json.loads(line)
    except Exception:
        continue
    r = e.get("result") if e.get("type") == "result" else None
    if isinstance(r, dict):
        for it in r.get("items", []):
            if "grade" in it:
                grade[it["phenomenonId"]] = it["grade"]
                view[it["phenomenonId"]] = it.get("subscriberView", "")

# 66현상의 자리 — 한 곳에서 정한다. 9개 메뉴에 들어간 39개는 After 머리말("[→ 02 Wind …]")에서 읽고,
# 자리가 없던 27개는 아래 표가 정한다. status: PD = 2026-09-20 PD 확정("라이프 트래블은 메뉴에 넣어줘") · REC = 제 추천(PD 판단 대기)
MENU_NAME = {"01": "01 기온", "02": "02 바람", "03": "03 강수", "04": "04 구름", "05": "05 해양", "06": "06 재해",
             "07": "07 대기질", "08": "08 우주", "09": "09 지형", "10": "10 Compare", "11": "11 Intelligence", "12": "12 Simulation"}
PLACEMENT = {
    "land.forest": ("L Life", "숲", "PD"), "land.bird_migration": ("L Life", "새 › 철새 이동", "PD"),
    "land.bird_survey": ("L Life", "새 › 육상 조사", "PD"), "ocean.seabird": ("L Life", "새 › 바닷새", "PD"),
    "ocean.sea_turtle": ("L Life", "바다거북 — 기관 서면 확인 전 동결", "PD"),
    "people.population": ("L Life", "사람 › 인구", "PD"), "people.crowding": ("L Life", "사람 › 서울 실시간 혼잡", "PD"),
    "ocean.deep_sea": ("L Life", "심해 체험(수심 읽기는 09 지형 Inspector 로)", "PD"),
    "travel.today_pick": ("T Travel", "오늘 갈 곳", "PD"), "travel.place_catalog": ("T Travel", "목적별 장소", "PD"),
    "travel.place_sequence": ("T Travel", "장소 Inspector 의 '다음에 간 곳 Top 5'", "PD"),
    "travel.visitor_pressure": ("T Travel", "방문자", "PD"),
    "weather.daily_extremes": ("11 Intelligence", "Now 탭 맨 위 '오늘의 극값' 카드", "PD2"),
    "land.snow_cover": ("03 강수", "'쌓인 눈(관측)' 칩 — IMS 수집기 복구가 선행", "PD2"),
    "weather.station_obs": ("01·02·03·07", "공통 'Show Stations' 토글 — 독립 메뉴 폐지", "PD2"),
    "ocean.coastal_inundation": ("05 해양", "해수면 상승 · 침수 보조 모드('재해'에서 옮김)", "PD2"),
    "hazards.crustal_motion": ("09 지형", "'Plates & Motion' 으로 합침", "PD2"),
    "land.crustal_motion": ("09 지형", "'Plates & Motion'", "PD2"),
    "space.orbital_debris": ("08 우주", "Satellites 의 'Debris' 칩 + 근접사건(거짓 문구 핫픽스는 P0)", "PD2"),
    "travel.flight": ("→ v1", "사실(FACT) 질문이고 v1 에 구현이 있다", "PD2"),
    "space.solar_system": ("→ v1", "지구를 대체하는 전체 화면 · 전용 슬라이더 — v2 셸에 안 맞는다", "PD2"),
    "space.photo": ("→ v1", "v1 cosmic3d 에 사진 아틀라스 진입점이 이미 있다", "PD2"),
    "space.galaxy": ("→ v1", "교육 콘텐츠 — v1", "PD2"),
    "people.news": ("상단 · 재해 Inspector", "'관련 보도' — 좌측 메뉴 밖. 분홍 막대 5개는 즉시 삭제(S)", "PD2"),
    "ocean.vessel_traffic": ("뺌", "그릴 자료가 없다(AIS 미연결) — 자료가 생기면 다시 연다", "PD2"),
    "travel.poi": ("뺌", "자료 없음 — 한국은 '목적별 장소'가 같은 질문에 답한다", "PD2"),
    "hazards.glacial_lake_flood": ("뺌(보류)", "수집기(glacial-lake-us) 배포 전 — 자료가 들어오면 06 재해로", "PD2"),
}


def place_of(it):
    pid = it["phenomenonId"]
    if pid in PLACEMENT:
        return PLACEMENT[pid]
    m = re.search(r"→\s*(0[1-9]|1[0-2])", (it.get("after") or "")[:170])
    return (MENU_NAME.get(m.group(1), m.group(1)) if m else "?", "", "AUTO")


GRADE_KO = {"A_GOOD": "A 팔 수 있다", "B_OK": "B 손보면 된다", "C_WEAK": "C 빈약하다", "D_BROKEN": "D 망가져 보인다"}
ACTION_KO = {"REBUILD": "다시 만든다", "IMPROVE": "고친다", "KEEP": "둔다", "MERGE": "합친다", "MOVE": "옮긴다", "REMOVE": "뺀다"}

items = [dict(it, group=g["groupName"]) for g in groups for it in g.get("items", [])]
L = []
got_ids = {i["phenomenonId"] for i in items}
pending = [p for p in grade if p not in got_ids]
if pending:
    L.append("> ⚠️ **아직 반박 검증이 안 끝난 현상 %d개**(분석 단계 사이에 입력이 잘려 빠졌다 — 재검증 중, 끝나면 이 표에 들어온다): %s" % (len(pending), " · ".join("`%s`" % p for p in pending)))
    L.append("")

# ── 4-0 요약 ─────────────────────────────────────────────────────────
gc = collections.Counter(grade.get(i["phenomenonId"], "?") for i in items)
ac = collections.Counter(i["action"] for i in items)
pc = collections.Counter(i["priority"] for i in items)
L.append("**전체 %d현상.** 지금 등급 — %s." % (len(items), " · ".join("%s %d" % (GRADE_KO.get(k, k), gc[k]) for k in ("D_BROKEN", "C_WEAK", "B_OK", "A_GOOD", "?") if gc[k])))
L.append("처분 — %s. 우선순위 — %s." % (
    " · ".join("%s %d" % (ACTION_KO.get(k, k), ac[k]) for k in ("REBUILD", "IMPROVE", "KEEP", "MERGE", "MOVE", "REMOVE") if ac[k]),
    " · ".join("%s %d" % (k, pc[k]) for k in ("P0", "P1", "P2", "P3") if pc[k])))
L.append("")
L.append("### 4-0. 한눈에")
L.append("")
L.append("| 옛 묶음 | 메뉴 줄 | **새 자리** | 지금 | 처분 | 우선 | 크기 | 바꾼 뒤(한 줄) |")
L.append("|---|---|---|---|---|---|---|---|")
for i in items:
    L.append("| %s | %s | **%s** | %s | %s | %s | %s | %s |" % (
        cell(i["group"]), cell(i["menuName"], 40), cell(place_of(i)[0]), GRADE_KO.get(grade.get(i["phenomenonId"]), "—").split(" ")[0],
        ACTION_KO.get(i["action"], i["action"]), i["priority"], i["size"], cell(i["after"], 120)))
L.append("")

# ── 4-1… 묶음별 상세 ────────────────────────────────────────────────
for n, g in enumerate(groups, 1):
    L.append("### 4-%d. %s" % (n, g["groupName"]))
    L.append("")
    if g.get("groupNotes"):
        L.append("> " + cell(g["groupNotes"]).replace("<br>", "<br>> "))
        L.append("")
    for it in g.get("items", []):
        pid = it["phenomenonId"]
        L.append("#### %s · `%s` — %s · %s · %s" % (it["menuName"], pid, ACTION_KO.get(it["action"], it["action"]), it["priority"], it["size"]))
        L.append("")
        L.append("| | |")
        L.append("|---|---|")
        L.append("| **Before** | %s |" % cell(it.get("before")))
        if view.get(pid):
            L.append("| 돈 내는 사람 눈 | %s (%s) |" % (cell(view[pid]), GRADE_KO.get(grade.get(pid), "—")))
        if it.get("reference"):
            L.append("| 기준 사이트 | %s |" % cell(it["reference"]))
        L.append("| **After** | %s |" % cell(it.get("after")))
        L.append("| 표현 | %s |" % cell(it.get("renderType")))
        L.append("| 자료 | %s |" % cell(it.get("dataNeed")))
        if it.get("reuse"):
            L.append("| 재사용 | %s |" % cell(it["reuse"]))
        if it.get("paidHook"):
            L.append("| 무료 / 유료 | %s |" % cell(it["paidHook"]))
        if it.get("blockers"):
            L.append("| 걸리는 것 | %s |" % bullets(it["blockers"]))
        if it.get("acceptance"):
            L.append("| **완료 기준** | %s |" % bullets(it["acceptance"]))
        L.append("")
    if g.get("corrections"):
        L.append("<details><summary>반박 검증에서 뒤집거나 낮춘 것 (%d)</summary>" % len(g["corrections"]))
        L.append("")
        for c in g["corrections"]:
            L.append("- " + cell(c))
        L.append("")
        L.append("</details>")
        L.append("")
menu_md = "\n".join(L)

# ── 5 PD 결정 ────────────────────────────────────────────────────────
D = []
def first_line(t):
    return (t or "").strip().splitlines()[0] if (t or "").strip() else ""

placed = [(i, PLACEMENT[i["phenomenonId"]]) for i in items if i["phenomenonId"] in PLACEMENT]
noslot = [x for x in placed]                      # 아래 출력 문구용
decide = [i for i in items if i["phenomenonId"] not in PLACEMENT and "PD 결정" in (i.get("after") or "")]
cnt_pd = sum(1 for _, pl in placed if pl[2] == "PD")
cnt_pd2 = sum(1 for _, pl in placed if pl[2] == "PD2")
D.append("### 5-1. PD 정본의 9개 메뉴에 자리가 없던 %d현상 — 어디로 갔나" % len(placed))
D.append("")
D.append("**전부 PD 확정이다.** Life · Travel %d개는 2026-09-20 \"라이프 트래블은 메뉴에 넣어줘\", 나머지 %d개는 같은 날 \"모두 진행해\"(추천안 전부 승인)." % (cnt_pd, cnt_pd2))
D.append("")
D.append("| 상태 | 메뉴 줄 | 새 자리 | 어떻게 |")
D.append("|---|---|---|---|")
for i, pl in sorted(placed, key=lambda x: (x[1][2] != "PD", x[1][0])):
    D.append("| %s | %s | **%s** | %s |" % ("✅ PD 확정" if pl[2] == "PD" else "✅ PD 승인(추천안)", cell(i["menuName"], 40), cell(pl[0]), cell(pl[1])))
D.append("")
D.append("⚠️ 취미·야외 활동 5줄(해변과 낚시터 · 서핑 · 낚시 · 패러글라이딩 · 산 정상 날씨)은 분석에서 물리 메뉴(해양 · 바람 · 기온)의 활동 오버레이로 들어갔다. Travel 이 메뉴가 된 지금, **Travel 에 '야외 활동' 칩을 두고 누르면 해당 물리 메뉴의 오버레이를 여는** 입구를 하나 더 둔다(자료와 그림은 한 곳에만 둔다) — 2026-09-20 \"모두 진행해\"로 승인.")
D.append("")
D.append("### 5-1b. 자리는 있지만 **세부를 정해 주셔야 하는** 현상 (%d)" % len(decide))
D.append("")
D.append("| 묶음 | 메뉴 | 들어갈 자리와 정할 것(요약) |")
D.append("|---|---|---|")
for i in decide:
    t = i.get("after") or ""
    k = t.find("PD 결정")
    snippet = t[max(0, k - 140): k + 160] if k >= 0 else t[:240]
    D.append("| %s | %s | %s<br>… %s … |" % (cell(i["group"]), cell(i["menuName"]), cell(first_line(t), 110), cell(snippet)))
D.append("")
D.append("""### 5-2. 그 밖에 정해야 하는 것

| # | 결정 | 제 추천 | 이유 |
|---|---|---|---|
| 1 | **0.5°(55 km)를 1차 해상도로 받아들일지** | 받아들인다 | 0.25° 는 지금 Lambda 구조에서 못 돈다(스텝당 10.8 MB). 지구본 축척에서는 0.5° + 셰이더 구간색이면 시안의 그림이 나온다. 한반도 확대는 기상청 5 km 격자로 따로 푼다 |
| 2 | **Open-Meteo 를 걷어낼 범위** | 유료 핵심 그림(기온·바람·기압·강수·파고·대기질)은 전부 교체 | 비상업 조항 위험. 대체: NOAA GFS·GFS-Wave(퍼블릭 도메인) · ECMWF open data(CC-BY-4.0) · CAMS·CMEMS·ERA5(Copernicus, 출처표시) · 기상청(공공누리) |
| 3 | **Copernicus(CAMS·CMEMS·ERA5) 출처표시 조건 수용** | 수용 | 무료·상업 이용 가능, 출처 표기만 요구. 계정 가입이 필요하다(사람 일) |
| 4 | **두 번째 모델을 ECMWF 로 할지** | 그렇게 한다 | Compare 의 의미는 GFS 대 ECMWF 다. open data 0.25° 가 공개돼 있다. 다만 **격자 수집기가 지금 없다**(eccodes 필요, 별도 L 작업) — G3 의 선행 조건 |
| 4-1 | **`ecmwf-ingest` 정기 실행 등록**(6시간마다) | 지금 등록 | 수동 1회분뿐이다. ECMWF 는 2~3일치만 보관해 지나간 회차는 영영 못 받는다. "한국에서 AI 모델 대 물리 모델" 채점의 재료다. `events:*` 권한이 없어 PD 가 해야 한다 |
| 4-2 | **앙상블 확률의 자료원** | NOAA GEFS(31멤버 · 퍼블릭 도메인) | 기온·강수의 격자 앙상블이 지금 없다. 태풍 확률은 있는 자료(ECMWF 51멤버 경로)로 바로 된다 |
| 5 | **유료 경계를 언제 켤지**(`FREE_OPEN` → 유료) | G3 뒤 | 지금 켜면 팔 것이 없다. 등급 판정 코드는 한 번도 실행된 적이 없어 켜기 전에 시험이 필요하다 |
| 6 | **관측소 바람(막대기)의 처분** | '지상 관측' 현상의 값 라벨로 옮긴다 | 자료는 귀하다(기상청·GTS 3,000곳). 표현만 막대기에서 숫자로 바꾼다 |
| 7 | **계약 §C-2 개정** | PD 가 2026-09-20 에 방향을 정했다(근거 있으면 통과) — 문구 확정만 남음 | `AGENTS.md` 에 개정 대상으로 표시해 둠 |
| 8 | **남은 PD 배포 4건**(공개 API 키 · 빙하호 · 변화 창고 · LLM) | `docs/PD-DEPLOY-2026-09-20.md` | 🔴 공개 API 키는 지금도 익명으로 읽힌다 |
""")
dec_md = "\n".join(D)

# ── 부록 A ───────────────────────────────────────────────────────────
aud = json.load(open(audit_path, encoding="utf-8"))
allv = aud["all"]
order_v = {"MISSING": 0, "PARTIAL": 1, "UNKNOWN": 2, "DONE": 3}
order_u = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
DOM = {"render": "시각 표현", "product": "요금제·상품", "intel": "인텔리전스·자료", "ux": "UI·모바일"}
VER = {"MISSING": "없음", "PARTIAL": "부분", "UNKNOWN": "확인 불가", "DONE": "됨"}
A = []
vc = collections.Counter(v["verdict"] for v in allv)
A.append("문서가 **수치·이름으로** 약속한 %d건을 뽑아 각각 코드를 열어 재검증했다. 없음 %d · 부분 %d · 확인 불가 %d · 됨 %d. (1차 조사의 주장 %d건이 재검증에서 뒤집혔다.)" % (
    len(allv), vc["MISSING"], vc["PARTIAL"], vc["UNKNOWN"], vc["DONE"], len(aud.get("overturned", []))))
A.append("")
for dom in ("render", "product", "intel", "ux"):
    rows = sorted([v for v in allv if v["domain"] == dom], key=lambda v: (order_v.get(v["verdict"], 9), order_u.get(v["userVisible"], 9)))
    c = collections.Counter(v["verdict"] for v in rows)
    A.append("### A-%s (%d건 — 없음 %d · 부분 %d · 됨 %d)" % (DOM[dom], len(rows), c["MISSING"], c["PARTIAL"], c["DONE"]))
    A.append("")
    A.append("| 판정 | 체감 | 크기 | 약속 | 출처 | 왜 중요한가 |")
    A.append("|---|---|---|---|---|---|")
    for v in rows:
        A.append("| %s | %s | %s | %s | %s | %s |" % (VER.get(v["verdict"], v["verdict"]), v["userVisible"], v["fixSize"],
                                                   cell(v["promise"], 170), cell(v["source"], 90), cell(v["whyItMatters"], 170)))
    A.append("")
aud_md = "\n".join(A)

text = open(tpl_path, encoding="utf-8").read()
for mark, body in (("<!-- MENU_TABLE -->", menu_md), ("<!-- DECISIONS -->", dec_md), ("<!-- AUDIT_TABLE -->", aud_md)):
    if mark not in text:
        sys.exit("자리 표시가 없다: " + mark)
    text = text.replace(mark, body)
open(doc_path, "w", encoding="utf-8", newline="\n").write(text)
print("채움: 메뉴 %d항목 · 자리 없음 %d · 세부 결정 %d · 재검증 대기 %d · 감사 %d건 · 문서 %d자" % (len(items), len(noslot), len(decide), len(pending), len(allv), len(text)))
