# EARTHUS V2 INTEGRATION-3 RESULT

```text
STATUS:  PARTIAL — PRODUCTION PUBLISH READY 를 선언하지 않는다
PARENT:  a73ceeee
DATE:    2026-09-08
```

---

## 왜 READY 가 아닌가

거버넌스 쪽 문은 전부 닫았다. 그런데 **이미 공개돼 있는 것**은 문을 닫는다고
사라지지 않는다. 실측으로 두 가지가 지금 열려 있다:

```text
events/social-drafts.json                              200   사람 승인 전 SNS 문구
app/supabase/schema.sql (+ postgres DDL 4건)           200   DB 테이블·RLS·RPC 이름
```

앞의 것은 배포가 올린 것이 아니라 람다가 **직접 쓴다** — 거름망 밖이다.
뒤의 것은 옛 배포가 남긴 것이고, `earthus-deploy` 에 `s3:DeleteObject` 가 없어
지울 수 없다. 둘 다 [인계 D · E](INTEGRATION-3-HANDOFF.md) 다.

내려가기 전에는 준비됐다고 말하지 않는다.

---

## §0 · §1 공개 빌드 격리

**바뀐 것: 배포가 작업 트리를 더 이상 원본으로 쓰지 않는다.**

```text
전  prototype/ ──(aws s3 sync + --exclude 10줄)──▶ app/
후  prototype/ ──(aws/build-public.py 거름망)──▶ build/public-app/ ──(sync, --exclude 0줄)──▶ app/
```

`--exclude` 는 *아는* 구멍만 막는다. 실제로 계속 샜다:

| 새던 것 | 왜 안 막혔나 |
|---|---|
| `v2-deploy/engine-v11/postgres/*.sql` 외 DDL 3건 | `supabase/*` 만 제외했다 |
| `README.md` · `NEXT_STEPS.md` · `js/ext/CONTRACT.md` 등 26건 | `legal/README.md` 하나만 제외했다 |
| `v3-paper/tools/` 157건 · `handoff/` 27건 · 원본 PNG 53건 | `deploy-v3-paper.sh` 는 조심스럽게 뺐는데 `deploy-app.sh` 가 통째로 다시 올렸다 |
| `v3-kids/character-studio.*` | 인증이 아예 없는 저작 도구 |
| `canary/` 4건 | 규칙이 없었다 |

```text
올린다 3,615 · 뺀다 338 · 규칙 34줄 · 지문 e205d4f46018912d
```

### 누출 시험 (`PUBLIC_BUILD_LEAK_TEST`)

거름망을 **베끼지 않는다.** 규칙표와 독립적으로 판정하고, 걸리면 빌드가 멈춘다.

1. 확장자 — `.pem .key .sql .env` 등이 남아 있나
2. 이름 — 자료 파일 이름이 비밀을 가리키나
3. 내용 — 개인키 블록 · `AKIA…` · service_role 키 · Slack/GitHub 토큰
4. 승인 전 산출물 — 판정은 `publication_privacy` 한 곳에서만 한다
5. **git 교차 확인** — `git check-ignore` 로 "git 이 일부러 뺀 파일이 공개로 나가나"

5번이 `js/config.local.js` 를 잡았다. `.gitignore` 가 *절대 커밋 금지*로 적어 둔
파일인데 배포는 그대로 올리고 있었다. 그건 앱이 로그인·결제에 실제로 쓰는 파일이라
빼면 제품이 깨진다 — 그래서 지우지 않고 `PUBLIC_BY_DECISION` 에 **이유를 적어**
통과시킨다. 적혀 있지 않으면 빌드가 멈춘다. 조용한 통과가 없다.

> 검사기를 한 번 좁혔다. `js/earthus2/v07/backend/secret-vault-adapter.js` 를
> 유출로 잡았는데, 그 파일은 비밀을 담은 게 아니라 *"비밀은 값이 아니라 참조로 들고
> 다녀라"* 를 강제하는 코드다. 이름 검사는 자료 파일에만 걸도록 바꿨다 —
> 소스는 값(SECRET_PATTERNS)으로 판정한다.

