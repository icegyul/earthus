# EARTHUS V2 — PRODUCTION BOUNDARY LOCK

```text
STATUS:   LOCKED
CREATED:  2026-09-09
UPDATED:  2026-09-09  (인텔리전스를 문맥층으로 — UI 만, 경계는 그대로)
COMMIT:   682d3aa6   (잠금 생성 당시 725d7b1a)
BUCKET:   earthus-cache-kr (us-east-2)
DIST:     E193CZEBLWEB56
```

INTEGRATION-6 부터 열한 단계를 막아 온 블로커 둘이 모두 닫혔다.
이 문서는 **잠긴 경계가 무엇인지**를 적는다. 바꾸려면 이 문서를 먼저 고쳐야 한다.

---

## 1. PUBLIC SOURCE — 공개로 나갈 수 있는 유일한 원본

```text
prototype/            개발 소스
  → aws/build-public.py (DENY_RULES 45 · KEEP_RULES 2 · PUBLIC_BY_DECISION 12)
  → build/public-app/  ← **배포기가 읽는 유일한 트리**
  → S3 app/
```

```text
매니페스트   3,599 파일 · 지문 fcd07d73c5d11531   (잠금 생성 당시 ca85670af54c3608)
```

거름망을 지나지 않은 트리를 올리는 배포기는 없다.
`aws/_shared/public-source.sh` 의 `public_source_root()` · `public_dir()` · `public_file()`
을 12개 배포 스크립트가 쓴다.

## 2. DEPLOY SOURCE — SOURCE = DEPLOY

```text
prototype/v2-three         소스
  → tools/build-v2-bundle.sh
  → prototype/v2-deploy    번들
  → build/public-app/v2-deploy
  → S3 app/v2/
```

**증명**: 빌드를 두 번 돌려 번들 전체 sha256 이 같았다 — 번들은 소스의 함수다.

```text
69afe811d5cbbeb5f5ff35b61fb215c8bc23e94186874f1a02d43a207daeca76
  (잠금 생성 당시 1c2be8c503700ac551bab8abe8a1eb78ffa1e539d5ed70f6bab7d81c3adca820)
```

배포기 자체도 바이트 대조를 한다(`deploy-v2-three.sh` 3/5 단계 · 5/5 단계).
손으로 파일을 옮겨 맞추지 않는다.

## 3. ALLOWED PUBLIC PATHS

버킷 정책이 익명에게 여는 접두사는 **여덟 개뿐**이다(2026-09-08 실측 · 두 Sid 동일).

```text
app/          celestrak/    clouds/      wind/
events/       ocean/        solar/       reports/published/
```

`app/` 에 쓸 수 있는 자리는 `aws/_shared/write_policy.py` 의 `APP_WRITERS` 에
사유와 함께 하나하나 적혀 있다. 목록 밖이면 **거부**다.

## 4. FORBIDDEN PATHS

```text
LIVE_FORBIDDEN = 0
```

95건을 2026-09-09 에 키 지정으로 삭제하고 95/95 되읽기로 부재를 증명했다.
신선 실사에서 `LEGACY_PUBLIC_FORBIDDEN` 분류 자체가 사라졌다.

```text
26,104건  KEEP_PUBLIC 15,066 · KEEP_PRIVATE 11,034 · EXEMPT_PRODUCT_PATH 4 · UNKNOWN 0
```

거름망이 앞으로도 막는 부류(`forbidden_class`):
DB 스키마·마이그레이션 · DB 스키마 트리 · 저장소 안쪽 문서 · 해시 없는 옛 원본 ·
승인 전 SNS 초안 · 개발자 설정 서식 · QA 하네스 · 개발 서버 · 카나리 산출물.

**배포 후 전수 재확인**: 95건 중 되살아난 것 0.

## 5. REPORT PUBLIC POLICY

```text
reports/published/…   ← 정책이 여는 유일한 reports 자리
reports/…  그 밖      ← 부여 없음(403) · 표에도 없어 **쓰기 자체가 거부**
```

`reports/*` 를 통째로 열지 않았다. 쓰는 쪽 검사가 깨져도 초안이 공개 자리로 갈 수 없다.

```text
200  reports/published/index.json
200  reports/published/report/2026-08/v1.json
403  reports/index.json · reports/draft/ · reports/review/ · reports/published-ish/
```

## 6. SOCIAL PUBLIC POLICY

```text
자동 게시 없음이 설계다 (aws/distribution)
초안·후보는 archive/ (비공개) · MOCK 발행은 PUBLISHED 로 세지 않는다
events/social-drafts.json  ← 옛 공개 초안. 2026-09-09 삭제 완료
```

## 7. APPROVAL POLICY

```text
검증 → 사람 승인 → 올리기 → 익명 되받기 → PUBLISHED
```

