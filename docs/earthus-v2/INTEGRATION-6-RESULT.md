# EARTHUS V2 INTEGRATION-6 RESULT

```text
STATUS:   BLOCKED  (BLOCKED_NO_DELETE_PERMISSION)
PARENT:   3214739c
COMMIT:   이 문서와 같은 커밋
DATE:     2026-09-08
```

---

## LIVE OBJECTS

```text
before:      25,310   (app/ events/ archive/ reports/ wind/ ocean/ clouds/ solar/ celestrak/ analysis/)
forbidden:       95   LEGACY_PUBLIC_FORBIDDEN · 9.8 MB · 익명 200
deleted:          0   ← s3:DeleteObject 권한 없음 (존재하지 않는 키로 확인)
remaining:       95
```

분류(§2):

| | |
|---|---:|
| KEEP_PUBLIC | 14,429 |
| KEEP_PRIVATE | 10,782 |
| **LEGACY_PUBLIC_FORBIDDEN** | **95** |
| EXEMPT_PRODUCT_PATH | 4 |

> INTEGRATION-5 는 99건이라고 했다. 이번 신선 실사에서 그중 4건이
> `app/v3/data/*` 로 **운영 제품 경로**임이 드러나 `EXEMPT_PRODUCT_PATH` 로 옮겼다.
> 일괄 삭제 대상이 아니라 v3 담당이 개별로 판단할 것이다(§2 규칙 그대로).

산출물 — 전부 도구가 만든다. 손으로 적지 않았다:

```text
docs/earthus-v2/integration-6-live-audit.json          실사 (47 KB, 금지·예외 99건 전량 + 접두사 집계)
docs/earthus-v2/integration-6-delete-candidates.json   삭제 후보 95 (키·크기·sha256·근거·안전판정)
docs/earthus-v2/integration-6-cleanup-command.txt      키 지정 삭제 명령 115줄
docs/earthus-v2/integration-6-production-blocker.md    §20 블로커 문서
```

## PRIVATE ACCESS

```text
archive/                        403   비공개 접두사
archive/social-drafts.json      403   새 초안 자리 (INTEGRATION-5 에서 옮김)
analysis/aurora-reports.json    403   ← 이번에 실측하고 표에 PRIVATE 로 넣었다
서명 없는 PUT                    403   직접 우회 불가
```

**§6 에서 고친 것**: `check_public_write` 가 모르는 접두사(UNKNOWN)를 **통과**시키고
있었다. 표에 없는 자리가 곧 허가였다는 뜻이다. 기본값을 뒤집었다 —
공개인지 비공개인지 표가 말해 주지 않으면 **거부**한다.

같이 표를 실측으로 채웠다(2026-09-08 익명):

```text
solar/meta.json                 200 → PUBLIC   (표에 없었다)
celestrak/catalog.json.gz       200 → PUBLIC   (표에 없었다)
analysis/aurora-reports.json    403 → PRIVATE  (표에 없었다)
```

## PUBLIC BOUNDARY

```text
PUBLIC SOURCE   prototype/ → aws/build-public.py (규칙 45줄)
DEPLOY SOURCE   build/public-app/   올림 3,598 · 막음 356
MANIFEST        build/public-manifest.json  ← 공개 트리 **밖**
MANIFEST HASH   c4fe8771bf245f173d9083ffa9c4174d
누출 시험        통과 (거름망 밖 비공개 0)
```

## UPLOADER COUNT

```text
16   전수 (§7 — 확장자로 거르지 않는다)
12   FILTERED   build/public-app 을 원본으로 쓴다
 4   EXEMPT     이유를 코드와 시험에 적었다
```

## EXEMPTIONS

| 업로더 | 이유 |
|---|---|
| `aws/deploy-app.sh` | `build/public-app` 을 직접 원본으로 쓴다 |
| `aws/deploy-orbital-static.sh` | `build/orbital` — 내보내기 산출물. **거름망을 지나지 않는다**(아래 §8) |
| `tools/publish-aetherus-snapshot.sh` | API 호출 결과를 만들어 올린다 |
| `tools/upload_information_release.mjs` | 빌더가 만든 payload 만 올린다. 원본 판정은 `build_information_release.mjs` 가 한다 |

### §8 ORBITAL

`build/orbital` 의 유일한 생산자는
`services/aetherus-orbital/tools/export_static_site.py` 이고, 세 가지만 쓴다:
얼린 API JSON · 거절문 2개 · `services/aetherus-orbital/frontend/` **통째 복사**.

