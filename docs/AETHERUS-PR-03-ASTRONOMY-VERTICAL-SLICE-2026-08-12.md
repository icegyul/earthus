# AETHERUS PR-03 — Astronomy Vertical Slice

> 기준일: 2026-08-12 (Asia/Seoul)
> 선행 기준: `docs/AETHERUS-PR-02-PHOTO-OWNERSHIP-2026-08-12.md`
> 설계 기준: `AETHERUS_Engineering_Specification_v1.0_FINAL_CODEX_HANDOFF.docx`

> 현재 route 주의: 이 문서가 완료될 때의 writer는 v2였다. PR-04 Observation Planner가
> `plan=geometry24h`를 추가해 현재 writer를 v3로 올렸으며 v1·v2 reader는 유지한다.

## 0. 결론

PR-03은 기능 목록이 아니라 Aetherus 천문 계산의 첫 종단 수직 절편이다.

```text
화성 + 관측자 위경도 + UTC
  → JPL Table 1 태양중심 근사 좌표
  → 지구중심 ICRF/J2000 적경·적위·거리
  → 관측일 세차 변환
  → 관측자 기하학적 고도·방위각
  → 정밀도·제한·출처·UTC·n 의미
  → 화성 3D 상세·공유 URL
```

화성 하나로 판단 가능한 실제 제품 흐름을 닫았다. 결과는 `Explorer` 등급이며 관측 계획,
망원경 조준, 항해, 안전 판단에 쓰지 않는다. 화성이 기하학적 지평선 위인지만 말하며
실제로 보인다·관측할 수 있다·안전하다는 결론을 내리지 않는다.

## 1. ADR-019 — 시간·좌표계·정밀도 헌법

### 1.1 시간

- 외부 입력과 URL은 초 단위 ISO 8601 UTC(`...Z`)만 받는다.
- 표시와 출처 계약에 UTC 시각과 Julian Date UTC를 같이 남긴다.
- 현재 Explorer 엔진은 UTC를 JDTDB와 같은 값으로 근사한다. 이 근사를 숨기지 않는다.
- JPL Table 1의 계약 범위인 `1800-01-01T00:00:00Z`∼`2050-01-01T00:00:00Z`만 계산한다.
- 범위 밖, 타임존 없는 문자열, 잘못된 날짜는 추정하지 않고 실패한다.

### 1.2 좌표계

| 단계 | 계약 |
|---|---|
| 행성 원소 | NASA/JPL Table 1, J2000 평균 황도 원소, AU/도 |
| 화성-지구 벡터 | 지구중심 황도 직교 좌표, AU |
| 적도 변환 | J2000 황도 경사각 `23.43928°` |
| 외부 RA·Dec | approximate ICRF/J2000 geocentric |
| 수평 변환 중간값 | IAU 1976 평균 세차, 관측일 적도·분점 |
| 관측자 | WGS84에 상응하는 지리 위도·경도, 지표 고도 0km 근사 |
| 수평 결과 | 기하학적 고도, 북=0°·동=90° 방위각 |

JPL Horizons의 표시 RA·Dec는 ICRF/J2000이지만 고도·방위각은 관측일 좌표계를 사용한다.
J2000 RA·Dec를 지역 항성시에 바로 넣지 않고, 수평 변환 전에 관측일 평균 세차를 적용한다.
이 경계를 빼면 2026-08-12 인천 천정 부근에서 방위각이 1.509° 벌어지는 것을 기록 fixture로 재현했다.

### 1.3 정밀도·오차 예산

```json
{
  "tier": "explorer",
  "comparisonGateDeg": 1,
  "validFrom": "1800-01-01T00:00:00.000Z",
  "validUntil": "2050-01-01T00:00:00.000Z",
  "marsNominalHeliocentricError": {
    "longitudeArcsec": 40,
    "latitudeArcsec": 2,
    "distanceKm": 25000
  }
}
```

- 기록된 Horizons 적경·적위·고도·방위각과 각 1° 미만이어야 한다.
- 거리는 Horizons 기준 0.01AU 미만이어야 한다.
- 현재 3개 fixture의 최대 각오차는 0.008° 미만이다.
- 광행시·광행차·장동·시차·대기굴절·지표 고도·지형 지평선·주광·날씨를 제외한다.
- 이 제한 중 하나라도 해소하지 않고 `Scientific`이나 관측 가능성으로 승격하지 않는다.

## 2. 책임·입력·출력·인터페이스

