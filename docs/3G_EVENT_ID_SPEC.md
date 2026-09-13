# 3G EarthEvent ID 규격 — 결정 ④

작성 2026-09-13 · DESIGN ONLY · 코드 0줄
정책 정본 → `docs/3G_POLICY_DECISIONS.md` §4

---

## 1. 결정 ④ (확정)

- GDELT `GlobalEventID` 를 canonical `event_id` 로 **쓰지 않는다** — source-local identifier 로 보존
- canonical event_id 는 **deterministic fingerprint** 기반
- 최소 입력: `event_type` · `canonical_place` · `time_bucket` · `primary_entities` · `event_key_version`
- **`event_key_version` 을 반드시 저장**한다
- 동일 입력 → 동일 EarthEvent ID
- GDELT 회차별 source ID 변경 → 같은 EarthEvent 에 연결 가능
- merge/split 시 source IDs 와 aliases 를 보존
- **collision test 필수**

---

## 2. 왜 GDELT id 를 쓸 수 없는가 — 실측

`aws/gdelt-events/handler.py` 는 창 3시간 안의 기사들을 병합하고, 병합 묶음의 대표로
**점수가 가장 높은 구성원의 GlobalEventID** 를 `id` 로 내보낸다(`merged` 필드가 병합 개수다).

따라서 **같은 이야기인데 회차마다 `id` 가 바뀔 수 있다** — 새 기사가 들어와 점수 순위가
뒤집히면 대표가 교체된다. 그 값을 canonical id 로 쓰면 같은 사건이 두 개로 갈라진다.
결정 ④ 가 그것을 막는다.

---

## 3. 기존 "잠긴 계약"과의 관계 — 실측으로 확인

`docs/EARTH_EVENT_CANONICAL_MODEL.md` 는 네 곳에서 `{kind}-{sourceId}` 를 정본 주소로 적었다:
`:40` · `:198` · `:242`("잠긴 정본 주소") · `:633`(§8 잠긴 계약 표).
`:633` 은 그 형식을 `test_v2_ui_information_architecture.mjs` **2건**이 고정한다고 적었다.

**그 2건을 직접 읽었다. 형식을 검사하지 않는다.**
```
tools/test_v2_ui_information_architecture.mjs:120
  assert.match(mainSrc, /feed\.selectById\(ds\.eventId, orbit\)/)
tools/test_v2_ui_information_architecture.mjs:156-157
  assert.match(mainSrc, /feed\.updateMarkers\(camera, altKm, \(eventId, kind\) =>/)
  assert.match(mainSrc, /feed\.selectById\(eventId, orbit\)/)
```
→ **호출 모양만** 고정한다. id 문자열의 형식은 보지 않는다.

그리고 **id 를 파싱하는 소비자가 저장소에 0건이다.**
`eventId.split` · `eventId.match` · `split('-')` 를 `prototype/js` · `engine-v11` · `aws` 전역에서
찾아 사건 관련 히트가 없다. 소비자는 id 를 불투명 문자열로 다룬다.

### 3.1 따라서 고쳐야 할 것 — 문서와 주석뿐
| 위치 | 현재 | 조치 |
|---|---|---|
| `docs/EARTH_EVENT_CANONICAL_MODEL.md:40` | 정본 `event_id` = `{kind}-{sourceId}` | 결정 ④ 로 대체 |
| `:198` | 표의 사건 id 칸 | 같음 |
| `:242` | "`{kind}-{sourceId}` ← 잠긴 정본 주소" | 같음 |
| `:633` | §8 잠긴 계약 표의 그 행 | 계약을 **id 불투명성**으로 다시 쓴다(형식이 아니라 "소비자는 파싱하지 않는다") |
| `aws/_shared/sql/20260913_earth_event_core.sql:145` | `event_id` 주석 | 같음 |

**테스트 변경은 필요 없다.** npm 143 기준선이 깨지지 않는다.

---

## 4. 해시 폭 — v11 것을 그대로 쓸 수 없다

`prototype/js/earthus2/v11/core/contracts.js:13-17`
```js
export function stableId(parts=[]) {
  const input=parts.map(v=>String(v??'')).join('|'); let h=2166136261;
  for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619);}
  return `ei_${(h>>>0).toString(16).padStart(8,'0')}`;
}
```
FNV-1a **32비트** → 8 hex. 하루 유입 상한 = 150건 × 48회(`cron(5,35)`) = **7,200 사건/일**
(중복 제거 전). 생일 한계 계산:

| 형식 | 공간 | 50% 충돌 | 1/1e6 유지 한계 | 7,200/일 기준 |
|---|---|---|---|---|
| v11 `ei_`+8hex | 2^32 | 77,162 | **92** | **즉시 초과** |
| `CNT-`+12hex (distribution `generator.content_id_for`) | 2^48 | 19,753,662 | 23,726 | 3.3일 |
| 16hex | 2^64 | 5,056,937,540 | 6,074,000 | 844일 |
| 20hex | 2^80 | 1.29e12 | 1.55e9 | 실질 무한 |

→ **v11 의 해시 함수는 재사용하지 않는다.** 재사용하는 것은 *입력을 조립하는 방식*
(구분자로 이어 문자열을 만든 뒤 해시)이고, 해시는 sha256 으로 바꾼다.
distribution 이 같은 방식을 쓴다 — `aws/distribution/generator.py` 의
`candidate_identity()` + `content_id_for()`(`CNT-<sha256 12hex>`).

