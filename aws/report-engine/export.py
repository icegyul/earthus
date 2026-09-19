# -*- coding: utf-8 -*-
"""리포트 내보내기 — 지시서 §60 · §61 · §69 · §100 · §157.

HTML 이 정본이다. PDF 는 그 HTML 을 인쇄한 것이다(§69 — 별도 PDF 본문을 손으로 관리하지 않는다).
Markdown·JSON 은 기계용이다.

왜 HTML 이 정본인가
  이 저장소에는 번들러도 PDF 엔진도 없다. 서버에서 PDF 를 그리려면 새 의존성과
  한글 폰트를 들여와야 하고, 그러면 화면과 PDF 가 서로 다른 두 렌더러가 된다.
  인쇄 CSS 하나면 같은 문서가 종이가 된다.

§61 시각 위계 — 1 EARTHUS · 2 기간 · 3 주요 발견 · 4 시각화 · 5 방법·출처.
마케팅 브로슈어가 아니라 지구 관측 보고서로 읽혀야 한다.
"""
import html
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "_shared"))
import report_period as rp        # noqa: E402
import sections as sx             # noqa: E402

EXPORT_VERSION = "earthus.report-export/1.0.0"

# §157 — 안정 파일명. 이 이름이 링크로 돌아다닌다. 바꾸지 않는다.
TYPE_SLUG = {
    "RETROSPECTIVE_MONTHLY": "MONTHLY",
    "RETROSPECTIVE_QUARTERLY": "Q",
    "RETROSPECTIVE_ANNUAL": "STATE_OF_EARTH",
    "OUTLOOK_NEXT_MONTH": "OUTLOOK_MONTHLY",
    "OUTLOOK_NEXT_QUARTER": "OUTLOOK_Q",
    "OUTLOOK_NEXT_YEAR": "OUTLOOK_ANNUAL",
}


def filename(report, ext):
    """EARTHUS_MONTHLY_2026_08.html · EARTHUS_Q3_2026.html · EARTHUS_STATE_OF_EARTH_2026.html"""
    rtype = report.get("type")
    slug = TYPE_SLUG.get(rtype, "REPORT")
    per = report.get("period") or {}
    a = (per.get("from") or "")[:10]
    year = a[:4] or "0000"
    if rtype in ("RETROSPECTIVE_ANNUAL", "OUTLOOK_NEXT_YEAR"):
        stem = f"EARTHUS_{slug}_{year}"
    elif rtype in ("RETROSPECTIVE_QUARTERLY", "OUTLOOK_NEXT_QUARTER"):
        q = (int(a[5:7]) - 1) // 3 + 1 if len(a) >= 7 else 0
        stem = f"EARTHUS_Q{q}_{year}"
    else:
        stem = f"EARTHUS_{slug}_{year}_{a[5:7] or '00'}"
    rev = report.get("revision")
    if rev:
        stem += f"_rev{rev}"
    return f"{stem}.{ext}"


def to_json(report):
    """§69 — 구조화 내보내기. 리포트 객체 그대로다. 여기서 모양을 바꾸지 않는다."""
    return json.dumps(report, ensure_ascii=False, indent=1)


