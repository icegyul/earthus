# -*- coding: utf-8 -*-
"""ForecastAdapter 계약 (PHASE 8 §8).

어댑터가 있어야 그 현상을 채점할 수 있다. 어댑터가 없으면 **없다고 적는다** —
자리를 채우려고 숫자를 만들지 않는다.

계약
  phenomenon_id   무엇을 채점하는가
  source          어디서 온 자료인가 (공개 키 또는 기관)
  model_id        누구의 예보인가. 모델을 섞지 않으려면 반드시 있어야 한다
  model_version   같은 모델이라도 판이 바뀌면 다른 숫자다
  input_window    예보 스냅샷이 있는 구간
  output_window   실측이 있는 구간
  normalize()     원자료 → 우리 봉투
  evaluate()      예보 vs 실측 → 검증 레코드 (없으면 (), reason 을 남긴다)
  provenance()    무엇을 보고 만들었는지

evaluate() 가 못 할 때 돌려주는 것
  Availability {available: False, reason: <키>, detail: <사람이 읽는 이유>}
  reason 은 report_contract.NOT_VERIFIABLE_REASONS 또는 아래 ADAPTER_REASONS 에 있어야 한다.
"""
import os
import sys

sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "_shared"))
import report_contract as rc      # noqa: E402

# 어댑터 층에서만 쓰는 사유. 검증 계약의 사유와 뜻이 겹치지 않게 나눠 둔다.
ADAPTER_REASONS = {
    "NO_SOURCE": "그 현상의 예보를 우리가 받지도 보관하지도 않는다",
    "NOT_AVAILABLE": "자료는 존재하지만 이 실행 환경에서 읽을 수 없다 (권한·목록 조회 불가 등)",
    "FORECAST_ARCHIVE_NOT_ENUMERABLE": "예보 원문은 보존돼 있으나 키를 나열할 수 없어 기간 단위로 모을 수 없다",
    "NO_OBSERVATION_ARCHIVE": "실측 이력이 없다",
}


class ForecastAdapter:
    """모든 예보 어댑터의 부모. 구현하지 않은 것을 구현한 척하지 않는다."""

    phenomenon_id = None
    source = None
    model_id = None
    model_version = None

    def input_window(self, doc):
        """예보 스냅샷이 덮는 구간 {'from','to'} 또는 None."""
        raise NotImplementedError

    def output_window(self, doc):
        """실측이 덮는 구간 {'from','to'} 또는 None."""
        raise NotImplementedError

    def normalize(self, doc, period):
        """원자료 → ReportFact 목록. 자료가 없으면 빈 목록."""
        raise NotImplementedError

    def evaluate(self, doc, period):
        """예보 vs 실측 → 검증 레코드 목록. 못 하면 unavailable() 을 돌려준다."""
        raise NotImplementedError

    def provenance(self):
        return {"phenomenonId": self.phenomenon_id, "source": self.source,
                "modelId": self.model_id, "modelVersion": self.model_version,
                "adapter": type(self).__name__}

    # ── 공통 도우미 ──
    @staticmethod
    def unavailable(reason, detail=None):
        if reason not in ADAPTER_REASONS and reason not in rc.NOT_VERIFIABLE_REASONS:
            raise ValueError(f"알 수 없는 사유: {reason}")
        text = ADAPTER_REASONS.get(reason) or rc.NOT_VERIFIABLE_REASONS.get(reason)
        return {"available": False, "reason": reason, "detail": detail or text}

    @staticmethod
    def available(**kw):
        out = {"available": True}
        out.update(kw)
        return out