## §2 사람 승인 게이트

`aws/_shared/governance.py` 한 곳에서 판정한다. **리포트와 SNS 가 같은 문을 지난다.**

| 요구 | 어떻게 |
|---|---|
| `approved_by` | 시스템 계정 패턴 6종으로 막는다 — `system` · `*-bot` · `lambda` · `svc-*` · `cron` · `anonymous` · 빈 값 |
| `approved_at` | 없으면 승인이 아니다 |
| `approval_method` | `UI_CLICK` · `CLI_CONFIRM` · `SIGNED_TOKEN` — 전부 사람이 그 자리에 있어야 하는 방법 |
| `approval_revision` | 승인한 판본의 sha256 |

**가장 중요한 한 줄**: 상태 문자열만 `APPROVED` 인 콘텐츠는 이제 `STATUS_ONLY` 다.

```text
distribution/cli.py:243   for step in ("FACT_CHECK","REVIEW","APPROVED"): transition(...)
                          → 사람이 아무것도 안 봤는데 승인 상태가 된다
                          → social_publish 가 STATUS_ONLY 로 읽고 발행을 거부한다
```

cli.py 는 다른 세션 소유라 고치지 않았다([인계 A](INTEGRATION-3-HANDOFF.md)).
대신 **발행 쪽 문을 닫았다** — 상태를 찍어도 나가지 않는다.

## §3 승인 판본 잠금

승인 뒤 내용이 한 글자라도 바뀌면 `APPROVAL_INVALID` 다.

```text
승인 b4edfba886c6… ≠ 현재 da76ae202b4a…
```

지문에서 빼는 것은 승인·발행 기록과 상태·시각뿐이다(`UNSIGNED_FIELDS`).
그것까지 넣으면 승인을 적는 순간 방금 한 승인이 스스로 깨진다.
제목·수치·스토리·팩트·판 번호는 전부 지문에 들어간다.

## §4 직접 우회 — 실측

```text
PUT  _integration3-bypass-probe/anyone-can-write.txt   403   ✅ 막혀 있다
GET  app/index.html                                    200   ✅ 앱은 열린다
GET  archive/                                          403   ✅
GET  events/distribution-content.json                  403   ✅
GET  events/social-drafts.json                         200   ❌ 열려 있다
GET  app/supabase/schema.sql                           200   ❌
GET  app/README.md                                     200   ❌
GET  app/v2-deploy/.../v11_advanced_intelligence.sql   200   ❌
```

`aws/verify-public-access.py` 가 이 셋을 **구분한다**: 막혔다(CLOSED) ·
열려 있다(OPEN) · 확인 못 했다(UNKNOWN). **UNKNOWN 은 실패다** —
"자격증명이 없어서 못 했다"가 통과로 세어지지 않는다.

거름망이 막는 338경로를 전부 두드려 본 결과, **17건이 이미 공개**다(인계 D).

E2E 도 같은 이유로 고쳤다. `integration_e2e.py` 는 발행 단계를
`step("PUBLISH", True, …)` 로 못박고 있었다 — 자격증명이 하나도 없는 환경에서도
PASS 를 찍는다. 이제 통과 조건이 명시돼 있다: 올라갔다는 것은 되읽기를 통과했어야 하고,
안 올라간 것은 막힌 이유가 설명돼야 한다.

## §5 발행 상태 기계

```text
DRAFT → READY_FOR_REVIEW → APPROVED → PUBLISHING → PUBLISHED → ARCHIVED
```

상태 8종 · 허용 15길 · **금지 49길**. 금지에는 전부 사유가 붙는다.
"허용 표에 없다"만으로는 다음 사람이 표를 고쳐 버린다.

```text
DRAFT → PUBLISHED             사람 승인을 통째로 건너뛴다
READY_FOR_REVIEW → PUBLISHED  기계가 통과시킨 것과 사람이 승인한 것은 다르다
APPROVED → PUBLISHED          되읽기 확인이 빠진다
PUBLISHED → PUBLISHED         발행본은 덮어쓰지 않는다. 판을 올린다
ARCHIVED → PUBLISHED          물러난 판을 다시 세우지 않는다
```

