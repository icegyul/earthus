# -*- coding: utf-8 -*-
"""기후 시계열 4종을 매일 갱신하는 Lambda 진입점.

왜 필요한가
  build_*_series.py 는 손으로 돌리는 스크립트였다. 2026-07-27 에 마지막으로 돌리고
  6주 동안 아무도 안 돌려서, 앱의 "일별 해수면온도 1982–2026" 그래프가 오늘 선 앞에서
  끊긴 채 운영에 남았다("차트에 선이 오늘자는 끊겨있어"). 상류(NOAA PSL·NSIDC·GHCN)는
  그동안 계속 갱신되고 있었다 — 우리 쪽이 안 돌린 것뿐이다.

무엇을 하나
  event.task 하나를 받아 그 빌더의 main() 을 올해 기준으로 실행한다.
    sst    ocean/series/sst-daily.json     (OISST v2.1)
    land   wind/series/temp-daily.json     (CPC Global Daily Temperature)
    korea  wind/series/korea-daily.json    (GHCN-Daily 10개 관측소)
    seaice ocean/series/seaice-daily.json  (NSIDC G02135)
  빌더는 지난 해가 이미 있으면 건너뛰고 올해만 다시 받는다 — 매일 돌려도 몇십 초다.

⚠️ 네 작업을 한 번에 돌리지 않는다. 상류 하나가 느리면 900초 안에 나머지가 못 끝나고,
   그날 넷 다 "지난 자료"가 된다. EventBridge 규칙 넷이 15분 간격으로 하나씩 부른다.
"""
import importlib
import sys
from datetime import datetime, timezone

TASKS = {
    "sst": "build_sst_series",
    "land": "build_land_series",
    "korea": "build_korea_series",
    "seaice": "build_seaice_series",
}


def handler(event, _context=None):
    task = (event or {}).get("task", "sst")
    if task not in TASKS:
        return {"ok": False, "error": f"unknown task {task!r}", "tasks": sorted(TASKS)}
    year = datetime.now(timezone.utc).year
    # sst·land 는 argv[1] 을 시작 연도로 읽는다 — 올해부터 시작해 올해만 받는다.
    sys.argv = [TASKS[task], str(year)]
    mod = importlib.import_module(TASKS[task])
    rc = mod.main()
    return {"ok": not rc, "task": task, "year": year, "rc": rc}
