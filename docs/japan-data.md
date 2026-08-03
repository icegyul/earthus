# 일본 자료 — 조사 기록 (2026-08-03)

물음: "일본도 한국처럼 api로 데이터 받는 곳 있을까?"

## 결론: 있다. 그리고 **인증키가 필요 없다.**

기상청(KMA)은 API 허브에 키를 신청해야 한다. JMA 는 자기 방재 사이트가 쓰는
JSON 을 그대로 공개해 둔다. 우리는 이미 지진·태풍에 이 경로를 쓰고 있다.

| 자료 | 주소 | 상태 |
|---|---|---|
| **AMeDAS 실측** | `www.jma.go.jp/bosai/amedas/data/map/{YYYYMMDDHHMMSS}.json` | ✅ **1,286지점 · 10분** |
| AMeDAS 지점표 | `/bosai/amedas/const/amedastable.json` | ✅ 이름·좌표·고도 |
| 동네예보 | `/bosai/forecast/data/forecast/{office}.json` | ✅ 58관서 |
| 특보 | `/bosai/warning/data/warning/{office}.json` | ✅ |
| 지역 코드표 | `/bosai/common/const/area.json` | ✅ 1,805 세부구역 |
| 지진 | `/bosai/quake/data/list.json` | ✅ **이미 씀** |
| 태풍 | `/bosai/typhoon/data/targetTc.json` | ✅ **이미 씀** |
| 방재정보 XML | `www.data.jma.go.jp/developer/xml/feed/{regular,extra}.xml` | ✅ 정식 공개 |

## AMeDAS 실측 — 한국보다 촘촘하다

실측(2026-08-03 17:50 JST, 27분 전 자료):

```
지점 1,286곳 · 10분 간격
  기온      916곳      10분 강수  1,285곳
  풍속      915곳      습도         842곳
  일조      843곳      기압         154곳
```

⚠️ 기상청 AWS 가 약 600지점이다. **AMeDAS 가 두 배 많다.**

## ⚠️ 다만 짚어 둘 것

**① 이건 "정식 API" 가 아니다.** JMA 방재 사이트가 자기 화면을 그리려고 쓰는
JSON 이다. 널리 쓰이고 안정적이지만, JMA 가 규격을 보장한다고 문서로 약속한 적은
없다. 어느 날 구조가 바뀌어도 공지가 없을 수 있다.
→ 정식 경로는 **기상업무지원센터(気象業務支援センター)** 이고 유료다.
→ 우리는 이미 지진·태풍에서 이 경로를 쓰고 있으니 위험을 새로 지는 것은 아니다.
   다만 **health 감시에 반드시 넣어야 한다** — 조용히 바뀌면 조용히 죽는다.

**② 이용조건을 확인해야 한다.** JMA 홈페이지 자료는 대체로 출처만 밝히면
자유롭게 쓸 수 있다(정부표준이용규약 계열)고 알려져 있으나,
**우리가 직접 확인한 것은 아니다.** 쓰기 전에 확인한다.

**③ 지명이 일본어다.** 宗谷岬(Cape Soya) 처럼 kjName/enName 이 함께 온다 —
한국어 표기는 우리가 정해야 한다. 지어내지 말고 영문 병기로 두는 편이 안전하다.

## 중국은 다르다

CMA 는 공개 API 가 사실상 없다. 전지구 자료(Open-Meteo·GMGSI·OSMC 부이)로
덮이는 만큼만 된다. 이건 우리 사정이 아니라 그쪽 정책이다.