# ── Markdown ─────────────────────────────────────────────────────────────────
def to_markdown(report, *, lang="ko"):
    L = []
    title = _title(report, lang)
    L.append(f"# {title}")
    L.append("")
    L.append(_meta_line(report))
    L.append("")
    L.append("## 목차")
    for t in sx.table_of_contents(report.get("sections") or []):
        mark = " — 자료 없음" if t["notAvailable"] else ""
        L.append(f"- [{t['titleKo']}](#{t['id']}){mark}")
    L.append("")
    by_id = {f["factId"]: f for f in report.get("facts") or []}
    for s in report.get("sections") or []:
        L.append(f"## {s.get('titleKo')}")
        L.append("")
        if s.get("notAvailable") or s.get("empty"):
            L.append(f"> **자료 없음** — {s.get('reasonKo') or '사유가 적히지 않았다'}")
            L.append("")
            continue
        for fid in s.get("factRefs") or []:
            f = by_id.get(fid)
            if not f:
                L.append(f"- ⚠️ 없는 팩트 참조: `{fid}`")
                continue
            L.append(f"- **{f.get('metric')}**: {_fmt_value(f)}"
                     + (f" _(표본 {f['sampleCount']})_" if f.get("sampleCount") else ""))
        for c in s.get("cards") or []:
            L.append(f"- **{c.get('title')}** · {c.get('kindKo')} · "
                     f"{c.get('occurredAt') or '시각 미확인'}"
                     + (f" · {c.get('region')}" if c.get("region") else ""))
            if c.get("importanceReason"):
                L.append(f"  - 선정 근거: {' · '.join(c['importanceReason'])}")
        for r in s.get("rows") or []:
            L.append(f"- {r if isinstance(r, str) else json.dumps(r, ensure_ascii=False)}")
        if s.get("coverage"):
            L.append(f"- 상태: **{s.get('state')}**")
            L.append(f"- 기간 안 사건 {s['coverage'].get('inPeriod')}건 · "
                     f"시각 미확인 {s['coverage'].get('undated')}건")
        if s.get("body"):
            L.append("```json")
            L.append(json.dumps(s["body"], ensure_ascii=False, indent=1))
            L.append("```")
        L.append("")
    return "\n".join(L)


def _fmt_value(f):
    v = f.get("value")
    u = f.get("unit")
    if isinstance(v, float):
        v = f"{v:g}"
    return f"{v}{u or ''}"


def _title(report, lang="ko"):
    per = report.get("period") or {}
    a = (per.get("from") or "")[:10]
    rtype = report.get("type")
    if rtype == "RETROSPECTIVE_ANNUAL":
        return f"EARTHUS STATE OF EARTH {a[:4]}"
    if rtype == "RETROSPECTIVE_QUARTERLY":
        q = (int(a[5:7]) - 1) // 3 + 1 if len(a) >= 7 else 0
        return f"EARTHUS 분기 지구 리포트 · {a[:4]} Q{q}"
    if rtype == "RETROSPECTIVE_MONTHLY":
        return f"EARTHUS 월간 지구 리포트 · {a[:7]}"
    return f"EARTHUS {rtype} · {a[:7]}"


def _meta_line(report):
    # §32 — 세 형식이 **같은 정체성**을 들고 다녀야 한다. reportId 가 그 첫 칸이다.
    return (f"리포트 `{report.get('reportId')}` · "
            f"생성 {report.get('generatedAt')} · "
            f"스냅샷 `{report.get('dataSnapshotId')}` · "
            f"엔진 `{report.get('algorithmVersion')}` · "
            f"상태 {report.get('lifecycle') or report.get('status')}"
            + (f" · 개정 {report['revision']}" if report.get("revision") else ""))


# ── HTML ─────────────────────────────────────────────────────────────────────
E = html.escape

