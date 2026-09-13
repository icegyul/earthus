# PERSISTENT DEVICE TEST SERVER — https://earthus.net/wonder-test/ (2026-09-13 17:45 KST)

PD 지시 "PERSISTENT DEVICE TEST SERVER": LAN 개발 서버가 아니라 터미널·브라우저를 닫아도 남는 AWS(S3 + CloudFront) 경로에서 새 WONDER 를 폰으로 테스트한다. `/wonder/` 는 LEGACY 그대로.

| 항목 | 값 |
|---|---|
| **[TEST URL]** | `https://earthus.net/wonder-test/` · 실기기 `https://earthus.net/wonder-test/?qa=1&device=1` (`/wonder-test`, `/wonder-test/index.html`, `/wonder-test/apps/web/` 도 200) |
| **[STAGING PREFIX]** | `s3://earthus-cache-kr/app/wonder-test/` — 296 put(파일 291 + 주소 키 `app/wonder-test/`·`app/wonder-test`·`app/wonder-test/index.html`·`app/wonder-test/apps/web/` + `BUILD.json`), 객체 0 → 295 (+ 형제 키 1). `TARGET=wonder-test bash scripts/deploy-staging.sh`. 같은 빌드로 `app/wonder/next/` 도 갱신(6 put) |
| **[BUILD SHA]** | `1018db1a6aa94370d599161354387f439d81f377` = 회전 규칙 이식 `d5fcec37` + 지역 포커스 수정(한국을 누르면 한국) + 빌드 target. CDN `BUILD.json` 의 `commit`·`appCommit` 동일. 291 파일 28.97 MB, 124 eager 0 · 숨은 지역 preload 0 · 스토리 preload 0(부팅 요청 21건: 코드·css·geo·environments 뿐) |
| **[HTTP STATUS]** | 배포 전 `/wonder-test/` **403**(S3 키 없음 → CloudFront 기본 동작이 이미 `app/wonder-test/` 로 감) → 배포 뒤 **200** text/html. `.mjs` 200 text/javascript · `.json` 200 application/json · `.webp` 200 image/webp · `BUILD.json` 200. `/wonder/` 200 legacy(24,245 B, `public, max-age=60`, RefreshHit) · `/v3/` 200 legacy · `/wonder/live/apps/web/` 403(없음) |
| **[CACHE]** | CloudFront 변경 0(기본 동작: origin `s3-app` path `/app`, 관리형 캐시 정책 `658327ea…`=CachingOptimized, 함수·Lambda@Edge 0, 커스텀 오류 응답 0 — 읽기 전용 확인). 테스트 경로 객체는 전부 `/wonder-test/` 아래라 production 과 키를 공유하지 않는다. html·mjs·js·css·json `Cache-Control: no-cache, max-age=0`(엣지·브라우저 매번 재검증, 첫 요청 `x-cache: Miss`), svg·webp·txt `public, max-age=300`, 캐릭터·랜드마크 자산은 레지스트리 sha 로 `?v=sha12`. 무효화 0(필요 없음 — 새 키) |
| **[SERVICE WORKER]** | 이 빌드는 서비스워커 등록 0. **주의**: earthus.net 루트 v1 `sw.js`(scope `/`)가 이 오리진을 제어하며, 그 통과 목록 `['/v2','/v3','/Intelligence','/wonder',…]` 는 `/wonder-test/` 를 **포함하지 않는다**(`/wonder/` 접두 일치만). 실측(인앱 Chromium, SW 등록된 상태): 부팅 21 요청 전부 SW 를 거침(`workerStart>0`). v1 SW 의 처리 방식은 앱 코드(document·script·style)만 **network-first**(`fetch(req, {cache:'no-cache'})` → 성공 응답을 v1 캐시 `earthus-shell-2026-09-07-scope` 에 복사) — 온라인에서는 항상 새 WONDER 파일을 받고 legacy 자산이 섞이지 않는다. JSON·webp 는 SW 가 손대지 않는다. **남는 위험**: 네트워크 실패 시에만 화면 이동(navigate)이 v1 `index.html` 폴백으로 떨어질 수 있고, 테스트 파일 사본이 v1 캐시 이름 안에 쌓인다. 해결은 v1 `sw.js` 통과 목록에 `/wonder-test` 한 줄 추가(V1 변경 — PD 승인 필요, 이번엔 하지 않음) 또는 경로를 `/wonder/…` 아래로 두는 것. 검증 근거 `https://earthus.net/sw.js` 82~130행 |
| **[PRODUCTION CHANGES]** | **0** — `app/wonder/live/` 0 객체(전·후), 별칭 3키(`app/wonder`·`app/wonder/`·`app/wonder/index.html`, 24,245 B, 2026-09-07 14:06) 그대로. cutover 없음 |
| **[LEGACY CHANGES]** | **0** — `app/v3/` 403 객체·최신 2026-09-07 14:05:59(전·후 동일), `/wonder/`·`/v3/` 응답은 legacy index 그대로. V1/V2 코드·`sw.js`·CI 무변경. cleanup 없음 |
| **[DELETE COUNT]** | **0** (`--delete`·`rm` 없음, IAM 에 DeleteObject 권한 없음) |
| **[DEVICE READY]** | **READY** — S3/CloudFront 만 쓰므로 노트북·터미널·브라우저를 닫아도 `https://earthus.net/wonder-test/` 는 유지된다. 로컬 dev-server 의존 0. 인앱 Chromium 375×812: 부팅 21 요청 전부 `/wonder-test/` 아래(outside 0, 4xx 0), QA 패널 15단계, 한국(37.57, 126.98) 진입 → 카메라·마커가 한국(라벨 "동아시아 · East Asia"). 실기기 결과는 [복사] → `docs/device-gate/device/` → `npm test` |

## 같이 들어간 수정 (PD 실기기 신고 2026-09-13 17:39 iOS)

"한국을 터치하면 중국 저 지역으로만 터치돼" — `regionFocus()` 가 지역 **중심**(동아시아 35°N 115°E, 중국 내륙)을 돌려줘 카메라·마커가 중국으로 갔다. 이제 `regionAt()` 이 누른 좌표를 hit 에 싣고 `regionFocus()` 는 **누른 자리**를 준다(라벨은 지역 이름 그대로, 나라 이름은 뒤 단계). 시험 `regions: 지역 진입 포커스는 손가락이 닿은 자리` 추가, `node --test` 57/57. 이전 동작으로 되돌리려면 `regionFocus` 한 줄이다.

## 지키는 것

`/wonder/` 덮어쓰기 0 · `/wonder/live/` 0 · `app/v3` 0 · V1/V2 0 · legacy cleanup 0 · production cutover 0 · 삭제 0 · 배경 production_approved 0 · push 0.
