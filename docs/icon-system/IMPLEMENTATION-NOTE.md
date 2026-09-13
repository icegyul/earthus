# EARTHUS 아이콘 시스템 — 적용 기록

적용일: 2026-09-13
인수 패키지: `v3si/EARTHUS_ICON_SYSTEM_V1.2_COMPLETE_PACKAGE.zip` (2026-09-12)
적용 범위: V1(`prototype/`) · V2(`prototype/v2-three/` → `prototype/v2-deploy/`)

---

## 1. 어디에 무엇이 있나

| 것 | 자리 |
|---|---|
| 아이콘 44종 × 4크기 | `prototype/assets/earthus-icons/` |
| 아이콘 레지스트리 v1.2 | `prototype/assets/earthus-icons/registry.json` |
| **표 (v1·v2 공용 정본)** | `prototype/js/earthus-icons.js` |
| V2 메뉴 묶음·순서 | `prototype/v2-three/js/phenomenon-registry.js` 의 `MENU_GROUPS` |
| 인수 문서 원본 | `docs/icon-system/*.md` |
| v1.2 추가분 원판 | `docs/icon-system/EARTHUS_ICON_SHEET_v1.2_ADDITIONS.png` |

원본 zip 두 개는 `.gitignore` 로 뺐다 — 풀어서 쓴 것이 정본이다.

## 2. 표가 하나뿐인 이유

지시서 §13 합격조건이 "V1 과 V2 가 같은 라벨에 같은 아이콘 ID 를 쓴다" 이다.
두 화면이 각자 표를 들면 며칠 안에 갈라진다. 그래서 `earthus-icons.js` 하나만 두고
V1(`layerbar.js`)과 V2(`ui-shell.js`)가 같은 파일을 읽는다.
`tools/test_v2_ui_information_architecture.mjs` 가 "ui-shell 이 자체 아이콘 표를 만들지 않는다"를 시험으로 지킨다.

## 3. 지시서와 다르게 한 곳 — 그리고 이유

### 3.1 §3.2 목록 중 10개 칸을 만들지 않았다

빙하 · 홍수·수문 · 산사태 · 영구동토 · 농업 · 도시·인프라 · 에너지 · 수자원 · 식량·식생 —
EARTHUS 에 해당 현상 자료가 없다. 없는 칸을 "준비 중"으로 그리면 이 저장소가 스스로
금지한 빈 약속이 된다(불변식 4 — 능력 없으면 진입점 없음).

**아이콘은 이미 있으므로**, 자료가 붙는 날 `MENU_GROUPS` 의 `members` 에 한 줄 더하면 칸이 열린다.

### 3.2 V1 위성 4종은 아이콘으로 바꾸지 않았다

`gk2aAuto` · `himawari` · `truecolor` 는 실제 위성 사진 썸네일(`img/sat-*.png`)을 유지한다.
레지스트리에 '천리안2A' 같은 항목이 없고, 그 사진은 '혼합 아이콘 계열'이 아니라 자료 자체의
미리보기다. 넷을 `satellite-observation` 으로 바꾸면 넷이 전부 같은 동그라미가 된다.
사진이 없는 `clouds`(NOAA 합성, 보여 줄 기체가 없다)만 §6 #11 대로 관측 아이콘을 준다.

### 3.3 아이콘 8종을 새로 만들었다 (레지스트리 v1.2)

습도 · 수증기 · PM10 · 먼지·황사 · 대기질 지수 · 자외선 · 오존 · 너울.

§6 의 부모 상속 규칙만 따르면 V1 대기질 일곱 줄이 **전부 같은 `air-quality` 동그라미**가 된다.
지금은 색이 다른 절차적 썸네일이라 구별되던 것이 오히려 나빠진다.

화풍은 `EARTHUS_ICON_GENERATION_MASTER_PROMPT_v1.0.md` 그대로.
⚠️ 첫 판은 세밀한 풍경화로 나와 28px 에서 다섯 개가 뭉개졌다(§13 합격조건 미달) — 버렸다.
둘째 판은 "납작한 기호, 장면 아님"을 못박아 다시 받았고 여덟 다 24~28px 에서 읽힌다.

### 3.4 남은 중복 두 쌍은 일부러 둔다

`airkr`(대기오염 실측) ↔ `pm25`, `sst` ↔ `sstanom`.
**같은 양의 값 vs 실측/편차**라서 같은 아이콘이 맞다. 서로 다른 물질·양은 전부 갈랐다.

## 4. 규격 — 새 아이콘을 만들 때 반드시 맞출 것

- **원 지름 / 캔버스 = 0.909.** 이 비율이 어긋나면 같은 CSS 크기에서 다른 크기로 보인다.
  (64px 파일에서 원이 58px, 110px 파일에서 100px)
- **파일 이름의 `-128` 은 실제로 110×110 이다.** 36종 원본이 그렇고 새 8종도 맞췄다.
  레지스트리가 그 이름을 정본으로 적고 있어 이름을 고치지 않았다.