- `services/aetherus-orbital/artifacts/`(evidence `.har` 2.5MB·스크린샷)는 **내보내지 않는다** — 확인함
- 지금 `frontend/` 에는 제품 파일 13개뿐이라 **누출은 없다**
- 다만 그 복사는 `__pycache__` 말고는 아무것도 거르지 않는다.
  거기 파일 하나만 놓이면 그대로 공개된다 — **지금 안전한 것은 우연이지 구조가 아니다**
- 그 스크립트만 `--delete` 를 쓴다(:54). 그 권한이 없어 `set -euo pipefail` 에서 죽는다 —
  **지금은 죽은 코드다.** 리전 기본값도 혼자 `ap-northeast-2` 로 버킷과 다르다

→ 인계 B

## REPORT

`aws/report-engine/integration_e2e.py --period 2026-08` **11단계 전부 OK**

```text
report_id        report:2026-08          팩트 60 · 스토리 21 · 라벨 DATA_PARTIAL
story_id         story:2026-08:sst.tropics
phenomenon_id    ocean.sst
fact_id          fact:2026-08:sst:tropics:mean
event_id         (없음 — 기후 시계열이라 사건이 붙지 않는다. 끊긴 것이 아니다)
visual_asset_id  vis:report_2026-08:earth   verified=true · 조건 6/6
content_id       CNT-2026-000001            status=DRAFT · eligibility=REVIEW_REQUIRED
```

연결이 양방향으로 다 있다:
시각자산의 `factRefs`·`storyId` 가 리포트로 돌아가고, 콘텐츠의
`reportIds`·`storyIds`·`visualAssetIds` 가 셋을 모두 가리킨다.

화면에서도 실제로 눌러 확인했다:

```text
REPORT CENTER   15절 · 스토리 카드 37 · 자료 라벨 4종(자료 충분·일부·부족·평가 불가)
→ PHENOMENON    '선택 자료' 탭
→ INTELLIGENCE  '자료의 근거' 탭
→ SIMULATION    ocean/wavefield · hazards/tsunami 둘 다 '시뮬레이션' 탭 + 실제 내용
```

## FORECAST

**§15 를 마지막 화면까지 닫았다.**

INTEGRATION-2 는 교차리드 순위를 `prototype/js/lab-report-detail.js` 에서 없앴다.
그런데 **같은 표가 하나 더 있었다** — v2 사건 방(`intel-feed.js`).

```text
intel-feed.js:636 (이전)
  .sort((x, y) => (x.headErr ?? 999) - (y.headErr ?? 999))
        └ headErr = 여러 예보시간을 합친 방향오차.
          람다가 그 값에 crossLead:true · rankingBasis:false 를 찍어 보낸다.

같은 파일 :641 설명 (이전)
  "같은 리드타임·같은 표본에서만 비교"      ← 표가 하는 일과 정반대였다
```

고친 뒤:

```text
정렬     기관 이름순 (localeCompare)
열 제목  방향 오차(리드 합산) · 위치 오차(리드 합산)
설명     "아래 오차는 여러 예보시간을 합친 값입니다 — 순위를 매기지 않고 이름순으로 둡니다.
          우열은 같은 예보시간끼리 나눈 뒤에만 말합니다."
```

`prototype/v2-deploy/js/intel-feed.js`(배포 번들)에도 같은 수정을 넣었다 —
두 파일은 vendor 경로 한 줄만 다르다.

공개 스코어카드가 싣는 것: 현상 · 모델 · 변수 · 리드 · 지표 · 표본 · 평가기간.
모델 간 합산 없음. 교차리드 순위 없음.

## MEDIA

```text
CARD              있다 — x · instagram 판 생성 (SNS_PAYLOAD 단계 OK)
VISUAL            있다 — 실제 v2 캡처, verified=true, 되읽기·해시·픽셀검사 6/6
REPORT HIGHLIGHT  있다 — export 가 html · json · md 세 형식
VIDEO             **없다**
```

⚠️ 영상 경로는 이 저장소에 **존재하지 않는다.** 만들지 않았다(§14 새 기능 금지).
없는 것을 있다고 적지 않는다. 인계 D.

`verified=false` 인 자산은 공개 콘텐츠에 들어가지 못한다 — 여덟 조건 중 하나만
어긋나도 `PUBLIC_CONTENT_INVALID` 다.

## APPROVAL

```text
DRAFT             공개 접근 금지    PASS
FACT_CHECK        공개 접근 금지    PASS
REVIEW            공개 접근 금지    PASS
APPROVED          발행 전 금지      PASS  (APPROVED→PUBLISHED 는 금지 전이)
PUBLISHED         공개 허용         PASS
BYPASS TEST       9종 전부 막힘     PASS
```

