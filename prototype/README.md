# earthus 프로토타입

인수인계 문서 §5-9(2-state UI) / §5-10(핀 노출 규칙) / §5-1(레이어 아키텍처) 검증용.
**AWS 계정 없이 그대로 돌아갑니다.**

## 실행

```bash
cd prototype && python3 devserver.py 8787
```

→ http://localhost:8787

Cesium 1.143.0 과 satellite.js 6.0.2 는 CDN에서 받습니다. 빌드 과정 없음.

> ⚠️ **`python3 -m http.server` 를 쓰지 마세요.** ES 모듈이 브라우저에 캐시되어
> 코드를 고쳐도 이전 버전이 계속 돕니다 (증상: 새 레이어가 안 보임, 고친 버그가 재현됨).
> `devserver.py` 는 `Cache-Control: no-store` 를 보내고 `Last-Modified` 를 제거해 이 문제를 없앱니다.
> 이미 캐시가 끼었다면 **포트를 바꿔서** 실행하면 즉시 해결됩니다 (`python3 devserver.py 8799`).

## 좌상단 HUD

`고도 / 상태 / 표시핀 / API 상태` 와 전지구·국가·시도 점프 버튼.
`숨김` 으로 접을 수 있습니다. 개발용이라 출시 빌드에선 제거.

## 지금 실제로 동작하는 것

| 기능 | 데이터 | 상태 |
|---|---|---|
| 지구본 (Blue Marble + 야간 불빛 + 대기광 + 주야 경계) | NASA GIBS | ✅ |
| 2-state 전환 (Ambient ↔ Explore) | — | ✅ |
| 줌 임계 핀 노출 (1,500km / 500km) + 클러스터링 | — | ✅ |
| 지진 (2분 갱신, 규모별 크기·색, 6.5+ 전지구 노출) | USGS | ✅ |
| 기상 — 지점 탭 시 현재값 + 7일 예보 | Open-Meteo (GFS/ECMWF) | ✅ |
| 바람 방향 화살표 (뷰포트 격자) | Open-Meteo | ✅ |
| 로켓 발사 (15분 갱신, D-24h 전지구 노출, 중계 링크) | Launch Library 2 | ✅ |
| 위성 궤도 (SGP4 실시간 전파, ISS 궤적) | CelesTrak TLE | ✅ |
| 오로라 확률 (5분 갱신) | NOAA SWPC OVATION | ✅ |
| 기온 래스터 | NASA AIRS | ✅ |
| 화산 | 정적 30개 | ✅ |
| 명소 POI (뷰포트 기반 로딩) | OpenStreetMap Overpass | ✅ |
| 다국어 (한/영) + 온도 단위 분리 | — | ✅ |
| 무료/구독 티어 게이팅 | — | ✅ (설정에서 전환) |

## 아직 안 되는 것 — 연결 지점만 있음

칩이 점선/흐리게 표시되고, 누르면 사유가 토스트로 뜹니다.

| 레이어 | 막힌 이유 |
|---|---|
| 해양 부이 (NDBC) | CORS 차단 → **서버 프록시 필요** |
| 이벤트 뉴스 (GDELT) | CORS 차단 + rate limit → **서버 프록시 필요** |
| 해양 쓰레기 (CYGNSS) | PO.DAAC 가공 필요 → **서버 처리 필요** |
| 야생동물 (Movebank) | 연구자 계정 인증 필요 |
| 항공기 / 선박 | 유료 API (§4-10, Phase 2) |
| 예약·예매 | 제휴 계정 필요 — 명소 시트에 버튼만 있음 |
| 구독 결제 | Apple/Google 개발자 계정 필요 — 티어 전환은 로컬 토글로 대체 |

## 구조

```
prototype/
  index.html          화면 골격
  css/app.css         전체 스타일
  js/
    config.js         임계값·엔드포인트·레이어 정의·티어   ← 튜닝은 대부분 여기
    store.js          상태(티어/레이어/카메라) + 이벤트
    i18n.js           한/영 + 온도 단위
    viewer.js         Cesium 초기화, 리빙어스 룩, GIBS 프로바이더
    ui.js             Ambient 크롬 / 칩 / 시트 / 설정 / HUD
    main.js           진입점, 픽 핸들러
    layers/
      registry.js     레이어 생명주기·갱신 타이머
      pointLayer.js   점 레이어 공통 (클러스터·줌 임계)
      imagery.js      면 레이어 + 오로라 캔버스
      hazard.js       지진·화산
      space.js        로켓 발사·위성 궤도
      weather.js      Open-Meteo·바람 화살표
      travel.js       POI
```

## 개발 중 알아낸 것 (다시 밟지 말 것)