### 2.1 `astronomy.js` 책임

- 관측 UTC와 관측자 위경도 검증
- 화성·지구 근사 위치 결합
- J2000 적경·적위·거리 계산
- 관측일 세차와 지역 항성시를 통한 고도·방위각 계산
- Explorer 등급·제한·provenance·`n 해당 없음` 계약 반환

UI 문구, 날씨, 주광, 현지 지평선, 관측 가능 판단, 장비 제어는 책임 밖이다.

### 2.2 호출 계약

```js
calculateMarsObservation({
  observer: { lat, lon, source, accuracyM? },
  at: ISO_8601_UTC,
  precision: 'explorer'
}) -> AstronomyObservationV1
```

```json
{
  "schema": "earthus.astronomy-observation.v1",
  "target": "mars",
  "observer": {
    "lat": 37.4563,
    "lon": 126.7052,
    "source": "default"
  },
  "time": {
    "utc": "2026-08-12T00:00:00.000Z",
    "julianDateUtc": 2461264.5,
    "inputScale": "UTC"
  },
  "coordinates": {
    "raDeg": 90.0589,
    "decDeg": 23.6796,
    "distanceAu": 1.949879,
    "frame": "approximate-ICRF-J2000-geocentric",
    "equatorialOfDate": {},
    "horizontal": {
      "altitudeDeg": 75.9356,
      "azimuthDeg": 167.4730,
      "frame": "geometric-horizontal-no-refraction"
    }
  },
  "horizon": "above",
  "precision": {},
  "provenance": {
    "kind": "calculated",
    "sampleCount": null,
    "sampleReason": "deterministic calculation, not an observation sample"
  }
}
```

## 3. 사용자 흐름·상태 전이

```text
SOLAR_SYSTEM
  └─ select Mars
       ├─ default observer(Incheon) + now UTC
       ├─ calculate success → MARS_ASTRONOMY_READY + URL v2
       └─ calculate failure → MARS_ASTRONOMY_ERROR

MARS_ASTRONOMY_READY
  ├─ Recalculate now → same observer + new UTC → READY | ERROR
  ├─ Use my location
  │    ├─ permission success → round lat/lon to 0.01° + new UTC → READY + URL
  │    └─ denied/insecure/unavailable → ERROR, no coordinate fabrication
  ├─ language change → same result, translated labels only
  └─ back/Escape/Earth exit → clear observer/time/result from memory and URL

DEEP_LINK
  └─ decode v1/v2/v3 → activate base scene → apply observer/time → select Mars
       └─ canonicalize to current v3 only after restoration finishes
```

`showAstronomy()`는 계산 결과를 `textContent`로만 표시한다. 엔진이 실패하면 좌표나 지평선
결론을 대체하지 않고 실패 상태와 재계산/위치 버튼만 남긴다.

## 4. URL v2(당시 writer, 현재 v3)·개인정보 계약

### 4.1 문법

```text
?aetherus=2&solar=1&target=mars
  &observer=default
  &at=2026-08-12T00:00:00.000Z
  &precision=explorer

?aetherus=2&solar=1&target=mars
  &observer=37.46,126.71
  &at=2026-08-12T00:00:00.000Z
  &precision=explorer
```

- v1·비버전 `solar/space` 링크를 계속 읽는다. PR-04 이후 새 URL은 v3로 쓴다.
- `observer=default` 또는 유효한 `lat,lon` 형식만 허용한다.
- Aetherus 천문 패널은 이미 있는 Earthus 위치 값을 자동으로 소비하거나 URL에 넣지 않는다.
- 사용자가 버튼을 눌러 허용한 뒤에만 위경도를 0.01°(중위도에서 약 1km)로 반올림한다.
- 기기 정확도, 원본 좌표, 계정, IP는 URL에 넣지 않는다.
- 공유 URL에서 읽은 좌표는 `shared`로 분류해 '내 위치'라고 오표시하지 않는다.
- `target=mars` 없는 observer/at/precision은 `ORPHAN_ASTRONOMY_STATE`로 제거한다.
- URL 문자열을 HTML로 삽입하지 않는다.

### 4.2 프라이버시 중지

화성 상세를 닫거나 Earthus로 돌아가면 Aetherus 천문 상태의 관측자 좌표·UTC·계산 결과를
메모리와 URL에서 제거한다. 이 PR이 추가한 천문 경로는 localStorage, 서버, 분석 이벤트,
외부 관측 API로 위치를 전송하지 않는다. 접속 시 위치를 묻는 기존 Earthus `myLocation.locate()`와
날씨/특보 흐름은 PR-03이 새로 만든 것이 아니며 이 문서의 변경 범위 밖이다.

