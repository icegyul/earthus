# EARTHUS V3 WONDER — DEPLOYMENT MAP v1 (2026-09-13, 문서만 · AWS 변경 0건)

DECISION LOCK 3·5 의 구체화. **이 문서는 설계다. 어떤 S3 객체·CloudFront 설정·CI·sw.js 도 바꾸지 않았다.**
AWS 항목은 `earthus-deploy` 프로파일로 읽기 전용 조회한 실측이다(2026-09-13 13:0x).

## 1. Legacy (현재 라이브) — 실측

| 항목 | 값 |
|---|---|
| 계정 / 배포 사용자 | `294951922100` / `arn:aws:iam::294951922100:user/earthus-deploy` — `s3:DeleteObject`·`GetBucketVersioning`·`GetLifecycleConfiguration` **없음** (실측 AccessDenied) |
| 버킷 | `earthus-cache-kr` (us-east-2). 공용. `app/` 아래 접두사 21개: Intelligence, aetherus, assets, canary, css, data, img, js, legal, logo, ocean, shots, space, tools, tourism, v2-deploy, v2-three, v2, **v3**, vendor, **wonder** |
| CloudFront | `E193CZEBLWEB56` (`d3458uw9ftptt9.cloudfront.net`), 별칭 `earthus.net`·`www.earthus.net`, 기본 루트 객체 `index.html`, Compress on |
| CloudFront 오리진 | `s3-app` = 버킷 + **origin path `/app`** (기본 동작) · `s3-data` = 버킷 루트 (`/wind/* /events/* /ocean/* /solar/* /clouds/* /celestrak/*`) · `lambda-llm` (`/api/*`) |
| → URL 규칙 | `https://earthus.net/<p>` ⇢ S3 키 `app/<p>` (위 6개 data 경로와 `/api/*` 제외) |
| `/v3` 라이브 | `app/v3/` — **v3-paper**(`src/main.js`, `<base href="/v3/">`). kids 파일(09-05)과 paper 파일(09-07) 혼재. 삭제 권한이 없어 계속 섞인다 |
| `/wonder` 라이브 | 키 **정확히 3개**: `app/wonder`, `app/wonder/`, `app/wonder/index.html` (각 24,245 B, 09-07) — paper index 사본. **`app/wonder/` 아래 다른 키 없음** (실측: next/·builds/·live/ 없음) |
| 배포 스크립트 | `aws/deploy-v3-paper.sh`, `aws/deploy-v3-kids.sh` — 둘 다 `app/v3/` sync + **`/wonder` 별칭 3키 재작성** + 무효화 `/v3/*`, `/v3`, `/wonder`, `/wonder/`, `/wonder/index.html` (와일드카드 `/wonder/*` 는 안 씀) |
| CI | `.github/workflows/deploy-v3-kids.yml` — `prototype/v3-kids/**`·`aws/deploy-v3-kids.sh`·자기 자신 변경 시 main·현재 브랜치 push 에 실행 → `app/v3/`(가드가 exit 5). v3-paper 는 CI 없음(수동) |
| 서비스워커 | `prototype/sw.js`(v1, 범위 `/`) — 통과 목록 `/v2 /v3 /Intelligence /wonder /v2-three /v3-paper /v3-kids /v2-deploy` (경로 == p 또는 `p/` 로 시작). 그 밖의 경로는 v1 워커가 network-first 로 다루고 실패 시 v1 index.html 폴백 |
| Route53 | 미조회(권한·필요 없음). 도메인은 CloudFront 하나에 걸려 있어 새 빌드에 DNS 변경 없음 |
| 버킷 버전 관리·수명주기 | 이 프로파일로 조회 불가. 기존 기록: Versioning OFF, Object Lock 없음 |

## 2. New WONDER prefix — 설계 (LOCKED 후보, 실행 전)

`app/v3/` 를 쓰지 않고, v1 sw.js 를 바꾸지 않고, legacy 키와 겹치지 않는 조건을 동시에 만족하는 유일한 자리는 **`/wonder/` 하위** 다
(sw.js 통과 목록에 `/wonder/…` 가 이미 있다. 다른 새 경로 `/v3w/`·`/wonder-new/` 는 v1 워커가 가로챈다).

