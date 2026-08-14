# Ocean Core Foundation — O0 shadow

## 상태

`LOCAL_SHADOW_COMPLETE`. 정규화 계약과 안전 gate의 첫 배치는 구현·회귀 검증을 마쳤다.
기존 공개 해양 reader, 서핑·낚시 UI, 판매, 알림, AIS, 예약에는 연결하지 않았다. 따라서
Ocean Core 전체나 O0 공개 전환이 완료된 상태는 아니다.

## 목적

Open-Meteo Marine 모델 격자와 KMA 해상관측 부이를 같은 `OceanObservation` 모양으로 읽되
`FORECAST`와 `MEASURED`를 보존한다. 결측값을 0으로 바꾸거나 조위에서 조류를 만들지 않는다.
공식 낙뢰·태풍·통제·검증된 극단 파고 gate는 활동 점수보다 먼저 점수와 CTA를 차단한다.

## 구현

- `prototype/js/ocean/observation-contract.js`
  - UTC/KST 시각 파싱, freshness, provider manifest 검증
  - Marine grid와 KMA station 정규화
  - exact metric selection; cross-metric inference 금지
- `prototype/js/ocean/safety-gate.js`
  - `BLOCKED / UNKNOWN / NO_BLOCKING_EVIDENCE`
  - 점수·출발 CTA 우선 차단, SAFE 표현 금지
- `prototype/data/ocean/provider-manifest.v1.json`
  - Open-Meteo/KMA/NOAA NDBC·OSMC 모두 `DRAFT`, public operation 0
- `tools/fixtures/ocean-core-v1.json`, `tools/test_ocean_core.mjs`
  - fixture-only 값, OT-001 낙뢰 gate와 OT-002 조류 결측 보존
- `tools/verify_ocean_core_live.mjs`
  - 다운로드한 운영 JSON을 네트워크 없이 전체 재생하는 검증기

## 보호 계약

- 모델 격자는 `observedAt=null`, `validFrom`과 `FORECAST`를 사용한다.
- 부이 실측은 KST 원시각을 UTC로 바꾸고 `MEASURED`를 사용한다.
- KMA 30m 초과 파고는 지도값으로 복구하지 않고 raw rejection 증거로 남긴다.
- provider 권리는 문자열 license만 보고 승인하지 않는다. `rightsStatus=APPROVED`와 허용 operation이
  함께 있어야 public operation을 허용한다.
- critical evidence가 없거나 stale이면 점수와 CTA는 `UNKNOWN/null`이다.
- `NO_BLOCKING_EVIDENCE`는 SAFE가 아니며 positive recommendation도 만들지 않는다.

## 2026-08-14 검증 증거

로컬 fixture 회귀는 provider 권리 차단, 모델/KMA/NDBC 정규화, 결측·stale, OT-001 낙뢰,
OT-002 조류 결측, 미승인 극단 파고 policy, 직접 유입된 90m 파고 방어를 통과했다.

같은 adapter로 다운로드한 공개 JSON을 네트워크 없이 전체 재생한 결과는 다음과 같다.
이 수치는 당시 스냅샷의 구조·결측·변환 검증용이며 운영 freshness 또는 공개 권리 승인이 아니다.

| 입력 | source time (UTC) | 원본 범위 | 정규화 결과 |
|---|---:|---:|---:|
| Marine model grid | 2026-08-14 09:00 | 2,376 cells | 12,239 observations, 6,769 missing, 0 rejected |
| KMA marine station | 2026-08-14 10:35 | 191 stations | 510 observations, 0 rejected |
| NOAA NDBC/OSMC | 2026-08-14 10:40 | 2,397 buoys | 6,188 observations, 0 rejected |

세 provider 모두 manifest `rightsStatus=DRAFT`, `allowedOperations=[]` 상태이며
`publicDisplayAllowed=false`가 확인됐다. 실데이터 재생기는 검증 전용 freshness를 명시적으로
주입하고 production policy로 저장하지 않는다.

## 다음 gate

1. provider별 이용약관·재표시 권리와 production freshness policy 승인.
2. 공식 낙뢰·태풍·통제 adapter를 source coverage와 함께 연결.
3. 운영 극단 파고 임계값을 근거·관할·적용 범위와 함께 승인.
4. shadow UI에서 source/valid time/quality를 먼저 검수한 뒤 공개 reader 전환 여부 결정.
5. provider 실패와 schema drift 운영 관측을 추가한 뒤 O0 완료 여부를 재판정.
