#!/usr/bin/env python3
"""바다거북·철새 자료를 v3 가 읽을 자리로 옮긴다.

두 자료는 이미 우리 서비스(aws/sea-turtle, aws/migbird)가 만들어 events/ 에
올려 둔 것이다. v3 는 배포되면 같은 출처(earthus.net)라 그냥 읽어도 되지만,
개발 서버(localhost)에서는 다른 출처가 되어 못 읽는다. 그래서 v3 의 다른 겹들과
같은 자리(prototype/data/)에 둔다.

**그래도 되는 이유**: 둘 다 실시간이 아니다.
  · 바다거북 — 기관이 "추적이 종료된 수신기에 대해서만 조회"한다. 지나간 경로다.
  · 철새 — 2021~2025 봄 북상 179건. 해마다 한 번 갱신되는 표다.
새로 나오면 이 스크립트를 다시 돌린다.

■⚠️⚠️⚠️ 바다거북은 **공공누리 제4유형**이다 (출처표시 + 상업적 이용금지 + 변경금지).
   그래서 이 스크립트는 **받은 것을 한 글자도 고치지 않고 그대로 쓴다.**
   필드를 고르거나 좌표를 줄이거나 점을 솎아내지 않는다 — 그게 곧 '변경'이다.
   화면에서도 좌표를 그대로 찍고, 이 자료로 분석 문장을 만들지 않는다.
   v3 는 언제나 무료이므로 상업적 이용 금지 조건에 걸리지 않는다.

■ 철새는 이용허락범위 **제한 없음**이다. 그래도 같은 방식으로 그대로 옮긴다.

사용: python tools/fetch-wildlife.py
"""

import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "prototype" / "data"
BASE = "https://earthus.net/events"

FILES = [
    ("sea-turtle.json", "바다거북 이동경로", "공공누리 제4유형 — 변경금지·상업적 이용금지"),
    ("migbird.json", "철새 이동", "이용허락범위 제한 없음"),
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, what, lic in FILES:
        raw = urllib.request.urlopen(f"{BASE}/{name}", timeout=300).read()
        d = json.loads(raw.decode("utf-8"))          # 읽을 수 있는지만 확인하고
        (OUT / name).write_bytes(raw)                # 저장은 받은 바이트 그대로 한다
        n = len(d.get("turtles") or d.get("trips") or [])
        print(f"▸ {what}: {n}건  {len(raw):,} B")
        print(f"   {lic}")
        print(f"   출처: {d.get('source')}")


if __name__ == "__main__":
    main()