### 1. GIBS 는 반드시 EPSG:3857 을 써야 한다 ⚠️
GIBS 의 EPSG:4326 타일 격자는 `2×1 → 3×2 → 5×3 → 10×5 …` 로,
Cesium 의 `GeographicTilingScheme`(2→4→8→16)과 **어긋난다.**
레벨 0 만 우연히 맞아서 전지구 뷰는 그려지고, 확대하면 전부
`400 TileOutOfRange` 가 나며 지구가 검게 죽는다. 원인 찾기 매우 어려움.

→ `epsg3857/best` + `GoogleMapsCompatible_LevelN` + `WebMercatorTilingScheme` + 256px 타일.

레이어별 매트릭스셋 (GetCapabilities 확인, 2026-07-26):

| 레이어 | 매트릭스셋 | 포맷 | 시간축 |
|---|---|---|---|
| BlueMarble_ShadedRelief_Bathymetry | Level8 | jpeg | 없음 |
| VIIRS_CityLights_2012 | Level8 | jpeg | 없음 |
| MODIS_*_Cloud_Fraction_Day | Level6 | png | 일 단위 |
| AIRS_L2_Surface_Air_Temperature_Day | Level6 | png | 일 단위 |
| *_CorrectedReflectance_TrueColor | Level9 | jpeg | 일 단위 |

시간축 레이어는 **D-1** 을 쓰는 게 안전 (당일치는 처리 지연).

### 2. `lightingFadeOutDistance < lightingFadeInDistance` 여야 한다 ⚠️
뒤집으면 근거리에서 지구가 통째로 검게 죽는다. 에러도 경고도 없다.

### 3. Ambient/Explore 는 크롬만 바뀌면 안 된다
야간면에서 확대하면 `base.nightAlpha=0` 때문에 지표가 안 보인다.
`imagery.updateForHeight()` 로 고도에 따라 nightAlpha 를 램프시킨다.
멀리=리빙어스 룩(불빛만), 가까이=지도로 쓸 수 있게.

### 4. CelesTrak 궤도는 OMM JSON으로 받는다
2026-07-11부터 6자리 신규 카탈로그 번호가 발급돼 TLE에는 새 위성이 들어오지 않는다.
브라우저 전역 번들이 있는 satellite.js 6.0.2의 `json2satrec()`으로 파싱한다.
v7은 ESM 전용이라 빌드 없는 현재 구조에서는 그대로 교체할 수 없다.

### 5. 구름 레이어는 미해결
MODIS Cloud_Fraction 은 과학용 **위색** 산출물이라 그대로 얹으면 분홍/보라.
탈채도해도 "구름비율"이라 옅은 구름까지 전부 칠해져 지구를 덮고,
극궤도 **스와스 이음매**가 줄무늬로 남는다.
→ 리빙어스급 매끈한 전지구 구름은 **서버측 합성이 필요**하다. §4-1 재검토 대상.

### 6. 브라우저 탭이 백그라운드면 rAF 가 멈춘다
스크린샷이 검게 나오면 렌더 문제가 아니라 이것일 수 있다.
`setInterval(()=>scene.render(), 33)` 로 강제 펌프해서 확인.

## 콘솔 디버그 핸들

```js
__e.viewer / __e.scene / __e.store / __e.registry / __e.imagery / __e.orbits
__e.store.setTier('paid')      // 구독 티어로
__e.store.setLayer('aurora', true)
```


---

# 회원 · 법적 요건 (2026-07-26 추가)

## 인증 — Google / Apple 만

**Supabase** 를 씁니다. Postgres 라 §0 의 "데이터 축적 → 재분석" 방향과 맞고,
사전등록·회원·동의이력을 한 스키마에서 다룰 수 있습니다.

```
js/auth.js              인증 래퍼 + 사전등록
js/ui-account.js        로그인/동의/계정/법적문서 UI
js/config.local.js      키 (gitignore 됨) — config.local.example.js 를 복사해서 작성
supabase/schema.sql     테이블 + RLS + 계정삭제 함수
```

**키가 없으면 게스트 모드로 동작합니다.** 지구본·기상·재난 등 로그인 없는 기능은 전부 정상이고
로그인/구독/사전등록만 비활성화됩니다. 즉 지금 상태로도 앱은 완전히 돌아갑니다.

### 설정 순서 (사람이 해야 하는 일)

1. supabase.com 프로젝트 생성 → `config.local.js` 에 URL/anon key 입력
2. SQL Editor 에 `supabase/schema.sql` 붙여넣고 실행
3. Authentication → Providers 에서 Google / Apple 설정
   - Google: Google Cloud Console 에서 OAuth 클라이언트 생성
   - Apple: **개발자 계정 필요(연 $99)** → Services ID + Sign in with Apple 키(.p8)

### 설계 결정

