# Aetherus Spotlight Foundation — Sheets 102–114

## 상태

`LOCAL_SHADOW_COMPLETE / LIVE_PROVIDER_AND_NOTIFICATION_EXTERNAL`. National/organization hub,
한국 locale 우선순위, 누리호·CubeSat·Falcon mission, booster history/landing, Starship 분리 timeline,
Starlink payload 연결, follow history, deterministic ranking과 editorial override를 합성 fixture로 검증했다.

## 보호 계약

- mission/status, booster flight/landing, milestone은 모두 official/curated evidence를 요구한다.
- booster와 ship timeline은 별도 track이며, scheduled와 occurred를 동시에 가질 수 없다.
- ranking은 입력 relevance와 증거 있는 editorial override만 사용하고 무작위 정렬하지 않는다.
- 한국 hub는 `ko-KR`을 우선하지만 source 값과 시각은 번역·변형하지 않는다.
- follow는 private user reference만 저장하고 notification은 외부 gate가 닫힌 상태로 유지한다.
- 국가 추가는 policy registry 행 추가로만 가능하며 production과 분리한다.

## 닫힌 gate

현재 policy는 `DRAFT + productionEnabled=false`다. Sheet 105 live telemetry와 108 일정·착륙
evidence는 `BLOCKED_EXTERNAL`로 유지한다. 실제 KASA/발사사/provider feed, follow persistence,
notification consent/delivery, editorial 운영 승인은 미연결이다.
