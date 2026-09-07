# EARTHUS V2 — 구독 · 능력 매핑

| 항목 | 값 |
|---|---|
| 상태 | 설계 (PHASE 9 대상). 구현 없음 |
| 작성일 | 2026-09-08 |
| 기준 커밋 | `1e03eac8` |
| 전제 문서 | [phase-0-audit.md](phase-0-audit.md) · [phenomenon-registry.md](phenomenon-registry.md) |

> 봉인 인계 패키지(2026-08-27)의 일부가 아니다. `SHA256SUMS` 대상이 아니다.

---

## 0. 현재 상태 — v2 에 게이트가 없다

| | 실제 |
|---|---|
| v2-three 의 게이트 | **전혀 없다.** `access-mode.js`·`store.js`·`auth.js`·`billing.js` 를 **아무것도 import 하지 않는다** |
| v2 의 계정 계층 | **없다.** `main.js:4784-4788` 이 로그인을 v1 으로 넘긴다(`/?login=1&back=...`). 세션도 프로필도 티어도 없다 |
| v2 의 유료 UI | **없다.** 유일한 흔적은 `engine-bridge.js:86` 의 `NON_TRUTH.PRO ['locked','EXPLORER PRO']` 인데 **호출부가 하나도 없다** |
| 레이어의 `tier` 필드 | **없다.** 109개 레이어 형태는 `{id, name, state, src, act}` 다 |
| 서버측 강제 | `supabase/functions/forecast-v8` **단 하나.** 유료 태풍·LAB 리포트조차 공개 JSON 을 클라이언트 게이트로 가린다 |

**중요한 오해 하나를 바로잡는다.** 109개 중 `LOCKED` 인 4개는 **유료라는 뜻이 아니다.** "아직 구현 안 됨 / 자료 정책상 막힘" 이라는 뜻이다. `state` 는 진실·준비 등급이지 접근 등급이 아니다. 이 둘을 섞으면 사용자에게 "돈 내면 열린다" 고 거짓말하게 된다.

v1 에는 진짜 중앙 이음매가 있다 — `prototype/js/access-mode.js` 의 `TIER` + `decideCapabilityAccess` 사다리. 다만 지금 **무력화**되어 있다: `config.local.js` 가 `MONETIZATION_MODE='FREE_OPEN'` 이고 `access-mode.js:75-77` 이 모든 판정을 `allowed:true` 로 단락시킨다. 게다가 최소 5개 표면이 `auth.isPaid()`/`store.isPaid()` 를 직접 불러 이 사다리를 **우회**하며, 그 우회들은 `FREE_OPEN` 을 존중하지 않아 **정책상 전부 무료인데도 지금 잠겨 있다.**

---

## 1. 코드보다 먼저 고쳐야 할 것 — 결제 쓰기 경로가 깨져 있다

지침서 §36(중앙화)보다 **앞에** 와야 한다. 지금 상태로 첫 실결제가 들어오면 `check_violation` 이 난다.

| 문제 | 내용 |
|---|---|
| CHECK 불일치 | `profiles.tier` 는 `('free','paid')` 로 제약되는데 `apply_paid_order` 는 `'explorer'`/`'intelligence'` 를 쓴다 |
| 트리거 연동 | `sync_profile_membership_class` 와 `expire_subscriptions` 가 **둘 다** `tier='paid'` 에 걸려 있다 |
| 서버 게이트 | `forecast-v8-policy.js:18` 이 `tier==='paid'` **문자열 일치**다 — 등급 비교가 아니다 |

→ **셋을 한 번에** 고친다. `CHECK` 만 넓히면 유료 가입자가 전부 `membership_class='free'` 로 찍힌다.

→ 그다음 `forecast-v8-policy.js` 를 등급 비교로 바꾸고, `store.js` 의 fail-OPEN 을 닫는다.

---

## 2. 게이트는 현상 레지스트리에 붙인다

지침서 §36 은 중앙화를 요구한다. 붙일 자리는 이미 만들었다 — **현상 레지스트리**다. 컴포넌트마다 하드코딩하지 않는다.

```js
Capability { id, accessTier, prerequisites, featureFlag, description }
```

능력 축은 레지스트리의 7개 플래그를 그대로 쓴다(`current · history · intelligence · forecast · simulation · evidence · report`). 즉 **게이트의 단위는 "레이어" 가 아니라 "현상 × 능력" 이다.**

이것이 지침서 §20 의 요구("무료가 잠긴 상자로 가득한 페이지가 되면 안 된다")를 구조적으로 만족시킨다. 같은 현상을 무료 사용자도 **보고**, 유료 사용자는 **더 깊이** 본다.

### 출발 정책 (검증 전 초안)

| 능력 | 등급 | 근거 |
|---|---|---|
| `current` | FREE | 지금 무슨 일이 일어나는지는 항상 무료다 |
| `evidence` | FREE | 출처를 감추면 제품의 신뢰가 무너진다 |
| `history` | FREE (요약) / PRO (심층 비교) | |
| `intelligence` | FREE (기본 질문 1개) / PRO (심화) | 지침서 §36 `intelligence.basic FREE` |
| `forecast` | FREE (요약) / PRO (상세·앙상블) | |
| `simulation` | PRO | 계산 비용이 실제로 든다 |
| `report` | FREE (요약·이전 전망 평가 요약) / PRO (전문) | 지침서 §20 |

> 지침서 §36 이 직접 말한다: "이것들은 출발 정책 예시일 뿐이며 최종 등급은 제품 전략과 대조해 검증해야 한다." 확정하지 않았다.

**저장소 메모리와의 정합**: v1·v3 는 무료, v2 는 인텔리전스 완료 후 유료. 그런데 오늘 v2 에는 게이트가 없고 계정 계층도 없다. 지침서 §50 의 마지막 규칙이 여기 그대로 적용된다 — **무료 사용자 여정이 동작하기 전에 PRO 잠금을 넣지 않는다.**

---

## 3. 지금 잠그면 안 되는 이유 (지침서 §41)

레지스트리가 말해 주는 것:

- `intelligence:true` 인 현상이 66개 중 **44개**다. 22개는 오늘 해석을 못 낸다.
- `forecast:true` 는 **13개**뿐이다.
- `simulation:true` 는 **2개**뿐이다.
- `report:true` 는 **7개**뿐이다.

**유료로 팔 깊이가 아직 얇다.** 지금 게이트를 세우면 사용자는 "더 알고 싶다" 가 아니라 "일부러 안 준다" 를 경험한다. 그것이 지침서가 명시적으로 금지한 전환 방식이다.

→ 순서는 **능력을 참으로 만드는 것이 먼저, 게이트가 나중**이다.

---

## 4. 순서

1. 결제 DB 3종 동시 수정 (CHECK · 트리거 · 만료) — **제품 티어 작업보다 먼저**
2. `forecast-v8-policy` 를 등급 비교로, `store.js` fail-OPEN 닫기
3. v2 에 계정·세션 계층 (지금은 v1 으로 넘긴다)
4. 레지스트리에 `accessTier` 축 추가 — 컴포넌트가 아니라 여기 한 곳
5. 능력을 참으로 만드는 작업 (해석 22개 · 예보 · 리포트)
6. **그다음에** 게이트를 켠다. 결과 일부를 보여준 뒤 잠근다. 배너는 쓰지 않는다
7. 서버측 강제 — 클라이언트 게이트는 공개 JSON 앞에서 무의미하다