- **게스트 모드가 기본.** 만 14세 미만도 교육 콘텐츠를 써야 하므로(§3), 로그인은 구독·동기화·배지에만 필요
- **비밀번호를 저장하지 않음.** 소셜 로그인만 → 유출 위험 자체가 없음
- **App Store 규정 4.8**: Google 로그인을 넣으면 Apple 로그인이 **의무**. 둘 다 넣은 이유
- **App Store 규정 5.1.1(v)**: 앱 내 계정 삭제 **필수** → `delete_own_account()` 구현
- 동의 이력은 버전·시각과 함께 저장하고 **수정·삭제 불가**로 막음 (입증 책임이 사업자에게 있음)

## 법적 문서

```
legal/privacy.ko.md     개인정보처리방침 (개인정보보호법 제30조 필수항목 기준)
legal/terms.ko.md       이용약관
legal/README.md         신고·설정 체크리스트  ← 문서보다 이게 더 중요
```

**전부 초안이며 출시 전 변호사 검토가 필요합니다.** `{{ }}` 는 확정 후 채울 값입니다.

### ⚠️ 인수인계 문서에 없던 것 — 위치기반서비스사업 신고

앱이 단말 위치를 받아 기상을 보여주므로 **위치정보법상 신고 대상일 가능성이 높습니다**(방통위).
`legal/README.md` 1번 참조. 좌표를 소수점 1자리로 반올림하면 법적 부담이 줄고
**API 호출량도 크게 감소**하므로, 법적 판단과 무관하게 도입할 가치가 있습니다.

### ⚠️ CelesTrak 상업 이용 조건 확인 필요

위성 궤도(TLE)를 유료 티어에 쓸 예정인데, §4-10 에서 OpenSky 가
"비상업 라이선스라 유료 앱 사용 불가"였던 것과 같은 함정일 수 있습니다.

---

# 자연현상 3D 교육 콘텐츠 (§5-6)

`js/layers/phenomena.js` — 무료 티어의 두 축 중 하나. 이전까지 0% 였습니다.

**3D 에셋은 아직 없지만, 감지·배치·예보연동은 전부 실제로 동작합니다.**
에셋이 나오면 `renderHeatDome()` 안의 도형만 교체하면 됩니다.

## 열돔 — 실제 감지

지표 기온만으로는 단순 더위와 구분이 안 되므로 **500hPa 지위고도**를 함께 봅니다.

| 조건 | 값 |
|---|---|
| 500hPa 지위고도 | ≥ 5880m (상층 고기압 능) |
| 지표 최고기온 | ≥ 33°C |
| 지속 | 3일 이상 |

전지구 30개 지점을 **한 번의 Open-Meteo 요청**으로 스캔합니다.

실측 예 (2026-07-26): 휴스턴 7일/40°C/5973m, LA 7일/35°C/5962m,
상하이 6일/39°C/5904m(8/1 해소 예보), 카이로 6일/39°C/5884m

> ⚠️ 임계값은 여름 중위도 통상치입니다. **운영 전 기상 전문가 검수 필요.**

## 설명문 생성 규칙

§5-6 이 "학생 교육자료로 쓰이므로 예보 수치에 근거한 문장만" 을 요구합니다.
`explain()` 은 **실제 수치를 넣은 템플릿만** 씁니다 — "아마 ~할 것이다" 류의 추측 문장을 만들지 않습니다.
해소 예보도 예보모델이 조건 이탈을 예측한 날짜만 표시하고, 없으면 "7일 내 해소 예측 없음" 이라고 밝힙니다.

## 쓰레기섬 (§4-7)

환류 5곳을 실제 크기로 그리고, **"섬이 아니다"** 를 설명문에 명시합니다.
표시된 원은 쓰레기 양이 아니라 해류가 도는 범위라는 점을 밝혀 오해를 만들지 않도록 했습니다.

---

# 알려진 이슈 (다음 세션)

- [ ] **근거리 지표면이 흐림** — 1,500km 이하에서 Blue Marble 이 뭉개짐.
      z8 타일이 안 붙는 것으로 보임 (`maximumScreenSpaceError` / LOD 확인 필요)
- [ ] 구름 레이어 미해결 — §13-3 결정대로 Himawari 파이프라인 필요 (AWS)
- [ ] §5-2 이벤트 신뢰도 검증 로직 미구현 (GDELT 프록시 전이라도 뼈대는 가능)
- [ ] §5-5 로켓→궤도 연계 미구현 (데이터는 둘 다 이미 붙어 있음)
- [ ] §5-8 바이럴 기능 미구현 (대척점 뷰어, 스냅샷 공유, 방문국 색칠)
- [ ] 실기기(아이폰) 테스트 — 줌 임계·성능