## §8 시각자산 보안

여덟 조건. 하나라도 어긋나면 `PUBLIC_CONTENT_INVALID` 다.

```text
1 assetId          2 verified 표식      3 캡처 여섯 조건 **빠짐없이**
4 fileHash sha256  5 파일 되읽기 일치   6 픽셀 검사 통과
7 우리 런타임 주소 8 요청한 레이어가 실제로 켜져 있었다
```

두 군데가 처음에 틀렸고, 둘 다 **감사가 잡았다**:

- 3번을 `verifyConditions` 안의 값이 전부 참이면 통과로 검사했다.
  `{"아무거나": true}` 하나로 "여섯 조건 통과"가 된다.
  → 이름 목록을 `governance.CAPTURE_VERIFY_CONDITIONS` 정본으로 두고 키 집합을 대조한다.
- 7번을 주소 문자열에 `earthus` 가 들어 있는지로 검사했다.
  `https://example.com/x?ref=earthus` 가 통과한다.
  → 호스트와 경로를 갈라서 본다.

그리고 더 나쁜 것 하나 — **항목 이름을 지어냈다.**
`readBack.ok` · 맨헥스 `fileHash` 로 썼는데 실제 산출물은
`readBack.hashMatches` · `sha256:<hex>` 다. 그대로 뒀으면 **실제로 확인된 유일한
자산이 막혔을 것이고**, 픽스처만 보는 시험은 그 사실을 잡지 못했다.
이제 디스크의 진짜 캡처 산출물을 직접 통과시켜 보는 시험이 있다.

## §11 탭 경쟁 — setTimeout 제거

```text
지운 것   if (target !== 'now') { setTimeout(reassert, 400); setTimeout(reassert, 1200); }
```

대신 **마지막 사용자 의도가 이긴다**:

```text
showTab(t, 'intent')   사용자가 고른 것 — 탭 단추 · 메뉴 행 · 보고서 행동 · 지구 클릭
showTab(t, 'follow')   자료가 도착해 카드를 갈아 끼우는 것 — 의도와 다르면 무시
```

`onLayerAction` 의 첫 카드만 의도를 세우고, 그 뒤 비동기 갱신은 전부 `follow` 다.
타이머가 없으니 느린 기기에서도 결과가 같다.

실측(모든 표본이 안정, `MutationObserver` 로 탭 전이를 기록):

| 한 일 | 200ms | 1.4s | 3s | 5s | 7s |
|---|---|---|---|---|---|
| 보고서 → 시뮬레이션(`ocean.wave`) | scenario | scenario | scenario | scenario | scenario |
| 보고서 → 분석(`ocean.wave`) | why | why | why | why | why |
| 자료 여는 중 사용자가 '사건'을 누름 | feed | feed | feed | feed | feed(10s 까지) |

마지막 줄이 새로 생긴 성질이다. 예전에는 자료가 도착하면서 사용자를 '선택 자료'로
끌고 갔다 — 이제 사용자가 이긴다.

## §12 시뮬레이션 클릭 — 실제로 눌렀다

레지스트리의 시뮬레이션 능력은 정확히 2개다(`ocean.wave` · `hazards.tsunami`).
**어느 보고서에도 그 현상을 가리키는 이야기가 없어서** 지금까지 눌러 본 적이 없었다.

`tools/make-report-sim-fixture.py` 가 실제 2026-08 보고서 위에 그 두 현상을 가리키는
이야기를 얹는다(숫자는 넣지 않는다 — 연결만 바꾼다). 산출물은 `_verify/` 아래에 두고,
공개 빌드 거름망이 그 경로를 막는다.

| 현상 | 복합키 | 버튼 | 클릭 결과 | 내용 |
|---|---|---|---|---|
| `ocean.wave` | `ocean/wavefield` | 조건을 바꿔보기 | **scenario** (7s 안정) | 파랑 물리 기준 카드 |
| `hazards.tsunami` | `hazards/tsunami` | 조건을 바꿔보기 | **scenario** (4.4s 안정) | 쓰나미 도달시간 계산 |

