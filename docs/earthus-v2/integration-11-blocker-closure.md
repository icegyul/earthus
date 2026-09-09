# EARTHUS V2 — INTEGRATION-11 BLOCKER CLOSURE

```text
STATUS:  DELETE COMPLETE — LIVE_FORBIDDEN = 0
PARENT:  8a9ccf5d
DATE:    2026-09-09
```

INTEGRATION-6 부터 여섯 단계를 막아 온 **공개 금지 객체 95건을 실제로 지웠다.**
95/95 을 한 건씩 되읽어 부재를 증명했고, 신선 실사로 0 을 확인했다.

---

## 자격증명

```text
aws sts get-caller-identity → arn:aws:iam::294951922100:root
bucket                        earthus-cache-kr (us-east-2)
get-bucket-versioning       → 출력 없음 = Versioning OFF
```

⚠️ **Versioning OFF 이므로 이 삭제는 영구적이다.** 되돌릴 수 없다.
다만 지운 것은 전부 S3 사본이고 원본은 저장소에 남아 있다
(`prototype/supabase/` · `prototype/space/skybox/…` · 각 문서).

## 무엇을 기준으로 지웠나

**새로 스캔하지 않았다.** INTEGRATION-11 에서 승인·기록된 목록만 썼다.

```text
docs/earthus-v2/integration-11-delete-candidates.json   count 95 · 항목 95 (일치 확인)
```

## 삭제 전 보호 검증 (§3)

```text
승인       95
차단        0
```

| 검사 | 결과 |
|---|---|
| `count == 95` 이고 실제 항목도 95 | ✅ |
| 전 항목 `classification == DELETE_CANDIDATE` | ✅ |
| 전 항목 `safe_to_delete == True` · `replacement_required == False` | ✅ |
| §6 보호 객체 9개가 목록에 있나 | ❌ 없음 (0건 매치) |
| `reports/` 접두사가 목록에 있나 | ❌ 없음 |
| `character-studio/` 접두사가 목록에 있나 | ❌ 없음 |
| EXEMPT_PRODUCT_PATH 4건이 목록에 있나 | ❌ 없음 (별도 차단표에도 넣음) |
| 중복 키 · `..` · `*` · 디렉터리 키 | 0 |
| 삭제 직전 실제 존재 확인 | 95/95 존재 |

### 파노라마는 따로 확인했다

7번 묶음(8.98 MB)이 `app/space/` 아래라 제품 자산일 수 있어 먼저 참조를 뒤졌다.

```text
sky-asset-manifest.js / .v1.json 이 고르는 것:
  panorama-6000.a68eeb037463019f.webp   ← 해시 이름. 삭제 목록에 없음. 지금도 200
  panorama-2048.28125627e27567e3.webp   ← 200
  panorama-4096.87d8f6aa25b1f088.webp   ← 200

삭제한 것: panorama.webp · panorama-6000.webp · source-panorama.webp
  → 코드 어디서도 참조하지 않는 **무해시 옛 사본**
  → 삭제 목록에 해시 파일이 섞였나: 0건
```

## 삭제 방식 (§4)

```text
aws s3api delete-object --bucket earthus-cache-kr --key "<EXACT_KEY>"   × 95
```

접두사 삭제 · 버킷 삭제 · `deploy-app.sh --delete` · 와일드카드 · `--recursive`
**하나도 쓰지 않았다.** 빈 파일 overwrite 우회도 쓰지 않았다.

## 되읽기 (§5) — 명령 성공을 증거로 삼지 않았다

각 키마다 **삭제 → head-object → 익명 HEAD** 세 단계를 돌았다.

```text
DELETE_CANDIDATE       95
DELETE_ATTEMPTED       95
DELETE_SUCCESS         95   (delete-object exit 0 × 95)
DELETE_READBACK_PASS   95
DELETE_READBACK_FAIL    0

head-object 잔존        0
익명 응답 분포          {403: 95}
```

전량 기록: [integration-11-delete-readback.json](integration-11-delete-readback.json)
(키 · size · sha256 · 사유 · exit · stillExists · anonStatus · readbackPass)

## 신선 실사 — 삭제 후

```text
before:      25,522        (INTEGRATION-11 시점)
forbidden:       95
deleted:         95
remaining:        0
```

```text
after 실사   26,104건   (그사이 수집 람다 피드가 늘었다)
  KEEP_PUBLIC              15,066
  KEEP_PRIVATE             11,034
  LEGACY_PUBLIC_FORBIDDEN       0   ← 분류 자체가 사라졌다
  EXEMPT_PRODUCT_PATH           4   ← 운영 제품 경로. 의도적으로 남김
  UNKNOWN                       0
삭제 후보(재산출)              0
```

산출물: [integration-11-live-audit-after.json](integration-11-live-audit-after.json) ·
[integration-11-delete-candidates-after.json](integration-11-delete-candidates-after.json)

## PUBLIC SAFETY (§6)

```text
200  app/index.html · app/v2/index.html · app/v3/index.html
200  app/aetherus/manifest.json
200  app/tourism/seoul-flow.json · app/tourism/health.json
200  app/v2/data/current-earth/snow-ice.meta.json · snow-ice.png
200  app/v3/characters/catalog.json · app/v3/data/trench-bathymetry-audit.json
200  reports/published/index.json
200  reports/published/report/2026-08/v1.json
200  ocean/lab-reports.json · events/… · wind/… · solar/… · celestrak/…
200  app/space/skybox/…/panorama-6000.a68eeb…webp · sky-asset-manifest.v1.json
200  app/js/config.local.js
```

