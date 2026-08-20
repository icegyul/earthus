# AETHERUS major-body ephemeris cache

이 디렉터리는 브라우저가 NASA/JPL Horizons API를 직접 호출하지 않도록 하는 서버측 캐시 빌더다.
JPL SSD API fair-use 정책에 맞춰 **한 번에 한 요청씩** Sun + 8 planets를 순차 수집하고,
전부 검증된 경우에만 하나의 gzip JSON을 S3에 쓴다. 한 천체라도 실패하면 기존 last-good
object를 덮어쓰지 않는다.

## 데이터 계약

- Source: NASA/JPL Horizons API
- `EPHEM_TYPE=VECTORS`
- `CENTER=@0` — Solar System Barycenter
- `REF_PLANE=FRAME`, `REF_SYSTEM=ICRF`
- `OUT_UNITS=AU-D`
- `VEC_TABLE=2` — X/Y/Z + VX/VY/VZ
- `VEC_CORR=NONE` — geometric state
- `TIME_TYPE=UT`
- 기본 범위: 과거 370일 + 미래 35일
- 기본 노드 간격: 6시간
- 앱 보간: position+velocity cubic Hermite

공식 파라미터 문서: https://ssd-api.jpl.nasa.gov/doc/horizons.html

## 파일

- `index.mjs` — Horizons 순차 수집, 정합성 검사, S3 gzip write
- `horizons-parser.mjs` — AWS 의존성이 없는 순수 `$$SOE`/`$$EOE` vector CSV parser
- 브라우저 소비자 — `prototype/js/space/ephemeris-provider.js`

## Lambda 환경변수

필수:

```text
CACHE_BUCKET=earthus-cache-kr
CACHE_REGION=us-east-2
```

선택 기본값:

```text
EPHEMERIS_KEY=aetherus/ephemeris-major.json.gz
EPHEMERIS_PAST_DAYS=370
EPHEMERIS_FUTURE_DAYS=35
EPHEMERIS_STEP_HOURS=6
HORIZONS_TIMEOUT_MS=30000
HORIZONS_REQUEST_GAP_MS=350
```

Lambda 실행 역할에는 최소 `s3:PutObject`가
`arn:aws:s3:::earthus-cache-kr/aetherus/*`에 필요하다. 이 함수는 사용자 요청 경로에
두지 않고 EventBridge에서 하루 1회 갱신하는 것을 기본 운영값으로 한다.

## 공개 경로

앱의 기본 provider 경로는 현재 `/aetherus/ephemeris-major.json.gz`다. 따라서 production
origin/CDN에서 `/aetherus/*`를 `earthus-cache-kr`의 같은 prefix로 연결해야 한다.
그 route를 만들기 전에는 브라우저 provider가 fail-closed로 JPL Table 1 근사식에 폴백한다.
S3 URL을 직접 쓰는 배포라면 CORS에 `GET, HEAD`와 Earthus origin을 허용해야 한다.

**이 경로가 실제로 배포되기 전에는 화면에서 `JPL Horizons`를 활성 provider로 주장하면 안 된다.**
`#dev`에서는 canvas dataset의 `ephemerisProvider`, `ephemerisCoverage`,
`motionEphemerisProviders`로 실제 선택된 provider를 확인한다.

## 검증

순수 회귀검사:

```bash
node --experimental-default-type=module tools/test_aetherus_coordinate_core.mjs
```

PR 검증에서 JPL에 Sun vector를 **1회만** 요청해 실제 Horizons wire format도 확인한다.
대량/병렬 검증 요청은 금지한다.
