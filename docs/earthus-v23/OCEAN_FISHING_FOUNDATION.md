# Ocean Fishing Foundation — O1 shadow

## 상태

`LOCAL_SHADOW_IN_PROGRESS`. Fishing의 관측 계약·조위 요약·안전 우선 결정·개인 위치 정책을
구현했지만 기존 공개 Fishing UI의 reader로 전환하지 않았다. provider 상업 이용권, 공식
입수·출입 통제 coverage, production 임계값이 승인되기 전에는 공개 완료로 판정하지 않는다.

## 구현 계약

- `normalizeOpenMeteoMarinePoint`
  - point current를 `FORECAST`로 보존하고 offset 없는 시각은 응답의 `utc_offset_seconds`로만 UTC화한다.
  - 해류 km/h는 source unit을 남기고 m/s로 변환한다. 알 수 없는 단위는 거부한다.
- `normalizeOpenMeteoTidePoint`, `summarizeTideObservations`
  - datum은 `GLOBAL_MEAN_SEA_LEVEL`, 용도는 `NOT_FOR_NAVIGATION`으로 고정한다.
  - 1시간 간격 봉우리·골 요약은 최대 약 30분 오차를 명시한다.
  - 조위에서 조류 속도나 물때 번호를 만들지 않는다.
- `buildFishingDecision`
  - 파고·너울·주기·수온·해류를 같은 계약으로 읽는다.
  - 안전 evidence가 `BLOCKED/UNKNOWN`이면 먼저 표시하고, 언제나 출발·예약 CTA를 닫는다.
  - 조황·어종·입질 확률·catch guarantee를 만들지 않는다.
- `protectOceanLocation`
  - owner exact는 동의와 서버 강제 정책이 있을 때만 허용한다.
  - shared는 deterministic grid blur, public은 region-only, EXIF GPS는 항상 제거한다.

## 확인된 기존 오류와 수정

Open-Meteo Marine의 `ocean_current_velocity` 기본 응답은 km/h인데 다음 네 경로가 숫자를
변환하지 않고 m/s로 표시·저장하고 있었다.

- `aws/marine-grid/handler.py`
- `aws/marine-ea/handler.py`
- `prototype/js/fishing.js`
- `prototype/js/beaches.js`의 시간대 처리

수집기와 Fishing reader는 `wind_speed_unit=ms`를 명시하고, 응답이 km/h이면 3.6으로 나누며,
그 외 단위는 거부하도록 수정했다. 해양 지점 선택은 `cell_selection=sea`, 시간은 GMT와
`utc_offset_seconds` 기반 명시 변환으로 고정했다. 이미 공개되어 있던 과거 격자 snapshot은
재수집 전까지 해류 단위가 잘못 표기됐을 가능성이 있으므로 운영 재생성·live 검증이 필요하다.

## 닫힌 gate

1. Open-Meteo 상업 이용과 기반 모델 attribution 검토.
2. 수정된 Lambda의 운영 재배포·재수집·live m/s 비교.
3. 실제 해수욕장 관리주체의 입수·출입 통제 feed와 coverage.
4. private point의 서버 저장·공유 API와 두 principal 격리 검증.
5. 공개 Fishing UI를 `OceanObservation` reader로 전환하는 실제 화면 회귀.
