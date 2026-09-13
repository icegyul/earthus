# STAGING DEPLOYMENT FOR DEVICE GATE — 보고 (2026-09-13 16:36 KST)

PD 지시 "STAGING DEPLOYMENT FOR DEVICE GATE" 의 결과. **production cutover 아님 · production 승인 아님 · 배경 production_approved = 0 유지 · Git push 는 별도 PD 결정 · Phase 2 착수 없음.**

| 항목 | 값 |
|---|---|
| **[STAGING URL]** | `https://earthus.net/wonder/next/apps/web/` (디렉터리 주소 `/wonder/next/` · `/wonder/next` 도 200 — `<base href="/wonder/next/apps/web/">` 사본) |
| **[DEVICE TEST URL]** | `https://earthus.net/wonder/next/apps/web/?qa=1&device=1` |
| **[DEPLOY TARGET]** | `s3://earthus-cache-kr/app/wonder/next/` (us-east-2) → CloudFront `E193CZEBLWEB56` origin path `/app` → `https://earthus.net/wonder/next/…`. 스크립트 `scripts/deploy-staging.sh` (prefix 문자 고정 + 가드, `--delete` 없음, 무효화 없음) |
| **[COMMIT SHA]** | `91bf2330db029843829b3a889ddae8885f39a879` — wonder 3 미커밋 0, `BUILD.json.commit` 동일(CDN 에서 확인) |
| **[BUILD]** | `node scripts/build-staging.mjs` → `build/staging/` **291 파일 28.96 MB** (app 10 · packages 11 · vendor 3 · data 8 · landmark 3 · character-runtime 248 · character-thumb 3 · fx 5) + `_index-base-next.html` + `BUILD.json`. 제외: docs · tests · scripts · benchmarks · `*.ts` · 검수/QA/출처 JSON · source-manifest · **불합격 배경 24장**. 개발 서버 업로드 없음. 서비스워커 없음. 124 eager 0 · 숨은 지역 preload 0 · 스토리 preload 0 (지역 진입 전 요청 21건 = 코드·css·geo·environments 뿐 — 아래 NETWORK) |
| **[UPLOAD COUNT]** | **296 put** = 파일 291 + 디렉터리/주소 키 4 (`app/wonder/next/apps/web/`, `app/wonder/next/`, `app/wonder/next`, `app/wonder/next/index.html`) + `BUILD.json`. prefix `app/wonder/next/` 객체 수 **0 → 295** (형제 키 `app/wonder/next` 1 은 prefix 밖에서 셈) |
| **[DELETE COUNT]** | **0** (`--delete`·`rm` 없음; IAM `earthus-deploy` 에 DeleteObject 권한 자체가 없음) |
| **[AWS CHANGES]** | `app/wonder/next/**` 296 put **만**. CloudFront 설정·무효화 0 · IAM/버킷 정책 0 · CI 0. 캐시 정책은 **스테이징 객체에만**: html/mjs/js/css/json `no-cache, max-age=0` · svg/webp/txt `public, max-age=300`. production 캐시 정책 무변경 |
| **[APP/V3 CHANGES]** | **0** — `app/v3/` 403 객체, 최신 2026-09-07 14:05:59 (배포 전·후 동일) |
| **[PRODUCTION CHANGES]** | **0** — `app/wonder/live/` 0 객체(전·후), 별칭 3키 `app/wonder`·`app/wonder/`·`app/wonder/index.html` 24,245 B 2026-09-07 14:06 그대로. `https://earthus.net/wonder/` 200 (legacy paper index 24,245 B, `RefreshHit`). `/wonder/live/apps/web/` 403(존재하지 않음). V1·V2·AETHERUS·DAMC 경로 접근 0 |
| **[REGRESSION]** | `node --test` **48/48** (배포 직전 재실행) · `build-registry.mjs --check` 최신 |
| **[BROWSER]** | 인앱 Chromium 1024×768, `…/apps/web/?qa=1`: 부팅 marks geo 1446 · texture 1491 · gl 1635 ms → `environmentAt(27.98, 86.92)` = himalaya → `enterEnvironment` → **active** (discoveryReady true) → 스토리 카드 **open** ("구름보다 높은 산" / "눈 위의 커다란 발자국") → close → `returnToEarth` → **earth**. visits 1. 자산 런타임 loads 4 · failures 0 · timeouts 0 · retries 0 · resident 169 KB. 스크린샷 확인(종이 지구 + QA 패널). 렌더는 인앱 창이 가려지면 rAF 가 멈춰 `__wonder.stepFrames` 로 진행 |
| **[CONSOLE]** | **0** (No console logs) |
| **[NETWORK]** | 요청 **전부** `https://earthus.net/wonder/next/` 아래(outside 0) · 4xx/5xx **0**. 부팅 21건 / 지역 진입~스토리 10건(registry 17 KB · manifest 12 KB · landmarks 1 KB · himalaya.webp 17 KB · thumb 9 KB · runtime yeti 40 KB · stories 2 KB · yeti_scene). Content-Type `.mjs` text/javascript · `.json` application/json · `.webp` image/webp · `x-cache: Miss`(첫 요청). **서비스워커**: 이 빌드는 등록 0. earthus.net 루트 v1 `sw.js` 가 오리진을 제어하지만 fetch 핸들러가 `/wonder/` 경로를 즉시 `return`(통과, sw.js:92) — 스테이징 응답은 v1 캐시를 거치지 않고 production 캐시 이름을 참조하지 않는다 |
| **[BLOCKERS]** | 배포 자체 **없음**. 남은 FINAL GATE 3: ① Android 실기기 ② iOS 실기기 ③ 배경 production 승인(0 유지) |

