# Earthus · Ocean · Aetherus 무료 운영 정책 — 2026-08-14

## PD 결정

PD가 **"유료서비스 시작하자"**라고 명시하기 전까지 사용 가능한
Earthus·Ocean·Aetherus 기능을 모두 무료로 제공한다.

현재 정본은 다음과 같다.

- `MONETIZATION_MODE='FREE_OPEN'`
- `SALES_OPEN=false`
- `SHOW_SUBSCRIBE=false`
- 사용 가능한 기능: 무료 접근
- 결제·구독 화면: 비활성

## 무료가 열지 않는 것

무료 정책은 미완성 기능을 있는 척하게 하거나 권리·안전 gate를 우회하는
승인이 아니다. 다음은 무료 모드에서도 계속 닫힌다.

- provider 미연결, 상업 이용·재배포·캐시 권리 미승인
- 출처·관측시각·표본수·결측이 없는 자료
- 안전 hard gate에서 `BLOCKED / UNKNOWN`인 활동 결론
- 사용자 동의·RLS·신원 확인이 필요한 개인 기록·위치·알림
- 원격 장비 제어, 자동 게시, 자동 결제

안전 정보는 향후 유료 서비스가 시작된 후에도 계속 무료다.

## 코드 강제

`prototype/js/access-mode.js`가 상위 접근 계약이다.

- `FREE_OPEN`: 준비된 capability는 구독 없이 허용
- `PAID`: 향후 명시 승인 후에만 구독 entitlement 평가
- 오타·구버전 config: `FREE_OPEN`으로 fail-safe
- `FREE_OPEN`에서 `SALES_OPEN=true`로 잘못 바꿔도 결제 거부
- 미준비 capability: 무료 여부와 관계없이 거부

## 향후 유료 시작 gate

PD의 명시 지시 없이 `MONETIZATION_MODE='PAID'`로 바꾸지 않는다. 지시 후에도
다음을 확인한 배치로 진행한다.

1. 무료/유료 기능표와 가격 승인
2. 창립 멤버 500명 평생 반값 서버 결제 검증
3. 통신판매·약관·개인정보·provider 상업 이용 관문
4. 서버 entitlement·영수증·RLS principal A/B
5. canary 결제·해지·복원·롤백 검증

창립 멤버 반값 약속은 무료 운영 기간에도 삭제하지 않고, 유료 시작 시
서버 checkout에서 적용한다.

## 운영 배포 결과

2026-08-14T13:22:08.873Z에 무료 정책 관련 12개 파일만
`s3://earthus-cache-kr/app/`에 명시적으로 업로드하고 CloudFront를 무효화했다.

- CloudFront invalidation: `I69OTVRN5FIHSUKKQHMNEPN8DE`
- live/local SHA-256·MIME·`no-cache`: `12/12 PASS`
- Ocean·Aetherus canary 전체 의존성: `45/45 PASS`
- 실제 Chrome store: 기존 유료 후보 capability `5/5` 무료 허용
- 실제 Chrome canary: mobile·desktop `22/22 PASS`, 가로 overflow 0
- 결제: `OFF`; 구독 UI: `OFF`
- 운영 checkout 비인증 호출: HTTP 401 `UNAUTHORIZED_NO_AUTH_HEADER` 거부
- 항공기·선박: 유료 잠금이 아니라 provider 미연결로 계속 차단
- Earthus 메인: HTTP 200
- 배포 시점에는 stage·commit 미실행; 후속 PD 명시 지시로 본 변경 묶음 커밋

운영 재검증 시각은 `2026-08-14T13:24:13Z`다.
비인증 checkout 거부는 인증 앞단의 증거이며, 실제 가입 계정의 결제·영수증 테스트를
대신하지 않는다. 그 테스트는 유료 시작 승인 후에만 진행한다.

## 2026-08-15 위성 전체 기능 운영 재검증

`tools/test_aetherus_free_satellite_ui.mjs`로 로컬과 운영 `earthus.net`을 각각 실제 Chrome에서
검증했다. `FREE_OPEN`에서 미래 capability 이름인 `SAT_ALL`, `SAT_DEEP`, `PASSES`가 현재
결제 잠금으로 작동하지 않는지 실제 조작으로 확인했다.

- 스타링크 약 8,000기 그룹: 무료 선택 가능
- 전체 활성 위성 약 16,000기 그룹: 무료 선택 가능
- 실제 표시는 기기 성능 측정 상한 적용, 잘린 수는 화면에 공개
- 선택 위성의 과거·향후 궤도 추적선: 무료 표시
- 사용자가 허용한 현재 위치 기준 48시간 통과 계산: 무료 표시
- 위성 화면 내 구독·결제·준비 중 문구: 0

테스트의 소형 위성 카탈로그는 대용량 다운로드 없이 접근 판정과 UI 흐름을 재생하기 위한
fixture다. 운영 코드·접근 모드·위성 계산은 배포된 `earthus.net` 자산을 사용했다. 실제 16,000기
장시간 발열 시험이나 실기기 성능 인증을 대신하지 않으므로, 성능 상한과 사용자 확인은 유지한다.
