# -*- coding: utf-8 -*-
"""9개 메뉴 x 7단계 Premium UX 문법 매트릭스 워크플로 스크립트를 만든다.
사용: python build_grammar_wf.py <앞선 워크플로 스크립트> <by-menu.json> <출력 js>"""
import json
import re
import sys

src = open(sys.argv[1], encoding="utf-8").read()
data = json.load(open(sys.argv[2], encoding="utf-8"))


def const(name):
    m = re.search(r"const %s = `(.*?)`\n" % name, src, flags=re.S)
    assert m, name
    assert "${" not in m.group(1), name
    return m.group(1)


BASE, KNOWN, PD_SPEC = const("BASE"), const("KNOWN"), const("PD_SPEC")
menus = [{"no": k, "name": data["menus"][k], "items": data["byMenu"][k]} for k in ("10", "11")]
extra = {}

GRAMMAR = """
== PD 지시(2026-09-20): 9개 메뉴 각각을 눌렀을 때 **반드시 같은 7단계 Premium UX 문법**이 성립해야 한다 ==
 (1) 극적으로 보인다 -> (2) 정확한 값을 읽는다 -> (3) 출처를 확인한다 -> (4) 시간축을 움직인다 -> (5) 모델을 비교한다 -> (6) Intelligence 를 본다 -> (7) Simulation 으로 들어간다
 "그렇게 되면 EARTHUS 의 진짜 상품이 '3D 지구 지도'가 아니라 **'지구를 이해하고 미래를 시험해보는 시스템'** 으로 바뀐다."

[7단계의 정의 — 9개 메뉴가 **같은 공용 부품**으로 구현한다. 메뉴마다 새로 만들지 않는다]
 (1) 극적으로 보인다    1탭 뒤 3초 안에 지구가 그 현상의 자료로 바뀐다. 구간색+등치선+숫자 라벨 / 흐르는 입자 / 사건 기호(심각도 구간색). 막대기·그라데이션 단독 금지.
                        공용 부품: FieldRenderer(값 보간 -> 셰이더 구간색 -> 셰이더 등치선 -> 라벨) · ParticleField · EventLayer · Legend
 (2) 정확한 값을 읽는다  지도 클릭 1회 -> 우측 Inspector 에 값·단위·정밀도의 한계(모델 격자 평균인가, 실측 지점인가). 네트워크 호출 0건(텍스처 CPU 사본).
                        공용 부품: Inspector.ValueCard
 (3) 출처를 확인한다    같은 카드에서 출처 기관·관측/모델 구분·시각(observed / run / valid)·해상도·라이선스.
                        공용 부품: Inspector.ProvenanceCard + 배지
 (4) 시간축을 움직인다  화면 전체에 **하나뿐인** Global Timeline(과거 <-> 지금 <-> +5일). 메뉴마다 슬라이더를 만들지 않는다. v2 는 예보한다(5일).
                        공용 부품: GlobalTimeline + 공용 프레임 저장소
 (5) 비교한다          "두 개를 같은 조건(카메라·시간·고도·범례)으로 나란히". PD 표현은 '모델 비교'지만 메뉴에 따라 정직하게 성립하는 짝이 다르다:
                        모델<->모델(GFS|ECMWF) · 런<->런(최신|이전 런) · 기관<->기관(JTWC|JMA|KMA) · 관측<->모델 · 시각<->시각 · 시나리오<->기준선.
                        **그 메뉴에서 실제로 성립하고 자료가 있는 짝**을 고른다. 없는 짝을 지어내지 않는다.
                        공용 부품: Compare workspace(split / wipe / diff)
 (6) Intelligence 를 본다 수치 -> 출처 -> **원인과 확률(%)** 문장. v2 Intelligence 는 원인과 확률을 말하기 위해 만든 시스템이다 —
                        근거(측정된 조건+문헌 기작 / 기관 확률·앙상블 비율·채점된 모형)가 패킷에 실리면 말한다.
                        공용 부품: Intelligence Inspector + 인텔 패킷 v1(+ attribution[] · probability[])
 (7) Simulation 으로 들어간다 지금 보고 있는 상태를 스냅샷으로 들고 별도 작업 공간으로(Current -> Baseline -> Scenario -> Result, 시나리오 칩).
                        엔진이 아직 없으면 **그 사실과 이유를 말하되 입구는 같은 자리에 있다** — 문법은 같고 가용성은 정직하다.
                        공용 부품: Simulation workspace + SIM_CAPABILITIES(sim-questions.js) + SimulationRunRecord

[이미 확정된 기술 결정 — 어긋나지 않게]
 · 자료: aws/gfs-cloud-forecast 에 TMP 2m · UGRD/VGRD 10m · PRMSL · APCP 추가(NOAA GFS 0.5° · 41프레임 · 퍼블릭 도메인). 8bit 1채널 선형 값 텍스처. 0.25° 불가.
 · Open-Meteo 파생은 유료 핵심 그림에 쓰지 않는다. ECMWF 격자 수집기는 없다(ecmwf-ingest = 한국 97지점 IFS 대 AIFS 점값 + 태풍 경로 51멤버).
 · 기온·강수 앙상블은 없다(후보 NOAA GEFS 31멤버 — 해독 가능 여부 미확인). 태풍 확률은 지금 자료로 된다.
 · 진짜 계산 시뮬레이션은 지금 쓰나미 도달시간 1건(sim-questions.js SIM_CAPABILITIES, 21현상 중 available 1 · limited 3).
 · **2026-09-20 PD 추가 결정: Life · Travel 을 좌측 메뉴에 넣는다(메뉴 11개).** 아래 재료의 '자리 없음 · PD 결정 필요'는 이 결정으로 **해소됐다** — 자리는 이 메뉴다.
   두 메뉴도 **같은 7단계 문법**을 받는다. 다만 이 두 메뉴는 '물리 격자장'이 아니라 **기록·집계·장소** 자료다 — (1) 의 '극적으로'는 단계색 면·숫자 원판·리본(막대기·점 구름 금지),
   (4) 는 자료가 가진 시간(연도·계절·12시간 예측·30일 지수)만, (5)(7) 은 재료가 없으면 입구+사유. 빈 단계를 지어내 채우지 않는다.
   Travel 은 **관광 데이터랩 대회(접수 2026-09-30 · 발표심사 10-23) 출품 모듈**이다 — 그때까지 구조 이동은 동결하고 그림·문구만 고친다. 바다거북은 공공누리 4유형(상업적 이용금지) — 기관 서면 확인 전 동결.
 · 인텔 패킷 생산자 4개: 태풍(cyclone-analog) · 수온(marine-grid) · 지진(lab-events) · 평년 대비 기온(kma-aws).
"""

