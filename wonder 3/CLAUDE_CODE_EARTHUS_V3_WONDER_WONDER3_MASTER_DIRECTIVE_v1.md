# EARTHUS V3 WONDER — Claude Code Master Development Directive v1.0

## 0. NEW BUILD ROOT — ABSOLUTE

작업 루트:

`D:\## APP\EARTHUS v2_APP\wonder 3`

이 폴더는 **EARTHUS V3 WONDER 신규 개발 전용 루트**다.

### 절대 원칙

- 기존 EARTHUS V3를 수정해서 이어가지 않는다.
- 기존 `v3-paper`, `v3-kids` 코드를 새 제품의 기반으로 복사하지 않는다.
- `wonder 3`는 새로운 프로젝트/아키텍처로 구축한다.
- 기존 V1/V2/Simulation/DAMC/AETHERUS 및 공용 AWS/DB를 절대 삭제하지 않는다.
- 기존 자산은 승인된 경우에만 새 프로젝트의 콘텐츠 원본으로 재사용한다.
- 기존 코드/데이터/API는 “참고 또는 재사용 후보”일 뿐 새 제품의 구조를 결정하지 않는다.

---

# 1. PRODUCT IDENTITY

제품명:

**EARTHUS V3 WONDER**

대상:
- 4~9세
- 어린이 중심
- 부모 동반 사용 고려

핵심 정의:

> **아이의 손길로 지구가 살아나는 2.5D Paper Wonder Earth.**

V3는 게임도 아니고 데이터 대시보드도 아니다.

핵심 경험:

`발견 → 터치 → 살아남 → 탐험 → 캐릭터 반응 → 이야기 → 다시 지구`

---

# 2. VISUAL DIRECTION

## 2.1 Paper Earth

지구 자체는 **2.5D Paper Earth**다.

참고 기준:
- 사용자가 승인한 Paper Earth 이미지
- paper-cut / layered paper / collage
- 실제 지리적 대륙 배치
- 실제 지구의 둥근 구형
- 따뜻한 자연색
- 고급 그림책 / 자연사 박물관 / 탐험책 느낌

금지:
- 중국풍 장식/UI
- 과도한 게임 UI
- 지나치게 유치한 장난감 렌더
- 지구를 평면 지도처럼 보이게 하는 연출

## 2.2 Globe

지구는 화면의 주인공이어야 한다.

목표 크기:
- Desktop: 약 720px
- Laptop: 약 660px
- Tablet: 약 580px
- Mobile: 약 350px

반드시:
- 회전
- 줌
- inertia
- touch/pinch
- 실제 구면 좌표
- 캐릭터가 지구 뒤로 돌아가는 깊이감
- region/country/local navigation

---

# 3. WORLD LOD

줌에 따라 세계가 단계적으로 펼쳐진다.

```text
WORLD
  ↓
REGION
  ↓
COUNTRY
  ↓
LOCAL
  ↓
WONDER POI
  ↓
CHARACTER / STORY
```

Region 예:
- East Asia
- Europe
- North Africa
- South Asia
- Southeast Asia
- North America
- South America
- Oceania
- Polar

지명을 화면 전체에 항상 표시하지 않는다.

필요한 위치/줌에서만 자연스럽게 나타난다.

---

# 4. BORDER / COASTLINE

기본값:

```text
Country Border = OFF
Coastline = OFF
Province = OFF
```

사용자가 메뉴에서 켜면:

- 흰색
- 얇음
- Glow
- 구면 표면에 부착
- 줌에 따라 상세도 증가

동작:

```text
OFF
 ↓
toggle ON
 ↓
soft fade-in
 ↓
white glow line
```

모든 데이터를 초기 로딩하지 않는다.

LOD + lazy loading.

---

# 5. KOREA SPECIAL LOD

한국은 일반 국가보다 훨씬 자세하게 만든다.

```text
WORLD
 ↓
EAST ASIA
 ↓
SOUTH KOREA
 ↓
PROVINCE / CITY
 ↓
TOURISM
 ↓
WONDER
 ↓
CHARACTER
 ↓
STORY
```

한국은 관광 데이터가 중요한 핵심 영역이다.

가능한 콘텐츠:
- 서울
- 부산
- 경주
- 제주
- 주요 자연경관
- 문화유산
- 관광지
- 설화 장소
- Wonder POI

외부 데이터의 권리/상업 사용 상태는 반드시 metadata로 관리한다.

---

# 6. WONDER ENVIRONMENT ENGINE

지역 화면은 정적 배경 이미지 한 장으로 끝내지 않는다.

