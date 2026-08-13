# AETHERUS Device RC 릴리스 증거

## 결론

2026-08-14 AETHERUS 실기기 검증 콘솔을 독립 RC 경로에 배포했다.

```text
URL: https://earthus.net/aetherus-device-qa.html
Main AETHERUS public consumer: NOT OPENED
DECISION_CORE_READY: unchanged
Release decision: BLOCKED until physical and external gates pass
```

이 릴리스는 기존 EARTHUS 지구 화면, AETHERUS 공개 메뉴, 판매, 알림, 결제, SNS, 원격
장비를 열지 않았다. 검증 콘솔은 `noindex` 독립 경로이며 정확한 URL을 아는
검수자가 직접 버튼을 눌러야 카메라·위치·센서 권한을 요청한다.

## 구현 범위

- 390×844 반응형·VoiceOver 이름·focus-visible·48px 터치 기준선.
- Sky AR 후면 카메라·방향 센서 명시적 권한 시작·중지·visibility/pagehide 해제.
- 방위·고도·헤딩 모드·지터·수락/드롭 표본·카메라 settings·live track/listener 계측.
- 카메라 frame을 기존 Capture 상태 머신으로 `COMPLETED`, SHA-256 불변 RAW, IndexedDB,
  Archive `HOT`에 저장.
- 새 repository 핸들의 raw/archive digest 재검증, 페이지 세션 간 보존 확인.
- checksum export package 내려받기, 명시적 삭제 확인, 검증된 삭제 영수증.
- 로컬 QA 동의→철회→동의 기록·QA 원본 삭제 UX.
- NASA M82 서명 dev fixture: manifest/digest/WCS, 독립 검증 별 8개, original upload 0.
- AI 읽기 전용 의도, prompt injection 차단, 인용 커버리지, state mutation null, 외부 호출 0.
- 원격 관측소 단일 사용 승인, stale weather/dome/mount, target mismatch, E-stop Safe Hold,
  device command null.
- 5분 유한 내구성·배터리·발열 기록. 무한 interval/rAF 없음.
- PASS/FAIL/BLOCKED/UNKNOWN와 출처·시각·계측을 JSON 보고서로 export.
- AETHERUS private data Supabase migration: Personal Universe, record, archive metadata, privacy event,
  data-subject request, deletion receipt의 `ENABLE/FORCE RLS`, owner policy, anon revoke.
- account export, idempotent consent withdrawal, idempotent delete receipt RPC.
- 두 authenticated principal A/B 간 select/forged insert/update/delete 거절·probe cleanup 검증기.

## 자동 검증

```text
PASS: tools/test_aetherus_device_qa.mjs
PASS: tools/test_aetherus_ai_evidence.mjs
PASS: tools/test_aetherus_astrometry.mjs
PASS: tools/test_aetherus_astronomy.mjs
PASS: tools/test_aetherus_citizen_science.mjs
PASS: tools/test_aetherus_community_safety.mjs
PASS: tools/test_aetherus_foundation.mjs
PASS: tools/test_aetherus_hardening.mjs
PASS: tools/test_aetherus_mission_replay.mjs
PASS: tools/test_aetherus_observation_media.mjs
PASS: tools/test_aetherus_observation_planner.mjs
PASS: tools/test_aetherus_observation_session.mjs
PASS: tools/test_aetherus_personal_universe.mjs
PASS: tools/test_aetherus_photo_ownership.mjs
PASS: tools/test_aetherus_plugin_sandbox.mjs
PASS: tools/test_aetherus_remote_observatory.mjs
PASS: tools/test_aetherus_sky_ar.mjs
```

운영 브라우저 390×844 검증:

```text
horizontal overflow: 0
minimum control height: 48px
external scripts: 0
console warning/error: 0
signed M82 solve: VERIFIED, independent validation 8, P95 0.0000 arcsec
AI local guard: PASS, production model BLOCKED
Remote Safe Hold simulator: PASS, physical HIL BLOCKED
```

## 선별 배포

S3 `s3://earthus-cache-kr/app/` 아래에 다음 4개 정적 파일만 배포했다.