```
S3 키                                   URL                                   역할
app/wonder                              /wonder                               ┐ legacy 별칭 3키 — cutover 까지 손대지 않음
app/wonder/                             /wonder/                              │
app/wonder/index.html                   /wonder/index.html                    ┘
app/wonder/next/…                       /wonder/next/…                        ★ 스테이징 거울 (earthus-v3-wonder/ 공개 부분: apps/web · packages · content)
app/wonder/next                         /wonder/next                          ┐ 디렉터리 주소용 index 사본 (<base href="/wonder/next/apps/web/">)
app/wonder/next/                        /wonder/next/                         ┘
app/wonder/live/…                       /wonder/live/…                        ★ 운영 거울 (cutover 뒤). 별칭 3키가 이 거울의 index 를 가리킴
```

- 새 스크립트(예정 `aws/deploy-wonder-next.sh`)는 **`app/wonder/next/` 와 `app/wonder/live/` 만** 쓴다. `app/v3/`·별칭 3키·`app/wonder/index.html` 은 cutover 단계 전까지 쓰지 않는다.
- 진입 HTML 은 프로젝트 루트 거울 안 `apps/web/index.html` 이고, 디렉터리 주소(`/wonder/next/`)용 사본에 `<base href="/wonder/next/apps/web/">` 를 얹는다(legacy 와 같은 S3 REST 오리진 함정 — 디렉터리 요청에 index 를 붙여 주지 않는다).
- `main.mjs` 의 `CONTENT_BASE` 가 `import.meta.url` 기준 상대라 거울 위치가 next/live 어디든 그대로 동작한다.

### 2.1 충돌 검사 (키 집합 교집합)

| 쓰는 주체 | 쓰는 키 | `app/wonder/next/*` | `app/wonder/live/*` | 별칭 3키 | `app/v3/*` |
|---|---|---|---|---|---|
| deploy-v3-paper.sh | `app/v3/*`, 별칭 3키 | ✗ 없음 | ✗ 없음 | **씀** | 씀 |
| deploy-v3-kids.sh (CI) | `app/v3/*`, 별칭 3키 | ✗ 없음 | ✗ 없음 | **씀** | 씀 |
| deploy-app.sh (V1 전체) | `app/<prototype 트리>` | ✗ (prototype 에 wonder/ 없음) | ✗ | ✗ | (v3-paper·v3-kids 하위는 별도 접두사) |
| **새 deploy-wonder-next.sh** | `app/wonder/next/*` | 씀 | ✗ | ✗ | ✗ |
| **새 deploy-wonder-live.sh** (cutover) | `app/wonder/live/*` + 별칭 3키 | ✗ | 씀 | **씀** | ✗ |

**결론: cutover 전에는 교집합이 비어 있다.** 교집합이 생기는 건 별칭 3키 하나뿐이고, 그 시점은 cutover 다 (§5).
CloudFront 무효화도 legacy 는 정확 경로 5개라 `/wonder/next/*` 캐시를 건드리지 않는다.

### 2.2 왜 `app/wonder3/` 나 `app/v3w/` 가 아닌가

v1 `sw.js` 통과 목록 밖이라 v1 워커가 요청을 중개하고, 실패 시 v1 index.html 을 돌려줘 모듈 MIME 오류를 낸다(2026-09-07 실측 기록). 통과 목록에 넣으려면 sw.js 를 바꿔야 하는데 DECISION LOCK 5 가 금지한다.

## 3. CI (설계)

- 새 workflow `deploy-wonder-next.yml`: 트리거 `wonder 3/earthus-v3-wonder/**` 변경 + `workflow_dispatch`. 대상 `app/wonder/next/` 만. 기존 `deploy-v3-kids.yml` 은 손대지 않는다.
- **전제:** `wonder 3/` 는 현재 **git 미추적**이다. CI 가 돌려면 커밋해야 한다(PD 결정 필요: "깃허브에는 v1·v2 만" 규칙과의 관계). 커밋 전까지는 로컬 수동 배포.
- 배포 전 검사(legacy 와 같은 정신): `node --test` PASS, `build-registry.mjs --check` 최신, 원본 PNG·benchmarks/·docs/·scripts/·tests/ 제외(거름망), `navigator.geolocation` 문자열 없음.

