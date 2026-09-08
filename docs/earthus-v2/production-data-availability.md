# EARTHUS V2 — 운영 자료 가용성 (PHASE 7 §1)

| 항목 | 값 |
|---|---|
| 상태 | PHASE 7 — **운영 자료를 실제로 받아 확인함** |
| 확인 시각 | 2026-09-08 |
| 기준 커밋 | `2be59446` |
| 규칙 | 실제 응답을 받아 본 것만 YES. 못 받아 본 것은 `NO` 또는 `UNVERIFIED` |

> PHASE 6 의 [data-availability-matrix.md](data-availability-matrix.md)는 **코드**를 읽고 만든 표다.
> 이 문서는 **운영 응답을 실제로 받아** 확인한 결과다. 둘이 어긋나면 이 문서가 우선한다.

---

## 0. PHASE 6 보고를 정정한다

PHASE 6 에서 "`verify-daily.json` 을 받지 못해 실물 대조를 못했다" 고 적었다. **틀렸다.**

이번에 다시 받아 보니 **HTTP 200 · 23,946 bytes** 로 정상 응답한다. PHASE 6 의 실패는 자료가 없어서가 아니라 그때의 요청이 실패한 것이다. 자료는 처음부터 있었다.

---

## 1. 실제로 받아 본 것

### `wind/series/verify-daily.json` — **YES**

```text
generated        2026-09-08T02:40:00Z
leadBasis        observation-time          ← 2026-08 사고 이후의 올바른 기준
collectingSince  2026-08-06
days             34일 (2026-08-06 ~ 2026-09-08)
stationCount     97   (기상청 ASOS)
models           gfs_seamless · ecmwf_ifs025
vars             temperature_2m · wind_speed_10m
leads            24h · 48h
```

QC 결과: **PASS** (실패 0 · 경고 0)

### 실제 채점 결과 — 2026년 8월

| 모델 | 변수 | 리드 | MAE | RMSE | 편향 | 표본 |
|---|---|---:|---:|---:|---:|---:|
| ECMWF IFS | 기온 | 24h | **1.236** ℃ | 1.593 | −0.239 | 59,697 |
| ECMWF IFS | 기온 | 48h | 1.328 ℃ | 1.700 | −0.296 | 59,627 |
| GFS | 기온 | 24h | **1.464** ℃ | 1.867 | −0.887 | 59,697 |
| GFS | 기온 | 48h | 1.489 ℃ | 1.914 | −0.794 | 59,627 |
| ECMWF IFS | 바람 | 24h | 1.117 m/s | 1.496 | +0.623 | 59,676 |
| GFS | 바람 | 24h | 1.104 m/s | 1.562 | +0.623 | 59,676 |

읽을 수 있는 것 두 가지 — **둘 다 표본 6만 규모라 우연으로 보기 어렵다.**

1. **기온은 ECMWF 가 GFS 보다 오차가 작다** (24h 기준 1.236 vs 1.464 ℃).
2. **GFS 는 기온을 낮게 본다** (편향 −0.887 ℃). ECMWF 도 낮게 보지만 폭이 3분의 1 수준이다.
3. 바람은 두 모델 모두 **높게 본다** (+0.62 m/s). 이쪽은 모델 간 차이가 거의 없다.

> 이 숫자들은 우리가 채점한 값이다 — 관측도 예보도 아니다(`truthType: EARTHUS_ANALYSIS`).
> 리드타임을 합치지 않았고, 두 모델을 섞지 않았고, 날짜별 표본 수로 가중했다.

---

## 2. 분야별 운영 상태

| 현상 | 관측 | 이력 | 예보 | 예보 스냅샷 | 검증 | 리포트 | 전망 |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **기온** `weather.temperature` | YES | YES | YES | **YES** | **YES** | **YES(발행 확인)** | NO |
| **바람** `weather.wind` | YES | YES | YES | **YES** | **YES** | **YES(발행 확인)** | NO |
| 태풍 `hazards.typhoon` | YES | YES | YES | YES | 부분 | 사건 보고서만 | NO |
| 강수 `weather.precipitation` | YES | **NO** | YES | NO | **NO** | NO | NO |
| 파고 `ocean.wave` | YES | NO | **NO** | NO | **NO** | NO | NO |
| 그 밖 | — | — | — | NO | NO | NO | NO |

**전망(OUTLOOK)은 모든 분야가 NO 다.** 우리가 생산·보관하는 장기 예보 산출물이 없다. 그래서 전망 보고서는 생성되지만 내용이 비어 있고, 그 이유를 적는다(`NO_OUTLOOK_SOURCE`). LLM 에게 "내년 날씨를 예측하라"고 시키지 않는다.

---

## 3. 실제로 통과시킨 파이프라인

```text
운영 verify-daily.json (HTTP 200, 34일)
  ↓ QC                    PASS
  ↓ DataSnapshot          snapshot:2026-09:verify
  ↓ ReportFact            24건 (모델 2 × 변수 2 × 리드 2 × 지표 3)
  ↓ ForecastVerification  8건 (2026-08 대상, 리드·모델 분리)
  ↓ Scorecard             평가 8 · 불가 2
  ↓ Narrative             결정적 생성(LLM 아님)
  ↓ NarrativeValidation   PASS
  ↓ ReportValidation      PASS
  ↓ PUBLISHED             report:2026-09
  ↓ Archive index         years.2026
  ↓ UI                    "월간 2026-09 · 읽기" 로 렌더 확인
```

**2026-09 월간 보고서의 검증 절은 2026-08 을 평가한다** — 실제 예보 스냅샷에서 나온 첫 forecast review 다.

---

## 4. 아직 못 하는 것

| | 이유 |
|---|---|
| 분기·연간 보고서의 검증 절 | 자료가 2026-08-06 부터라 이전 분기·이전 해가 없다. 없다고 적는다 |
| 전망 6종의 내용 | 자체 장기 예보 산출물이 없다 |
| 태풍 정기 리포트 | 트랙 채점은 있으나 기간 단위 공개 집계가 없다 |
| 강수 검증 | 관측 이력 수집기가 없다. 만들기 전에는 영원히 불가 |
| 운영 발행 | S3 `reports/index.json` 에 올리는 단계는 이 세션의 권한 밖이다 |

---

## 5. 다음에 이 표가 바뀌는 조건

- `collectingSince` 가 한 분기를 넘기면 → 분기 보고서의 검증 절이 생긴다(2026-11 이후).
- 강수 관측 수집기가 생기면 → 강수 검증이 가능해진다.
- 자체 장기 예보가 생기면 → 전망 6종이 내용을 갖는다.

표를 고칠 때는 **실제 응답과 확인 시각을 같이 적는다.**