CELL = {"type": "object", "properties": {
    "step": {"type": "integer", "minimum": 1, "maximum": 7},
    "now": {"type": "string", "enum": ["EXISTS", "PARTIAL", "MISSING"]},
    "nowEvidence": {"type": "string", "description": "파일:줄 또는 공개 파일 실측. 직접 열어 본 것만"},
    "target": {"type": "string", "description": "이 메뉴에서 이 단계가 끝났을 때 사용자가 보고 하는 것 — 2~4문장, 구체적으로"},
    "sharedComponent": {"type": "string"},
    "menuSupplies": {"type": "string", "description": "공용 부품에 이 메뉴가 공급해야 하는 것(필드·눈금·출처표·프레임·비교 짝·패킷 생산자·시나리오)"},
    "dependsOn": {"type": "string", "description": "선행 작업(W0~W10)·자료·결정"},
    "tier": {"type": "string", "enum": ["FREE", "EXPLORER", "PRO"]},
    "honestLimit": {"type": "string", "description": "이 칸에서 말하면 안 되는 것·말할 수 없는 것"}},
    "required": ["step", "now", "nowEvidence", "target", "sharedComponent", "menuSupplies", "dependsOn", "tier"]}
MENU_SCHEMA = {"type": "object", "properties": {
    "menu": {"type": "string"},
    "cells": {"type": "array", "items": CELL, "minItems": 7, "maxItems": 7},
    "compareChoice": {"type": "string", "description": "(5) 에서 이 메뉴가 고른 비교 짝과 그 이유, 지금 자료로 되는 것/안 되는 것"},
    "simulationChoice": {"type": "string", "description": "(7) 에서 이 메뉴의 정직한 시나리오 후보(있는 엔진 우선)와 가용성"},
    "descriptor": {"type": "string", "description": "이 메뉴의 PhenomenonDescriptor 초안 — JS 객체 리터럴 모양 텍스트"},
    "firstSlice": {"type": "string", "description": "7단계를 전부 관통하는 가장 얇은 첫 출시 단면 — 무엇을 넣고 무엇을 미루나"},
    "notes": {"type": "string"}},
    "required": ["menu", "cells", "compareChoice", "simulationChoice", "descriptor", "firstSlice"]}
CRITIC_SCHEMA = {"type": "object", "properties": {
    "contract": {"type": "string", "description": "통합 PhenomenonDescriptor 계약 — 필드 목록과 각 필드를 어느 공용 부품이 읽는가"},
    "inconsistencies": {"type": "array", "items": {"type": "string"}},
    "sharedBuildOrder": {"type": "array", "items": {"type": "string"}, "description": "공용 부품을 어떤 순서로 만들어야 9개 메뉴가 가장 빨리 7단계를 관통하는가"},
    "firstVertical": {"type": "string", "description": "7단계를 처음으로 끝까지 관통시킬 메뉴 하나와 그 이유"},
    "risks": {"type": "array", "items": {"type": "string"}},
    "cellFixes": {"type": "array", "items": {"type": "object", "properties": {
        "menu": {"type": "string"}, "step": {"type": "integer"}, "fix": {"type": "string"}}, "required": ["menu", "step", "fix"]}}},
    "required": ["contract", "inconsistencies", "sharedBuildOrder", "firstVertical", "risks", "cellFixes"]}

