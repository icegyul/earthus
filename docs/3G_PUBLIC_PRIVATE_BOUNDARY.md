# 3G 공개·비공개 경계 — B2 구현안

작성 2026-09-13 · DESIGN ONLY · 코드 0줄 · AWS 쓰기 0건
정책 정본 → `docs/3G_POLICY_DECISIONS.md` §2

---

## 1. 결정 ② (확정)

- canonical EarthEvent 은 반드시 **PRIVATE / SHADOW** 로 저장한다
- canonical 저장 위치 = **`archive/earth-events/…`**. `events/` 는 정본 저장소가 **아니다**
- `events/` 에는 **public eligibility 를 통과한 sanitized public projection 만** 허용
- `SHADOW` · `REVIEW_REQUIRED` · `BLOCKED` · `UNKNOWN` 인 Event 는 `events/` 에 **절대 쓰지 않는다**
- `check_public_write` 는 canonical EarthEvent 를 직접 공개시키는 용도가 아니다 —
  필요하면 **public projection 전용 게이트를 별도로** 만든다
- **자동 게시 없음**

---

## 2. 왜 `check_public_write` 로는 안 되는가 — 실측

`aws/_shared/publication_privacy.py` 의 경로를 따라가면 이렇게 된다.

```
check_public_write(key, artifact, kind="content")            :137
  → prefix_visibility(key)                                    events/ → PUBLIC
  → content_visibility(artifact)                              :100
      eligibility / safetyLevel / blockReasons 를 보고
      status 가 CONTENT_PUBLIC(:26) / CONTENT_PUBLIC_PREVIEW(:27) / CONTENT_PRIVATE(:28)
      중 어디에도 없으면 마지막 줄로 떨어진다               :122
  → allowed = not (keyVisibility=="PUBLIC" and visibility=="PRIVATE")   :165
```

EarthEvent 에는 콘텐츠 상태(`DRAFT`/`PUBLISHED` 등)가 없다. 실측:

```
check_public_write('events/earth-events.json', {eventId, truthStatus, releaseState, kind})
→ allowed=False · visibility=PRIVATE · reason "…비공개 산출물: 알 수 없는 상태: None"
```

즉 **정본을 `events/` 에 쓰려 하면 경계 검사가 거부한다.** 두 가지 해결이 가능했고
결정 ② 는 뒤쪽을 택했다:

| 안 | 내용 | 결정 |
|---|---|---|
| 산출물에 콘텐츠 상태 칸을 붙여 검사를 통과시킨다 | EarthEvent 를 콘텐츠인 척하게 만든다 | **택하지 않았다** |
| canonical 을 비공개 접두사로 옮긴다 | 접두사가 PRIVATE 이므로 `allowed` 가 참이 된다 | **택했다** |

앞쪽은 검사를 통과시키기 위해 자료 모양을 바꾸는 것이다. 그런 변경은 검사를 무의미하게 만든다.

---

## 3. B2 구현안 — 경계 설계

### 3.1 하나만 남기는 것: 접두사 표
`publication_privacy.py` 의 `PUBLIC_PREFIXES`(`:52`) · `PRIVATE_PREFIXES`(`:57`) 는
**경계의 유일한 정본**이다. 3G 는 이 표를 복사하지도 분기하지도 않는다.
`archive/` 가 `PRIVATE_PREFIXES` 에 있음을 확인했다. 새 접두사를 만들지 않는다 —
`check_public_write` 는 표에 없는 접두사를 거부한다(`:145-155` "모르는 자리에는 쓰지 않는다").

### 3.2 두 개의 쓰기, 두 개의 검사

```
canonical 쓰기      archive/earth-events/…
  → prefix_visibility 가 PRIVATE 임을 확인하는 단정문만 둔다.
    콘텐츠 가시성 판정을 부르지 않는다 — EarthEvent 는 콘텐츠가 아니다.
    통과 조건: 접두사가 PRIVATE. 그 외 아무것도 요구하지 않는다.

projection 쓰기     events/…
  → 전용 게이트가 판정한다. 그 게이트가 하는 일:
      ⑴ 접두사가 PUBLIC 인지 (publication_privacy 에 묻는다)
      ⑵ 이 사건이 공개 자격을 통과했는지 (허용 목록)
      ⑶ 내보낼 필드가 허용 목록 안인지 (sanitize)
    셋 중 하나라도 아니면 던진다.
```

### 3.3 허용 목록은 차단 목록이 아니다
distribution 이 이번 세션에 같은 실수를 실측으로 겪었다. 차단 목록이 하나뿐이라
`REVIEW_REQUIRED` 가 공개로 나갔다(9/13 후보 8건 중 7건). 고친 방식이
`aws/distribution/handler.py` 의 `PUBLIC_ELIGIBILITY = ("ELIGIBLE",)` **허용 목록**이다.
3G 의 projection 게이트도 허용 목록으로 만든다 — **통과가 적혀 있어야 통과다.**

결정 ② 가 금지한 넷(`SHADOW` · `REVIEW_REQUIRED` · `BLOCKED` · `UNKNOWN`)은
차단 목록에 적어서 막는 것이 아니라, **허용 목록에 없어서** 막힌다.

### 3.4 승격 사다리는 이미 있다 — 새로 만들지 않는다
```
release_state (SQL 도메인 :116-120)   SHADOW → CANARY → ACTIVE
publicReleaseAllowed(state)            ACTIVE · CANARY 만 true
   prototype/js/earthus2/v11/core/contracts.js:18
```
`earthus_earth_event.release_state` 는 `not null default 'SHADOW'`(`:175`)다 —
**만들어지는 모든 행이 기본 비공개**다. 3G 는 이 기본값을 바꾸지 않는다.
승격(SHADOW → CANARY/ACTIVE)은 3G 가 하지 않는다. 자동 게시 없음이 그 뜻이다.

