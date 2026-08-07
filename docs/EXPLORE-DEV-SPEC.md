# 우주·심해 탐험 — 코딩 개발 계획서 (코덱스 작업 지시서)

작성 2026-08-07 · 판단·검수 Claude / 제작 Codex
기획 원본: [SPACE-ZOOM-PLAN.md](SPACE-ZOOM-PLAN.md) · [DEEP-SEA-PLAN.md](DEEP-SEA-PLAN.md)
방향(받은 결정): **둘 다 교육 영역 — 전부 무료.** TIER_RATIONALE 의
"3D 학습은 계속 무료" 선언 안에 들어간다. 유료 코드를 섞지 말 것.

---

## 0. 전체 그림 — 왜 공통 기반부터 만드나

우주(위)와 심해(아래)는 같은 뼈대를 쓴다:

```
장면 전환기(scene.js) ─┬─ 우주 장면 (태양계·은하)
                       └─ 심해 장면 (수심 기둥)
스케일 자(ui-scale.js) — 은하 ~ 태양계 ~ 지구 ~ 수면 ~ 해구, 하나의 세로 자
카탈로그 규율          — 손 큐레이션 JSON + 크레딧 필수 + 검증 스크립트
```

**공통 기반(A) → 우주 사진(B1) → 심해 수심 기둥(C1)** 순서로 간다.
B1·C1 각각 단독 배포 가치가 있다 — 한 덩어리로 몰아서 만들지 말 것.

---

## 1. 파일 구조

### 신규

```
prototype/js/scene.js                장면 상태 머신 + 크로스페이드 (A1)
prototype/js/ui-scale.js             스케일 자 — 우주·심해 공용 (A2)
prototype/js/space/kepler.js         행성 위치 계산 (순수 함수, B3)
prototype/js/space/skyphotos.js      허블·JWST 천구 마커 (B2)
prototype/js/space/solarscene.js     태양계 2D 캔버스 장면 (B3)
prototype/js/space/galaxycards.js    은하 단계 카드 (B4)
prototype/js/ocean/divescene.js      수심 기둥 2D 캔버스 장면 (C2)
prototype/js/ocean/sealife.js        생물 도감 로드·배치 (C3)
prototype/data/space-photos.json     손 큐레이션 ~50장 (B2)
prototype/data/sea-life.json         손 큐레이션 ~80종 (C3)
prototype/data/trenches.json         해구 ~10곳 (C4)
aws/ocean-depth/handler.py           GEBCO 지점 수심 질의 (C1)
tools/build_depth_grid.py            GEBCO 원본 → 축소 격자 (1회 실행, 로컬)
tools/verify_kepler.py               Horizons 대조 — B3 완료 게이트
tools/validate_catalogs.py           카탈로그 필수 필드·크레딧 검사 — 커밋 게이트
```

### 수정

```
prototype/js/viewer.js      카메라 상한을 장면에 따라 동적으로 (지금 45,000km 고정)
prototype/js/store.js       scene 상태 ('earth'|'space'|'ocean') + 이벤트
prototype/js/layerbar.js    장면 필터 + "지구 레이어 N개 켜짐" 접힘 줄
prototype/js/ui.js          바다 지점 시트에 잠수 버튼 · 배너 클릭 시 지구 복귀
prototype/js/config.js      장면 임계값 상수 (SCENE_T)
prototype/js/layers/registry.js  장면별 로더 (우주 사진 카탈로그 등)
```

---

## 2. 공통 기반 (A)

### A1. scene.js — 장면 상태 머신

```js
export const sceneMgr = {
  current: 'earth',            // 'earth' | 'space' | 'ocean'
  // to('space', {stage}) / to('ocean', {lat, lon}) / to('earth', {flyTo})
};
```

- 전환 = 전면 덮개 div 크로스페이드 1.2초. CSS transition 만 쓴다 (JS 프레임 루프 금지).
- **Cesium 은 파괴하지 않는다.** 나갈 때: 입력 차단 + `display:none` + requestRender 중단.
  돌아올 때 반대로. (재진입이 잦아 재생성 비용이 더 크다 — SPACE 계획 §4)
