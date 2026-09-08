# -*- coding: utf-8 -*-
"""현상 레지스트리 **읽기** — INTEGRATION-1 §2.

⚠️⚠️ 이 파일은 레지스트리를 **다시 정의하지 않는다.** 정본은 하나다:
        prototype/v2-three/js/phenomenon-registry.js
   파이썬 쪽에서 현상↔레이어를 알아야 할 때(예: 리포트 팩트로 지구를 캡처할 때)
   표를 베껴 오면 두 개의 진실이 생긴다. 실제로 그 사고가 났다 —
   PHASE 8 의 climate_series_adapter 가 레이어 키를 손으로 적어 'ocean/sst' 라고
   썼는데, 진짜 레이어는 'ocean/sstfield' 였다. 캡처가 조용히 빈 지구를 찍었다.

   그래서 여기서는 **그 파일을 읽어서** 표를 얻는다. 파일이 바뀌면 따라 바뀐다.

읽는 것
    LAYER_PHENOMENON   'scene/layer' → {phenomenon, role, status}
    PHENOMENA 의 id 목록 (존재 확인용)

읽지 못하면 조용히 비어 있는 표를 돌려주지 않고 **예외를 던진다** —
빈 표로 계속 가면 "레이어를 못 찾았다"가 "레이어가 없다"로 둔갑한다.
"""
import os
import re

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO = os.path.dirname(os.path.dirname(_HERE))
REGISTRY_JS = os.path.join(_REPO, "prototype", "v2-three", "js", "phenomenon-registry.js")

# 'ocean/sstfield': Object.freeze({ phenomenon: 'ocean.sst', role: 'primary', status: 'rename' }),
# ⚠️ phenomenon 이 null 인 줄도 읽는다(사건 피드·LAB 입구 등 '현상이 아닌' 메뉴).
#    빼 버리면 표의 개수가 실제와 달라지고, "레이어를 못 찾았다"가 "그런 레이어는 없다"로
#    둔갑한다. null 은 None 으로 그대로 담는다.
_ROW = re.compile(
    r"'(?P<key>[a-z0-9_-]+/[a-z0-9_-]+)'\s*:\s*Object\.freeze\(\{\s*"
    r"phenomenon:\s*(?:'(?P<phen>[a-z]+\.[a-z_]+)'|(?P<null>null))"
    r"(?:[^}]*?role:\s*'(?P<role>[a-z_]+)')?",
    re.S)


class RegistryError(RuntimeError):
    pass


_cache = {}


def _source(path=None):
    p = path or REGISTRY_JS
    if p in _cache:
        return _cache[p]
    if not os.path.exists(p):
        raise RegistryError("현상 레지스트리를 찾을 수 없다: %s" % p)
    with open(p, encoding="utf-8") as fh:
        _cache[p] = fh.read()
    return _cache[p]


def layer_phenomenon(path=None):
    """'scene/layer' → {phenomenon, role}. 정본 파일에서 그대로 읽는다."""
    src = _source(path)
    start = src.find("export const LAYER_PHENOMENON")
    if start < 0:
        raise RegistryError("LAYER_PHENOMENON 선언을 찾을 수 없다")
    body = src[start:]
    out = {}
    for m in _ROW.finditer(body):
        out[m.group("key")] = {"phenomenon": m.group("phen"), "role": m.group("role")}
    if not out:
        raise RegistryError("LAYER_PHENOMENON 을 한 줄도 읽지 못했다 — 형식이 바뀌었을 수 있다")
    return out


def representative_layer_for(phenomenon_id, path=None):
    """현상 → 대표 레이어 키. JS 의 representativeLayerFor 와 **같은 규칙**이다.

    primary 가 있으면 그것, 없으면 처음 만난 것. 없으면 None.
    """
    fallback = None
    for key, hit in layer_phenomenon(path).items():
        if hit["phenomenon"] != phenomenon_id:
            continue
        if hit["role"] == "primary":
            return key
        if fallback is None:
            fallback = key
    return fallback


def layers_for(phenomenon_id, path=None):
    """그 현상에 속한 모든 레이어 키."""
    return sorted(k for k, v in layer_phenomenon(path).items()
                  if v["phenomenon"] == phenomenon_id)


def is_known_layer(key, path=None):
    return key in layer_phenomenon(path)


def phenomenon_ids(path=None):
    """레지스트리에 실제로 있는 현상 id 집합. 현상이 없는 입구 줄은 뺀다."""
    return sorted({v["phenomenon"] for v in layer_phenomenon(path).values()
                   if v["phenomenon"]})


def counts(path=None):
    """읽은 줄 수. 검사기가 이 값을 정본 개수와 대조한다."""
    lp = layer_phenomenon(path)
    return {"layers": len(lp),
            "withPhenomenon": sum(1 for v in lp.values() if v["phenomenon"]),
            "entrypoints": sum(1 for v in lp.values() if not v["phenomenon"]),
            "phenomena": len(phenomenon_ids(path))}
