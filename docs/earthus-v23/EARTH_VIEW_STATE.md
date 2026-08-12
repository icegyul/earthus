# PR-03 — Earth View State

> 구현일: 2026-08-12 KST
> 상태: **정적 운영 배포·대표 URL 검증 완료 / backend·TPW flag 전환 없음**
> 사용자 결과: 첫 방문의 아름다운 지구를 유지하면서 Style/Data/Evidence 상태를 공유·새로고침·뒤로가기로 복원

## 1. 범위

PR-03은 새 분석 화면이나 새 판단을 만들지 않는다. 기존 Cesium 지구, 레이어 메뉴, 선택 지점을
다음 의미 단계로 분리하고 URL을 정본으로 연결한다.

```text
Earth View → Style → Data → Evidence → Decision
```

- `Earth`: query 없는 첫 화면. 도시값·등치선·판독 패널을 자동으로 열지 않는다.
- `Style`: 사용자가 레이어 목록을 명시적으로 연 상태다.
- `Data`: 사용자가 고른 레이어와 선택 가능한 자료 시각·모델을 기억한다.
- `Evidence`: 레이어와 지점을 기억하고 원격자 값을 다시 읽는다.
- `Decision`: PR-05~09가 안전·활동·예약 화면을 붙일 계약만 정의한다. 판단값은 만들지 않는다.

PR-04의 공통 범례·도시값·등치선·지점 카드, PR-05 Safety, PR-07 Activity,
PR-09 Reservation은 이 PR의 URL/state 계약 위에 추가한다.

## 2. URL 계약

EARTHUS는 AETHERUS의 `view`, `at`, `target`과 충돌하지 않도록 접두어가 있는 키만 쓴다.

| 상태 | 예시 |
|---|---|
| Earth | `/` |
| Style | `?earth=1&earthView=style` |
| Data | `?earth=1&earthView=data&earthLayer=temp` |
| Data + 시각/모델 | `?earth=1&earthView=data&earthLayer=temp&earthAt=2026-08-12T12:00:00Z&earthModel=noaa-gfs` |
| Evidence | `?earth=1&earthView=evidence&earthLayer=temp&earthPoint=37.57,126.98` |
| Decision | `?earth=1&earthView=decision&earthActivity=baseball` 또는 `earthReservation=<stable-id>` |

규칙:

- URL 버전은 `earth=1`이다. 미지원 버전은 Earth로 낮춘다.
- Data/Evidence에는 실제로 열 수 있는 `earthLayer`가 필요하다.
- Evidence에는 유효한 위도·경도가 필요하며 URL에는 소수점 둘째 자리, 약 1km까지만 쓴다.
- 자료 시각은 초 단위 UTC ISO 8601만 받고 2000~2100 범위 밖은 거부한다.
- ID는 소문자 영숫자와 `_.:-`만 허용하고 80자를 넘기지 않는다.
- EARTHUS 상태를 쓸 때 AETHERUS·해구 route 키를 제거한다. Earth 키를 지울 때는 다른 서비스
  route를 건드리지 않는다.
- 수동으로 route가 섞인 주소는 `해구 dive/ocean → 명시 Earth → AETHERUS` 우선순위로 하나만
  복원하고 나머지 키를 걷어 두 장면 복원기가 경쟁하지 않게 한다.
- `TPW_READY=false`처럼 UI에서 열 수 없는 레이어는 공유 URL로도 우회하지 못한다.

## 3. 뒤로가기 계약

- Earth→Style→Data→Evidence처럼 의미 단계가 바뀔 때만 history 한 칸을 추가한다.
- 같은 Data 단계에서 레이어·시각·모델만 바뀌거나 같은 Evidence에서 지점만 바뀌면 현재 칸을
  교체한다. 지도를 누를 때마다 뒤로가기 수십 칸이 쌓이지 않는다.
- Evidence 뒤로가기는 Data와 같은 레이어를 복원한다.
- Data 뒤로가기는 Style을 열고 Data 레이어를 기본 Earth 레이어로 되돌린다.
- Style 뒤로가기는 query 없는 Earth와 닫힌 메뉴를 복원한다.
- Data 상태에서 레이어 메뉴만 닫는 행동은 Data를 닫는 행동으로 해석하지 않는다.
- `전지구로`는 선택·레이어·URL을 기본 Earth로 되돌린다.

## 4. 잘못된 URL과 결측

잘못된 URL로 빈 화면을 만들지 않는다.

| 문제 | 복원 |
|---|---|
| 미지원 버전·잘못된 view | Earth |
| Data에 layer 없음/사용 불가 | Style |
| Evidence에 point 없음 | Data |
| Decision에 activity/reservation 없음 | Evidence/Data/Earth 중 가능한 직전 단계 |

