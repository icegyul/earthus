# Earthus Ocean · Aetherus v3.0 Canary Release — 2026-08-14

## 결론

Ocean O0–O6과 Aetherus v3.0 로컬 계약을 메인 서비스와 분리된
`NOT RELEASED` canary에 배포했다. 사용자가 직접 실행할 수 있는 테스트 허브는
다음 주소에 있다.

- `https://earthus.net/canary/ocean-aetherus-v3/index.html`
- 배포 상태: `CANARY_DEPLOYED / NOT_RELEASED`
- 사용 가능한 기능: `FREE_OPEN`; 결제·구독 UI: 닫힘
- 권리·안전·알림·위치·운영 AI·원격제어 gate: 닫힘
- 메인 `index.html`과 저장소 루트의 `main.js`, `ui.js`, `cosmic3d.js`: 배포하지 않음
- 앱 `prototype/js/main.js`·`ui.js`는 `FREE_OPEN` 접근 정책 배치에만 포함
- 배포 시점에는 stage·commit 미실행; 후속 PD 명시 지시로 본 변경 묶음 커밋

## 정적 배포

초기 canary 44개 파일을 배포한 후 `FREE_OPEN` 공통 계약 1개를 추가해,
`tools/manifests/ocean-aetherus-v3-canary-files.tsv`의 현재 의존성은 45개다.
실제 변경 배치 12개만 `s3://earthus-cache-kr/app/`에 명시적으로 추가 업로드했다.

- Content-Type: HTML/CSS/JavaScript/JSON별 명시
- Cache-Control: 전 파일 `no-cache`
- CloudFront distribution: `E193CZEBLWEB56`
- invalidation ID: `I10L9TR457DEV56TI2WRIMBSCZ`
- invalidation 생성 시각: `2026-08-14T12:47:37.214Z`
- invalidation path: 44개
- 추가 invalidation ID: `I69OTVRN5FIHSUKKQHMNEPN8DE` (12 paths)
- live/local SHA-256, MIME, Cache-Control: `45/45 PASS`
- 최종 live 재검증 시각: `2026-08-14T13:24:13Z`

IAM 사용자에게 `cloudfront:GetInvalidation`이 없어 invalidation status 조회는
`AccessDenied`였다. 다만 invalidation 생성은 성공했고, 그 후 CloudFront 공개 URL에서
초기 44개와 후속 공통 계약을 합친 현재 45개의 해시와 헤더,
실제 브라우저 결과를 재검증해 전파를 실측했다.

## 브라우저 검증

CloudFront 공개 URL을 Chrome에서 직접 열어 공통 무료 정책 1개,
Ocean 8개, Aetherus 13개 계약을 실행했다.

| viewport | 결과 | layout | 가로 overflow |
|---|---:|---:|---:|
| 390×844 | 22/22 PASS | 1 column | 0 |
| 1280×900 | 22/22 PASS | 3 columns | 0 |

최종 smoke test에서 Earthus 메인 `https://earthus.net/`도 HTTP 200을 유지했다.

canary는 `noindex`, CSP, `NOT RELEASED`를 명시한다. Live data 연결, 결제,
알림 발송, 위치 수집, 원격 제어는 하지 않는다. JSON 보고서는 화면에서
다운로드할 수 있다.

## 해양 수집기 배포

`marine-grid`와 `marine-ea` Lambda에 Open-Meteo Marine API 현재 속도 단위를
`m/s`로 명시하는 코드를 배포했다. km/h fallback은 m/s로 변환하고,
알 수 없는 단위는 거부한다.

| Lambda | code updated | 직접 invoke 결과 |
|---|---|---|
| `marine-grid` | `2026-08-14T12:50:57Z` | `ok=true`, sea 1,653, failed 0, 88,297 bytes |
| `marine-ea` | `2026-08-14T12:51:17Z` | `ok=true`, sea 2,482, failed 0, 130,700 bytes |

공개 `ocean/marine.json`에서 `units.cur = "m/s"`를 재확인했다.

## 공개 데이터 재생 검증

배포 후 CloudFront의 실제 JSON 6개를 다시 내려받아 전체 재생했다.

### Ocean Core

- marine: 2,376 cells, source sea 1,653, observations 12,239, missing 6,769, rejected 0
- KMA: 182 stations, observations 492, rejected 0
- NDBC: 2,412 buoys, observations 6,197, rejected 0
- rights: `DRAFT`
- public display: `false`

### Ocean Safety

- lightning: JMA, source count 82, `ACTIVE`, nearby match 3
- typhoon: JMA Nangka, official radius 220 km, `ACTIVE`
- coast: observation 0, `UNKNOWN`, `OBSERVATION_IS_NOT_CLOSURE`
- rights: `DRAFT`
- public display: `false`

즉 자료 수집과 출처·관측시각·결측 보존은 작동하지만, 권리 승인 전에
메인 표시나 활동 결론을 열지 않는다.

## 롤백 단위

- canary 의존성: 현재 45개 manifest가 유일한 대상 목록이다.
- 무료 정책 배치: 12개 manifest로 별도 복원할 수 있다.
- 기존 파일 교체: `js/beaches.js`, `js/fishing.js` 및 무료 정책에 연결된 앱 JS 8개와
  `config.local.js`.
- 신규 정적 범위: canary, Ocean/Aetherus contract JS·policy JSON·fixture.
- Lambda: `marine-grid`, `marine-ea` 2개.
- S3 object versioning 가용성은 이 배포에서 확인하지 않았다. 롤백 시에는
  기존 두 파일과 Lambda의 last-known-good artifact를 먼저 확보한 후 명시적으로
  복원하고, 같은 path를 CloudFront에 무효화한다.

## 다음 공개 gate

canary 통과는 production 승인이 아니다. provider 권리, 운영 freshness,
server/RLS, 실기기, moderation/on-call, 롤백 리허설과 PD의 공개 승인이
모두 있어야 `NOT_RELEASED`를 낮춘다.
