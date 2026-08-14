# AX-02 Unified Place Detail — 운영 반영 완료

> 검증일: 2026-08-14 12:43 KST
>
> 코드 상태: VERIFIED
>
> 운영 상태: OPERATING (`2026-08-14 13:24 KST`)
>
> 공개 경계: `DECISION_CORE_READY=false`, 판매·예약 실행·SNS 자동 게시 변경 0

## 1. 실화면에서 확인된 문제

AX-01은 첫 Earth 아래에 `장소를 눌러 조건 확인` 손잡이를 자동 노출했다. 장소를 누르면
기존 날씨 정보 시트와 별도 판단 패널이 동시에 열려 같은 장소를 두 화면에서 읽고 두 번
닫아야 했다. 빨강 닫기와 노랑 내리기의 44px 가상 터치판도 서로 겹쳐 한 버튼의 입력을
다른 버튼이 가로챌 수 있었다.

## 2. 수정 결과

- 첫 Earth의 판단 손잡이·활동 CTA를 DOM에서 제거했다.
- 첫 방문 코치마크 자동 실행을 끄고 지구·날짜·시각·현재 날씨를 첫 화면에 남겼다.
- Ambient/Explore 구분 없이 빈 지구 지점을 누르면 기존 장소 상세 `#sheet`를 연다.
- 국가·좌표·현재 날씨·시간별 강수·일별 기온·파도 아래에 5개 활동과 공식 특보
  Safety를 같은 문서 흐름으로 넣었다.
- 판단 전용 fixed panel과 전용 close를 제거했다. 부모 시트 상단 close 한 번으로
  날씨와 판단을 함께 닫는다.
- 좌표 없는 항목을 열면 이전 장소의 판단을 숨겨 stale 맥락을 남기지 않는다.
- 통합 지점 시트만 760px 상한으로 넓히고 390px에서는 화면 안 한 열로 접는다.
- 빨강 닫기와 노랑 내리기를 각각 실제 44px 버튼으로 분리했다.

Activity Score, Forecast Confidence 숫자, 혼잡, 재고, 폐쇄, “가도 된다”는 새로 만들지
않았다. 한국 밖은 계속 현지 공식 특보 미연결이며 `SAFE`로 바꾸지 않는다.

## 3. 검증 증거

| 항목 | 결과 |
|---|---|
| 전체 회귀 | `tools/test_*.mjs` 45/45 PASS |
| AX 데스크톱/모바일 | 1280×900·390×844 PASS |
| 첫 Earth | decision hidden, handle 0, coach 0, sheet 0, overflow 0 |
| 실제 지구 클릭 | visible 장소 dialog 1, `decisionRail`은 `#sheet` 내부 |
| 닫기 | 판단 전용 close 0, 부모 close 한 번 뒤 sheet/decision 모두 hidden |
| Safety | 서울 호우경보 DANGER·추천 제한, 일본 KMA 적용 범위 밖 |
| 공개 경계 | Decision shadow asset 요청 0, Activity Score 숫자 0 |
| 접근성 | 활동·질의 44px, 닫기/내리기 독립 44px, 모바일 overflow 0 |
| 런타임 | page error 0 |
| 문법/whitespace | 변경 ES module `node --check`, `git diff --check` PASS |
| 운영 자동검사 | `https://earthus.net/` 1280×900·390×844 PASS |
| 운영 실클릭 | 첫 화면 hidden→통합 패널 opacity 1→부모 close 한 번 뒤 opacity 0 PASS |
| 통합 내용 | 현재 날씨·파도·5개 활동·Safety 한 장에서 확인 |

실제 Safari·구형 iPhone·VoiceOver·열/배터리는 이번 환경에서 측정하지 않았으므로
`UNKNOWN`을 유지한다.

## 4. 운영 반영 상태

아래 7개 파일을 `s3://earthus-cache-kr/app/`에 명시 MIME·`no-cache`로 올리고
CloudFront `E193CZEBLWEB56`의 해당 7개 경로를 무효화했다.

- `index.html`
- `css/decision-rail.css`
- `js/changelog.js`
- `js/decision-rail.js`
- `js/main.js`
- `js/onboard.js`
- `js/ui.js`

1차 무효화 ID는 `IA1052T8VAQWF1SD38ZZGT2WQF`다. 운영 실클릭에서 일부 백그라운드
WebView가 `#sheet`의 opacity 전환을 멈출 수 있는 신호를 발견해 장소 상세의 열기·닫기를
즉시 반영하도록 보강했고, 최종 CSS 무효화 ID는 `I49UB5GFX64HO7JJO6U1V5Z7RF`다.
배포 계정에는 `cloudfront:GetInvalidation` 권한이 없어 waiter 조회는 `AccessDenied`였지만,
캐시 우회 운영 URL에서 local/live SHA-256 7/7, 명시 MIME, `Cache-Control: no-cache`를
확인했다. 최종 운영 자동검사와 실제 지구 클릭·한 번 닫기도 통과했다.

## 5. 로컬·운영 SHA-256

| 파일 | 로컬·운영 공통 SHA-256 | 운영 Content-Type |
|---|---|---|
| `index.html` | `3dbe3fac72ce161ffb30d5bf1a09581f9c49adb7364f0367d19bf97d56f3ee6a` | `text/html; charset=utf-8` |
| `css/decision-rail.css` | `fa68c4ecd967b558c02a5e12168c889067017c5cc064140c6b66b319c78bd45d` | `text/css; charset=utf-8` |
| `js/changelog.js` | `14a1c3e31e5cc82caa60ade02e13b8ffddd74df84e8bcd4531d64a389271649e` | `text/javascript; charset=utf-8` |
| `js/decision-rail.js` | `82c2830d68ad4f12d8ec7f401a9eb3cc652cc4bd1f9894b64fb972e2a133f5e7` | `text/javascript; charset=utf-8` |
| `js/main.js` | `dbc50099b664746ca8f0c7f58ff1cecc3b4f1e9d0bea27833edf15b1adfa2c8a` | `text/javascript; charset=utf-8` |
| `js/onboard.js` | `128f4c59400adab82625feccd1dffb157f731ccf9ed77096376547e815317788` | `text/javascript; charset=utf-8` |
| `js/ui.js` | `53772a796932eb4239eec1d94a3ecd0a68e0d0573d9c6b93d1305f20020bebec` | `text/javascript; charset=utf-8` |

## 6. 롤백

운영에서 문제가 생기면 위 7개 경로만 AX-01 검증 object version으로 복원하고 같은
CloudFront 경로를 무효화한다. Safety reader·KMA 수집기·Decision Core flag·판매 설정은
이번 변경 범위가 아니므로 건드리지 않는다.