→ 따라서 이번 구현에서 projection 게이트를 통과하는 사건은 **0건이 정상**이다.
빈 projection 이 고장이 아니다. 승격 절차가 생기면 그때 통과가 생긴다.
distribution 의 `publicItems` 가 지금 0건인 것과 같은 구조다.

### 3.5 sanitize — 무엇이 공개 쪽으로 넘어가는가
필드 단위 허용 목록이 필요하다. 이미 잠긴 계약 하나가 그 방향을 정해 놓았다:
`docs/EARTH_EVENT_CANONICAL_MODEL.md` §8 "기사 본문 미저장 — `content` 칸 미도입"
(`aws/regional-news/handler.py` 머리말이 근거). 즉 기사 본문은 canonical 에도 없고
projection 에도 없다.

⚠️ **필드 허용 목록 자체는 미결정이다.** 이 문서는 그 목록을 채우지 않는다.
정해야 하는 축은 셋이다 — ⑴ 사건 식별(무엇을 노출하면 재식별이 되는가)
⑵ 출처 귀속(라이선스가 요구하는 최소 표기) ⑶ 판정 노출(진실 등급을 공개할 것인가).
⑵ 는 `events/global.json` 의 `license` · `termsUrl` 이 이미 요구를 적고 있다.

---

## 4. canonical 키 배치 — 주소 충돌 주의

`docs/EARTHUS_STORAGE_ARCHITECTURE.md:247` 이 이미
`archive/earth-events/dt=…/hh=…/part.jsonl.gz` 를 "불변 원자료"로 쓰고 있다
(`aws/archiver/handler.py:77` `put_jsonl`, `GzipFile(mtime=0)` 결정적 형태).

결정 ② 의 canonical 이 같은 접두사 아래 오므로 **두 계보를 구별하는 배치가 필요하다.**
그 배치는 미결정이다(→ `3G_POLICY_DECISIONS.md` §8-1). 이 문서가 이름을 지어내지 않는다.

판단에 필요한 구분: 불변 원자료는 **회차별로 쌓이는 append 계보**이고,
canonical 은 **사건별로 갱신되는 현재 상태**다. 같은 접두사에서 그 둘이 섞이면
`index_consistency.check()` 의 canonical 집합이 무엇인지 모호해진다.

---

## 5. 색인 규율 — 읽어서 더한다

canonical 색인은 `aws/report-engine/publisher.py` 의 규약을 따른다.
```
merge_index(index, report)   :110-134  "새로 만들지 않는다. 있는 것을 읽어서 더한다"
current_index()              :203-210  NoSuchKey → 빈 색인 / 그 외 → INDEX_READ_FAILED
                                       "못 읽으면 모른다고 말한다"
publish_index()              :246      "색인은 가변이다 — 조건부 쓰기를 쓰지 않는다"
rollback()                   :160-166  "발행본은 그대로 두고 색인에서 내린다"
```
3G 에서 이것이 **양식이 아니라 필수**인 이유: `events/global.json` 은 150건 상한과 3시간 창
때문에 사건이 매 회차 정당하게 빠진다. 전체 교체를 하면 살아 있는 사건이 색인에서 조용히 사라진다.

distribution 이 같은 결함을 이번 세션에 겪고 고쳤다 —
`aws/distribution/handler.py` 의 `read_index` · `merge_index`(커밋 `f2eaf85f`).
3G 는 그 구현을 참조 구현으로 본다. **모듈을 복사하지 않고 규율을 따른다.**

---

## 6. distribution 에서 가져오는 것과 다른 점

| distribution 이 보인 것 | 3G 가 그대로 쓰는가 |
|---|---|
| 허용 목록 방식(`PUBLIC_ELIGIBILITY`) | **그렇다** — 축의 값집합만 사건용으로 다르다 |
| `_assert_write_allowed` 로 매 PUT 앞 게이트 | **그렇다** — 단 canonical 은 접두사 단정문, projection 은 전용 게이트 |
| 색인에 판정과 사유를 적기(`publicEligible`·`publicWithheldReason`) | **그렇다** — 소비자가 다시 계산하지 않게 |
| `read_index` + `merge_index` | **그렇다** |
| `check_public_write` 를 직접 호출 | **아니다** — EarthEvent 는 콘텐츠가 아니다(§2) |
| 산출물 상태를 `DRAFT` 로 두기 | **아니다** — 사건은 `release_state='SHADOW'` 로 둔다 |

---

## 7. 미결정
1. projection 게이트의 이름 · 위치 · 허용 목록 값집합
2. projection 스키마 버전 문자열
3. sanitize 필드 허용 목록(§3.5 의 세 축)
4. canonical 키 배치(§4)
5. `REVIEW_REQUIRED` 가 사건 축에서 어느 정본의 값인가 —
   현재 그 값은 `aws/distribution/eligibility.py` 계보의 콘텐츠 자격 어휘다.
   사건에 같은 이름을 쓸 것인지, 쓴다면 어느 표가 소유하는지 정해야 한다

## 8. 이 문서가 금지하는 것
- `publication_privacy` 의 접두사 표를 복사·분기하는 것
- canonical 을 `events/` 에 쓰는 것
- 검사를 통과시키기 위해 EarthEvent 에 콘텐츠 상태 칸을 붙이는 것
- 3G 가 `release_state` 를 SHADOW 밖으로 승격시키는 것