BODY = r"""
phase('Matrix')
const rows = await parallel(MENUS.map((m) => () => agent(`${BASE}${KNOWN}${PD_SPEC}${GRAMMAR}
**메뉴 ${m.no} ${m.name} 의 7단계 매트릭스를 채운다.** 7칸 전부. 빈칸 금지.

이 메뉴에 들어오는 현상들의 검증된 분석(Before -> After -> 반박 검증을 이미 거쳤다 — 다시 설계하지 말고 **재료로 써라**. 잘리지 않았다):
${JSON.stringify(m.items, null, 1)}

각 단계((1)~(7))마다:
- now / nowEvidence — **지금 v2 에 이 단계가 이 메뉴에서 되는가.** 코드를 직접 열어 확인한다.
  (2) 는 지도 클릭 시 이 현상의 값이 실제로 나오는지(main.js 의 클릭 경로), (3) 은 출처·시각이 어디에 어떻게 나오는지, (4) 는 onTimeOffset -> 이 레이어가 실제로 반응하는지,
  (5) 는 비교 UI 가 있는지, (6) 은 인텔 패킷 생산자·띠가 이 현상에 있는지(intel-strip.js · main.js intelHostFor), (7) 은 sim-questions.js SIM_CAPABILITIES 의 이 현상 항목과 status.
  EXISTS 는 아껴 써라 — "있긴 한데 PD 목표에 못 미친다"는 PARTIAL 이다.
- target — 이 메뉴에서 그 단계가 끝났을 때의 화면. 공용 부품을 쓰되 이 메뉴만의 내용(값·눈금·짝·문장 예·시나리오)을 구체적으로.
  (6) 의 문장 예는 **원인과 확률을 실제로 말하는** 예로 쓴다(근거가 무엇인지와 함께). 근거를 댈 수 없으면 honestLimit 에 적는다.
- (5) compareChoice — 이 메뉴에서 **정직하게 성립하는 비교 짝**을 고른다. 지금 자료로 바로 되는 짝을 1순위로.
- (7) simulationChoice — 저장소에 **이미 있는 엔진**을 먼저 찾는다(sim-questions.js · aws/tsunami-eta · research-runtime · prototype/js/earthus2/v02 · prototype/v2-deploy/engine-v11 의 transport-simulator 등).
  없으면 없다고 하고, 어떤 시나리오가 이 메뉴에 의미 있는지와 필요한 것을 적는다. 입구는 같은 자리에 둔다.
- tier — 그 단계가 어느 요금에서 열리는가(PD: 무료=현재 시각화+기본 위치값 / EXPLORER=정확값·출처·편차·짧은 인텔 / PRO=비교·다중 모델·시뮬·export. 안전 정보는 무료).
- descriptor — 이 메뉴가 공용 부품들에 넘길 설정 객체 초안(fields, scale, units, sources, frames, compare, intel, simulation).
- firstSlice — 7단계를 **전부** 관통하는 가장 얇은 첫 단면. 빠질 수밖에 없는 단계는 "입구 + 정직한 사유"로 채운다.`,
  { label: `matrix:${m.no}`, phase: 'Matrix', schema: MENU_SCHEMA }).then((r) => ({ no: m.no, name: m.name, ...r }))))

const ok = rows.filter(Boolean)
log(`매트릭스 ${ok.length}/2 메뉴 · 칸 ${ok.reduce((s, r) => s + (r.cells || []).length, 0)}/14`)

return { rows: ok }

"""

js = ("export const meta = {\n"
      "  name: 'v2-premium-grammar-matrix-life-travel',\n"
      "  description: 'Life · Travel 두 메뉴의 7단계 매트릭스를 코드 실측으로 채운다 (읽기 전용)',\n"
      "  phases: [\n"
      "    { title: 'Matrix', detail: '메뉴마다 7칸 — 지금 있나 · 목표 · 공용 부품 · 메뉴가 공급할 것 · 선행 · 요금' },\n"
      "    { title: 'Critic', detail: '7단계가 9개 메뉴에서 같은 부품으로 구현되는가 · 통합 계약 · 만드는 순서' },\n"
      "  ],\n"
      "}\n"
      "const BASE = " + json.dumps(BASE, ensure_ascii=False) + "\n"
      "const KNOWN = " + json.dumps(KNOWN, ensure_ascii=False) + "\n"
      "const PD_SPEC = " + json.dumps(PD_SPEC, ensure_ascii=False) + "\n"
      "const GRAMMAR = " + json.dumps(GRAMMAR, ensure_ascii=False) + "\n"
      "const MENU_SCHEMA = " + json.dumps(MENU_SCHEMA, ensure_ascii=False) + "\n"
      "const CRITIC_SCHEMA = " + json.dumps(CRITIC_SCHEMA, ensure_ascii=False) + "\n"
      "const MENUS = " + json.dumps(menus, ensure_ascii=False) + "\n"
      "const EXTRA = " + json.dumps(extra, ensure_ascii=False) + "\n"
      + BODY)
open(sys.argv[3], "w", encoding="utf-8", newline="\n").write(js)
print("script", len(js), "chars | menus", [(m["no"], len(m["items"])) for m in menus])
