#!/usr/bin/env python3
"""KMA 공식 특보구역 계층 parser의 fail-closed 계약."""

import importlib.util
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("CACHE_BUCKET", "fixture")
os.environ.setdefault("CACHE_REGION", "ap-northeast-2")
os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "fixture")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "fixture")
sys.path.insert(0, str(ROOT / "aws" / "kma-warn"))

spec = importlib.util.spec_from_file_location("kma_warn_handler", ROOT / "aws" / "kma-warn" / "handler.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def main():
    fixture = """
# REG_ID,TM_ST,TM_ED,REG_SP,REG_UP,REG_KO,REG_NAME
L1000000,200001010000,999912312359,00000001,00000000,전국,대한민국
L1010000,200001010000,999912312359,00000002,L1000000,경기도,경기도
L1010200,200001010000,999912312359,00000003,L1010000,광명,광명시
S9000000,200001010000,999912312359,00000001,00000000,전해상,대한민국 전해상
S9010000,200001010000,999912312359,00000002,S9000000,서해,서해 전해상
X0000000,200001010000,999912312359,0,00000000,거절,거절
"""
    table, rejected = module.parse_region_hierarchy(fixture)
    assert len(table) == 5
    assert rejected == 0
    assert table["L1010200"]["parentId"] == "L1010000"
    assert table["L1010200"]["parentStatus"] == "MAPPED"
    assert table["S9010000"]["regionType"] == "SEA"
    assert table["L1000000"]["parentStatus"] == "ROOT"
    assert all(item["geometry"] is None for item in table.values())
    assert all(item["geometryStatus"] == "OFFICIAL_POLYGON_API_NOT_AVAILABLE" for item in table.values())

    fixed = """
L1000000 200507010000 210012310000 00000001 00000000 전국                                     전국
L1010000 200507010000 210012310000 00000002 L1000000 경기도                                   경기도
L1010200 200507010000 210012310000 00000013 L1010000 광명                                     광명시
"""
    fixed_table, rejected = module.parse_region_hierarchy(fixed)
    assert rejected == 0
    assert fixed_table["L1010200"]["name"] == "광명시"
    assert fixed_table["L1010200"]["shortName"] == "광명"
    assert fixed_table["L1010200"]["parentId"] == "L1010000"

    self_root, rejected = module.parse_region_hierarchy(
        "S2000000 200507010000 210012310000 00001001 S2000000 연안바다                                연안바다\n"
        "S2110100 200507010000 210012310000 00001012 S2000000 경북남부앞바다중 평수구역              경북남부앞바다중 평수구역\n"
    )
    assert rejected == 0
    assert self_root["S2000000"]["parentId"] is None
    assert self_root["S2000000"]["sourceParentId"] == "S2000000"
    assert self_root["S2000000"]["parentStatus"] == "SELF_ROOT_NORMALIZED"
    assert self_root["S2110100"]["parentStatus"] == "MAPPED"

    cycle = """
L1000001,200001010000,999912312359,0,L1000002,A,A
L1000002,200001010000,999912312359,0,L1000001,B,B
"""
    cyclic, rejected = module.parse_region_hierarchy(cycle)
    assert rejected == 2
    assert cyclic["L1000001"]["parentStatus"] == "CYCLE_REJECTED"
    assert cyclic["L1000002"]["parentStatus"] == "CYCLE_REJECTED"
    print("N2 warning hierarchy tests: 22 passed")


if __name__ == "__main__":
    main()
