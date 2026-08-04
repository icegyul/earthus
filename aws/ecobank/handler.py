# -*- coding: utf-8 -*-
"""에코뱅크(국립생태원 생태정보포탈) — 붙이기 전 탐색용.

받은 요청: "에코뱅크 키 받았어"

■⚠️⚠️ **키를 밖으로 꺼내지 않는다.**
   키는 이 함수의 환경변수에만 있고, 요청도 여기서 만들어 보낸다.
   그래서 응답 **모양만** 로그로 내보낸다 — 값은 앞 몇 글자만.
   (대화창이나 터미널 기록에 키가 남으면 안 된다)

■ 왜 탐색부터 하나
   기관마다 응답 껍데기가 다르다. 바다거북은 `response` 래퍼가 **없었고**,
   바닷새는 한 건일 때 item 이 **dict** 로 왔다.
   에어코리아는 dmX 가 위도였다. 먼저 실물을 보고 나서 파서를 쓴다.

호출:
   aws lambda invoke --function-name ecobank \
     --payload '{"url":"https://.../svc","params":{"numOfRows":3}}' out.json

━━━ 찔러서 알아낸 것 (2026-08-04) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

주소 꼴:  https://www.nie-ecobank.kr/ecoapi/{서비스}/attr/{작업}?type=json&serviceKey=키
키 이름:  `serviceKey` (data.go.kr 과 같다)
⚠️ 키는 **승인된 레이어에서만** 통한다. 조류 3종은 모두 통했다.

  자연환경조사_조류_점   NteeInfoService  **1,053,574건**
  생태계정밀조사_조류_점 EcpeInfoService      22,577건
  백두대간_조류_점       BgtsInfoService       9,455건

필드: spceId · geom · examinRealmSeNm · examinYear · tme · indvdCo(개체수)
      spcsLcnm(국명) · spcsScncenm(학명) · examinBeginDe · examinEndDe · registDe · updtDe

■⚠️⚠️⚠️ **좌표가 위경도가 아니다.** `geom: POINT(286374.92 595580.69)` —
   미터 단위 **투영좌표**다. 그냥 lat/lon 으로 읽으면 아프리카 앞바다에 찍힌다.

   추정: **EPSG:5186** (Korea 2000 중부원점 TM · 원점 127°E, 38°N ·
   가짜동거리 200,000 · 가짜북거리 600,000).
   ⚠️ 확인한 근거 — **백두대간 자료가 실제로 백두대간에 떨어진다**:
     큰부리까마귀 (333170, 587671) → 약 128.5°E, 37.9°N = 강원 남부 산줄기
     찌르레기     (297859, 469870) → 약 128.1°E, 36.8°N = 경북 내륙
   ⚠️ 그래도 **EPSG:5174(구 중부원점, Bessel 타원체)와 수백 m 차이**가 난다.
      붙이기 전에 아는 지점으로 한 번 더 맞춰볼 것. 산 이름 하나면 판별된다.

■⚠️ 로드킬(5.6만)·조류 유리창 충돌(1만)은 **Open API 목록에 없다.**
   메인 화면 배너에는 있지만 attr/wms/wfs 84개 어디에도 없다.
   → '국가중점개방데이터 다운로드'(파일)로만 열리는 것으로 보인다. 따로 확인할 것.
"""
import json
import os
import urllib.parse
import urllib.request

KEY = os.environ.get("ECOBANK_KEY", "")
UA = {"User-Agent": "earthus/1.0 (dalur@kakao.com)"}

# 키 이름이 기관마다 다르다. 되는 것을 찾을 때까지 차례로 시도한다.
KEY_NAMES = ["serviceKey", "apiKey", "key", "authKey", "auth_key"]


def _shape(v, depth=0):
    """자료를 **모양**으로 바꾼다. 값은 짧게만 남긴다."""
    pad = "  " * depth
    if isinstance(v, dict):
        out = []
        for k, x in list(v.items())[:40]:
            out.append(f"{pad}{k}: {_shape(x, depth + 1).lstrip()}")
        return "\n" + "\n".join(out)
    if isinstance(v, list):
        if not v:
            return "[] (빈 목록)"
        return f"[{len(v)}개] 첫 항목 →{_shape(v[0], depth + 1)}"
    s = str(v)
    return s if len(s) <= 60 else s[:57] + "…"


def handler(event=None, context=None):
    if not KEY:
        # ⚠️ 조용히 넘어가지 않는다. 키가 없으면 그렇다고 말한다.
        return {"ok": False, "why": "ECOBANK_KEY 환경변수가 비어 있습니다"}
    print(f"[ecobank] 키 확인됨 (길이 {len(KEY)}, 앞 4자리 {KEY[:4]}…)")

    ev = event or {}
    url = ev.get("url")
    if not url:
        return {"ok": False, "why": "url 을 넘겨주세요"}
    params = dict(ev.get("params") or {})
    names = [ev["keyName"]] if ev.get("keyName") else KEY_NAMES

    for name in names:
        q = urllib.parse.urlencode(params)
        full = f"{url}?{name}={KEY}" + (f"&{q}" if q else "")
        try:
            with urllib.request.urlopen(urllib.request.Request(full, headers=UA), timeout=45) as r:
                raw = r.read()
                ctype = r.headers.get("Content-Type", "")
        except Exception as e:                      # noqa: BLE001
            print(f"[ecobank] {name} → 실패: {e}")
            continue

        head = raw[:400].decode("utf-8", "replace")
        print(f"[ecobank] {name} → HTTP 200 · {len(raw)}바이트 · {ctype}")
        try:
            doc = json.loads(raw.decode("utf-8"))
        except Exception:                           # noqa: BLE001
            print(f"[ecobank] JSON 아님. 앞부분:\n{head}")
            return {"ok": True, "keyName": name, "json": False, "head": head}

        # ⚠️ 인증 실패도 HTTP 200 으로 온다. 껍데기를 봐야 안다.
        txt = json.dumps(doc, ensure_ascii=False)[:300]
        if any(w in txt for w in ("SERVICE_KEY", "인증", "등록되지", "AUTH", "ERROR")):
            print(f"[ecobank] ⚠️ 200 이지만 거절로 보인다: {txt}")
            continue
        print(f"[ecobank] ✔ 응답 모양:{_shape(doc)}")
        return {"ok": True, "keyName": name, "json": True}

    return {"ok": False, "why": "어느 키 이름으로도 안 됐습니다", "tried": names}