## 4. 캐시·서비스워커 (설계)

| 대상 | Cache-Control | 비고 |
|---|---|---|
| `*.html`, 디렉터리 사본 | `public, max-age=60` | legacy 와 동일 |
| `apps/web/**`, `packages/**` (.mjs/.css) | `public, max-age=60` (PHASE 1) → 빌드 id 경로 도입 뒤 `immutable` | 지금은 파일 수 적음 |
| `content/**` (webp/svg/json) | `public, max-age=31536000, immutable` — **파일 이름에 sha256_12 를 붙인 뒤** (레지스트리에 이미 해시가 있다) | 그 전까지 `max-age=60` |
| 900KB 넘는 JSON | gzip 재업로드 `Content-Encoding: gzip` | CloudFront 10MB·binary 미압축 함정(기존 실측) |
| 서비스워커 | **없음.** 새 캐시 네임스페이스도 없음 | v1 워커는 `/wonder/` 하위를 통과시킨다 |

## 5. Cutover 계획 (실행 전 필수 선행, DECISION LOCK 5)

순서: `legacy /wonder(v3-paper)` → `/wonder/next/ 에서 검증` → **선행 조건 전부 PASS** → `deploy-wonder-live.sh` 가 `app/wonder/live/` + 별칭 3키를 씀 → `/v3` 는 legacy 그대로(주소창 직통) → 그 뒤 cleanup 재검토.

선행 조건 (하나라도 FAIL 이면 별칭 3키를 쓰지 않는다):
1. `/wonder/next/` 가 Browser Verified + **Device Verified**
2. **legacy 배포 스크립트 2개의 `/wonder` 별칭 재작성 단계를 비활성화** — 안 하면 다음 legacy 배포가 `/wonder` 를 v3-paper 로 되돌린다. (이 변경은 DECISION LOCK 5 의 "기존 CI/sw.js 변경 금지" 와 별개로 **PD 승인 항목**이다)
3. `deploy-v3-kids.yml` 이 별칭을 건드리지 않음을 확인(현재는 스크립트가 건드린다 → 2 와 같은 승인)
4. `earth-switch.js` 메뉴(`/wonder`)는 바꿀 필요 없음 — 같은 주소가 새 빌드를 가리키게 된다
5. 롤백: 별칭 3키를 legacy index 사본으로 다시 put (legacy 스크립트가 하던 그대로) + 무효화 5경로. `app/wonder/live/` 는 남겨도 무해

## 6. 지금 상태 요약

| | 상태 |
|---|---|
| AWS 변경 | **스테이징만**: 2026-09-13 16:36 `app/wonder/next/**` 296 put(객체 0 → 295 + 키 `app/wonder/next`), 삭제 0, 커밋 `91bf2330`. 보고 `docs/STAGING_DEPLOY_REPORT_2026-09-13.md` |
| deployment collision | `app/wonder/live/` 없음(실측, 전·후). `app/wonder/next/` 는 이제 이 프로젝트의 스테이징 거울 |
| legacy AWS 보호 | `app/v3/`(403객체, 최신 09-07)·별칭 3키(09-07 24,245 B)·CloudFront·CI·sw.js 무변경 |
| 실행 스크립트 | `scripts/build-staging.mjs`(정적 빌드, 허용 목록) + `scripts/deploy-staging.sh`(prefix 고정·가드·`--dry-run`) — §3 의 예정 이름 `aws/deploy-wonder-next.sh` 대신 프로젝트 안 `scripts/` 에 둠(DECISION LOCK 2 §3). `deploy-wonder-live.sh` 는 아직 없음(cutover 는 PD 결정) |
| 스테이징 URL | `https://earthus.net/wonder/next/apps/web/` · 실기기 `…/?qa=1&device=1` (Browser Verified 2026-09-13, Device 0) |