```text
Environment
├─ Base Paper Layers
├─ Unfold
├─ Ambient Motion
├─ Discovery
├─ Landmark
├─ Local Character
└─ Story Link
```

핵심 연출:

> **접힌 종이가 펼쳐지면서 지역이 살아난다.**

예:

### Sahara
- 종이 모래언덕 unfold
- 낙타가 짧게 걷기
- 바람
- 모래 흐름
- 구름 이동

### Himalaya / Tibet
- 종이 산맥 unfold
- 구름 이동
- 깃발 흔들림
- 작은 동물의 미세한 움직임

### Ocean
- 물결
- 물고기
- 기포

### Forest
- 잎 흔들림
- 빛
- 작은 동물 움직임

---

# 7. MOTION POLICY

핵심은 “많이 움직이는 화면”이 아니다.

> **평소에는 조용하고, 아이가 만졌을 때 살아난다.**

### Ambient Motion Budget

동시에:
- Main motion 1개
- Secondary motion 1~2개

정도만 허용.

캐릭터가 선택되면:

```text
Character Focus
environment motion ≈ 20~30%
character = primary
```

Story 화면:

```text
ambient motion = minimal
```

### 반복 정책

지역 첫 방문:
- full unfold

재방문:
- short subtle unfold

이미 방문:
- navigation-only transition

무한 반복 GIF처럼 만들지 않는다.

### Accessibility

`prefers-reduced-motion` 지원.

장식용 motion은 줄이거나 중지 가능해야 한다.

---

# 8. DISCOVERY ENGINE

아이의 호기심을 만드는 시스템.

환경 오브젝트도 눌러볼 수 있게 한다.

예:

```text
Sand
 → Footprint

Rock
 → Hidden object

Tree
 → Fruit

Cloud
 → Moves

Water
 → Fish appears
```

Discovery 종류:
- one-shot
- repeatable
- chain
- story unlock

핵심:

> “누르세요”가 아니라 “여기 뭔가 있나?”라는 느낌.

---

# 9. CATEGORY WORLD STATE

V3의 3대 핵심 카테고리:

```text
전체       124
설화        43
공룡/선사   40
동물        41
```

카테고리 선택은 단순 필터가 아니라 **World State**다.

### 설화
- 설화 캐릭터만 활성화
- 설화 관련 Wonder 환경 우선
- 설화 Story 우선

### 공룡/선사
- 공룡/선사 캐릭터만 활성화
- 고생대/중생대 관련 환경
- 고생물 Story

### 동물
- 동물 캐릭터만 활성화
- 자연환경
- 생태 Story

다른 카테고리 캐릭터를 동시에 노출하지 않는다.

---

# 10. CHARACTER RUNTIME

기존 승인 캐릭터 디자인을 재사용할 수 있다.

하지만 새 Runtime을 만든다.

필요:
- character registry
- world coordinate
- region
- category
- LOD
- thumbnail
- runtime
- interaction
- story link

캐릭터 124종을 모두 하나의 initial load에 올리지 않는다.

---

# 11. CHARACTER INTERACTION

기존 “tap → jump” 중심 구조를 반복하지 않는다.

공통 interaction:
- wave
- point
- nod
- look
- surprise
- happy
- wiggle
- hide

개별 special action:
- character-specific
- playful
- safe
- repeatable/randomized

예:
- 일부 캐릭터: fart_playful
- 일부 캐릭터: splash
- 일부: fly
- 일부: roll
- 일부: hide
- 일부: special gesture

### 중요한 원칙

124종 모두 똑같은 반응을 사용하지 않는다.

각 캐릭터:
- common reactions
- personality
- unique special action

을 조합한다.

---

# 12. CHARACTER ASSET REALITY CHECK

현재 단일 full-body PNG만 있는 캐릭터는 그것만으로 정교한 관절 애니메이션을 “완성”했다고 주장하지 않는다.

진짜 limb animation이 필요한 경우:

```text
head
body
arm_L
arm_R
leg_L
leg_R
tail / wing / fin / prop
```

등 semantic parts를 만들고 `rig.json`에 연결한다.

가능하면:
- parts atlas
- pivot
- rig
- animation preset

구조로 제작한다.

단순 캐릭터는 full-body/sprite fallback을 허용한다.

---

# 13. STORY ENGINE

캐릭터 반응 이후 Story Card가 열린다.

```text
Character Tap
 ↓
Reaction
 ↓
Story Card
```

Story Card:
- character
- location
- hero image
- scene image
- title
- short body
- PLAY
- close
- EARTH return

1차는 텍스트 읽기.

