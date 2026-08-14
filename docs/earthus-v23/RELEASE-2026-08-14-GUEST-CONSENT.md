# 게스트 첫 Earth 약관 자동노출 교정 — 운영 증거

> 검증·운영 반영: 2026-08-14 13:34 KST
>
> 상태: OPERATING

## 문제와 원인

사용자가 로그인/가입을 누르지 않았는데 첫 Earth 위에 필수·선택 약관 전체가 자동으로
열렸다. Supabase가 브라우저에 남은 세션을 복원해도 `initAccount()`가 이를 방금 완료한
최초 로그인으로 취급했고, 현재 기기의 `earthus.consent` 값이 없거나 법적 문서 버전과
다르면 곧바로 `consentSheet.open()`을 호출한 것이 원인이었다.

## 교정

- 앱 부팅과 저장 세션 복원만으로는 약관을 열지 않는다.
- 사용자가 이 탭에서 로그인/가입을 직접 시작할 때 30분짜리 `sessionStorage` intent를 남긴다.
- 같은 탭의 OAuth 반환 뒤 그 intent를 한 번 소비한 경우에만 필요한 약관을 이어서 연다.
- 첫 화면 안전망이 오래된 `consentSheet.up` 상태도 닫는다.
- 게스트 설정에서는 `약관·동의 관리`를 숨기고 이용약관·개인정보처리방침 열람은 유지한다.
- 필수 동의 저장, 선택 위치·이용행태·마케팅 분리, 거부 시 가입 취소 규칙은 바꾸지 않았다.

## 검증

| 항목 | 결과 |
|---|---|
| 공개 UI 계약 | PASS · legal fallback 6 · sealed panels 30 |
| 게스트 첫 Earth | 약관·로그인·설정 visible 0, globe canvas 1, overflow 0 |
| 저장 세션 복원 모의 | 약관 자동노출 0 |
| 명시적 로그인 intent 모의 | 약관 1회 노출 |
| 기존 장소 통합 AX | desktop/mobile PASS |
| 운영 local/live SHA-256 | 2/2 일치 |
| 운영 헤더 | JavaScript MIME·`no-cache`·CloudFront `RefreshHit` 확인 |

실제 Google·Apple OAuth 왕복은 외부 계정 인증이 필요한 항목이라 이번 검수에서는 실행하지
않았다. 대신 운영 코드의 동일 auth subscriber에 복원 세션과 명시적 intent를 각각 주입해
분기 동작을 확인했다.

## 운영 반영

- `js/main.js` — `3407d8266684614ed14e318184e2a205d4cec7b6bda47c78a928eda11369a619`
- `js/ui-account.js` — `dfa1097baa4e4082988eeb61581f8bc563815165a082145125717161a3d33e1d`
- CloudFront invalidation — `IE8MNQ19IOOVYLCITRAMYX9MVL`

## 롤백

문제가 생기면 위 두 JavaScript만 직전 object version으로 복원하고 같은 두 CloudFront 경로를
무효화한다. 약관 문서·동의 테이블·RLS·선택 이용행태 정책은 이번 변경 범위가 아니다.