```text
PUBLIC_SAFETY:  PASS   (21/21 · 사라진 정상 파일 0)
```

## PRIVATE BOUNDARY (§7)

```text
403  archive/ · archive/social-drafts.json
403  analysis/aurora-reports.json
403  reports/index.json · reports/draft/x.json · reports/review/x.json
403  reports/published-ish/x.json
403  character-studio/jobs/x.json
403  mystery/unknown-prefix.json
403  서명 없는 PUT
```

```text
PRIVATE_BOUNDARY:  PASS
UNKNOWN_DENY:      PASS
```

코드에서도 유지된다 — `check_public_write` 가 표에 없는 접두사에 **쓰기를 거부한다**:

```text
mystery/x.json                allowed=False  keyVisibility=UNKNOWN
reports/draft/x.json          allowed=False  keyVisibility=UNKNOWN
reports/published-ish/x.json  allowed=False  keyVisibility=UNKNOWN
```

## CHARACTER-STUDIO (§8)

```text
character-studio/  객체 0건 — 이번에도 그대로다
```

검증을 위해 객체를 만들지도, 지우지도 않았다.
그 403 이 **공허한 통과**라는 INTEGRATION-11 의 기록을 그대로 유지한다 —
정책이 그 접두사를 열지 않는다는 것만 보여 줄 뿐, 아직 지키고 있는 것은 없다.

## 다음 배포가 되돌려 놓지 않는가

지웠어도 다음 배포가 다시 올리면 의미가 없다. 확인했다.

```text
공개 빌드 매니페스트 3,598 파일 중 지운 95건: 0건
build/public-app/supabase · build/public-app/v2/supabase: 없음 (거름망이 뺀다)

forbidden_class 표본:
  app/v2/supabase/schema.sql                     → DB 스키마·마이그레이션
  app/v2/supabase/functions/checkout/index.ts    → DB 스키마 트리
  app/README.md                                  → 저장소 안쪽 문서
  app/space/skybox/…/panorama.webp               → 해시 없는 옛 원본
  events/social-drafts.json                      → 승인 전 SNS 초안
  app/js/config.local.example.js                 → 개발자 설정 서식
```

원본은 `prototype/supabase/` 와 `./supabase` 에 그대로 있다 — 지운 것은 S3 사본뿐이다.

## TESTS

```text
TOTAL 505 · PASS 505 · FAIL 0
  report-engine + _shared 320 · distribution 71
  cyclone-analog + lab-events + _shared 69 · npm(mjs) 45
```

---

## 결과

| | INTEGRATION-11 | 지금 |
|---|---|---|
| **LIVE_FORBIDDEN** | ❌ 95 | ✅ **0** |
| UNKNOWN | ✅ 0 | ✅ 0 |
| PUBLIC_SAFETY | ✅ | ✅ |
| PRIVATE_BOUNDARY | ✅ | ✅ |
| **SOURCE = DEPLOY** | ❌ | ❌ **남음** |

```text
블로커 A (공개 금지 객체 95건)  →  CLOSED
블로커 B (SOURCE ≠ DEPLOY)      →  남음
```

블로커 B 는 다른 세션의 `PopMetricMenu` 미커밋이다. 이 세션에서 손대지 않는다.

```text
 M prototype/v2-three/index.html · js/main.js · js/pop-sculpture.js
?? prototype/v2-three/js/pop-metric-menu.js
```

```text
PRODUCTION_BOUNDARY_LOCK:  NOT_CREATED   (SOURCE = DEPLOY 미충족)
PRODUCTION_PUBLISH_READY:  NO            (블로커 1개)
OBJECT_LOCK:               VERIFIED — 설정 없음
```

## OBJECT LOCK — 이번에 확정했다 (INTEGRATION-11 의 NOT_VERIFIED 를 대체)

root 자격증명으로 직접 물었고, **권한 오류가 아니라 "설정이 없다"는 답**이 왔다.

```text
aws s3api get-object-lock-configuration --bucket earthus-cache-kr
→ ObjectLockConfigurationNotFoundError: Object Lock configuration does not exist for this bucket

aws s3api get-bucket-versioning --bucket earthus-cache-kr
→ (출력 없음) = Versioning OFF
```

```text
OBJECT_LOCK:  VERIFIED · 설정 없음
VERSIONING:   VERIFIED · OFF
```

INTEGRATION-11 은 이 둘을 읽을 권한이 없어 `NOT_VERIFIED` 로 남겼다. 이제 확정한다.

**뜻하는 것**: 발행본 불변성에 **버킷 차원 안전망이 없다.** 지금 그것을 지키는 것은
응용 계층 두 겹뿐이다 — 버전이 키 안에 있고(`…/v1.json`), 그 위에 `IfNoneMatch="*"`
조건부 쓰기가 있다(`publisher.py:236`). 실측으로 동작은 확인했다(덮어쓰기 거부 ·
해시·ETag·시각 불변). 다만 **S3 API 를 직접 부르는 다른 경로가 생기면 그 두 겹을
지나지 않는다.** 보존이 계약이라면 versioning + Object Lock 을 켜는 것이 별도 과제다.