## 5. 실패·retry·cache·offline·보안·비용

| 관심사 | PR-03 결정 |
|---|---|
| 잘못된 UTC/좌표 | 오류 코드로 즉시 실패; 임의 기본값으로 숨기지 않음 |
| 계산 범위 밖 | `UTC_OUTSIDE_JPL_TABLE_1`; 외삽 금지 |
| 위치 권한 거부 | 이유 표시, 좌표·지평선 결과 제거, 자동 재요청 없음 |
| retry | 사용자의 `지금 다시 계산`/위치 버튼으로만 수행 |
| cache | 계산은 순수 함수·로컬 상수; 네트워크 캐시·결과 영구 저장 없음 |
| offline | 배포된 JS가 있으면 같은 입력은 같은 결과; 날씨·지폄·Horizons 실시간 대조 없음 |
| input security | 숫자 범위·ISO UTC·precision allowlist·version 검증 |
| 런타임 비용 | 정적 JS 약간 증가 외 API·DB·스토리지·AI 비용 0 |
| 성능/발열 | 버튼/선택 당 동기 계산 1회; timer·polling·rAF 추가 없음 |

## 6. 표시·접근성 계약

- 화성에서만 천문 섹션을 연다. 다른 천체에 수치를 복제하지 않는다.
- 관측 위치, UTC, RA/Dec 프레임, 고도/방위각 기준, AU를 항상 표시한다.
- 소스는 `계산값`, sample count는 `n 해당 없음`이다. `관측 1건`처럼 보이게 하지 않는다.
- 제한 문구와 NASA/JPL 계산 근거를 좌표 같은 패널에 둔다.
- 본문·좌표 12px 이상, 버튼·링크 44px 이상을 사용한다.
- 390×844에서는 전폭 bottom sheet와 세로 스크롤을 사용하며 가로 overflow를 만들지 않는다.
- `aria-live` 상세 패널과 지평선 `role=status`를 유지한다.

## 7. 테스트·release gate

### 7.1 기록 fixture

`tools/fixtures/aetherus-mars-horizons.json`은 NASA/JPL Horizons API 1.3의 다음 조건을 기록한다.

```text
target=499(Mars), center=coord@399(Earth)
site=126.7052,37.4563,0
time=UT, angle=DEG, apparent=AIRLESS
quantities=1(RA/Dec),4(Az/El),20(range)
```

2026-08-12, 2026-12-01, 2027-08-12 세 시점을 고정했다. CI는 외부 API 장애와 결과
변경에 좌우되지 않고, 출처·질의·관측자·검증 기준을 fixture 안에 같이 보존한다.

### 7.2 자동 게이트

```text
node tools/test_aetherus_foundation.mjs
node tools/test_aetherus_astronomy.mjs
python3 tools/verify_kepler.py --base-date 2026-08-12
```

필수 시나리오:

1. 3개 Horizons row의 RA·Dec·Az·Alt·range·horizon 통과
2. 위도 91°, 2051년, 미제공 `scientific` 등급 실패
3. v1·v2 링크 복원, 현재 v3 round trip, v4 차단
4. 기기 좌표 0.01° 반올림, accuracy 미직렬화
5. target 없는 천문 상태 제거
6. 기존 8행성×4시점·Voyager 검증 회귀 통과

### 7.3 실제 UI 게이트

```text
desktop 1280×844: Mars direct route, default observer, source/UTC/n/limits visible
mobile 390×844: bottom sheet, 12px values, 44px controls, no horizontal overflow
v1 target=mars → current v3 canonical URL
v2 shared observer/time → same coordinates and current v3 URL
location denied → explicit failure, no fabricated coordinates
back/Escape → observer/time removed from URL and memory
idle render delta = 0
normal path console errors = 0
```

## 8. KPI·SLO·관측 가능성

PR-03은 별도 분석 전송을 추가하지 않는다. 운영 지표는 테스트·브라우저 증거로 수집한다.

- `JPL comparison fixture pass rate = 100%`
- `route v1/v2 decode and v2 encode pass rate = 100%`
- `invalid input safe-failure pass rate = 100%`
- `device coordinates consumed by Astronomy without explicit click = 0`
- `precise location serialized = 0`
- `idle render delta = 0`
- `new runtime network request = 0`