CSS = """
:root{--bg:#f7f8fa;--fg:#14171c;--mut:#5b6472;--line:#dfe3e9;--card:#fff;
      --accent:#2f6fed;--warn:#a5601b;--na:#8b94a3;--code:#eef1f6}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#0f1216;--fg:#e8ecf2;--mut:#9aa4b2;--line:#252b34;--card:#161a20;
  --accent:#7aa7ff;--warn:#d9a05b;--na:#6b7482;--code:#1b2027}}
:root[data-theme="dark"]{--bg:#0f1216;--fg:#e8ecf2;--mut:#9aa4b2;--line:#252b34;
  --card:#161a20;--accent:#7aa7ff;--warn:#d9a05b;--na:#6b7482;--code:#1b2027}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
     font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}
.wrap{max-width:860px;margin:0 auto;padding:32px 20px 80px}
.brand{font:700 12px/1 system-ui;letter-spacing:.22em;color:var(--mut)}
h1{font-size:27px;line-height:1.25;margin:.35em 0 .1em;letter-spacing:-.01em}
.period{color:var(--mut);font-size:14px;margin:0 0 18px}
.meta{font-size:12px;color:var(--mut);border:1px solid var(--line);border-radius:8px;
      padding:10px 12px;background:var(--card);word-break:break-all}
.meta code{background:var(--code);padding:1px 5px;border-radius:4px;font-size:11px}
nav.toc{margin:22px 0 30px;border-top:1px solid var(--line);padding-top:14px}
nav.toc ol{margin:0;padding-left:1.3em;columns:2;column-gap:28px}
nav.toc li{margin:.18em 0;font-size:13px;break-inside:avoid}
nav.toc a{color:var(--fg);text-decoration:none}
nav.toc a:hover{text-decoration:underline}
nav.toc .na{color:var(--na)}
section{margin:26px 0;scroll-margin-top:16px}
h2{font-size:17px;margin:0 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line)}
h2 .en{color:var(--mut);font-weight:400;font-size:12px;margin-left:8px}
.na-box{border:1px dashed var(--line);border-radius:8px;padding:12px 14px;
        color:var(--mut);background:var(--card);font-size:14px}
.na-box b{color:var(--warn);font-weight:600}
table{width:100%;border-collapse:collapse;font-size:13.5px}
.scroll{overflow-x:auto}
th,td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--mut);font-weight:600;font-size:12px;white-space:nowrap}
td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.smp{color:var(--mut);font-size:11.5px}
.card{border:1px solid var(--line);border-radius:8px;padding:11px 13px;margin:8px 0;
      background:var(--card)}
.card h3{margin:0 0 4px;font-size:14.5px}
.card .sub{color:var(--mut);font-size:12.5px;margin:0 0 6px}
.why{font-size:12px;color:var(--mut)}
.why b{color:var(--fg);font-weight:600}
.pill{display:inline-block;font-size:11px;padding:1.5px 7px;border-radius:99px;
      border:1px solid var(--line);color:var(--mut);margin-right:5px}
.q-GOOD{color:#1c7a4a}.q-MIXED{color:#a5601b}.q-LIMITED{color:#a5601b}.q-INSUFFICIENT{color:#a33}
footer{margin-top:44px;border-top:1px solid var(--line);padding-top:14px;
       color:var(--mut);font-size:12px}
.tl{margin:0;padding:0;list-style:none}
.tl li{display:flex;gap:12px;border-bottom:1px solid var(--line);padding:6px 0}
.tl .m{width:74px;color:var(--mut);font-size:12px;flex:none}
.tl .none{color:var(--na);font-size:12.5px}
@media print{
  :root{--bg:#fff;--fg:#111;--card:#fff;--line:#ccc;--mut:#555}
  body{font-size:10.5pt}.wrap{max-width:none;padding:0}
  nav.toc ol{columns:2}section{break-inside:avoid-page}
  h2{break-after:avoid-page}.card{break-inside:avoid}
}
"""


