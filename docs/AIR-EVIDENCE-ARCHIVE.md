# 황사·미세먼지 이동 계산 — 증거 회차 적재

## 현재 판정

한 시각의 먼지 농도와 바람만으로 발원지나 유입 경로를 말할 수 없다. `air-evidence-archive`는
CAMS 기반 동아시아 5° 모델 격자와 같은 시각대의 AirKorea 한국 실측을 하나의 비공개 회차로
묶는다. 아직 이동 계산이나 예보가 아니며 LAB 보고서를 만들지 않는다.

## 입력과 구분

| 입력 | 범위 | 역할 |
|---|---|---|
| `wind/air.json` | 15–60°N, 85–150°E, 5° 140칸 | PM10·PM2.5·먼지 질량·AOD 모델 |
| `wind/korea-air-obs.json` | 좌표가 확인된 한국 측정소 | PM10·PM2.5 실측과 결측 사유 |

모델은 전지구의 빈 공간을 덮지만 5° 한 칸이 넓고, 실측은 측정소 지점만 정확하다. 모델값을
실측으로 부르지 않고 실측을 모델 격자값으로 덮어쓰지 않는다. 먼지 질량만으로 고비사막·공사장·
연기 등 발원 종류를 확정하지 않는다.

## 운영

- Lambda: `air-evidence-archive`
- EventBridge: `earthus-air-evidence-archive`, 1시간
- 최신: `archive/air-evidence/latest.json`
- 변경 회차: `archive/air-evidence/YYYYMMDDHHMMSS.json`
- 저장 속성: `private, no-store`, `public=false`, `reportPublished=false`
- 모델 3시간·실측 2시간을 넘으면 `INPUT_STALE`로 기록하고 계산 문을 닫음
- 입력 시각과 내용이 같은 재실행은 `changed=false`로 회차 수를 늘리지 않음

## 계산·보고서 문턱

1. 서로 다른 신선한 회차 6개 전에는 관측소 도달 순서 계산 금지
2. 이후에도 `A→B→C`는 거리순이 아니라 관측시각·값 상승·풍향 일치·결측을 함께 검증
3. CAMS 5° 격자의 공간 대표성과 지점 측정소의 차이를 항상 표시
4. 발원 후보 위성 근거와 고도별 바람이 없으면 발원지·중심선·도달시각을 만들지 않음
5. 종료 사건과 사후 관측 대조 전에는 `analysis/air-pollution-reports.json` 생성 금지

## 2026-08-11 첫 운영 회차

- 동아시아 모델 140칸, 모델 4개 변수 결측 0
- AirKorea 좌표 확인 실측 672곳, 좌표 없음 1곳
- PM10 결측 55곳, PM2.5 결측 91곳
- `snapshotCount=1`, `sequenceCalculationAllowed=false`, `labReportAllowed=false`
- 동일 입력 두 번째 실행은 `changed=false`, 회차 수 1 유지