2차:
- AI narration
- audio
- ComfyUI video
- richer scenes

---

# 14. STORY ASSET

각 Story는 다음과 연결한다.

```text
Character
+
Location
+
Background Scene
+
Story Text
+
Future Audio
+
Future Video
```

1차:
- static image
- readable text

2차:
- ComfyUI video
- AI narrator

스토리 데이터에는 향후 확장 필드를 미리 둔다:

```text
storyId
characterId
locationId
title
body
heroImage
sceneImages[]
narrationScript
audioUrl
videoUrl
```

---

# 15. RETURN TO EARTH

단순 Back 버튼이 아니다.

지역/Story에서 EARTH를 누르면:

```text
Story
 ↓
Environment
 ↓
Paper folds
 ↓
Camera pulls back
 ↓
Region shrinks
 ↓
Paper Earth
```

단계별 Back:
- Story → Environment
- Environment → Region
- Region → Earth

상단에는 최소 `EARTH` 복귀 경로를 항상 제공한다.

---

# 16. ASSET REGISTRY / STREAMING

콘텐츠가 124 → 500 → 1,000+으로 늘어나도 앱이 비대해지지 않도록 한다.

구조:

```text
App Core
 ↓
Asset Registry
 ↓
CDN
 ↓
Region Pack
 ↓
Lazy Load
 ↓
Cache
 ↓
Unload
```

Asset metadata:
- id
- type
- category
- region
- LOD
- URL
- byte size
- version
- hash
- license
- priority
- dependency

---

# 17. ASSET LOD

```text
LOD0 = metadata
LOD1 = thumbnail
LOD2 = runtime
LOD3 = interaction
LOD4 = story
LOD5 = video/audio
```

초기:
- LOD0/LOD1

지역:
- LOD2

터치:
- LOD3

Story:
- LOD4

Video/Voice:
- LOD5

---

# 18. CACHE / MEMORY

기본 기능:
- request dedupe
- AbortController
- priority queue
- LRU
- unload
- memory budget
- retry
- fallback
- stale handling

권장 설계 목표:
- 초기 resident memory 최소화
- video는 streaming
- off-screen motion 정지
- 현재 region 외 asset unload

숫자는 device tier에 맞춰 조정하고 hard-coded universal limit로 만들지 않는다.

---

# 19. PERFORMANCE

기존 V3 감사에서 cold load 및 대용량 character/terrain assets가 병목으로 확인되었으므로 새 프로젝트에서는:

- 124개 character initial load 금지
- disabled layer preload 금지
- giant JSON 초기 fetch 금지
- PNG 일괄 로딩 금지
- content hashing
- immutable cache
- region chunking
- viewport culling
- lazy Story
- video streaming

을 기본값으로 한다.

성능 목표는 반드시 실제 측정한다.

---

# 20. WONDER LANDMARK ENGINE

지구 전체를 고해상도 3D로 만들지 않는다.

가벼운 Paper Earth 위에 대표 Wonder를 얹는다.

예:
- Tibet / Himalaya
- Sahara
- Taj Mahal
- Australian desert / Uluru region
- Great Barrier Reef
- Amazon
- Arctic
- Galápagos
- Volcano regions
- Korea landmarks

랜드마크는:
- paper illustration
- small 2.5D object
- lightweight WebP/sprite
- optional micro-motion

실제 3D 건물 다수를 상시 렌더링하지 않는다.

---

# 21. EXISTING V1 HOBBY

보존 대상:
- 철새 추적
- 거북이 추적
- 기타 기존 Hobby 기능

단, 메인 WONDER 경험을 복잡하게 만들지 않는다.

새 구조:

```text
WONDER
생물 탐험
  ├─ 철새 추적
  ├─ 거북이 추적
  └─ 기존 Hobby
```

외부 데이터는:
- source
- license
- commercial
- derivative
- redistribution
- attribution

상태를 관리한다.

권리 불명확/상업 이용 불가 데이터는 Premium 상품으로 가공하지 않는다.

---

# 22. AI / WONDER TALK

Premium 핵심 기능:

> **WONDER TALK**

무료:
- 정해진 캐릭터 반응
- 기본 대사

Premium:
- AI 캐릭터 대화
- 질문/답변
- 탐험 힌트
- 캐릭터가 아이에게 질문
- Story 연결

---

# 23. GEMINI-FIRST AI GATEWAY

현재 주력 provider:
**Gemini**

하지만 Gemini SDK를 제품 전체에 직접 넣지 않는다.

```text
Child
 ↓
EARTHUS AI Gateway
 ↓
Provider Router
 ↓
Gemini
```