## 재배포 (2026-09-13 17:19 — ROTATION RULE LOCK)

회전 규칙 이식 커밋 **`d5fcec37`** 을 같은 스크립트로 재배포: **10 put**(바뀐 파일 5 + 디렉터리/주소 키 4 + BUILD.json) · 삭제 0 · prefix 객체 295 → 295 · production/`app/v3` 변경 0. CDN 의 `BUILD.json.commit = d5fcec37`, `camera.mjs`·`input.mjs`·`qa-overlay.mjs`(v2, 15단계) 새 본문 확인. 상세 `docs/ROTATION_RULE_PORT_2026-09-13.md`. 실기기 게이트는 이 빌드로 다시 돌린다.

## 배포 전 점검 (지시 순서)

| # | 점검 | 결과 |
|---|---|---|
| 1 | git status (wonder 3) | 미커밋 0 |
| 2 | HEAD SHA | `91bf2330` (배포 스크립트 빈-prefix 수정 커밋 포함; 그 전 `e18859ac` 가 빌드·배포 스크립트 신설) |
| 3 | npm test | 48/48 |
| 4 | 회귀 ≥ 48/48 | PASS |
| 5 | console 0 | PASS (로컬 빌드·스테이징 둘 다) |
| 6 | build 결과 | 291 파일 28.96 MB, 금지 항목 0 (`find` 로 backgrounds webp·`*.ts`·docs·tests·scripts 0) |
| 7 | asset registry | `--check` 최신, 297 자산 |
| 8 | staging 출력 경로 | `app/wonder/next/` (스크립트 상수, 가드 `[[ "$PREFIX" == "app/wonder/next" ]]`) |
| 9 | production 경로 미포함 | 빌드 코드 내 `app/wonder/live`·`app/v3`·`serviceWorker` 참조 0 (stage/index.html 주석 1줄 "서비스워커 없음" 뿐) |

## 변경 목록 (배포 전 dry-run → 실제)

- dry-run: 295 건(파일 291 + 키 4), 삭제 0, `app/wonder/live`·`app/v3` 키 0.
- 실제: 296 건(+`BUILD.json`), 삭제 0, 오류 0. 목록 전문은 스크립트 출력(`.tmp-deploy.log`, 미보관) — 파일별 키는 `build/staging/BUILD.json.hashes` 와 1:1.
- 같은 날 `app/` 아래 다른 객체 **708건**(app/v2 311 · app/tourism 212 · app/assets 179 · app/Intelligence 3 · app/js 2 · app/css 1)이 00:03~16:33 에 바뀌어 있었다 — 이 세션 배포(16:36:17) **이전**, 다른 세션/CI 의 v1·v2 배포다. 이 스크립트는 prefix 밖을 쓸 수 없다(sync 대상 고정 + 가드 + IAM 삭제 불가).

## 발견 (비차단)

1. 첫 지역 진입 때 `asset-registry.json`·`manifest-124.json`·`landmarks.json` 이 **각 2회** 요청된다. `ensureContent()` 가 줌 단계 변경(`syncSprites`)과 `enterEnvironment` 에서 거의 동시에 불리는데 in-flight 약속을 공유하지 않아서다. 로컬(응답 수 ms)에서는 첫 호출이 끝난 뒤 둘째가 와서 안 보였고, CDN 지연(~1 s)이 드러냈다. 둘째 요청은 재검증(전송 300 B, `delivery=cache`) 이라 기능·예산 영향 없음. **수정 보류** — 실기기 게이트는 배포된 커밋 그대로 돌려야 하므로, PD 결정 뒤 다음 배포에 넣는다.

## 실기기 게이트에서 결과 저장

스테이징에는 개발 서버가 없어 QA 패널의 **[저장]** (`POST /qa-result`)은 실패한다(403). 폰에서 **[복사]** → JSON 을 `docs/device-gate/device/<android|ios>-<ISO 시각>.json` 으로 저장 → `npm test` (`device-gate` 시험이 14/14 판정). 같은 Wi-Fi 라면 LAN 주소 `http://192.168.219.115:8790/apps/web/?qa=1&device=1` 에서는 [저장] 이 바로 적는다(`node scripts/dev-server.mjs 8790 --lan`). 절차: `docs/DEVICE_GATE_CHECKLIST.md`.
