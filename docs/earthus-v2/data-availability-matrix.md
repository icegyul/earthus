# EARTHUS V2 — 자료 가용성 표 (PHASE 6 §28)

| 항목 | 값 |
|---|---|
| 상태 | PHASE 6 STEP 1 — 구현 **전에** 만든 능력 계약 |
| 작성일 | 2026-09-08 |
| 기준 커밋 | `0e900e50` |
| 규칙 | **실제 확인 없이 YES 를 넣지 않는다.** 확인 못 한 것은 `?` 가 아니라 `NO` 또는 `NO_DATA` 다 |

> 봉인 인계 패키지의 일부가 아니다.

이 표가 리포트 엔진이 **무엇을 생성해도 되는지**를 결정한다. 표에 없는 것은 생성하지 않는다.

---

## 0. 결론 먼저

**끝에서 끝까지 도는 영역은 기온 하나뿐이다.** `aws/kma-verify` 가 예보를 발행 시점 그대로 얼려 두고(`archive/verify/fc/<YYYYMMDDHH>.json`) 24·48시간 뒤 기상청 ASOS 실측과 채점해 `wind/series/verify-daily.json` 에 쌓는다. 예보 스냅샷 · 실측 · 검증이 **이미 다 있다.**

그래서 §29 의 첫 end-to-end 대상은 **기온(weather.temperature)** 이다. 태풍이 아니다 — 태풍은 트랙 채점이 있지만 그 산출물이 리포트가 소비할 수 있는 형태로 공개되지 않는다.

---

## 1. 표

`CURRENT` 지금 상태를 그린다 · `HISTORY` 과거 기록이 있다 · `FORECAST` 예보 산출물이 있다
`SNAPSHOT` 발행 시점 그대로 보존된다 · `OBS` 검증에 쓸 실측 이력이 있다 · `VERIFY` 채점이 실제로 돈다

| 현상 | 자료 출처 | CURRENT | HISTORY | FORECAST | SNAPSHOT | OBS | VERIFY | 리포트 생성 가능? |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|---|
| **기온** `weather.temperature` | Open-Meteo GFS·ECMWF + 기상청 ASOS 97지점 | YES | YES | YES | **YES** | **YES** | **YES** | **가능 — 유일한 완전 루프** |
| 바람 `weather.wind` | 같은 파이프라인 (`VARS` 에 `wind_speed_10m`) | YES | YES | YES | **YES** | **YES** | **YES** | 가능 — 기온과 같은 엔진 |
| 태풍 `hazards.typhoon` | GDACS · KMA/JMA/NHC 공식트랙 · ECMWF ENS · cyclone-analog | YES | YES | YES | YES(`typhoon-official` write-once) | YES(IBTrACS) | 부분 | 사건 보고서만. 정기 리포트용 공개 집계 없음 |
| 강수 `weather.precipitation` | 레이더 · AWS · GFS | YES | **NO** | YES | NO | **NO** | **NO** | **불가 — 관측 이력 자체가 없다** |
| 파고 `ocean.wave` | Open-Meteo Marine | YES | NO | **NO** | NO | NO | NO | 불가 — 우리가 예보를 생산·보관하지 않는다 |
| 해수온 `ocean.sst` | GHRSST L4 MUR · NASA GIBS | YES | 부분 | NO | NO | NO | NO | 현재값만. 검증 불가 |
| 지진 `hazards.earthquake` | USGS ComCat | YES | YES(25년) | — | — | — | — | 사건 보고서만. 지진은 예보 대상이 아니다 |
| 대기질 `weather.air_quality` | CAMS · 에어코리아 | YES | 부분 | YES | NO | 부분 | 부분(lab-events 24h PM10) | 사건 보고서만 |
| 그 밖 59개 현상 | — | 각각 | — | — | NO | NO | NO | 정기 리포트 대상 아님 |

### 근거

- **기온·바람 YES 의 근거**: `aws/kma-verify/handler.py` — `MODELS=['gfs_seamless','ecmwf_ifs025']`, `VARS=['temperature_2m','wind_speed_10m']`, `LEADS=[24,48]`, 출력 `wind/series/verify-daily.json` 의 `days[날짜]['{model}|{var}|{lead}h'] = {me, mae, rmse, n}`. 표본 20 미만 조합은 기록하지 않는다. 결측 지점은 채점에서 뺀다. 모델을 섞지 않는다.
- **강수 NO 의 근거**: PHASE 0 예보 감사 — 강수 관측 수집기가 없다. `kma-aws-min`·`kma-radar` 는 최신 키만 쓰고 레이더는 13칸 순환이다. 실측 이력이 없으므로 **원리적으로** 채점할 수 없다.
- **파고 NO 의 근거**: `ocean/marine.json` 은 `current=` 만 받는다(리드타임 없음). 유일한 예보는 FOR ME 카드 한 점을 위한 클라이언트측 Open-Meteo 직접 호출이고 `aws/` 가 만들지 않으며 어디에도 보관되지 않는다.
- **태풍 '부분' 의 근거**: `aws/typhoon-official` 이 `IfNoneMatch='*'` 로 발행본을 보존하고 `aws/cyclone-analog` 가 IBTrACS 최적경로와 대조해 리드별로 채점한다. 다만 그 결과는 **사건별 보고서**로만 나가고, 월/분기/연 단위로 집계된 공개 산출물이 없다.

---

## 2. 이 표가 엔진에 강제하는 것

1. **월간·분기·연간 회고와 세 전망의 뼈대는 만들 수 있다.** 다만 지금 채울 수 있는 실제 내용은 기온·바람뿐이다.
2. **강수·파고에는 점수를 만들지 않는다.** 계약의 `NOT_VERIFIABLE` 사유(`NO_OBSERVATION_ARCHIVE`, `FORECAST_NOT_OURS`)를 그대로 쓴다.
3. **"정확도 78%" 같은 한 줄 요약을 만들지 않는다.** 지표는 현상마다 다르고, 점수에는 항상 `n`(표본 수)과 채점 방법을 같이 적는다.
4. **`collectingSince` 이전 기간은 평가하지 않는다.** 자료를 모으기 시작한 날보다 앞선 달의 회고에는 검증 절이 없다 — "평가 데이터가 아직 축적되지 않았습니다".

---

## 3. 다음에 이 표가 바뀌는 조건

| 바뀌려면 | 필요한 것 |
|---|---|
| 강수 검증 YES | 강수 관측 이력 수집기부터. 없으면 영원히 NO |
| 파고 검증 YES | 우리가 파고 예보를 생산·보관해야 한다 |
| 태풍 정기 리포트 YES | `cyclone-analog` 의 리드별 점수를 기간 단위로 집계해 공개 |
| 해수온 검증 YES | 예보 산출물과 그 스냅샷이 먼저 |

표를 고칠 때는 **근거 file:line 을 같이 적는다.**