향후 다른 LLM으로 교체 가능해야 한다.

AI Gateway 기능:
- auth
- entitlement
- rate limit
- model routing
- prompt assembly
- safety
- usage control
- cost control
- logging
- timeout
- fallback

---

# 24. CHARACTER PERSONA

124개 캐릭터마다 모델을 만들지 않는다.

공통 LLM + Persona.

```json
{
  "characterId": "yeti",
  "personality": "gentle, curious",
  "speechStyle": "friendly",
  "ageLevel": "4-6",
  "region": "himalaya",
  "knowledgePack": "approved-yeti",
  "storyLinks": []
}
```

---

# 25. AI KNOWLEDGE GUARD

AI가 사실을 임의 생성하지 않도록 한다.

```text
Approved Knowledge
 ↓
Prompt Assembly
 ↓
Gemini
 ↓
Safety / Truth Guard
 ↓
Character Response
```

설화:
- 전승/이야기

과학:
- fact/uncertainty

를 구분한다.

---

# 26. CHILD SAFETY

필수:
- age-appropriate output
- no sexual content
- no self-harm content
- no dangerous instructions
- no personal-data solicitation
- no dependency/manipulation
- no child profiling beyond required product function
- prompt injection defense
- rate limit
- parent controls

AI가 아이에게 개인정보를 요구하지 않도록 한다.

---

# 27. PREMIUM MODEL

## FREE

- Paper Earth
- basic Wonder
- basic region
- basic characters
- basic interactions
- basic Story
- approved existing Hobby
- basic Wonder Book

## WONDER+

- WONDER TALK
- AI conversation
- voice conversation
- premium character interactions
- premium story
- premium Wonder Packs
- AI narration
- parent/family features
- continued premium content

원칙:

> **FREE = 발견**
>
> **WONDER+ = 교감 + 깊이 + 지속 콘텐츠**

기존 철새/거북이 데이터의 상업 이용권한이 불명확한 경우 Premium 상품으로 재가공하지 않는다.

---

# 28. NO ADS FOR CHILD EXPERIENCE

어린이 핵심 화면에는 광고를 넣지 않는다.

구독 유도:
- 과도한 팝업 금지
- 아이 화면에서 결제 압박 금지
- 부모 영역에서만 관리

---

# 29. WONDER BOOK

발견한 콘텐츠 기록:

- character
- region
- discovery
- story
- visited place

게임식 경쟁보다 그림책/스티커북 느낌으로 만든다.

문구:

> “아직 발견하지 않은 지구가 있어요.”

---

# 30. RESPONSIVE

반드시 검증:
- 1440
- 1024
- 390
- 375

필수:
- touch/pinch
- safe area
- reduced motion
- keyboard fallback where appropriate

---

# 31. NEW REPOSITORY STRUCTURE

권장:

```text
wonder 3/
├─ apps/
│  └─ web/
├─ packages/
│  ├─ globe-engine/
│  ├─ world-lod/
│  ├─ wonder-environment/
│  ├─ wonder-discovery/
│  ├─ character-engine/
│  ├─ story-engine/
│  ├─ asset-runtime/
│  ├─ asset-registry/
│  ├─ ai-gateway/
│  ├─ child-safety/
│  └─ shared/
├─ content/
│  ├─ registry/
│  ├─ characters/
│  ├─ environments/
│  ├─ landmarks/
│  ├─ stories/
│  ├─ discoveries/
│  └─ packs/
├─ tests/
├─ docs/
└─ scripts/
```

실제 프레임워크는 audit 후 결정하되 architecture boundary는 유지한다.

---

# 32. DEVELOPMENT ORDER

## PHASE 0 — Read-only Audit

기존 V1/V3와 새 작업 폴더를 먼저 조사.

결과:
- legacy asset inventory
- legacy feature inventory
- hobby inventory
- data/API inventory
- license inventory
- AWS/deploy inventory
- new build gap list

**코드 수정 금지.**

---

## PHASE 1 — Paper Earth

먼저:
- Globe
- camera
- rotation
- zoom
- touch
- earth return

완성.

---

## PHASE 2 — LOD / Lines

- World
- Region
- Country
- Local
- Border
- Coastline
- Glow

---

## PHASE 3 — Asset Runtime

- Registry
- Streaming
- cache
- unload
- budget
- manifest
- hashed assets

---

## PHASE 4 — Environment

- paper unfold
- ambient motion
- motion budget
- region pack

---

## PHASE 5 — Discovery

- discoverable objects
- hidden reactions
- one-shot
- repeatable
- story unlock

