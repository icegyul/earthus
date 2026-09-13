# -*- coding: utf-8 -*-
"""예보 성적표 → DATA_STORY 콘텐츠 — 지시서 §81 · §147.

이것이 EARTHUS 가 남과 다른 이야기를 할 수 있는 자리다:
**"우리가 어제 한 예보가 실제로 얼마나 맞았는가."**

입력은 `wind/series/verify-daily.json` — 저장소에서 예보 스냅샷·실측·채점이
셋 다 있는 유일한 자료다(docs/earthus-v2/data-availability-matrix.md).

지키는 것 (kma_verify_adapter.py 와 같은 규칙 — 두 곳이 다르면 두 성적이 생긴다)
  · 리드타임을 합치지 않는다. 24h 와 48h 는 다른 숫자다.
  · 모델을 섞지 않는다.
  · 표본 수로 가중한다.
  · **하나의 정확도 %를 만들지 않는다.**
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_AWS = os.path.dirname(os.path.dirname(_HERE))
sys.path.insert(0, os.path.dirname(_HERE))
sys.path.insert(0, os.path.join(_AWS, "_shared"))

import content_contract as cc      # noqa: E402
import report_period as rp         # noqa: E402
import report_contract as rc       # noqa: E402
import eligibility as el           # noqa: E402


def _load(name, path):
    """⚠️ 파일 경로로 직접 읽는다. sys.path 에 report-engine/adapters 를 넣으면
       그 `adapters` 패키지가 배포 엔진의 `adapters` 패키지를 가린다 —
       실제로 가렸다(ImportError: cannot import name 'lab_report_adapter').
       두 디렉터리에 같은 이름의 패키지가 있으므로 경로를 섞지 않는다."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules.setdefault(name, mod)
    spec.loader.exec_module(mod)
    return mod


def _adapter_path():
    """`kma_verify_adapter.py` 가 실제로 있는 자리. **패키지 안을 먼저 본다.**

    Lambda 는 zip 을 `/var/task` 로 풀고 그것이 `sys.path` 다. 그런데 위에서 만든 `_AWS` 는
    `dirname(dirname(_HERE))` = `/var` 가 되어 zip 루트 **밖**을 가리켰다. 그래서 콜드 스타트가
    `FileNotFoundError: /var/report-engine/adapters/kma_verify_adapter.py` 로 죽었다
    (docs/DISTRIBUTION_DEPLOYMENT_GAP.md §4).

    배포 패키저(`aws/_shared/lambda_package.py`)가 이 파일을 zip 루트에 평평하게 넣는다.
    로컬 저장소에는 그 자리에 없으므로 `aws/report-engine/adapters/` 로 떨어진다.

    ⚠️ 바꾼 것은 **경로를 찾는 방법뿐**이다. 무엇을 읽는지·어떻게 채점하는지·판정 기준은
       한 줄도 바뀌지 않았다. `_load` 도 그대로다 — `sys.path` 를 섞지 않는 이유는 위 주석에 있다.
    """
    for candidate in (
        os.path.join(os.path.dirname(_HERE), "kma_verify_adapter.py"),               # 배포 패키지 루트
        os.path.join(_AWS, "report-engine", "adapters", "kma_verify_adapter.py"),    # 저장소
    ):
        if os.path.isfile(candidate):
            return candidate
    raise FileNotFoundError(
        "kma_verify_adapter.py 를 찾지 못했다 — 배포 패키지에 동봉되지 않았을 수 있다. "
        "찾아본 곳: 패키지 루트, aws/report-engine/adapters/ "
        "(docs/DISTRIBUTION_DEPLOYMENT_GAP.md)")


kma = _load("earthus_kma_verify_adapter", _adapter_path())

SOURCE_REF = kma.SOURCE_REF

# 이 어댑터가 다루는 현상. 표에 없는 현상의 성적을 만들지 않는다.
PHENOMENA = ("weather.temperature", "weather.wind")

METRIC_KO = {"mae": "평균절대오차", "rmse": "제곱평균오차", "me": "치우침(평균오차)"}
VAR_KO = {"temperature_2m": "기온", "wind_speed_10m": "풍속"}
UNIT_DISPLAY = {"degC": "°C"}