- ⚠️ **하단 배너(#banner)는 장면 위에 있어야 한다.** z-index 를 장면 캔버스보다 높게.
  배너의 go() 는 `sceneMgr.to('earth')` 를 먼저 부르고 flyTo 한다 —
  은하를 보다가도 쓰나미 경보를 누르면 지구로 돌아온다. 이게 안 되면 검수 탈락.
- ⚠️ 전환 임계에 히스테리시스: 올라갈 때/내려갈 때 임계를 10% 다르게
  (store.js 의 T.CHROME 방식과 동일). 경계에서 덜컥거리면 안 된다.
- 상태는 저장하지 않는다 — 새로 열면 항상 지구다. (loadLayerState 의
  "처음 열 때는 지구가 지구로 보여야 한다"와 같은 이유)

### A2. ui-scale.js — 스케일 자

- 화면 오른쪽 세로 자. 로그 스케일. 구간: 은하들 — 은하수 — 태양계 — 달 — 지구 — 수면 — 해구.
- 지금 위치 표시 + 구간 클릭 = 그 단계로 이동 (sceneMgr 호출).
- 지구 장면에서는 **접혀 있고**(기존 UI 를 가리지 않는다), 우주·심해 장면에서 펼쳐진다.
- ⚠️ 폰트·색은 기존 칩(bn-n, layer chip) 문법을 따른다. 새 디자인 언어 금지.

### A3. 카탈로그 규율 — tools/validate_catalogs.py

- space-photos.json · sea-life.json · trenches.json 을 검사:
  필수 필드 존재 / **credit 비면 실패** / RA 0~360·Dec −90~90 / depthMin≤depthMax /
  ko·en 둘 다 존재.
- ⚠️ 이 스크립트가 실패하면 커밋하지 않는다. 크레딧 없는 사진 한 장이
  전체 신뢰를 무너뜨린다 (기획 문서 §1 의 라이선스 원칙).

---

## 3. 우주 (B)

### B0. 스파이크 — 반나절, 여기서 막히면 설계 재검토

1. `viewer.js` 카메라 상한을 2,000,000km 로 올리고 지구를 멀리서 볼 때
   지터·타일 오동작·별 배경 확인 (스크린샷 3장).
2. `Cesium.Transforms.computeIcrfToFixedMatrix(JulianDate)` 로 북극성 방향
   (RA 2h31m, Dec +89.26°)에 빌보드 1개 → 실제 북쪽 하늘과 일치하는지.
   ⚠️ 행렬이 undefined 를 돌려주는 시각이 있다(자료 미로드) — 폴백 필수.
3. 크로스페이드 프로토타입 + 발열: 전환 후 정지 상태에서 GPU 유휴 확인
   (기존 감사 방식 — 구형 폰 실측).

### B1·B2. 우주 사진 (첫 배포 단위)

**space-photos.json 스키마** (손 큐레이션 50장부터):

```json
{ "generated": "2026-08-07", "items": [{
  "id": "m16-pillars",
  "name": { "ko": "창조의 기둥", "en": "Pillars of Creation" },
  "ra": 274.70, "dec": -13.81,
  "telescope": "JWST",                  // "HST" | "JWST"
  "date": "2022-10-19",
  "distanceLy": 6500,                   // 모르면 null — 지어내지 않는다
  "thumb": "space/thumbs/m16.jpg",      // 우리 S3 캐시 256px
  "full": "https://...(원본 공식 페이지)",
  "credit": "NASA, ESA, CSA, STScI"     // ⚠️ 필수 — 없으면 validate 실패
}]}
```

**skyphotos.js**:
- 마커 = 지구 중심 반지름 300,000km 구면 위 빌보드. RA/Dec → ICRF → 지구고정 변환.
- ⚠️ 변환 갱신은 **onCameraIdle 1회** (viewer.js 에 이미 있는 훅 재사용).
  매 프레임 변환 금지 — 발열 규율.
- 카메라 거리 > 45,000km 에서만 표시 (그 아래에선 지구 UI 를 가리지 않는다).
- 클릭 → 기존 시트 틀: 큰 이미지 · 이름 · 망원경 · 촬영일 · 거리(있으면) · **크레딧** · 원본 링크.
- 망원경별 토글 2개(허블/JWST) — LAYER_DEFS 에 `hst`·`jwst` 추가, group:'space'.
- ⚠️ 썸네일은 우리 S3 에 캐시한다. STScI 핫링크 금지 (그쪽 서버 예의 + 우리 로딩 안정).

### B3. 태양계 장면

**kepler.js** — 순수 함수만. 네트워크 0.
- JPL 공식 문서 "Keplerian Elements for Approximate Positions of the Major Planets"
  (Standish) 의 8행성 궤도요소 + 세기당 변화율 상수를 그대로 옮긴다.
  ⚠️ 상수 출처 URL 을 파일 머리 주석에 적을 것. 숫자를 손으로 바꾸지 말 것.
- `planetPositions(date)` → 8행성 황도 좌표 {x,y,z}(AU).

**solarscene.js** — 2D Canvas 하나.
- 태양 + 행성 8 점 + 궤도 타원 8 + 이름표. Three.js 금지 — 점 9개에 WebGL 은 과하다.
- ⚠️ **정지 화면이다.** 시각이 바뀔 때만 다시 그린다. "행성 시간" 재생은
  태풍 타임라인 문법(스크러버+▶) 재사용, 재생 중에만 rAF, 멈추면 0 프레임.
- 크기 표기: 기본은 과장 + **"크기 과장됨" 라벨 상시**. "실제 크기 비율" 토글을
  켜면 전부 점이 된다 (그 자체가 교육 — 기획 §5).
- ⚠️ **완료 게이트: tools/verify_kepler.py** — Horizons API 로 8행성 × 4시점
  (오늘/+30일/+1년/2000-01-01) 대조, 황경 오차 1° 미만이면 통과.
  이 게이트를 통과하기 전에는 "실시간 위치"라는 말을 화면에 쓸 수 없다.

### B4. 은하 카드

- 상상도 2장 (큐레이션 — NASA/ESA 공식, 크레딧 확인) + "태양은 여기" 화살표.
- ⚠️ **"상상도 · (크레딧)" 라벨이 이미지 위에 상시.** 라벨 없으면 검수 탈락.
- 카드 본문은 i18n.STATIC 에 ko·en — 쉬운 말 원칙(숫자는 괄호).

---

## 4. 심해 (C)

### C0·C1. 수심 파이프라인 (첫 배포 단위)

**tools/build_depth_grid.py** (로컬 1회 실행):
- GEBCO 최신 격자(netCDF, 약 7GB — ⚠️ 내려받기 오래 걸림, 밤에 돌릴 것)를
  0.1° int16 격자(3600×1800, 약 13MB)로 축소해 S3 `ocean/depth-grid.bin` 업로드.
- ⚠️ 축소는 **셀 안 최솟값(최심)** 을 쓴다 — 평균을 쓰면 해구가 얕아진다.
  마리아나 셀이 6,000m 로 나오면 이 함정에 빠진 것이다.
- 검증: 마리아나(11.37N 142.59E ≈ −10,9xx) · 서해(37N 124E, 얕음) ·
  동해(38N 131E, 수천 m) 3점 대조를 스크립트가 출력할 것.

**aws/ocean-depth/handler.py** (deploy-lite + Function URL):
- 콜드 스타트에 격자를 S3 에서 읽어 메모리 유지, `?lat=&lon=` → 쌍선형 보간 수심.
- 응답에 해상도("약 11km 격자")와 출처("GEBCO Compilation Group") 명시.
- 가까운 해구(trenches.json 반경 내)면 trench 필드 포함 → D2 연장 구간 열쇠.
- ⚠️ Function URL 은 지금 계정 전체가 403 이다 (spot-air 에서 실측 —
  flight-track·celestrak-proxy 도 동일). **PD 가 콘솔에서 풀기 전까지는
  같은 증상이 날 것이다. 코드 문제로 오판하고 헤매지 말 것.**

### C2. 수심 기둥 장면 (divescene.js)

- 진입: ui.js 바다 지점 시트(isOcean 분기, ui.js:85 부근)에 "🤿 여기서 잠수" 버튼.
- 캔버스 세로 단면: 깊이별 배경색(밝음→검정, 1,000m 이후 완전 검정) +
  왼쪽 깊이 눈금 + 오른쪽 압력·빛 표시 + **그 지점 실제 수심에서 바닥**.
- 층 이름은 쉬운 말: 햇빛이 닿는 층(~200m) · 어스름한 층(200~1,000m) ·
  빛이 없는 층(1,000m~). 학술명은 괄호.
- 스크롤/드래그로 하강. ⚠️ 하강 중에만 그린다 — 멈추면 rAF 0.
- 비교 오브젝트: 지나칠 때 눈금 옆에 (예: 타이타닉 3,800m). trenches/비교값도
  data JSON 으로 — 코드에 숫자를 박지 않는다.

### C3. 생물 도감 (sea-life.json + sealife.js)

```json
{ "items": [{
  "id": "sperm-whale",
  "name": { "ko": "향유고래", "en": "Sperm whale" }, "sci": "Physeter macrocephalus",
  "group": "whale",                    // whale|fish|cephalopod|deep|glow
  "depthMin": 0, "depthMax": 2000,     // 문헌 잠수 범위 — 출처를 note 에
  "sizeM": 16,
  "thumb": "ocean/thumbs/sperm-whale.jpg",
  "credit": "…(필수)", "note": { "ko": "…", "en": "…" }
}]}
```

- 배치: 현재 깊이 창과 [depthMin, depthMax] 가 겹치는 종만 표시.
  가로 위치는 **종 id 해시로 고정** — ⚠️ Math.random 을 렌더에 쓰면
  스크롤할 때마다 생물이 순간이동한다.
- 클릭 → 시트: 사진 · 이름(국명+학명) · 잠수/서식 깊이 · 사람 실루엣 크기 비교 · 크레딧.
- ⚠️ 모든 생물 항목 밑에 작은 글씨 상시: "관측·문헌 기록 기반 — 이 자리에
  지금 있다는 뜻이 아닙니다".

### C4. 해구 + 우리 바다 카드

- trenches.json: 이름 ko/en · 좌표 · 최심부는 **범위**(min/max) · 출처.
  ⚠️ 챌린저 해연을 한 값으로 적으면 검수 탈락 — 측정마다 다르다(10,902~10,935m).
- 한국 카드(서해는 왜 얕은가 등) 수치는 **작성 시 출처 확인** — 기획 문서의
  수치도 확정이 아니라고 적어 두었다. 확인 못 하면 그 문장은 뺀다.

### C5. OBIS 연동 (마지막 — 스파이크 선행)

- ⚠️ api.obis.org 응답 크기·속도를 **먼저 실측**하고 설계를 확정한다
  (스파이크 없이 Lambda 부터 짜지 말 것). 방향: 주 1회 Lambda `obis-summary` 가
  5° 해역별 {기록 수, 상위 종} 을 S3 로 굽고, 잠수 씬은 그 요약만 읽는다.
- 화면 문구 필수: "이 해역 관측 기록 N건 (OBIS)" + **"기록 없음 ≠ 생물 없음"**.

---

## 5. 작업 순서와 완료 조건

| 주차 | 작업 | 완료 조건 (검수 기준) |
|---|---|---|
| 1 | **A1·A2 공통 + B0 스파이크** | 전환 데모, 배너가 장면 위에서 동작, B0 스크린샷 3장 + 발열 실측 |
| 2 | **B1·B2 우주 사진** → 배포 | 큐레이션 50장 validate 통과 · 마커 클릭→시트 · 크레딧 표기 · ko/en |
| 3 | **C0·C1·C2 수심 기둥** → 배포 | 3점 수심 대조 통과 · 서해/마리아나가 실제로 다르게 내려감 · 잠수 버튼 |
| 4 | **B3 태양계** | ⚠️ verify_kepler 8행성×4시점 통과 없이는 배포 불가 |
| 5 | **C3 생물 + B4·C4 카드·해구** | 사진 크레딧 전수 · "관측 기록" 문구 · 상상도 라벨 |
| 6 | **C5 OBIS + 메뉴·스케일 자 마감 + 발열 전수** | 정지 시 GPU 유휴 · 접힘 줄 동작 · 코치마크 1회만 |

각 주차 끝에 보고서 1개 — 무엇이 됐고, 무엇이 안 됐고, 스크린샷.
검수는 Claude 가 헤드리스 캡처로 한다 (지금까지 방식 그대로).

---

## 6. 이 저장소의 함정 (새로 오는 사람용 요약)

1. **requestRenderMode** — 뭔가 그렸는데 화면에 안 나오면 `power.animate(ms)`.
   반대로, 계속 그려지고 있으면 발열 버그다.
2. **store 상태 보존** — 장면이 바뀌어도 레이어 on/off 를 건드리지 않는다.
   접힘 줄은 표시만 접는 것이다.
3. **i18n** — 모든 새 문구는 ko·en 쌍. placeholder 는 `data-i18n-ph`.
   en 이 없으면 ko 를 그대로 내보낸다 (가짜 번역 금지).
4. **배포** — 빌드 없음. `aws s3 cp` + Content-Type 명시 + CloudFront 무효화.
   경로는 `/js/*` (앱이 루트에서 서빙된다 — `/app/*` 아님).
5. **Math.random 을 렌더 경로에 쓰지 않는다** — 날짜 시드(narrative)나 id 해시로.
6. **없는 것을 있다고 쓰지 않는다** — 이 문서의 모든 "⚠️ 문구 필수" 항목이 그것이다.
   문구를 빼면 기능이 완성돼도 검수에서 돌려보낸다.

## 7. 하지 않는 것 (재확인)

3D 물속/태양계 렌더링 · jwstapi.com 및 FishBase 런타임 의존 · 실시간 고래 ·
Gaia 항성 렌더링 · 무한 줌 · 유료 기능 연결 (전부 무료 — 받은 결정)