---

## PHASE 6 — Characters

대표 3종으로 먼저:
- 1 folklore
- 1 dinosaur
- 1 animal

Golden Path를 만든다.

그 후 124로 확대.

---

## PHASE 7 — Character Interaction

반드시 실제 브라우저 검증:
- wave
- point
- special
- repeated tap
- animation end
- no stuck state

---

## PHASE 8 — Story

- Story Card
- image
- text
- Play
- close
- Earth return

---

## PHASE 9 — Category Worlds

- 전체
- 설화
- 공룡
- 동물

각각 실제 표시/숨김 검증.

---

## PHASE 10 — Korea

- Korea LOD
- province/city
- tourism
- Wonder POI
- character anchors

---

## PHASE 11 — Existing Hobby

- migratory bird
- turtle
- other retained Hobby
- license states

---

## PHASE 12 — AI

- AI Gateway
- Gemini
- Persona
- knowledge guard
- safety
- text chat
- entitlement

---

## PHASE 13 — Premium

- WONDER+
- parent area
- usage limits
- account entitlement

---

## PHASE 14 — Scale

Test:
- 124
- 250
- 500
- 1,000 synthetic assets

검증:
- memory
- network
- cache
- unload
- navigation loops

---

## PHASE 15 — Production Verification

필수:
- build PASS
- tests PASS
- browser PASS
- mobile PASS
- slow network PASS
- reduced motion PASS
- repeated navigation PASS
- no memory growth
- no stale cache collision

---

# 33. GOLDEN PATH — 최종 합격 시나리오

반드시 실제 브라우저에서 처음부터 끝까지 성공해야 한다.

```text
🌍 Paper Earth
 ↓
East Asia
 ↓
Korea / Sahara / Himalaya
 ↓
Paper Environment Unfold
 ↓
small motion
 ↓
Character discovered
 ↓
Tap
 ↓
real individual reaction
 ↓
Story Card
 ↓
Scene Image
 ↓
Text Story
 ↓
EARTH
 ↓
Paper folds / camera pulls back
 ↓
Paper Earth
```

추후:
```text
Story
 ↓
AI Narrator
 ↓
Video
 ↓
WONDER TALK
```

---

# 34. DONE의 의미

다음 네 단계를 모두 통과해야 한다.

1. Implemented
2. Automated Tested
3. Browser Verified
4. Device Verified

문서에 “완료”라고 쓰기 전에 실제 증거를 남긴다.

“구현 예정”, “구조만 존재”, “fallback”, “실제 검증 완료”를 절대로 섞지 않는다.

---

# 35. FIRST COMMAND TO CLAUDE CODE

현재 폴더:

`D:\## APP\EARTHUS v2_APP\wonder 3`

에서 시작한다.

첫 작업은:

> **READ-ONLY AUDIT ONLY.**
>
> 기존 V3를 수정하지 마라.
> 기존 V3를 삭제하지 마라.
> AWS를 삭제하지 마라.
> 먼저 현재 `wonder 3`의 파일, 압축 패키지, 문서, 자산을 inventory하고,
> 기존 V1/V3/배포/AWS와 무엇을 재사용하고 무엇을 새로 만드는지 보고하라.
>
> Audit 결과를 제출한 뒤 승인된 개발 순서에 따라 NEW BUILD를 시작하라.

---

# 36. LEGACY AWS CLEANUP RULE

AWS legacy V3를 제거할 필요가 있는 경우에도:

```text
READ-ONLY DISCOVERY
 ↓
RESOURCE IDENTIFICATION
 ↓
BACKUP/INVENTORY
 ↓
USER-APPROVED DELETE
 ↓
VERIFY
```

순서로 한다.

삭제 금지:
- V1
- V2
- Simulation
- DAMC
- AETHERUS
- shared AWS
- shared DB
- unknown buckets
- unknown CloudFront
- entire Route53 zone

기존 V3 전용 리소스만 별도 확인 후 제거한다.

---

# 37. FINAL PRODUCT PRINCIPLE

EARTHUS V3 WONDER는:

> **지구를 보는 앱이 아니라,
> 만지면 살아나는 지구다.**

무료:
> 발견한다.

Premium:
> 대화하고 더 깊이 알아간다.

기술:
> 필요한 순간에만 에셋을 불러온다.

콘텐츠:
> 계속 추가할 수 있다.

아키텍처:
> 기존 V3와 분리된 NEW BUILD.

최종 경험:

```text
🌍
 ↓
👆
✨
🔎
🐾
😄
📖
💬
🌍
```