def candidate(daily_doc, period, *, lang="ko"):
    """한 기간의 성적표 하나를 콘텐츠 후보로 만든다.

    자료가 없으면 **None 을 돌려준다.** 빈 성적표를 만들지 않는다(§17 · §165).
    """
    cov = kma.coverage(daily_doc, period)
    if not cov.get("ok"):
        return None
    facts = kma.build_facts(daily_doc, period)
    if not facts:
        return None

    agg = kma.aggregate(daily_doc, period)
    total_n = sum(v["n"] for v in agg.values())
    models = sorted({k[0] for k in agg})
    leads = sorted({k[2] for k in agg})
    phen = sorted({f["phenomenonId"] for f in facts})

    refs = [SOURCE_REF]

    # 합계도 숫자다 — 팩트로 만들지 않고 문장에만 쓰면 그 숫자에 출처가 없다(§75).
    # 실제로 첫 실행에서 표본 합계 477212 가 '출처에 없는 숫자'로 잡혔다.
    facts = list(facts) + [rc.make_fact(
        fact_id=f"fact:{rp.label(period)}:sample-total",
        phenomenon_id=phen[0] if phen else "weather.temperature",
        metric="채점 표본 합계",
        value=total_n,
        unit="건",
        period=rp.label(period),
        source="기상청 ASOS 실측과 대조한 (지점 × 시각) 수",
        truth_type="EARTHUS_ANALYSIS",
        sample_count=total_n,
        evidence_refs=refs,
    )]

    # 리드타임 숫자(24·48)는 원자료의 **키 문자열**에 글자 그대로 있다.
    # 그 키를 원문으로 넘긴다 — 우리가 지어낸 숫자가 아니다.
    combo_keys = sorted({f"{m}|{v}|{h}h" for (m, v, h) in agg})
    claims = []
    # 관측 — 채점에 실제로 쓴 표본. 이것이 "우리가 무엇을 봤는가"다.
    claims.append(cc.make_claim(
        text=f"{rp.label(period)} 기간에 기상청 ASOS 실측과 대조한 표본은 {total_n}개다.",
        claim_type="OBSERVED", source_refs=refs, evidence_refs=refs, lang=lang))
    # 분석 — 리드·모델별 오차. 합치지 않는다.
    for (model, var, lead), m in sorted(agg.items()):
        if kma.VAR_PHENOMENON.get(var) not in PHENOMENA:
            continue
        label = kma.MODEL_LABEL.get(model, model)
        # 화면 표기만 바꾼다. kma_verify_adapter 의 단위 계약(degC)은 그대로 둔다 —
        # 그 값이 팩트에 들어가고, 여기서 고치면 두 단위 어휘가 생긴다.
        unit = UNIT_DISPLAY.get(kma.VAR_UNIT.get(var, ""), kma.VAR_UNIT.get(var, ""))
        what = VAR_KO.get(var, var)
        claims.append(cc.make_claim(
            text=(f"{label} {what} {lead}시간 예보의 평균절대오차는 {m['mae']}{unit}, "
                  f"제곱평균오차는 {m['rmse']}{unit} (표본 {m['n']})."),
            claim_type="ANALYZED", source_refs=refs, evidence_refs=refs,
            fact_id=f"fact:{rp.label(period)}:{model}:{var}:{lead}h:mae", lang=lang))

    signals = {
        "magnitude": el.UNKNOWN,       # 성적에는 규모가 없다
        "anomaly": el.UNKNOWN,
        "extent": 0.3,                 # 대한민국 97지점 — 국지다
        "duration": 1.0,               # 기간 전체를 덮는다
        "novelty": 0.5,
        "public_relevance": 0.7,
        "data_completeness": el.completeness(cov.get("days", 0), len(rp.days(period))),
    }

    return {
        "sourceKind": "verify-scorecard",
        "reportKind": "forecast-verification",
        "eventId": None,
        "phenomenonId": phen[0] if phen else "weather.temperature",
        "phenomenonIds": phen,
        "contentType": "DATA_STORY",
        "title": f"EARTHUS 예보 성적표 · {rp.label(period)}",
        "headline": None,
        "summary": ("우리가 낸 예보를 발행 시점 그대로 얼려 두고 기상청 실측과 대조한 결과입니다. "
                    "리드타임과 모델을 합치지 않습니다."),
        "status": "FINAL_REPORT",
        "eventTime": None,
        "observationPeriod": {"from": rp.parse(period)[1].isoformat(),
                              "to": rp.parse(period)[2].isoformat()},
        "geometry": {"type": "point", "lat": 36.5, "lon": 127.8, "radiusKm": 300.0},
        "location": "대한민국 (ASOS 97지점)",
        "facts": facts,
        "claims": claims,
        "signals": signals,
        "truthType": "EARTHUS_ANALYSIS",
        "sourceCount": len(models),
        "sampleCount": total_n,
        "datasetRefs": refs,
        # 원자료 문서에 글자 그대로 있는 문자열만. 조합 키가 리드타임 숫자를 들고 있다.
        "sourceTexts": combo_keys + [str(x) for x in (daily_doc or {}).get("leadsHours") or []],
        "verified": True,
        "coverage": cov,
        "models": models,
        "leads": leads,
        "raw": None,
    }
