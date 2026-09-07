# EARTHUS V2 — 예보 검증 아키텍처

| 항목 | 값 |
|---|---|
| 상태 | 설계 (PHASE 7 대상). 구현 없음 |
| 작성일 | 2026-09-08 |
| 기준 커밋 | `1e03eac8` |
| 전제 문서 | [phase-0-audit.md](phase-0-audit.md) · [report-engine-architecture.md](report-engine-architecture.md) |

> 봉인 인계 패키지(2026-08-27)의 일부가 아니다. `SHA256SUMS` 대상이 아니다.

---

## 0. 좋은 소식과 나쁜 소식

지침서 §16 은 이것을 필수 기능으로 못박는다. 감사 결과:

**좋은 소식 — 0에서 시작하지 않는다. 검증 엔진이 이미 셋 돌고 있다.**

| 엔진 | 무엇을 검증하나 | 진실값 |
|---|---|---|
| `aws/kma-verify` | 기온·바람, 24h/48h 리드 | 기상청 ASOS |
| `aws/cyclone-analog` | 태풍 트랙, 리드별 채점 | IBTrACS 최적경로 + 잠정 기관 분석 |
| `aws/lab-events` | 8개 현상 (CAMS 24h PM10 포함) | 각 현상별 |

**나쁜 소식 — 검증할 수 있는 예보가 절반뿐이고, 그 절반도 우연이다.**

보존은 **제품별 설계의 부산물**이지 공용 아카이빙 계층이 아니다.

---

## 1. 보존되는 것 / 파괴되는 것

이 표가 §16 의 실현 가능 범위를 결정한다.

### 발행 시점 그대로 남는다 (검증 가능)

| 산출물 | 키 |
|---|---|
| `kma-verify` | `archive/verify/fc/<YYYYMMDDHH>.json` — **이미 채점까지 됨** |
| `ecmwf-ingest` | `archive/ecmwf/<run>.json` |
| `archiver` | `archive/forecast/dt=/hh=` JSONL.gz, 4회/일, D+1~D+7 |
| `typhoon-official` | `events/typhoon-official/archive/{STORM}/{AGENCY}-{stamp}.json` — **저장소 유일의 진짜 write-once** |
| `tropical-intelligence` | `archive/tropical-intelligence/<run>.json` |

### 매 실행 덮어쓴다 (검증 불가능)

`wind/kma-fcst.json`(기상청 동네예보) · `events/typhoon-ecmwf.json`(IFS/AIFS 앙상블) · `wind/global.json` · `wind/forecast-leads.json` · `clouds/gfs/volume/*` · `clouds/gfs/global-low/*` · `events/uk-forecast.json` · `ocean/marine.json` · `events/kma-warn.json` · `ocean/khoa/flood/*.json`

**이것들은 발행 시점의 예보가 다음 실행에서 파괴되고 복원할 수 없다.**

### 특히 아픈 두 곳

1. **`archive/forecast` 는 4회/일 쌓이는데 읽는 코드가 저장소에 하나도 없다.** 한 번도 채점된 적이 없다. 가장 값싼 성과가 여기 있다 — 자료는 이미 있고, 읽는 사람만 없다.
2. **강수 관측 이력이 없다.** 수집기 자체가 없고 `kma-aws-min`·`kma-radar` 는 최신 키만 쓴다(레이더는 13칸 순환). → **강수 예보는 현재 원리적으로 검증할 수 없다.** 지침서 §16.2 가 요구하는 적중률·오경보율을 계산할 실측이 없다.

---

## 2. 파고 예보 — 지침서 §45 와 충돌

지침서는 파고를 "Ocean + Intelligence + Forecast" 시제품으로 지목한다. 실제로는:

- 지도에 그리는 `ocean/marine.json` 은 `current=` 만 요청한다. **리드타임이 없다.**
- 클릭한 해점도 `current=` 만 받는다.
- 유일한 예보는 `main.js:3194` `loadWaveHourly` — FOR ME 카드 **한 점**을 위한 클라이언트측 Open-Meteo 직접 호출이다. `aws/` 가 만들지 않고, 어디에도 보관되지 않는다.

→ 레지스트리에서 `ocean.wave.forecast = false` 다. **보관되지 않는 남의 예보는 검증 대상이 될 수 없다.**

---

## 3. 없는 것: 공통 발행 신원

예보 전반에 `issuedAt`/`validFrom`/`validTo`/`horizon` 의 **공통 스키마가 없다.** 지금 8가지 이름이 혼용된다:

`run` · `baseKst` · `issuedKst` · `issue` · `issuedAt` · `issued` · `validAt` · `_obs`/`_fetched`

문자 그대로의 `validFrom`/`validTo` 는 어디에도 없다. 예보 실행 id 도 없다.

→ **§16 의 첫 작업은 지표가 아니라 신원이다.** 무엇이 언제 발행되어 언제까지 유효한지 한 가지 방식으로 적지 않으면, 실측과 맞출 수 없다.

---

## 4. 지표는 예보 종류를 따른다 (지침서 §16.2)

하나의 정확도 퍼센트를 쓰지 않는다. 이미 도는 엔진들이 올바른 선례를 갖고 있다.

| 예보 종류 | 지표 | 선례 |
|---|---|---|
| 기온 등 연속값 | MAE · RMSE · 편향 · 이상 방향 적중 | `kma-verify` |
| 확률 사건 | Brier · 신뢰도 곡선 | — |
| 강수 유무 | 적중률 · 오경보율 | **불가 — 실측 없음** |
| 태풍 트랙 | 트랙 오차 · 시간 오차 · 강도 오차 | `cyclone-analog` |
| 앙상블 | 산포-기술 관계 · 실측 포함률 | — |

두 가지 규칙은 이미 저장소 규약이다. 그대로 따른다.

- **리드타임은 평균 내지 않는다.** 리드별 점수 행을 남긴다.
- **진실값 출처를 명시하고 섞지 않는다.** 잠정 검증은 `truthAgency` 를 선언하고 한 기관의 분석만 쓰며, 최종 검증은 IBTrACS 최적경로를 쓴다.

---

## 5. 정직성 (지침서 §16.4)

검증이 불가능하면 **점수를 만들지 않는다.** `NOT_VERIFIABLE` 과 사유를 적는다.

오늘 기준으로 사유가 확정된 것:

| 대상 | 사유 |
|---|---|
| 강수 | `NOT_VERIFIABLE — 관측 이력 없음` |
| 파고 | `NOT_VERIFIABLE — 예보를 우리가 생산·보관하지 않음` |
| 동네예보·앙상블·구름 | `NOT_VERIFIABLE — 발행본이 매 실행 덮어써짐` |

지침서 §35 의 "트랙 레코드" 를 **정확도(accuracy)** 로 광고하지 않는다. 방법론이 뒷받침하는 말만 쓴다 — 예보 기술(skill) · 보정(calibration) · 편향(bias) · 트랙 오차 · 포함률.

---

## 6. 순서

1. 공통 발행 신원 스키마 (`issuedAt`/`validFrom`/`validTo`/`horizon`/`runId`) 를 **먼저** 정한다
2. `archive/forecast` 를 읽어 채점한다 — 자료는 이미 4회/일 쌓여 있다. 가장 값싼 첫 성과
3. 덮어쓰는 산출물 중 **인용할 것만** `typhoon-official` 의 조건부 불변 패턴으로 전환
4. 강수 관측 수집기 — 없으면 강수는 영원히 검증 불가
5. 리드별 점수 행 → 월간 리포트의 "지난달 전망은 얼마나 맞았나"
6. `NOT_VERIFIABLE` 을 1급 결과로 렌더링