`approved_by` · `approved_at` · `approval_method` · `approval_revision` 넷 다 필수.
system/cron/bot/pipeline 이름은 낱말 44개 대조로 거부(꼬리 숫자·복수형 포함).
상태 문자열만 `APPROVED` 면 `STATUS_ONLY` — 발행되지 않는다.

## PUBLISH

```text
NOT_PUBLISHED
```

승인된 리포트가 하나도 없다. 없는 승인을 만들어 발행하지 않았다(§0 · §14).
E2E 의 발행 단계는 `PAYLOAD_READY` 두 건으로 멈췄고, 그게 **정상**이다.

## BROWSER

```text
1440 KO   PASS   지구 렌더 · 리포트 15절 · 스토리 37 · 시뮬 버튼 2 · overflow 0
1440 EN   PASS
375  KO   PASS
375  EN   PASS
CONSOLE   0
HORIZONTAL OVERFLOW   0
```

걸러진 빌드(`build/public-app`)로도 따로 확인했다:
`/README.md` `/supabase/schema.sql` `/js/earthus2/v03/qa/*` `/js/config.local.example.js` → **404**,
`/v2-three/js/main.js` `/legal/terms.ko.md` `/space/…/panorama-2048.<hash>.webp` → **200**.

## BUNDLE

```text
SOURCE = DEPLOY:  FAIL
```

원인은 **다른 세션의 미커밋 작업**이다.

```text
prototype/v2-three/js/pop-metric-menu.js   ?? 미추적 — 새 파일
prototype/v2-three/js/main.js               M  PopMetricMenu 호출
prototype/v2-three/index.html               M
prototype/v2-three/js/pop-sculpture.js      M
```

번들을 다시 만들면 그 미완성 작업이 `v2-deploy` 에 박히고 내 커밋에 섞인다.
§0 · §10 이 금지하므로 **다시 만들지 않았다.**

내가 이번에 고친 `intel-feed.js` 는 소스와 번들 **양쪽에 같은 수정**을 넣어
그 파일만은 일치시켰다(재작성 규칙인 vendor 경로 한 줄만 다르다).

## SECURITY

```text
public       app/index.html                      200   PASS
private      archive/                            403   PASS
             archive/social-drafts.json          403   PASS
             analysis/aurora-reports.json        403   PASS
unsigned PUT _integration6-bypass-probe/…        403   PASS

schema       app/v2/supabase/schema.sql          200   FAIL  ← 잔존물
migration    …member_rbac.sql                    200   FAIL  ← 잔존물
draft        events/social-drafts.json           200   FAIL  ← 잔존물
QA           app/js/earthus2/v03/qa/…            200   FAIL  ← 잔존물
internal     app/README.md                       200   FAIL  ← 잔존물
```

공개 업로더가 DRAFT·BLOCKED 를 올리는 경로: **없다**(시험이 막는다).
남은 FAIL 은 전부 과거에 올라간 것이고, 삭제 권한이 생기면 사라진다.

## TESTS

```text
TOTAL   427
PASS    427
FAIL    0

  report-engine + _shared   279   (+10 INTEGRATION-6)
  distribution               71
  cyclone-analog             26
  lab-events                  6
  npm (mjs)                  45
  N1 watch coverage        통과
  공개 빌드 누출 시험       통과
```

## UNRELATED

```text
0
```

다른 세션의 추적 파일에 손대지 않았다. 작업 중 그쪽이 `prototype/v2-three/index.html` ·
`js/main.js` · `js/pop-sculpture.js` · `js/pop-metric-menu.js`(신규) 를 건드리고 있었고,
그 넷은 그대로 두었다.

---

## PRODUCTION_PUBLISH_READY

```text
NO
```

## BLOCKERS

1. **공개 금지 객체 95건이 그대로 있다** (익명 200). `s3:DeleteObject` 권한 없음.
   → [integration-6-production-blocker.md](integration-6-production-blocker.md)
2. `SOURCE = DEPLOY` 불일치 — 다른 세션 작업이 끝나야 번들을 다시 만들 수 있다.
3. `build/orbital` 이 거름망을 지나지 않는다 (지금은 누출 없음, 구조적으로 열려 있음).
4. 영상 생성 경로 없음 — MEDIA E2E 의 VIDEO 칸을 채울 수 없다.

## HANDOFF

[INTEGRATION-6-HANDOFF.md](INTEGRATION-6-HANDOFF.md)
