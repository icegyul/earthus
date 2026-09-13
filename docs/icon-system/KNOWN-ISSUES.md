# 아이콘 작업 중 발견했으나 고치지 않은 것

기록일: 2026-09-13
기준 커밋: `2c319b95` (아이콘 시스템 v1.2 적용) · 그 부모: `3c577d15`

받은 지시대로 **아무것도 고치지 않고 기록만 한다.** 아래 셋 중 어느 것도 손대지 않았고,
아이콘 커밋 `2c319b95` 에도 들어 있지 않다.

아래 수치는 전부 **커밋된 트리에서 직접 실행해** 얻은 것이다. 지금 작업 트리에는 다른 세션의
미커밋 변경이 섞여 있어서, 작업 트리에서 잰 값은 커밋과 다를 수 있다 — 그 차이 자체가 이슈 2다.

---

## 이슈 1 — `test_public_ui_contract` 가 아이콘 커밋 이전부터 실패한다

### 이번 아이콘 작업의 blocker 아님

`3c577d15`(아이콘 작업 전)에서도 `2c319b95`(아이콘 작업 후)에서도 **똑같이 실패한다.**
아이콘 커밋은 이 시험이 보는 CSS 규칙도, 시험 파일도 건드리지 않았다.

### 사실

```
$ git worktree add --detach /tmp/atHEAD 2c319b95
$ cd /tmp/atHEAD && node --test tools/test_public_ui_contract.mjs
  tests 1 · pass 0 · fail 1
  AssertionError: AETHERUS handle still overlays the open EARTHUS menu
```

`3c577d15` 에서 같은 명령을 돌려도 결과가 같다(`pass 0 · fail 1`).

시험(`tools/test_public_ui_contract.mjs:107`)이 요구하는 것:

```js
assert.match(appCss, /#menuTab\.open \+ #aetherusTab:not\(\.open\)\{opacity:0;pointer-events:none\}/,
  'AETHERUS handle still overlays the open EARTHUS menu');
```

`prototype/css/app.css` 에 그 선택자는 **두 번** 있는데, 선언 내용이 다르다.

```
626: #menuTab.open + #aetherusTab:not(.open){ transform:translateY(-50%) translateX(calc(-1 * var(--mm-w))); }
783:   #menuTab.open + #aetherusTab:not(.open){transform:translateY(-50%) translateX(calc(-1 * var(--mm-w)))}
```

즉 **표기 차이가 아니라 구현 방식이 다르다.** 화면은 손잡이를 *숨겨서*(`opacity:0`) 겹침을
없애는 대신 *옆으로 밀어서* 없앤다. 시험은 숨기는 쪽을 정본으로 못박아 두었다.

### 정해야 할 것

둘 중 어느 쪽이 정본인가 — 밀어내기(현재 CSS)인가 숨기기(현재 시험)인가.
밀어내기가 맞다면 시험을 고쳐야 하고, 숨기기가 맞다면 CSS 를 고쳐야 한다.
**어느 쪽이든 아이콘 작업과 무관하므로 여기서 정하지 않았다.**

---

## 이슈 2 — 시뮬레이션 능력이 2개인가 3개인가 (작업 트리 한정 충돌)

### 이번 아이콘 작업의 blocker 아님

커밋된 트리에서는 **충돌이 없다.** `2c319b95` 에서 관련 시험이 전부 통과한다.

```
$ cd /tmp/atHEAD
$ node --test tools/test_v2_phenomenon_wiring.mjs              → tests 16 · pass 16 · fail 0
$ node --test tools/test_v2_ui_information_architecture.mjs    → tests 37 · pass 37 · fail 0
```

깨지는 곳은 **지금 작업 트리뿐**이고, 원인은 다른 세션의 미커밋 변경이다.
아이콘 커밋은 `phenomenon-registry.js` 를 **파일 끝에 덧붙이기만** 했고
(`MENU_GROUPS`·`EARTHUS_MENU_GROUPS`·`menuGroupOf`), 능력표(`capabilities`)는 한 글자도
건드리지 않았다.

### 사실