| path | Content-Type | Cache-Control |
|---|---|---|
| `/aetherus-device-qa.html` | `text/html; charset=utf-8` | `no-cache` |
| `/css/aetherus-device-qa.css` | `text/css; charset=utf-8` | `no-cache` |
| `/js/aetherus-device-qa.js` | `text/javascript; charset=utf-8` | `no-cache` |
| `/data/astrometry/m82opt-nasa-wcs-features-v1.json` | `application/json; charset=utf-8` | `no-cache` |

CloudFront:

- initial four-path invalidation: `IBCS0RI0PUEPEN567W2RUONWQU`
- final JavaScript invalidation: `IB3F9Y4H808L8SXJ68ZOPL47C0`
- final CSP·permission lifecycle invalidation: `I6LC8K5LHNHUWQHMYZ04I58S6I`
- final incomplete-sample decision invalidation: `IBRUBW7EOZICY1AJ2DC80Z87JK`

최종 local/live SHA-256:

| path | SHA-256 |
|---|---|
| `/aetherus-device-qa.html` | `712bcff02dea9eada3c3af13aa47b6c63248a8607494b2bb21ec9603ab46c376` |
| `/css/aetherus-device-qa.css` | `1b012debe93386f8d70151c2165b0c6f038321ae11d248ee750ac004d8b8281f` |
| `/js/aetherus-device-qa.js` | `a16a4c8860d1460f7876022f689661a6ebfc4960abf579f233574337ed545efa` |
| `/data/astrometry/m82opt-nasa-wcs-features-v1.json` | `3cd25a78da13b04829318658dcb549ea975a3da2f763f525340ded6d61f955bb` |

cache-busting URL을 다시 받아 local/live SHA-256 일치와 HTTP 200, 위 Content-Type,
`Cache-Control: no-cache`를 확인했다.

## 공개를 막는 Hard Gate

### 격리 canary·rollback 리허설

메인 RC·AETHERUS consumer와 분리된
`/canary/aetherus-device-rc-rollback-probe.json`에서 다음을 실제 수행했다.

```text
safe local/live: e64ca235212604eef33298f318ede3b305126735b93ca7213eea6a15d828eb73
intentional fault local/live: 2ba0a09610f1cf33e7cb2119008df18a2f182d41e172b4c042e58e190eb03fc6
restored live: e64ca235212604eef33298f318ede3b305126735b93ca7213eea6a15d828eb73
result: PASS — fault bytes were observed, then exact safe bytes restored
```

첫 시도에서는 장애 파일 경로가 없어 주입이 실행되지 않았고 안전판이 유지됐다.
이 시도는 PASS로 계산하지 않았다. 두 번째 시도만 서로 다른 fault SHA가 실제
CloudFront URL에서 관찰된 후 원래 safe SHA로 복원되어 PASS였다.

probe는 `no-cache`, `application/json; charset=utf-8`이고
`productionConsumerAffected=false`를 보존한다. 이 증거는 rollback 기술 절차 PASS이지
메인 AETHERUS 공개 승인이 아니다.

| gate | 현재 | 필요 증거 |
|---|---|---|
| iPhone Safari 카메라·센서 | `UNKNOWN` | 본인 권한 승인, 센서 sample, clean stop |
| 로컬 frame capture·재실행 | `UNKNOWN` | 실제 카메라 frame, digest, page-session 보존 |
| VoiceOver·200%·회전·저전력 | `UNKNOWN` | 실기기 수동 attestation |
| 5분 배터리·발열 | `UNKNOWN` | 배터리 차이·HOT 아님 |
| Supabase principal A/B | `BLOCKED` | migration 적용 후 두 독립 JWT 실거절 |
| 운영 AI | `BLOCKED` | 계약·비용·평가 dataset·red team·tool allowlist 승인 |
| 원격 관측소 | `BLOCKED` | 물리 dome/mount/E-stop HIL |
| 공개 전환 | `BLOCKED` | 격리 canary·장애 주입·rollback PASS; 실기기·외부 gate 후 PD 명시 승인 남음 |

따라서 자동 모듈·RC 콘솔·선별 배포는 완료되었지만, 실기기와 외부 권한 증거 전에
제품 공개가 완료되었다고 표시하지 않는다. 오전 실행 순서는
[`AETHERUS-DEVICE-QA-RUNBOOK-2026-08-14.md`](../AETHERUS-DEVICE-QA-RUNBOOK-2026-08-14.md)를 따른다.
