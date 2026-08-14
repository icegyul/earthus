# Ocean Expansion Gate Ledger — O6

## 결론

`BLOCKED_EXTERNAL`. 예약, 글로벌 AIS, 선박 지오펜스 알림, 항만·물류 B2B는 개발 대기열이
아니라 증거 gate 뒤의 별도 확장이다. `prototype/data/ocean/expansion-gates.v1.json`에서 G1–G5
모두 `CLOSED`, evidence는 `null`, production capability는 전부 `false`다.

## Gate

| Gate | 열기 전에 필요한 결정 증거 | 현재 차단 이유 |
|---|---|---|
| G1 관심 검증 | 승인된 분석 정책 아래 선박 메뉴 MAU·검색·외부 링크 전환 | 분석 정책·측정 미승인 |
| G2 비용 검증 | 승인 ARPU, 공급자 사용자당 원가, 월 호출·동시 사용자 예측 | 견적·수익모델 없음 |
| G3 계약 검토 | 상업 이용·표시·재배포·cache·history 권리와 법무 승인 | AIS·예약 권리 미승인 |
| G4 기술 확장 | stream 부하, geofence, history, provider 장애훈련, 비용 guardrail | G3와 운영시험 미완료 |
| G5 B2B | 항만/물류 계약, SLA, 지원 owner, incident·처리 검토 | 계약·SLA 없음 |

Gate를 열 때는 `evidence`에 값만 채우는 것으로 끝내지 않는다. 증거의 source ID, 관측 기간,
승인자, 승인 시각, 계약 revision을 immutable audit record에 연결하고 verifier를 `PASS` 경로까지
확장해야 한다. 현재 파일은 열림 로직을 의도적으로 포함하지 않는다.

## 허용하지 않은 작업

- 공급자·가격·MAU·전환율·좌표당 원가 추정.
- MarineTraffic/VesselFinder 화면 크롤링 또는 무단 재표시.
- 자체 AIS 수신망을 v1 출시 선행조건으로 지정.
- 예약 재고·잔여석 생성, 자동 예약/취소/결제.
- 글로벌 항적·알림·B2B SLA를 준비됨으로 판매.

## 검증

`tools/test_ocean_expansion_gates.mjs`가 G1–G5 순서, required evidence, evidence null,
capability false와 dependency 연결을 확인한다.