- 배경 투명, RGBA, 원 바깥은 알파 0.
- 크기 4종: 24 · 32 · 64 · `128`(=110).
- 화면이 실제로 쓰는 것은 `64`(1x)와 `128`(2x)다. 24·32 는 예비다.

## 5. 화면에서 쓰는 크기

| 화면 | 크기 | 자리 |
|---|---|---|
| V1 오른쪽 레이어 판 | 42px (활성 1.06배) | `.ly-icon` |
| V1 하단 칩 바 | 숨김 | 글자만 — 기존 동작 그대로 |
| V2 탐색 서랍 (데스크톱) | 28px | `.mp-ico` |
| V2 탐색 서랍 (≤640px) | 24px | `.mp-ico` |

상태(§7): 기본 = 차분한 그림자 · hover = 1px 뜨고 밝기 +8% · active = 묶음 색 발광 · locked = 탈색.

## 6. 배포 경로의 함정

`tools/build-v2-bundle.sh` 가 모듈을 번들의 **`js/` 바로 아래**에, 그림을 **번들 루트 `assets/`** 아래에 둔다.
모듈이 그림 위치를 `import.meta.url` 기준 한 칸 위로 풀기 때문이다.

⚠️ 모듈을 `js/shared/` 로 옮기면 경로가 한 칸 모자라 번들 밖을 가리키고,
4/4 무결성 검사가 배포를 막는다. (실제로 한 번 막혔다.)

⚠️ 그 검사기는 **주석까지** 훑는다. 설명하려고 주석에 적어 둔 상대경로 한 줄이 배포를 막았다.
경로를 설명할 때 글자 그대로 적지 말 것.

## 7. 곁다리로 고친 것

`ui-shell.js` 에 메뉴를 그리는 곳이 둘이었다. 패널은 현상 묶음으로 그리는데
검색 입력 핸들러만 **옛 씬 목록**을 다시 그려서, 검색창에 글자를 넣는 순간 메뉴가
통째로 다른 화면(씬 9개·레이어 90줄)으로 바뀌었다. 그리는 곳을 하나로 합치고
죽은 렌더러(`sectionHtml`)를 지웠다. 기능은 줄지 않는다 — 같은 레이어를 현상 줄의 펼치기가 전부 켠다.

## 8. 검수 결과 (2026-09-13)

로컬 `prototype/v2-deploy` · `prototype/` 실측.

| 해상도 | V2 아이콘 | 잘림 | 이름 없는 줄 | 가로 넘침 |
|---|---|---|---|---|
| 1280×800 · 1440×900 · 1920×1080 | 58개 28px 전부 로드 | 0 | 0 | 없음 |
| 375×812 · 390×844 · 430×932 | 58개 24px 전부 로드 | 0 | 0 | 없음 |

V1: 22개 항목 = 아이콘 19 + 위성 사진 3, 깨진 이미지 0, 남은 옛 썸네일 0.

시험: `test_v2_ui_information_architecture`(37) · `test_v2_information_flow`(12) ·
`test_v2_badge_parity`(2) · `test_v2_intel_time_contract`(5) — 56/56 통과.

⚠️ 손대지 않은 실패 두 건이 있다. 성격이 서로 다르다 — 자세한 것은 `KNOWN-ISSUES.md`.
- `test_public_ui_contract` — **HEAD 에서도 실패한다.** 정말로 기존 결함이다.
- `test_v2_phenomenon_wiring` — **HEAD 에서도 이 커밋에서도 16/16 통과한다.**
  지금 작업 트리에서만 깨져 있다. 다른 세션이 `space.satellite` 의 `simulation` 을 `true` 로
  올리고 IA 시험만 3개로 고쳐 둔 미커밋 상태이기 때문이다. '기존 실패' 가 아니라
  **작업 트리 한정 실패**다 (앞서 이것을 기존 실패라고 적었다가 HEAD 를 따로 체크아웃해 확인하고 고쳤다).

## 9. 측정할 때 조심할 것

브라우저 패널이 숨어 있으면 `document.visibilityState === 'hidden'` 이라
**lazy 이미지가 영영 로드되지 않고 CSS 전환도 돌지 않는다.**
그 상태로 재면 "아이콘 0개 로드", "패널이 화면 밖(-479px)" 같은 가짜 결함이 나온다.
스크린샷을 한 장 찍어 문서를 깨운 뒤 재야 한다.

## 10. 사고 기록 — 부분 스테이징이 `ui-shell.js` 를 반쪽만 적용했다

작업 트리에 다른 세션의 미커밋 변경이 섞여 있어, `ui-shell.js` 의 37개 hunk 중
**내 것 22개만** 골라 index 에 올려야 했다. 1차 시도가 파일을 깨뜨렸다.
워킹트리는 멀쩡했고 **index 안에서만** 깨져 있었다 — 즉 커밋했으면 아무 데서도 실행된 적 없는
내용이 그대로 올라갈 뻔했다.

### 10.1 무엇이 어떻게 깨졌나