⚠️ **폭은 미결정이다.** 보존 정책(사건이 얼마나 오래 남는가)이 정해지지 않아 모집단 상한을
확정할 수 없다. 위 표가 판단 자료다. 이 문서가 숫자를 고르지 않는다.

### 4.1 v11 입력을 그대로 쓸 수 없는 이유
v11 은 `stableId([eventType, region, startedAt, title])` 를 쓴다.
`startedAt` 은 **정확 시각**이고 결정 ③ 이 정확 시각 생성을 금지한다.
결정 ④ 의 입력 목록에 `time_bucket` 이 있는 것이 그 대체다 — 이식 시 바꿔야 한다.
`title` 도 결정 ④ 의 최소 입력에 없다(제목은 회차마다 바뀔 수 있다).

---

## 5. 지문 입력 — 정의와 미결정

결정 ④ 가 입력 다섯을 정했다. 각각을 GDELT 에서 어떻게 얻는가:

| 입력 | GDELT 원천 | 상태 |
|---|---|---|
| `event_type` | `root` · `cameoRoot` · `eventCode`(CAMEO 코드 계열) | 원천은 확정. **정규화 형식 미결정** |
| `canonical_place` | `lat` · `lon` · `place` · `country` · `featureId` · `geoType` | 원천은 확정. **정규화 규칙 미결정**(격자인가 지명인가, 격자면 폭) |
| `time_bucket` | `ageMin` 과 파일의 `generated`(→ `3G_TIME_PROVENANCE.md`) | **폭 미결정** |
| `primary_entities` | **GDELT 에 엔티티 목록이 없다** | **추출 규칙 미결정** |
| `event_key_version` | 우리가 정한다 | **초기값·증가 규칙 미결정** |

⚠️ 이 표의 "미결정" 다섯은 이 문서가 채우지 않는다. 채우면 그것이 결정으로 굳는다.
초안 과정에서 형식·격자폭·어휘를 채워 넣은 것이 있었고 전부 제거했다.

### 5.1 입력이 없을 때
결정 ④ 는 "동일 입력 → 동일 ID" 만 요구한다. 입력 하나가 없을 때의 처리는
**미결정**이다. 다만 지켜야 하는 성질은 둘이다:
- 없는 값을 **다른 값으로 대체하지 않는다**(그러면 다른 사건이 같은 id 를 받는다)
- 없음의 표현이 **회차마다 같아야** 한다(그러지 않으면 같은 사건이 id 를 바꾼다)

---

## 6. `event_key_version`

**왜 있는가.** 지문 입력의 정의가 바뀌면(예: 격자 폭 변경) 같은 사건이 다른 id 를 받는다.
버전을 지문에 넣고 **저장**하면, 어떤 규칙으로 만든 id 인지 사후에 알 수 있다.

**버전이 올라갈 때.** 옛 id 가 조용히 도달 불가가 되면 안 된다.
`aliases` 가 그 역할을 한다(§7). 버전 올림은 새 id 를 만들고 **옛 id 를 alias 로 남긴다.**

**저장 위치는 미결정** — 현재 `earthus_earth_event` 에 그 칸이 없다.

---

## 7. merge / split 과 aliases

결정 ④ 가 "merge/split 시 source IDs 와 aliases 를 보존한다"고 정했다.

- **source IDs** — GDELT `GlobalEventID` 는 source-local identifier 로 보존한다.
  `earthus_source` 가 `source_id = {system}:{identifier}` 형식을 쓰므로
  `gdelt:<GlobalEventID>` 형태가 그 규약에 맞는다.
- **aliases** — 한 EarthEvent 이 과거에 가졌던 canonical id 들. merge 로 둘이 하나가 되면
  흡수된 쪽 id 가 alias 가 된다. split 은 그 역이다.

⚠️ **SQL 에 alias 를 담을 칸이 있는지 확인이 필요하다.** `earthus_earth_event`(`:144-207`)에
그 칸이 없으면 최소 추가가 필요하다. 관계 표(`from_event_id, to_event_id, relation_type`)가
있으므로 alias 를 관계로 표현할 수도 있다 — 어느 쪽인지는 **미결정**이다.

---

## 8. collision test — 결정 ④ 가 요구한 것

무엇을 단정하는가:
1. **결정성** — 같은 입력을 두 번 넣으면 같은 id. 프로세스를 새로 띄워도 같다
2. **분별** — 입력 다섯 중 **하나만** 달라도 다른 id. 다섯 축 각각에 대해 검사한다
3. **시각 무관** — 실행 시각이 id 에 섞이지 않는다(결정 ③ 과 같은 방향)
4. **회차 무관** — GDELT `id` 가 바뀌어도 같은 EarthEvent id
5. **폭** — 합성 입력 N 개를 넣어 충돌 0건. N 은 §4 의 폭 결정에 따라 정한다
6. **버전** — `event_key_version` 이 다르면 id 가 다르고, 옛 id 가 alias 로 남는다

⚠️ 5 는 폭이 정해지기 전에는 쓸 수 없다. 4 는 `merged` 대표 교체를 흉내내는 픽스처가 필요하다.

---

## 9. 미결정 요약
`event_type` 정규화 형식 · `canonical_place` 정규화 규칙 · `time_bucket` 폭 ·
`primary_entities` 추출 규칙 · `event_key_version` 초기값과 증가 규칙 ·
해시 폭 · canonical id 문자열 형식(접두사) · 입력 없음의 표현 ·
`event_key_version` 저장 칸 · alias 저장 방식
