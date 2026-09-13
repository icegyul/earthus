# -*- coding: utf-8 -*-
"""주장 게이트 — `prototype/js/earthus2/v11/claims/claim-gate.js` 의 Python 이식.

**규칙을 새로 만들지 않았다.** v11 의 `RULES` · `evaluateClaim` · `claimLabel` 을
그대로 옮겼다. v11 테스트 65건이 그 규칙을 고정하고 있으므로 값을 바꾸지 않는다.

이 게이트가 하는 일: **증거가 없으면 주장을 붙이지 않는다.**
`allowed=False` 인 주장은 이름을 얻지 못한다(`claim_label` 이 None 을 돌려준다).

⚠️ 이것은 진실 등급(TRUTH_STATUS)이 아니다. 주장 종류에 필요한 증거가 갖춰졌는지만 본다.
   진실 등급은 `aws/_shared/truth_vocabulary.py` 가 정한다.
"""
SCHEMA = "earthus.claim-gate/1"

# v11 claim-gate.js:1-7 그대로
RULES = {
    "SOURCE_ATTRIBUTION": ("officialSourceAttribution",),
    "TRANSPORT": ("vectorProof", "transportEvidenceKind"),
    "DISCOVERY_RECOMMENDATION": ("minimumSignals", "safetyGate", "providerEvidence"),
    "FORECAST": ("modelReleaseGate", "calibrationEvidence", "providerEvidence"),
    "SAFETY_ACTION": ("officialWarning",),
}

# v11 claim-gate.js:9 의 표기 표
_LABELS = {
    "SOURCE_ATTRIBUTION": "SOURCE_ATTRIBUTED",
    "DISCOVERY_RECOMMENDATION": "EARTHUS_DISCOVERY",
    "FORECAST": "EARTHUS_FORECAST",
    "SAFETY_ACTION": "OFFICIAL_SAFETY",
}
# TRANSPORT 는 증거 종류에 따라 두 갈래다 (v11 과 같다)
_TRANSPORT_OBSERVED = "OBSERVED_MOTION"
_TRANSPORT_MODELLED = "MODELLED_TRANSPORT"
# v11 이 `transportEvidenceKind` 를 참으로 인정하는 값
TRANSPORT_EVIDENCE_KINDS = ("MODELLED", "OBSERVED")

CLAIM_TYPES = tuple(sorted(RULES))


def evaluate_claim(claim_type, evidence=None):
    """v11 `evaluateClaim(claimType, evidence)` 이식.

    돌려주는 것: {claimType, allowed, missing}

    ⚠️ 모르는 주장 종류는 요구 증거가 **빈 목록**이 되어 통과한다 — v11 이 그렇다
       (`RULES[claimType] || []`). 그 동작을 바꾸지 않았다. 대신 호출자가 종류를
       확인하도록 `is_known()` 을 뒀다.
    """
    evidence = evidence or {}
    required = RULES.get(claim_type, ())
    missing = []
    for key in required:
        value = evidence.get(key)
        if key == "transportEvidenceKind":
            if value in TRANSPORT_EVIDENCE_KINDS:
                continue
            missing.append(key)
            continue
        if value is not True:
            missing.append(key)
    return {"claimType": claim_type, "allowed": not missing, "missing": missing}


def claim_label(claim_type, evidence=None):
    """게이트를 통과한 주장의 표기. 통과하지 못하면 **None** — 이름을 주지 않는다."""
    evidence = evidence or {}
    gate = evaluate_claim(claim_type, evidence)
    if not gate["allowed"]:
        return None
    if claim_type == "TRANSPORT":
        return (_TRANSPORT_OBSERVED
                if evidence.get("transportEvidenceKind") == "OBSERVED"
                else _TRANSPORT_MODELLED)
    return _LABELS.get(claim_type, claim_type)


def is_known(claim_type):
    """RULES 에 있는 종류인가. 모르는 종류를 조용히 통과시키지 않으려면 먼저 묻는다."""
    return claim_type in RULES


def gate_all(claims, evidence=None):
    """주장 여러 개를 한 번에. 돌려주는 것: {allowed[], refused[]}

    `allowed` 항목은 {claimType, label}, `refused` 항목은 {claimType, missing, reason}.
    """
    evidence = evidence or {}
    allowed, refused = [], []
    for claim_type in claims or ():
        if not is_known(claim_type):
            refused.append({"claimType": claim_type, "missing": [],
                            "reason": "모르는 주장 종류 — 통과시키지 않는다"})
            continue
        gate = evaluate_claim(claim_type, evidence)
        if gate["allowed"]:
            allowed.append({"claimType": claim_type,
                            "label": claim_label(claim_type, evidence)})
        else:
            refused.append({"claimType": claim_type, "missing": gate["missing"],
                            "reason": "필요한 증거가 없다: %s" % ", ".join(gate["missing"])})
    return {"schema": SCHEMA, "allowed": allowed, "refused": refused}