def to_html(report, *, lang="ko", app_base="https://earthus.net"):
    """§60 · §61 — 정본 HTML. 인쇄하면 그대로 PDF 다."""
    by_id = {f["factId"]: f for f in report.get("facts") or []}
    secs = report.get("sections") or []
    title = _title(report, lang)

    P = []
    P.append("<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\">")
    P.append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">")
    P.append(f"<title>{E(title)}</title><style>{CSS}</style></head><body><div class=\"wrap\">")

    # §61 LEVEL 1·2 — 정체성과 기간
    P.append("<header>")
    P.append("<div class=\"brand\">EARTHUS</div>")
    P.append(f"<h1>{E(title)}</h1>")
    per = report.get("period") or {}
    P.append(f"<p class=\"period\">관측 기간 {E(per.get('from') or '?')} ~ {E(per.get('to') or '?')}"
             f" · UTC</p>")
    if report.get("internalTest"):
        P.append("<div class=\"na-box\"><b>INTERNAL TEST</b> — 이 리포트는 시험용입니다. "
                 "승인 전까지 외부에 배포하지 않습니다.</div>")
    P.append("<div class=\"meta\">")
    P.append(f"리포트 <code>{E(str(report.get('reportId')))}</code> · "
             f"생성 {E(str(report.get('generatedAt')))} · 스냅샷 <code>"
             f"{E(str(report.get('dataSnapshotId')))}</code> · 엔진 <code>"
             f"{E(str(report.get('algorithmVersion')))}</code> · 상태 "
             f"{E(str(report.get('lifecycle') or report.get('status')))}")
    if report.get("revision"):
        P.append(f" · 개정 {report['revision']} (이전 {E(str(report.get('supersedes')))})")
    P.append("</div>")
    P.append(_visual_html(report))
    P.append("</header>")

    # 목차 (§100)
    P.append("<nav class=\"toc\"><ol>")
    for t in sx.table_of_contents(secs):
        cls = " class=\"na\"" if t["notAvailable"] or t["empty"] else ""
        na = " · 자료 없음" if t["notAvailable"] else ""
        P.append(f"<li{cls}><a href=\"#{E(t['id'])}\">{E(t['titleKo'] or t['id'])}{na}</a></li>")
    P.append("</ol></nav>")

    for s in secs:
        P.append(f"<section id=\"{E(s['id'])}\">")
        P.append(f"<h2>{E(s.get('titleKo') or s['id'])}"
                 f"<span class=\"en\">{E(s.get('titleEn') or '')}</span></h2>")
        P.append(_section_html(s, by_id, app_base))
        P.append("</section>")

    P.append("<footer>")
    P.append(f"EARTHUS · {E(EXPORT_VERSION)} · 모든 숫자는 위 스냅샷의 자료에서 나왔습니다. "
             f"자료가 없는 절은 비워 두고 사유를 적었습니다.")
    P.append("</footer></div></body></html>")
    return "".join(P)


def _visual_html(report):
    """§12 표지 그림 · §38 — 실제 캡처가 있을 때만 그린다.

    ⚠️ 없는 그림 자리에 임시 상자를 두지 않는다. 확인되지 않은 캡처(verified=False)는
       **그리지 않고** 왜 없는지 적는다. 확인 안 된 그림을 보고서에 실으면
       "EARTHUS 가 이렇게 봤다"는 거짓 증거가 된다.
    """
    man = report.get("visualManifest") or {}
    assets = [a for a in (man.get("assets") or []) if a.get("verified") and a.get("fileRef")]
    if not assets:
        why = None
        for a in (man.get("assets") or []):
            if a.get("verificationProblems"):
                why = "; ".join(a["verificationProblems"][:2])
                break
        note = why or "이 리포트에는 확인된 지구 캡처가 없습니다."
        return f"<div class=\"na-box\"><b>지구 캡처 없음</b> — {E(note)}</div>"
    a = assets[0]
    src = os.path.basename(a["fileRef"])
    cam = a.get("cameraPosition") or {}
    layers = " · ".join(E(x) for x in (a.get("dataLayer") or []))
    return (
        f"<figure class=\"earth\"><img src=\"{E(src)}\" alt=\"EARTHUS 지구 캡처\" "
        f"style=\"width:100%;border-radius:10px\">"
        f"<figcaption class=\"meta\">EARTHUS V2 실제 화면 · 레이어 {layers or '없음'} · "
        f"카메라 {E(str(cam.get('lat')))},{E(str(cam.get('lon')))} 고도 "
        f"{E(str(cam.get('heightKm')))}km · 촬영 {E(str(a.get('capturedAt')))} · "
        f"현상 {E(str(a.get('phenomenonId')))}</figcaption></figure>")