| | |
|---|---|
| 상태 판정 | **허용 목록**(`VALIDATED_STATES`). 표에 없으면 DRAFT — 거부 목록으로 바꾸지 말 것 |
| 승인 항목 | 누가·언제·어떻게·무엇을(`approvalRevision`) 네 가지 전부 |
| 승인 방법 | `UI_CLICK` · `CLI_CONFIRM` · `SIGNED_TOKEN` 만 |
| 시스템 계정 | 영문 44 · **한국어 19** 낱말로 차단 (사람 이름 오탐 0) |
| 승인 뒤 변조 | 내용 → `APPROVAL_INVALID` · 상태 → `APPROVAL_STATE_MOVED` |
| 발행 도장 | `publishedAt`·`immutableRef` 는 **올리는 쪽만** 찍는다 (put 직전) |
| 발행본 | 버전이 키 안 + `IfNoneMatch="*"` — 덮어쓰기 경로가 없다 |

## 8. VISUAL VERIFICATION POLICY

```text
여덟 조건을 전부 넘어야 공개 콘텐츠에 들어간다 — 하나라도 어긋나면 PUBLIC_CONTENT_INVALID
자산 식별 · verified 표식 · 검증 조건 전부 참 · sha256 지문
디스크 되읽기 해시 일치 + 그림 디코딩 · 빈 화면 아님(픽셀 분산) ·
우리 런타임 주소에서 나옴 · 요청한 레이어가 실제로 켜져 있었음
```

## 9. FORECAST POLICY

```text
리드 6h·12h·24h·48h·72h·120h  각각 독립 (집계 키 = 모델 × 변수 × 리드)
교차리드 순위 0 · 교차모델 집계 0
값 없음 → None (0 이 아니다) · bool → 숫자 거부
NOT_EVALUABLE 은 사유와 함께 보존 · 표본 수 n · nByMetric
```

## 10. PRIVATE STORAGE POLICY

```text
archive/  analysis/  character-studio/     ← PRIVATE_PREFIXES
표에 없는 접두사                            ← UNKNOWN → 쓰기 거부 (fail closed)
```

```text
403  archive/ (실객체 11,009) · analysis/ (9) · character-studio/ (0건 — 공허한 통과)
403  서명 없는 PUT
```

## 11. WRITE PATH POLICY

**문자열을 찾지 않는다. 값을 따라간다.**

```text
쓰기 지점 264 (aws · tools · services · .py .mjs .js .sh) · 거부 0
아홉 가지 키 모양이 영구 회귀 시험으로 고정 —
  리터럴 · 모듈 상수 · 감싸개 · 환경변수 · 함수 반환 ·
  **args 사전 전개 · for 루프 · JS 템플릿 · 셸 이어붙인 줄
UNKNOWN 목적지 → DENY
읽기 전용 람다 4종 → app/ 키 0건 (오탐 없음)
```

새 공개 writer 를 넣으면 미증명 건수를 못 박는 시험이 깨진다.

## 12. CLEANUP STATUS

```text
DELETE_CANDIDATE       95
DELETE_ATTEMPTED       95
DELETE_SUCCESS         95
DELETE_READBACK_PASS   95
DELETE_READBACK_FAIL    0
```

기록: [integration-11-delete-readback.json](integration-11-delete-readback.json) ·
[integration-11-blocker-closure.md](integration-11-blocker-closure.md)

## 13. RETENTION — 안전망이 없다는 사실을 적어 둔다

```text
VERSIONING:   OFF          (확인함)
OBJECT LOCK:  설정 없음     (ObjectLockConfigurationNotFoundError — 권한 오류 아님)
```

발행본 불변성을 지키는 것은 **응용 계층 두 겹뿐**이다(키 안의 버전 +
`IfNoneMatch="*"`). 버킷 차원 보존은 없다. S3 API 를 직접 부르는 경로가 새로
생기면 그 두 겹을 지나지 않는다. 삭제도 되돌릴 수 없다.

## 14. BUNDLE HASH

```text
v2 번들 (prototype/v2-deploy)   be10b9a44ae07e4e5b47cca01e1954f11f9ccea965a47c934808ab2e95d5945d
공개 빌드 매니페스트            6b54bdab7baf05b1  (3,599 파일)
커밋                            682d3aa6
CloudFront 무효화               IAR84FF9AXACOVCIUT7JHILGAW
```

### 2026-09-09 갱신 — 인텔리전스 진입점 통합

UI 만 바뀌었다. 이 문서가 잠근 것 중 **바뀐 항목은 없다.**