`git diff -U0` 패치에서 hunk 를 골라 `git apply --cached --unidiff-zero` 로 넣었다.
U0 패치의 `+시작줄` 은 **앞 hunk 가 전부 적용된 상태**를 가정한다. 15개를 건너뛰니 그만큼
뒤 hunk 들이 밀린 자리에 꽂혔고, `--unidiff-zero` 는 그것을 잡아 줄 문맥 검사를 꺼 버린다.
결과는 두 군데였다.

**파손 ①  메서드 체인 한가운데에 `const` 가 꽂혔다** (staged 432~434행)

```js
const LOOSE_LAYERS = Object.entries(LAYER_PHENOMENON)
const GROUP_BY_ID = new Map(MENU_GROUPS.map((g) => [g.id, g]));   // ← 여기 꽂혔다
  .filter((e) => !e[1].phenomenon)
```

`node --check` 가 `SyntaxError: Unexpected token '.'` 로 잡는다. 이건 **시끄러운** 파손이다.

**파손 ②  `return` 표현식 한가운데에 아이콘 블록이 꽂혔다** (`phenomenonRowHtml`, staged 472~489행)

```js
return '<div class="mp-phen'
  + '<button class="mp-item mp-phen-main'
  + ' data-fscene="' + … + '" data-flayer="' + … + '"'
const slug = iconForPhenomenon(entry.id);        // ← 여기부터 꽂혔다
const ico  = slug ? '<img class="mp-ico" …>' : '';
  + ' title="' + … + '">'                        // ← 여기부터는 죽은 코드
```

자동 세미콜론 삽입(ASI)이 `data-flayer` 뒤에서 `return` 을 끝낸다. 그래서 메뉴 한 줄이
**닫히지도 않은 `<button` 한 토막**으로만 나오고 — 아이콘도, 이름도, 배지도, 닫는 태그도 없다.
뒤에 남은 `+ ' title="…'` 조각들은 단항 `+` 식으로 해석돼 조용히 죽는다.

**이 ②번은 문법적으로 완전히 정상이다.** `node --check` 를 통과한다.
①이 함께 있어서 들켰을 뿐, ②만 있었다면 아무 도구도 소리내지 않았을 것이다.

### 10.2 그때 **통과한** 검사들 — 정적 `readFileSync` 시험의 한계

파일이 파싱조차 안 되는 상태에서 아래가 **전부 초록불**이었다.

| 검사 | 그때 결과 |
|---|---|
| `node --test` 관련 시험 4종 | **56/56 통과** |
| `test_v2_phenomenon_wiring` | **16/16 통과** |
| `tools/build-v2-bundle.sh` 무결성 | **PASS 2/2** |
| `grep` 으로 확인한 심볼 유무(`MENU_GROUPS`·`mp-ico` 등) | 전부 있음 |
| 다른 세션 표식(`spaceDoor` 등) 0건 | 확인됨 |

이유는 하나다. 이 저장소의 시험은 `ui-shell.js` 를 **`readFileSync` 로 읽어 정규식만 본다.**
모듈로 `import` 하는 시험이 저장소에 **하나도 없다**(KNOWN-ISSUES 이슈 3).

그래서 내가 이번에 **새로 넣은** 시험조차 파손된 파일에서 통과했다 —

```js
assert.ok(body.indexOf('class="mp-ico"') < body.indexOf('class="mp-lbl"'), '아이콘이 이름 뒤에 있다');
```

잘린 `return` 안에서도 **글자 순서는 그대로**이기 때문이다.
번들 무결성 검사도 경로만 재작성할 뿐 JS 를 파싱하지 않으므로 그냥 지나간다.

결국 잡은 것은 시험이 아니라 **`git show :<path>` 로 index 의 실물을 꺼내 읽은 독립 감사**였다.

### 10.3 다음에 부분 커밋을 할 때

**스테이징**: 패치를 git 에게 주지 않는다. HEAD 내용에 고른 hunk 를 **옛쪽(`-`) 좌표**로 직접
적용해 목표 내용을 만들고 `git hash-object -w` + `git update-index --cacheinfo` 로 넣는다.
옛쪽 좌표는 무엇을 건너뛰든 변하지 않는다.
검산은 **hunk 를 전부 적용하면 작업 트리와 바이트 단위로 같아야 한다**(줄끝 CRLF 정규화 후).

**검증**: 워킹트리가 아니라 **커밋될 트리**에서 잰다.
`git write-tree` → `git commit-tree` → `git worktree add` 로 꺼내 놓고,

1. `node --check` — 파손 ①은 잡는다. **②는 못 잡는다.**
2. **실제 `import()`** — 모듈이 진짜 로드되는지.
3. **한 줄 실제 렌더** — 파손 ②는 이것만이 잡는다.
   (이번에는 현상 58줄을 그려 아이콘·이름·닫는 태그를 모두 확인했다.)
4. 그 트리에서 시험과 번들 빌드를 돌린다.

**시험이 초록불이라는 것은 파일이 멀쩡하다는 뜻이 아니다.**