def _section_html(s, by_id, app_base):
    if s.get("notAvailable") or s.get("empty"):
        return (f"<div class=\"na-box\"><b>자료 없음</b> — "
                f"{E(s.get('reasonKo') or '사유가 적히지 않았습니다.')}</div>")

    P = []
    refs = s.get("factRefs") or []
    if refs:
        P.append("<div class=\"scroll\"><table><thead><tr><th>항목</th><th>값</th>"
                 "<th>표본</th><th>출처</th></tr></thead><tbody>")
        for fid in refs:
            f = by_id.get(fid)
            if not f:
                # §73 — 고아 참조를 조용히 숨기지 않는다. 화면에 그대로 드러낸다.
                P.append(f"<tr><td colspan=\"4\">⚠️ 없는 팩트 참조: <code>{E(fid)}</code></td></tr>")
                continue
            src = " · ".join(f.get("evidenceRefs") or []) or "—"
            P.append(f"<tr><td>{E(str(f.get('metric')))}</td>"
                     f"<td class=\"num\">{E(_fmt_value(f))}</td>"
                     f"<td class=\"num smp\">{E(str(f.get('sampleCount') or '—'))}</td>"
                     f"<td class=\"smp\">{E(src)}</td></tr>")
        P.append("</tbody></table></div>")

    # INTEGRATION-1 — 스토리 절(compose.py)도 그린다. 문장은 엔진이 만든 것을 그대로 쓴다.
    for st in s.get("_stories") or []:
        P.append("<div class=\"card\">")
        P.append(f"<h3>{E(str(st.get('title') or st.get('storyId')))}</h3>")
        P.append(f"<p class=\"sub\">{E(str(st.get('summary') or ''))}</p>")
        comp = st.get("comparison") or {}
        why = []
        if comp.get("rankHigh") and comp.get("ofYears"):
            why.append(f"{comp['ofYears']}년 중 {comp['rankHigh']}번째")
        run = (st.get("temporalExtent") or {}).get("longestRun")
        if run:
            why.append(f"{run}일 연속")
        if why:
            P.append("<p class=\"why\"><b>왜 중요한가</b> — " + " · ".join(E(w) for w in why) + "</p>")
        refs = " · ".join(E(r) for r in (st.get("sourceRefs") or []))
        if refs:
            P.append(f"<p class=\"sub\">근거 {refs} · 팩트 {len(st.get('factIds') or [])}건</p>")
        for pid in (st.get("phenomenonIds") or [])[:2]:
            P.append(f"<span class=\"pill\">{E(pid)}</span>")
        P.append("</div>")

    for c in s.get("cards") or []:
        P.append("<div class=\"card\">")
        P.append(f"<h3>{E(str(c.get('title') or c.get('eventId')))}</h3>")
        bits = [c.get("kindKo"), c.get("occurredAt") or "시각 미확인", c.get("region"),
                c.get("status")]
        P.append("<p class=\"sub\">" + " · ".join(E(str(b)) for b in bits if b) + "</p>")
        if c.get("headline"):
            P.append(f"<p class=\"sub\">{E(str(c['headline']))}</p>")
        if c.get("importanceReason"):
            P.append("<p class=\"why\"><b>선정 근거</b> — "
                     + " · ".join(E(str(x)) for x in c["importanceReason"]) + "</p>")
        if c.get("phenomenonId"):
            P.append(f"<span class=\"pill\">{E(c['phenomenonId'])}</span>")
        if c.get("kind"):
            P.append(f"<a class=\"pill\" href=\"{E(app_base)}/lab-reports.html?kind="
                     f"{E(c['kind'])}\">사건 보고서 열기</a>")
        P.append("</div>")

    if s.get("months") is not None:
        P.append("<ul class=\"tl\">")
        for m in s["months"]:
            evs = m.get("events") or []
            inner = (" · ".join(E(str(e.get('title'))) for e in evs[:3])
                     if evs else "<span class=\"none\">이 달에 해당하는 사건 없음</span>")
            P.append(f"<li><span class=\"m\">{E(m['month'])}</span><span>{inner}</span></li>")
        P.append("</ul>")

    if s.get("coverage"):
        cov = s["coverage"]
        st = s.get("state") or "UNKNOWN"
        P.append(f"<p><b class=\"q-{E(st)}\">{E(st)}</b></p>")
        P.append("<div class=\"scroll\"><table><tbody>")
        P.append(f"<tr><th>기간 안 사건</th><td class=\"num\">{E(str(cov.get('inPeriod')))}</td></tr>")
        P.append(f"<tr><th>기간 밖</th><td class=\"num\">{E(str(cov.get('outOfPeriod')))}</td></tr>")
        P.append(f"<tr><th>시각 미확인(제외)</th><td class=\"num\">{E(str(cov.get('undated')))}</td></tr>")
        if cov.get("undatedNote"):
            P.append(f"<tr><th>제외 사유</th><td>{E(cov['undatedNote'])}</td></tr>")
        deg = cov.get("degradedSources") or []
        P.append(f"<tr><th>상태 나쁜 출처</th><td>{E(', '.join(map(str, deg)) or '없음')}</td></tr>")
        P.append("</tbody></table></div>")

    if s.get("body"):
        P.append(_kv_table(s["body"]))

    rows = s.get("rows")
    if rows:
        P.append("<div class=\"scroll\"><table><tbody>")
        for r in rows:
            if isinstance(r, dict):
                head = r.get("provider") or r.get("ref") or r.get("title") or "—"
                rest = " · ".join(f"{k}: {v}" for k, v in r.items()
                                  if k not in ("provider", "ref", "title") and v is not None)
                P.append(f"<tr><th>{E(str(head))}</th><td>{E(rest)}</td></tr>")
            else:
                P.append(f"<tr><td colspan=\"2\">{E(str(r))}</td></tr>")
        P.append("</tbody></table></div>")

    if s.get("evaluationRefs"):
        P.append("<div class=\"scroll\"><table><tbody>")
        for e in s["evaluationRefs"]:
            P.append(f"<tr><td><code>{E(str(e))}</code></td></tr>")
        P.append("</tbody></table></div>")

    if s.get("comparisonNote"):
        P.append(f"<p class=\"why\">{E(s['comparisonNote'])}</p>")
    if s.get("rankingNote"):
        P.append(f"<p class=\"why\">{E(s['rankingNote'])}</p>")
    if s.get("note"):
        P.append(f"<p class=\"why\">{E(str(s['note']))}</p>")

    return "".join(P) or "<p class=\"why\">이 절에는 표시할 내용이 없습니다.</p>"


def _kv_table(body):
    if not isinstance(body, dict):
        return f"<p>{E(str(body))}</p>"
    P = ["<div class=\"scroll\"><table><tbody>"]
    for k, v in body.items():
        if isinstance(v, (list, tuple)):
            v = "<br>".join(E(str(x)) for x in v)
        else:
            v = E(str(v))
        P.append(f"<tr><th>{E(str(k))}</th><td>{v}</td></tr>")
    P.append("</tbody></table></div>")
    return "".join(P)


def write_all(report, out_dir, *, app_base="https://earthus.net"):
    """세 형식을 같은 리포트 객체에서 낸다. 손으로 맞추는 사본을 만들지 않는다."""
    os.makedirs(out_dir, exist_ok=True)
    written = {}
    for ext, text in (("html", to_html(report, app_base=app_base)),
                      ("md", to_markdown(report)),
                      ("json", to_json(report))):
        path = os.path.join(out_dir, filename(report, ext))
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
        written[ext] = path
    return written