```text
바뀐 것   prototype/v2-three/index.html · js/ui-shell.js  (진입점·겹침·가시성)
          tools/ QA 하네스 7 (없앤 선택자를 새 진입점으로)
안 바뀐 것 계산 · 자료 provider · Supabase · API · report-engine · 보고서 스키마
          시뮬레이션 · 예보 로직 · 인증 · 저장 정책 · S3 정책 · 배포 구조 · DB 스키마
```

```text
지운 95건 되살아남   0   (익명 응답 {403: 95} · head-object 잔존 0)
공개 정상 파일        9/9  200
비공개 경계           7/7  403
시험                538/538   (npm 묶음 45 → 78: IA 가드 33개를 물렸다)
```

### 2026-09-09 (2차) — 시험 회계를 정정한다

`tools/test_v2_ui_information_architecture.mjs` 는 **어떤 시험 묶음에도 물려 있지 않았다.**
그래서 직전 갱신의 `505/505` 는 내가 돌린 네 묶음에 대해서는 참이지만
이 파일을 세지 않았다. 그 사이 내 변경이 그 파일의 2건을 깼다.

```text
ffc0725e   32 중 31 통과       (1건은 그 전부터 실패 — 낡은 기대)
ba4be7ad   32 중 29 통과       ← 2건이 내 탓
682d3aa6   33 중 33 통과       (package.json test 에 물렸다)
```

이 파일의 절 제목이 **'불변식 1 — Intelligence 는 최상위 기능 메뉴가 아니다'** 다.
가드는 있었는데 돌지 않았다. 이제 `npm test` 가 돌린다.

---

## VERIFICATION DATE

```text
2026-09-09
```

| 조건 | 결과 |
|---|---|
| LIVE_FORBIDDEN = 0 | ✅ 95/95 삭제·되읽기 · 배포 후 되살아남 0 |
| UNKNOWN = 0 · UNKNOWN_PUBLIC_WRITE = 0 | ✅ |
| PUBLIC_LEAK = 0 | ✅ 매니페스트 3,599 중 금지 0 |
| PRIVATE_DIRECT_ACCESS = 0 | ✅ 403 · 서명 없는 PUT 403 |
| REPORT_PUBLIC_READ = PASS | ✅ 200 |
| REPORT_READBACK = PASS | ✅ 5항목 |
| APPROVAL = PASS · AUTO_APPROVAL = 0 | ✅ |
| UNVERIFIED_VISUAL_PUBLIC = 0 | ✅ |
| CROSS_LEAD_RANKING = 0 · NO_DATA_SCORE = 0 | ✅ |
| REPORT_E2E = PASS · MEDIA_E2E = PASS | ✅ (VIDEO 는 DEFERRED) |
| **SOURCE = DEPLOY** | ✅ 멱등 sha256 일치 + 배포기 바이트 대조 |
| **LIVE report-center.js = 200** | ✅ (직전까지 403) |
| **published report live display** | ✅ earthus.net 에서 17절 렌더 |
| BROWSER 4/4 | ✅ 1440 KO·EN · 375 KO·EN (라이브) |
| CONSOLE | ✅ **우리 origin 0** |
| OVERFLOW = 0 | ✅ |
| TESTS | ✅ 505/505 |
| UNRELATED = 0 | ✅ 지시된 범위만 |

### CONSOLE 을 정확히 적는다

우리 origin(earthus.net · earthus-cache-kr)에서 나는 오류는 **0** 이다.
서드파티는 그렇지 않고, 그것은 이 잠금이 통제하는 범위 밖이다:

```text
s3.amazonaws.com/elevation-tiles-prod   지형 타일. 간헐 403/404 (요청 제한).
                                        같은 타일을 다시 받으면 200 — 일시적이다.
api.worldbank.org                       국가 인구 총계. CORS 헤더가 없어 브라우저에서 실패.
                                        live-layers.js 의 기존 코드이고 이번 변경과 무관하다
                                        (HEAD 번들에서도 동일 재현). 실패하면 catch 로
                                        UNAVAILABLE — 값을 지어내지 않는다.
```

---

## 이 잠금을 깨는 방법 (알아 두어야 할 것)

1. `build/public-app` 을 거치지 않고 올리는 배포기를 새로 만드는 것
2. `write_policy.APP_WRITERS` 에 사유 없이 항목을 더하는 것
3. `_derive_state` 를 허용 목록에서 거부 목록으로 되돌리는 것
4. `run_publication_pipeline` 에서 다시 `publishedAt` 을 찍는 것
5. `next_version()` 에서 승인 기록을 그대로 들고 가는 것 (지금은 해시가 막는다)
6. 버킷 정책에 접두사를 더하는 것 — `PUBLIC_PREFIXES` 와 `BUCKET_PUBLIC_PREFIXES`
   가 어긋나면 `PUBLIC_PREFIX_GAP` 시험이 깨진다

여섯 가지 모두 시험이 잡는다. 시험을 지우면 잠금도 없다.
