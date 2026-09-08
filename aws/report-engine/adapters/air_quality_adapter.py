# -*- coding: utf-8 -*-
"""대기질 어댑터 — PHASE 8 §8.

**아직 아무것도 만들 수 없다.** 그 사실을 코드로 남긴다.

왜 만들 수 없나 (2026-09-08 실측)
  · wind/air-ea.json · wind/korea-air-obs.json · wind/air-state.json
    → 200 으로 받힌다. 그런데 전부 **지금 상태**뿐이다. 어제 값이 없다.
      매 실행마다 같은 키를 덮어쓰므로 8월을 되돌릴 수 없다.
  · aws/air-state/handler.py 는 archive/air-state/<날짜>.json 으로 하루치를 남긴다.
    → 그 접두사는 **비공개**다(403). 자격증명이 있는 환경에서만 읽을 수 있다.
  · 예보 스냅샷은 아무 데도 얼려 두지 않는다. air-state 가 Open-Meteo 예보를
    부르지만 **판정에 쓰고 버린다** — as-issued 를 복원할 방법이 없다.

그래서
  normalize() → []                     기간 팩트를 만들 수 없다
  evaluate()  → NO_SOURCE              채점할 예보 스냅샷이 없다

⚠️ 이 파일의 존재 이유는 "언젠가 채우려고"가 아니다.
   보고서 대기질 절이 **왜 비어 있는지**를 화면이 그대로 말할 수 있게 하기 위해서다.
   빈 절을 그럴듯한 문장으로 덮는 것보다 이게 낫다.

이 표가 바뀌는 조건
  1. archive/air-state/ 를 공개하거나 자격증명으로 읽는 실행 환경을 만든다 → 기간 팩트 가능
  2. 대기질 예보를 발표 시각과 함께 얼리는 수집기를 만든다 → 채점 가능
  둘 중 하나라도 되면 여기 NO_SOURCE 를 지우고 실제 구현으로 바꾼다.
"""
import os
import sys

sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "_shared"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from base import ForecastAdapter  # noqa: E402

PHENOMENON = "weather.air_quality"
# 확인한 것을 그대로 적는다. 나중에 누가 다시 확인할 수 있게 응답 코드까지 남긴다.
PROBED = (
    {"ref": "wind/air-ea.json", "http": 200, "state": "CURRENT_ONLY",
     "detail": "동아시아 대기질 현재 상태. 이력 없음(같은 키를 덮어씀)"},
    {"ref": "wind/korea-air-obs.json", "http": 200, "state": "CURRENT_ONLY",
     "detail": "한국 관측 현재 상태. 이력 없음"},
    {"ref": "wind/air-state.json", "http": 200, "state": "CURRENT_ONLY",
     "detail": "오늘 판정 + 어제와의 차이. 기간 집계 불가"},
    {"ref": "archive/air-state/<날짜>.json", "http": 403, "state": "PRIVATE",
     "detail": "하루치 스냅샷은 있으나 공개 읽기 권한이 없다"},
)
PROBED_AT = "2026-09-08"


class AirQualityAdapter(ForecastAdapter):
    phenomenon_id = PHENOMENON
    source = None
    model_id = None
    model_version = None

    def input_window(self, doc):
        return None      # 얼린 예보가 없다

    def output_window(self, doc):
        return None      # 관측 이력이 없다

    def normalize(self, doc, period):
        return []        # 값을 지어내느니 아무것도 내지 않는다

    def evaluate(self, doc, period):
        return self.unavailable(
            "NO_SOURCE",
            "대기질은 현재 상태만 보관합니다. 예보를 발표 시각과 함께 얼려 두지 않아 "
            "채점할 대상이 없습니다(%s 확인)." % PROBED_AT)

    def provenance(self):
        p = super().provenance()
        p["probed"] = list(PROBED)
        p["probedAt"] = PROBED_AT
        return p