능력이 없는 현상에는 버튼이 그려지지 않는다 — 20개 실제 이야기 중 0개.

## §13 브라우저

| | 리포트 열림 | 시뮬 버튼 2종 | 클릭 → scenario | 가로 스크롤 | 요소 넘침 |
|---|---|---|---|---|---|
| 1440×900 KO | ✅ | ✅ | ✅ | 0 | 0 |
| 1440×900 EN | ✅ | ✅ | — | 0 | 0 |
| 375×812 EN | ✅ | ✅ | ✅ | 0 | 0 |
| **375×812 KO** | ✅ | ✅ | ✅ | 0 | 0 |

375 KO 는 INTEGRATION-2 가 건너뛴 칸이다. 콘솔 오류 0 · 동일 출처 요청 전부 200.

## §15 거버넌스 E2E

`aws/report-engine/tests/test_integration3_governance.py` — `TEST-REPORT-001` 하나를
끝까지 걸어 보고, **길을 벗어나려는 시도**를 아홉 가지 막는다.

```text
정상   리포트  VALIDATING → 사람 승인 → 발행 → 되읽기 해시 일치
       콘텐츠  PAYLOAD_READY → 사람 승인 → 발행 → 되읽기 id·상태 일치

부정 1 시스템 계정 8종 승인 시도          → 전부 GovernanceError
     2 승인 없이 발행                     → NOT_APPROVED · 디스크에 아무것도 안 씀
     3 상태만 APPROVED                    → STATUS_ONLY · publishedAt 없음
     4 승인 뒤 팩트 값 변조               → APPROVAL_INVALID · 발행 거부
     5 금지 전이 7종                      → FORBIDDEN_TRANSITION
     6 되읽기 깨진 시각자산               → PUBLIC_CONTENT_INVALID · 리포트도 막힘
     7 같은 판을 두 번 발행               → alreadyPreserved · 디스크 원본 그대로
     8 자격증명 없음                      → BLOCKED_NO_CREDENTIALS · 발행으로 안 셈
     9 DRAFT·FACT_CHECK·REVIEW·REJECTED   → 공개 키 쓰기 거부
```

## TESTS

```text
report-engine + _shared   226   (+15 거버넌스 E2E · 그 밖은 강화된 픽스처)
distribution               71
cyclone-analog             26
lab-events                  6
────────────────────────────────
합계                      329
npm test (mjs)             45   pass 45 · fail 0
공개 빌드 누출 시험        통과 (거름망 밖 비공개 0)
번들                       소스 = 배포 (경로 재작성 규칙 외 차이 없음)
```

## UNRELATED

0. 다른 세션의 추적 파일에 손대지 않았다.
작업 중 다른 세션이 `prototype/js/gridoverlay.js` · `readability.js` 를 새로 고쳤고,
그 둘은 건드리지 않았다.

## KNOWN LIMITATIONS

- **이미 공개된 17건을 내리지 못했다.** 삭제 권한이 없다(인계 D).
- **`events/social-drafts.json` 이 공개다.** 람다가 직접 쓰는 키라 거름망 밖이다(인계 E).
- `distribution/cli.py` 는 여전히 승인 상태를 자동으로 찍는다. 발행은 막히지만
  화면에는 "승인됨"으로 보인다(인계 A).
- 시각자산 값 판정이 `governance` 와 `capture` 두 곳에 있다. 이름 목록만 정본을
  모았고 값 판정은 아직 두 벌이다(인계 H).
- `sections.py` 와 `compose.py` 가 서로 다른 절 어휘를 쓴다(인계 C).
- `lab-events` 의 여진·화산재·대기질·표류가 아직 리드를 합친 평균을 쓴다(인계 B).
- 파이썬 시험 329건이 여전히 `npm test` 와 CI 에 연결돼 있지 않다.
- SNS 영상 경로 없음. 데이터 차트·지도 이미지 없음(지구 캡처만).

## NEXT

인계 D · E 를 닫는다 → 그 뒤에 PRODUCTION PUBLISH READY 를 다시 판정한다.