낮춰진 이유는 `issues`와 `[earth-route]` 경고에 남긴다. 값이 없는 Evidence는 이전 지점 값을
남기지 않고 `sourceNote` 지점 값을 `null`로 지운다.

## 5. 구현 파일

- `prototype/js/earth-route-state.js`: URL decode/encode/validation/version
- `prototype/js/earth-view-state.js`: store·menu·scene·history 복원
- `prototype/js/store.js`: 저장하지 않는 `earthView` 상태와 구독 이벤트
- `prototype/js/layerbar.js`: Style 열기/닫기, layer/preset intent, 잠금 확인
- `prototype/js/main.js`: 부팅·AETHERUS route 분리·지점 Evidence·전지구 초기화
- `tools/test_earth_route_state.mjs`: URL 계약 11개

기존 TPW, source writer, canonical/governance shadow, AETHERUS 장면 구현은 바꾸지 않는다.

## 6. 2026-08-12 검증 증거

자동:

- 변경 JS 5개 `node --check` 통과
- Earth route contract 11/11 통과
- TPW grid math 통과
- Signal Foundation 12/12 통과
- Rights/Freshness replay 20/20 통과
- 카탈로그 50/41/10/2/8/13/2 통과
- Kepler 8행성×4시각, Voyager 2개 통과
- AETHERUS foundation v3 13 route, astronomy 5 route/privacy, photo ownership 통과

실제 로컬 화면:

- 기본 `/`: `data-earth-view=earth`, 메뉴 닫힘, 지구 장면 유지, 새 warning/error 0
- Style: `?earth=1&earthView=style`, 레이어 2단 열림
- 기온 Data: `?earth=1&earthView=data&earthLayer=temp`, 기온 레이어와 출처 표시
- 지점 Evidence: `earthPoint=26.79,136.31`, 원격자 `26.7°C` 표시
- Evidence 새로고침: 같은 URL·view·원격자·출처 복원
- 뒤로/앞으로: Earth↔Style↔Data↔Evidence 각 단계와 메뉴/레이어 복원
- 390×844: query 없는 Earth와 기온 Data 공유 URL 복원, 새 error 0
- `TPW_READY=false` 직접 Data URL: Style로 낮춤, NOAA 구름 유지,
  `UNAVAILABLE_LAYER` 근거 경고
- 혼합 route: Earth+AETHERUS는 Earth Data와 정리된 Earth URL, Earth+ocean은 trench stage와
  `?ocean=1`만 복원, console error 0

동시에 진행 중인 AETHERUS `route-state.js`가 이 검증 중 v2→v3으로 변경돼 처음에는 기존
v2 시험 기대값과 어긋났지만, AETHERUS 작업이 v3 시험을 같은 revision으로 갱신한 뒤
foundation·astronomy·photo ownership을 모두 다시 통과했다. PR-03은 해당 파일과 시험을
수정하지 않았다.

## 7. 운영 배포와 남은 gate

2026-08-12 PD의 직접 지시로 정적 파일은 S3·CloudFront에 배포했다. 자세한 해시·URL·rollback
증거는 `RELEASE-2026-08-12-PR00A-03.md`가 정본이다. PR-01/02 backend와 TPW flag는 전환하지 않았다.

남은 검증:

1. EARTHUS/AETHERUS/해구 대표 URL의 실제 화면 상호 배제 확인
2. 430×932, 768×1024, 1280×720, 1440×900 추가 실제 화면
3. Safari/Chrome과 실제 구형 iPhone 뒤로가기·새로고침
4. Data/Evidence on/off 뒤 timer/network/render owner 0 확인
5. 실제 rollback 복구 rehearsal과 RTO 기록

완료한 운영 검증:

- `main.js`, `store.js`, `layerbar.js`를 다른 작업과 충돌 없이 커밋 `3c797f4`에 선택 병합
- `index.html` main 및 main→layerbar cache revision을 `20260812-earthview1`로 통일
- 배포 파일 15개의 운영 SHA-256과 로컬 일치, 신규 모듈 Content-Type/no-cache 확인
- Earth/Style/Data/Evidence, 뒤로/앞으로, AETHERUS 화성, 해구, 혼합 route, TPW 잠금 확인
- CloudFront 무효화 조회 권한은 없지만 cache-busting 응답과 파일 해시로 실제 반영 확인

rollback은 `main.js`의 controller 연결과 store/layerbar intent hunk를 제거하고 신규 두 모듈을
배포 대상에서 제외한다. URL을 읽는 코드가 사라져도 기존 query 없는 Earth 화면은 유지된다.
