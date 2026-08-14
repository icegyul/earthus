# AX-02 Unified Place Detail — 검증 및 운영 반영 대기

> 검증일: 2026-08-14 12:43 KST
>
> 코드 상태: LOCAL VERIFIED
>
> 운영 상태: 배포 대상 운영 경로의 사용자 명시 승인 대기
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

실제 Safari·구형 iPhone·VoiceOver·열/배터리는 이번 환경에서 측정하지 않았으므로
`UNKNOWN`을 유지한다.

## 4. 운영 반영 상태

아래 7개 파일을 `s3://earthus-cache-kr/app/`에 명시 MIME·`no-cache`로 올리고
CloudFront `E193CZEBLWEB56`을 무효화할 계획이다.

- `index.html`
- `css/decision-rail.css`
- `js/changelog.js`
- `js/decision-rail.js`
- `js/main.js`
- `js/onboard.js`
- `js/ui.js`

보안 승인 단계가 이 정확한 운영 경로의 사용자 명시 승인을 요구해 업로드를 실행하지
않았다. 따라서 이 문서에는 invalidation ID나 live SHA를 적지 않는다. 승인 뒤 위 7개만
배포하고 local/live SHA-256·MIME·`Cache-Control`·운영 첫 Earth/지점 클릭을 다시 확인해야
`OPERATING`으로 바꿀 수 있다.

## 5. 로컬 SHA-256

| 파일 | SHA-256 |
|---|---|
| `index.html` | `3dbe3fac72ce161ffb30d5bf1a09581f9c49adb7364f0367d19bf97d56f3ee6a` |
| `css/decision-rail.css` | `cbab61aca2a98cf1164ca0cd188a1aa2da92285c1f420b3742e644e2261c6799` |
| `js/changelog.js` | `14a1c3e31e5cc82caa60ade02e13b8ffddd74df84e8bcd4531d64a389271649e` |
| `js/decision-rail.js` | `82c2830d68ad4f12d8ec7f401a9eb3cc652cc4bd1f9894b64fb972e2a133f5e7` |
| `js/main.js` | `dbc50099b664746ca8f0c7f58ff1cecc3b4f1e9d0bea27833edf15b1adfa2c8a` |
| `js/onboard.js` | `128f4c59400adab82625feccd1dffb157f731ccf9ed77096376547e815317788` |
| `js/ui.js` | `53772a796932eb4239eec1d94a3ecd0a68e0d0573d9c6b93d1305f20020bebec` |

## 6. 롤백

운영 반영 뒤 문제가 생기면 위 7개 경로만 AX-01 검증 object version으로 복원하고 같은
CloudFront 경로를 무효화한다. Safety reader·KMA 수집기·Decision Core flag·판매 설정은
이번 변경 범위가 아니므로 건드리지 않는다.
