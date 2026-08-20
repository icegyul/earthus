#!/usr/bin/env python3
"""N1의 예약 수집기 주 출력이 health 감시 밖으로 새지 않는지 검사한다."""

import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HEALTH = ROOT / "aws" / "health" / "handler.py"

# 2026-08-14 서울 리전에서 enabled가 확인된 예약 수집기의 정본 출력.
# EventBridge 목록 read 권한이 생기면 운영 inventory와 이 fixture를 함께 diff한다.
SCHEDULED_OUTPUTS = {
    "wind/air.json", "wind/korea-air-obs.json", "wind/air-state.json",
    "wind/status/ascat-observations.json", "events/crustal.json",
    "wind/status/cwa-observations.json", "archive/air-evidence/latest.json",
    "events/cyclone-tracks.json", "celestrak/catalog.json.gz",
    "ocean/cyclone-analog.json", "wind/ecmwf-fcst.json", "events/global.json",
    "clouds/meta.json", "wind/kma-fcst.json", "ocean/lab-reports.json",
    "solar/meta.json", "events/volcanic-ash-vaac.json", "events/tsunami-intl.json",
    "archive/vaac-validation/latest.json", "events/wildfire.json", "wind/global.json",
    "events/forest-fire-kr.json", "wind/fx-ea.json", "clouds/gk2a/meta.json",
    "wind/gts-global.json", "wind/jp-amedas.json", "events/jma-warn.json",
    "events/coast-kr.json", "wind/kma-aws.json", "wind/kma-aws-min.json",
    "wind/kma-life.json", "events/kma-lightning.json", "wind/kma-mountain.json",
    "wind/kma-normal.json", "ocean/kma-buoy.json", "wind/kma-radar.json",
    "wind/kma-upper.json", "wind/kma-upper-wind.json", "events/kma-warn.json", "wind/stations.json",
    "events/lightning.json", "wind/status/marine-ea.json", "ocean/marine.json",
    "events/uk-forecast.json", "wind/series/mountain-gap-daily.json",
    "ocean/obis-summary.json", "wind/pressure-ea.json", "events/push-tick.json",
    "events/quake-asia.json", "events/regional.json", "events/regional-news.json",
    "events/sea-turtle.json", "events/social-drafts.json", "wind/tpw-ea.json",
    "events/typhoon-official.json", "events/world-alerts.json",
    "app/tourism/health.json",
}


def read_watch():
    tree = ast.parse(HEALTH.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "WATCH" for target in node.targets
        ):
            return ast.literal_eval(node.value)
    raise AssertionError("WATCH not found")


def main():
    watch = read_watch()
    keys = [item["key"] for item in watch]
    assert len(keys) == len(set(keys)), "WATCH has duplicate keys"
    missing = sorted(SCHEDULED_OUTPUTS - set(keys))
    assert not missing, f"scheduled outputs missing from WATCH: {missing}"
    for item in watch:
        assert item["everyMin"] > 0
        assert item["graceMin"] >= 0
        assert item.get("ko")
    print(f"N1 watch coverage: {len(SCHEDULED_OUTPUTS)} scheduled outputs covered by {len(keys)} watches")


if __name__ == "__main__":
    main()