| | `3c577d15` | `2c319b95` (아이콘) | 지금 작업 트리 |
|---|---|---|---|
| `phenomenon-registry.js` 의 `simulation: true` | 2 | 2 | **3** |
| `test_v2_ui_information_architecture.mjs` 기대값 | 정확히 2개다 | 정확히 2개다 | **정확히 3개다** |
| `test_v2_phenomenon_wiring.mjs` 기대값 | 정확히 2개다 | 정확히 2개다 | 정확히 2개다 |
| `test_v2_phenomenon_wiring` 실행 | 16/16 통과 | 16/16 통과 | **1건 실패** |

다른 세션이 `space.satellite` 의 `simulation` 을 `true` 로 올리고 **IA 시험만** 3개로 고쳐 두었다.
`wiring` 시험은 아직 2개를 기대하므로, 그 세션이 커밋을 마칠 때까지 작업 트리에서만 어긋난다.

### 정해야 할 것

`sat-layer.js` 에 SGP4 실전파가 있으므로 3개가 정직해 보인다. 그렇다면 `wiring` 시험도 3개로
맞춰야 두 시험이 화해한다. **다만 그 판단은 해당 변경을 만든 세션의 몫이므로 건드리지 않았다.**

> ⚠️ 앞선 보고에서 이것을 '기존 실패' 라고 적었다가 정정했다. `3c577d15` 를 따로 체크아웃해
> 확인해 보니 16/16 통과였다. 기존 실패가 아니라 **작업 트리 한정 실패**다.

---

## 이슈 3 — 시험이 `ui-shell.js` 를 글자로만 읽어서 문법 오류를 못 잡는다 (새로 발견)

### 이번 아이콘 작업의 blocker 아님

`2c319b95` 에 담긴 `ui-shell.js` 는 **문법도 동작도 정상임을 따로 확인했다** —
`node --check` 통과, 실제 `import()` 성공, 현상 58줄을 실제로 렌더해 아이콘 누락 0·파손 0.
이 이슈는 커밋의 결함이 아니라 **시험 그물의 구멍**이고, 아이콘 작업 이전부터 있던 성질이다.

### 사실

아이콘 작업 중 스테이징 1차 시도에서 `ui-shell.js` 가 실제로 **파싱조차 안 되는 상태**가 됐는데,
관련 시험이 **전부 통과했다.** 소스를 문자열로 읽어 정규식만 보기 때문이다.

```
$ git show HEAD:tools/test_v2_ui_information_architecture.mjs | grep -c "import(.*ui-shell"   → 0
$ git show HEAD:tools/test_v2_phenomenon_wiring.mjs           | grep -c "import(.*ui-shell"   → 0
$ git show HEAD:tools/test_v2_badge_parity.mjs                | grep -c "import(.*ui-shell"   → 0
$ git grep -l "import(.*ui-shell" HEAD -- 'tools/test*'                                       → (없음)
```

셋 다 `readFileSync` 로 읽는다. 그래서 "메뉴 줄에 아이콘이 이름보다 앞에 온다" 같은 시험조차
`return` 이 잘려 아무것도 안 그리는 파일에서 **통과한다** — 글자 순서는 그대로이기 때문이다.

### 제안 (이번 커밋에는 넣지 않았다)

문법이 깨지면 즉시 빨개지는 연막 시험 한 줄.

```js
test('셸이 모듈로 실제 로드된다 — 글자 검사로는 문법 오류를 못 잡는다', async () => {
  const m = await import('../prototype/v2-three/js/ui-shell.js');
  assert.equal(typeof m.initShell, 'function');
  assert.ok(Array.isArray(m.SCENES) && m.SCENES.length);
});
```

⚠️ 함께 적어 둔다: **`node --check` 만으로는 부족하다.** 1차 사고 때 아이콘 블록이 `return`
표현식 한가운데로 들어갔는데, 자동 세미콜론 삽입(ASI) 때문에 파일은 **문법적으로 멀쩡했다.**
잘린 `return` 뒤의 조각들이 단항 `+` 식으로 해석돼 조용히 죽은 코드가 됐을 뿐이다.
그런 종류는 **실제로 한 줄을 그려 봐야** 잡힌다.
