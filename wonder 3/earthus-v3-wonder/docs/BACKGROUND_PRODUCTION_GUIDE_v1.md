# EARTHUS V3 WONDER — Background Asset Production / Integration Guide v1

## 1. 목적

`assets/background/`의 24개 배경을 NEW BUILD의 WONDER Environment Layer에서 사용한다.

배경은 화면을 통째로 교체하는 페이지가 아니라, 해당 지역에 진입했을 때 Paper Earth 위에 활성화되는 **2.5D Paper Environment**의 재료다.

## 2. 24개 구성

- World 1
- Korea 4: Seoul / Busan / Gyeongju / Jeju
- Atmosphere 3: Day / Sunset / Night
- Region 16: Himalaya / Tibet / Sahara / Savanna / Forest / Jungle / Ocean Shallow / Underwater / Island / Coast / Volcano / Desert Oasis / Grassland / Tundra / Canyon / Aurora

## 3. 반드시 유지할 UX

EARTH → REGION → Environment

지역 진입:
1. Paper layer unfold
2. 배경/환경 활성화
3. 작은 ambient motion
4. discovery 활성화
5. 캐릭터가 필요할 때만 표시

환경 배경을 별도의 무거운 페이지로 전환하지 않는다.

## 4. Motion

배경은 정적 이미지 + 가벼운 모션 레이어로 사용한다.

권장:
- cloud drift
- water shimmer
- foliage sway
- sand drift
- flag flutter
- small ambient particles

한 화면 동시 main motion 1개 + secondary 1~2개를 기본값으로 한다.

영상은 1차에서 사용하지 않는다.

## 5. Asset Loading

초기 부트 시 24개를 모두 받지 않는다.

- WORLD: boot/near boot
- REGION: region entry 시 load
- LOCAL/Story: 필요한 순간 load
- Story 종료/지역 이탈: 낮은 우선순위 asset unload
- 브라우저 Cache + immutable hash 사용

## 6. Production note

현재 제공된 24개는 **1차 AI-generated candidate asset**이다.
브라우저에서 직접 보여주는 최종 품질이 아니라, 새 Runtime의 배경 구조/톤/구성을 먼저 닫기 위한 production candidate다.

다음 production art pass에서 필요한 경우 개별 원본을 더 높은 해상도로 재생성한다.
원본 PNG를 덮어쓰거나 삭제하지 않는다.

## 7. Claude Code 적용

다음 작업을 한다.

1. `assets/background_manifest.json` 읽기
2. 24개 asset registry 등록
3. `background` type으로 분류
4. region/category metadata 연결
5. lazy-load adapter 연결
6. Paper Earth Environment layer와 연결
7. placeholder/fallback 처리
8. 24개 모두 실제 브라우저 선택 테스트
9. 모바일 375/390에서 crop 안전성 확인

## 8. 완료 기준

IMPLEMENTED:
- 24 assets registered

TESTED:
- manifest/schema valid
- paths valid
- all files readable

BROWSER VERIFIED:
- each background can be selected by region
- no UI/text/character overlay baked into the background layer
- environment transition works
- no console errors

DEVICE VERIFIED:
- 375px
- 390px
- desktop

## 9. 금지

- 배경 이미지 안에 캐릭터를 구워 넣지 않는다.
- 배경 이미지 안에 UI를 구워 넣지 않는다.
- 배경 이미지 안에 글자를 넣지 않는다.
- 전체 24개를 initial preload하지 않는다.
- 기존 V3 runtime을 복사해서 연결하지 않는다.