API/DB가 없으므로 별도 서버 SLA는 정의하지 않는다. 정적 asset 가용성은 기존 Earthus CDN
SLO를 따른다.

## 9. 변경·배포·롤백 경계

### 9.1 변경 파일

```text
prototype/index.html
prototype/css/app.css
prototype/js/main.js                         # Aetherus import cache key hunk only
prototype/js/space/astronomy.js
prototype/js/space/cosmic3d.js
prototype/js/space/route-state.js
tools/fixtures/aetherus-mars-horizons.json
tools/test_aetherus_astronomy.mjs
tools/test_aetherus_foundation.mjs
docs/AETHERUS-PR-03-ASTRONOMY-VERTICAL-SLICE-2026-08-12.md
```

운영에는 `prototype/` 런타임 6개만 정확한 MIME·`Cache-Control: no-cache`로 배포한다.
`main.js`에 동시 진행 중인 TPW 등 사용자 소유 hunk가 있으므로 PR-03 hunk만 선별 스테이징하고,
배포도 최종 PR-03 커밋 blob을 기준으로 한다.

### 9.2 롤백

위 6개 런타임 파일을 직전 PR-02 커밋 blob으로 같이 되돌리고 CloudFront에서 같은 경로를
무효화한다. route-state만 v1로 되돌리거나 UI만 남기는 혼합 롤백은 허용하지 않는다.
v2 URL을 직전 버전이 읽지 못하더라도 기존 링크와 Earthus 장면은 안전하게 열려야 한다.

### 9.3 배포 결과

- 커밋된 `prototype/` 런타임 6개 blob만 `app/` prefix에 선별 배포했다.
- CloudFront invalidation: `IER4U6G9H840F3SRSGW8S6UFUO`
- 공개 URL 6개는 배포 blob과 SHA-256 byte-for-byte 일치했다.
- HTML은 `text/html; charset=utf-8`, CSS는 `text/css; charset=utf-8`, ES module 4개는
  `text/javascript; charset=utf-8`이며 모두 `Cache-Control: no-cache`를 확인했다.
- JPL 기록 3시점의 최대 각오차는 0.008° 미만이고, 거리 오차는 모두 0.01AU 미만이다.
- 실서비스 1280×844: 패널 가로 overflow 0, 좌표 12px, 버튼 57px, 범위 내 세로 표시를 확인했다.
- 실서비스 390×844: 전폭 패널, 문서/패널 가로 overflow 0, 좌표 12px,
  버튼·소스 링크 44px, 우측 브랜드 손잡이 겹침 0을 확인했다.
- 실서비스 기준 입력 `2026-08-12T00:00:00Z`에서 RA `06h 00m 14.1s`, Dec `+23.680°`,
  고도 `+75.936°`, 방위각 `167.473°`, 거리 `1.949879 AU`를 복원했다.
- v1 화성 링크는 v2 기본 관측자·UTC로 정규화됐고, 공유 좌표는 `shared`로 표시됐으며,
  상세를 닫으면 observer/at/precision이 URL에서 제거됐다.
- `2051-01-01` 입력은 `INVALID_AT`·좌표 0개로 실패했고, 사용자가 '지금 다시 계산'을
  누른 후에만 기본값으로 복구됐다.
- 입력 후 실서비스 유휴 렌더 `8 → 8`, 정상 경로의 별도 새 탭 콘솔 warn/error 0을 확인했다.
- TPW·signal foundation·source governance·HANDOVER 등 동시 진행 중인 사용자 소유 변경은
  스테이징·커밋·배포에서 제외했다.

## 10. 후속 확장 경계

PR-03에 포함하지 않는다.

- 목성·토성 등 대상 확장과 일괄 검증 fixture
- TT/TDB·UT1, IERS EOP, IAU 2000/2006 세차·장동
- DE440/441 또는 Horizons 고정밀 ephemeris provider
- 광행시·광행차·시차·지표 고도·대기 굴절
- 현지 지평선, 광공해, 운량·시정·일출몰 결합
- Observation Planner의 `관측 가능` 판정과 오차 합성
- Sky AR 센서 frame·calibration·gyro drift
- 망원경 조준·remote observatory 제어

위 확장은 현재 Explorer 함수를 묵은 provider interface 뒤에 새 엔진으로 추가한다.
고정밀 provider가 없는 상태에서 등급 문구만 `Scientific`으로 바꾸지 않는다.
