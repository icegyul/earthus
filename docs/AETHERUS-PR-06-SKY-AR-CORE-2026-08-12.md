# AETHERUS PR-06 — Sky AR Core Device Probe

> 기준일: 2026-08-12 (Asia/Seoul)
> 선행 기준: `docs/AETHERUS-PR-05-LOCAL-SESSION-SYNC-2026-08-12.md`
> 설계 기준: `AETHERUS_Engineering_Specification_v1.0_FINAL_CODEX_HANDOFF.docx` ENG-402 / ENG-403 / ENG-404 / TST-002 / PART XVI PR-05
> 저장소 매핑: 제품 사진 소유권 PR이 삽입되어 Word의 PR-05는 저장소 PR-06에 해당한다.
> 현재 상태: `DEV_PROBE_DEPLOYED / REAL_DEVICE_GATE_OPEN / PUBLIC_NOT_RELEASED`

## 0. 결론

PR-06은 Sky AR 완제품이나 망원경 조준 기능이 아니다. 화성의 기하학적 고도·방위각을
기기의 카메라 자세와 같은 local ENU 좌표계에 투영하고, 위치·방향 센서·후면 카메라를
사용자 동작으로만 요청하며, confidence가 낮으면 target cue를 숨기는 첫 device-ready
vertical slice다.

```text
Mars geometric horizontal coordinates
  + device-local observer / current UTC
  + explicit orientation permission
  + explicit rear-camera permission
  + event-driven pose samples (max 15 Hz)
  + manual compass-north/horizon calibration (unverified)
  → local ENU projection
  → BLOCKED / LOW: cue HIDDEN
  → MEDIUM: BROAD_RING only
  → stop / page hidden / scene exit: tracks 0, listeners 0, loops 0
```

실제 iOS/Android permission·calibration, 30분 thermal, camera FOV/왜곡, 자기편차, plate
solve residual은 아직 검증되지 않았다. 따라서 UI는 `#dev`에서만 생성되고, 모듈도 DEV
버튼을 열기 전에는 다운로드하지 않는다. 이 실기기 gate를 통과하기 전에는 공개 Sky AR로
표현하거나 Word PR-05 exit gate 완료로 표시하지 않는다.

## 1. ADR-022 — event-driven local ENU device probe를 첫 Sky AR 경계로 채택

### 1.1 결정

| 항목 | 결정 |
|---|---|
| runtime owner | 현재 브라우저 기기 |
| projection frame | local ENU: x=east, y=north, z=up |
| target | PR-03 Astronomy의 Mars geometric altitude/azimuth |
| pose input | W3C `deviceorientation` / `deviceorientationabsolute`, Safari compass extension |
| permission | 위치와 orientation+camera를 서로 다른 사용자 버튼으로 요청 |
| camera | `getUserMedia`, environment-facing preference, audio=false, ideal 15/max 20 fps |
| update | sensor event 수신 시 최대 15 Hz, rAF/timer/polling 없음 |
| calibration | 사용자가 기기 나침반 북쪽과 수평에 맞추는 manual low-confidence profile |
| confidence | BLOCKED/LOW/MEDIUM/HIGH + reason list; LOW 이하 cue 숨김 |
| screen cue | MEDIUM은 넓은 ring만, HIGH만 precise ring 계약이나 현재 도달 불가 |
| lifecycle | stop, page hidden, Earth/other scene, body close에서 track/listener 모두 해제 |
| privacy | raw frame/sample/profile 저장·분석·upload 없음 |
| release surface | `#dev` only, dynamic import, public route/schema 변경 없음 |

ENG-402/403/404는 pose가 confidence 없이 소비되거나 magnetic heading이 단독 truth가 되는
것을 금지한다. 현재 저장소에는 star-field calibration, camera intrinsics, plate solver가 없으므로
manual calibration을 정밀 성공으로 승격하지 않는다. `MANUAL_UNVERIFIED`, residual `null`,
magnetic declination/camera intrinsics/star residual 미검증을 같은 profile과 UI에 남긴다.

### 1.2 채택하지 않은 대안

- 방향 센서의 `alpha`를 바로 화살표 위치로 사용: absolute 여부, 화면 회전, confidence와
  자기 오차가 사라져 금지한다.
- 카메라가 켜지면 60 fps 무한 rAF: pose event가 없을 때도 GPU/배터리를 쓰므로 금지한다.
- 위치·센서·카메라 동시 요청: 어떤 목적으로 어떤 권한을 허용하는지 분리되지 않고 iOS의
  transient user activation 흐름을 재현하기 어렵다.
- default 인천 위치로 AR 시작: 실제 기기 위치와 다른 target direction을 그리므로 차단한다.
- 수동 북쪽 보정 뒤 precise cue: 자기편차·렌즈·별 residual이 없어 거짓 정밀도다.
- camera frame 또는 sensor trace 저장: 이 slice에는 capture/archive/diagnostic consent가 없다.
- Generic Sensor API 강제: 브라우저 지원과 권한 경계가 현재 repository에서 검증되지 않았다.
- 공개 버튼 선행: Word exit gate의 실제 iOS/Android와 thermal 증거가 없다.

## 2. 책임·입력·출력·인터페이스

### 2.1 `sky-ar.js` 책임

- W3C Z-X'-Y'' orientation을 device rear-camera basis로 정규화한다.
- screen orientation을 screen-right/up basis에 적용한다.
- horizontal altitude/azimuth를 local ENU vector로 바꾼다.
- camera pose/FOV/viewport에서 perspective screen anchor를 계산한다.
- pose 표본을 최근 32개로 제한하고 circular heading jitter를 계산한다.
- manual north/horizon calibration profile을 explicit schema로 만든다.
- camera/pose/target freshness/calibration/jitter/location accuracy를 confidence reason으로 평가한다.
- orientation permission과 camera stream lifecycle을 local adapter로 소유한다.
- page hidden과 explicit stop에서 listener와 media track을 해제한다.
- diagnostics에 listener/live track/sample/drop/loop/upload count를 노출한다.

책임 밖: 정밀 camera intrinsics, distortion map, magnetic declination model, gyro bias filter,
visual-inertial odometry, star recognition, plate solving, local horizon, weather, daylight safety,
telescope mount command, capture/archive, account sync, analytics, remote API.

### 2.2 pure projection port

```js
projectHorizontalToScreen({
  targetAzimuthDeg,
  targetAltitudeDeg,
  poseAzimuthDeg,
  poseAltitudeDeg,
  rollDeg,
  horizontalFovDeg,
  verticalFovDeg?,
  width,
  height,
}) -> {
  visible,
  behind,
  x,
  y,
  horizontalAngleDeg,
  verticalAngleDeg,
  angularSeparationDeg,
  frame: 'local-ENU-perspective'
}
```

입력에 null/NaN/0 viewport/잘못된 FOV가 있으면 기본 성공값을 만들지 않고 range error를
반환한다. 남반구 별도 부호 분기는 없다. astronomy engine이 관측자 위도에서 만든 local
altitude/azimuth와 동일 ENU 정의를 쓰므로 Sydney의 south celestial pole fixture도 같은
projection을 통과한다.

### 2.3 permission lifecycle port

```js
const runtime = createBrowserSkyARRuntime({ maxEventHz: 15 });

await runtime.start({ video, onSample, onState })
  -> ACTIVE | BLOCKED(reason)

runtime.stop(reason)
  -> {
    listenerCount: 0,
    liveTrackCount: 0,
    loopCount: 0,
    networkUploadCount: 0
  }
```

`DeviceOrientationEvent.requestPermission`이 있으면 사용자 클릭 call stack에서 요청한다.
orientation이 거부되면 camera를 열지 않는다. camera가 실패하면 부분 stream/listener를
남기지 않는다. promise가 성공한 뒤에만 sensor listener를 등록한다.

## 3. 데이터 계약

### 3.1 normalized pose sample

```json
{
  "schema": "earthus.sky-ar-runtime.v1",
  "atMs": 1786492800000,
  "azimuthDeg": 182.4,
  "altitudeDeg": 21.3,
  "rollDeg": -1.2,
  "absolute": true,
  "headingMode": "SAFARI_COMPASS_ABSOLUTE",
  "headingAccuracyDeg": 10,
  "screenAngleDeg": 0,
  "raw": { "alpha": 177.6, "beta": 111.3, "gamma": 1.2 }
}
```

이 표본은 메모리의 최대 32개 ring buffer에만 존재한다. IndexedDB, localStorage, URL,
analytics, console payload, session export에 넣지 않는다. 화면에는 latest pose와 aggregate
jitter만 표시한다.

### 3.2 calibration profile

```json
{
  "schema": "earthus.sky-ar-calibration.v1",
  "schemaVersion": 1,
  "profileId": "cal_...",
  "state": "LOCKED_LOW_CONFIDENCE",
  "method": "USER_COMPASS_NORTH_AND_HORIZON",
  "headingOffsetDeg": -12.1,
  "altitudeOffsetDeg": 2.0,
  "rollOffsetDeg": -0.8,
  "residualDeg": null,
  "source": {
    "kind": "user-input",
    "sampleCount": 1,
    "sensorHeadingMode": "W3C_ABSOLUTE"
  },
  "precision": "MANUAL_UNVERIFIED",
  "limitations": [
    "magnetic-declination-not-corrected",
    "camera-intrinsics-not-solved",
    "no-star-or-plate-solve-residual"
  ]
}
```

profile은 현재 활성 probe 메모리에만 둔다. 새 start에서 reset한다. 기기 고유 calibration
fingerprint가 될 수 있으므로 이 PR에서는 영속화하지 않는다.

## 4. 좌표·projection

### 4.1 horizontal vector

북쪽 0°, 동쪽 90°인 azimuth `A`, altitude `h`를 다음 ENU vector로 만든다.

```text
east  = cos(h) sin(A)
north = cos(h) cos(A)
up    = sin(h)
```

camera forward도 같은 식을 사용한다. `right = normalize(forward × worldUp)`,
`up = normalize(right × forward)`를 만들고 roll을 적용한다. target을 이 basis에 dot product해
horizontal/vertical angular offset과 perspective normalized coordinate를 계산한다. depth가
0 이하이면 camera 뒤이므로 cue를 숨긴다.

### 4.2 orientation reading

orientation event의 intrinsic `Rz(alpha) · Rx(beta) · Ry(gamma)` matrix에서 device rear camera
`-z`와 screen-right/up basis를 만든다. Safari의 `webkitCompassHeading`이 숫자이면 heading에
그 값을 사용하되 accuracy를 confidence input으로 남긴다. 그 값이 없으면 event.absolute를
구분하며 relative heading은 manual offset이 있어도 LOW ceiling이다.

### 4.3 FOV limitation

현재 브라우저 camera settings는 focal length와 distortion을 보장하지 않는다. probe는
60° fallback을 쓰지만 `FALLBACK_UNVERIFIED`로 고정한다. 따라서 manual calibration으로
MEDIUM에 도달해도 넓은 ring만 허용한다. precise screen anchor는 plate solve 또는 검증된
intrinsics와 residual ≤2° fixture가 생긴 뒤 별도 ADR/PR에서 연다.

## 5. 상태·전이

| From | Action | To | Guard / side effect |
|---|---|---|---|
| hidden | DEV open | `NOT_STARTED` | `#dev`, Mars detail only, permission 없음 |
| `NOT_STARTED/BLOCKED` | device location | `NOT_STARTED` | 기존 `myLocation` explicit button, observer=device |
| `NOT_STARTED/BLOCKED/STOPPED` | start | `REQUESTING_PERMISSION` | secure context + device observer + user activation |
| `REQUESTING_PERMISSION` | orientation denied | `BLOCKED` | camera 요청 0 |
| `REQUESTING_PERMISSION` | camera denied/fail | `BLOCKED` | partial resources release |
| `REQUESTING_PERMISSION` | close / stop | `STOPPED` | start generation 무효화, 늦게 도착한 stream도 즉시 stop |
| `REQUESTING_PERMISSION` | permissions granted | `ACTIVE` | rear camera stream + finite listeners |
| `ACTIVE` | first stable samples | `CALIBRATION_REQUIRED` | cue remains HIDDEN |
| `CALIBRATION_REQUIRED` | manual north/horizon | `CALIBRATED_LOW_CONFIDENCE` | residual null, broad cue only if other guards pass |
| active | stop / page hidden / scene exit | `STOPPED` | every track.stop, listener remove, video srcObject null |
| any | close | hidden | no background sensor/camera work |

`HIGH/PRECISE_RING`은 schema에만 있고 이 PR의 UI에서는 실제로 열리지 않는다.

## 6. confidence와 저신뢰 강등

`evaluateSkyARConfidence`는 다음 reason을 보존한다.

- `CAMERA_INACTIVE`, `POSE_MISSING`, `POSE_STALE`, `TARGET_STALE`: BLOCKED.
- `POSE_WARMING`, `ABSOLUTE_HEADING_UNAVAILABLE`, `MAGNETIC_ACCURACY_LOW`,
  `POSE_JITTER_HIGH`, `CALIBRATION_REQUIRED`, `LOCATION_ACCURACY_LOW`: LOW.
- 위 reason이 없고 manual calibration이 있으면 최대 MEDIUM / `BROAD_RING`.
- 검증 intrinsics + residual ≤2° + 낮은 jitter/heading accuracy가 있을 때만 HIGH 후보.

BLOCKED/LOW에서는 marker DOM을 `hidden`으로 유지한다. 숫자와 reason은 그대로 보여 주며
default center arrow나 마지막 성공 anchor를 재사용하지 않는다. target UTC가 120초를 넘으면
같은 pose가 있어도 BLOCKED로 바뀐다.

## 7. failure·retry·offline

| 실패 | 행동 | 자동 재시도 |
|---|---|---|
| insecure context | `SECURE_CONTEXT_REQUIRED`, 권한 요청 없음 | 없음 |
| orientation API 없음 | `ORIENTATION_SENSOR_UNAVAILABLE`, camera 요청 없음 | 없음 |
| orientation 거부 | BLOCKED, camera 요청 없음 | 없음 |
| camera 거부/없음/읽기 실패 | partial resource release, reason 표시 | 없음 |
| 권한 요청 중 close | `START_CANCELLED`, late camera stream stop, listener 0 | 없음 |
| incomplete/null pose | sample drop, 이전 cue를 성공값으로 유지하지 않음 | 다음 실제 event만 수신 |
| relative heading | LOW, cue hidden | 없음 |
| high jitter/low compass accuracy | LOW, cue hidden | 실제 sample 평가 |
| target stale | BLOCKED, cue hidden | 사용자가 다시 start |
| page hidden/track ended | 즉시 stop | 없음 |
| module load fail | BLOCKED, 기존 astronomy/planner/session 유지 | 사용자의 다음 DEV open |

계산과 센서는 온디바이스라 네트워크 transport retry가 없다. 다만 현재 DEV module 자체의
offline precache와 실기기 offline/reconnect는 미검증이다. 이를 완전한 offline AR로 표현하지
않는다.

## 8. security·privacy·접근성

- `#dev`에서만 button/overlay DOM을 만든다. 공개 Mars 화면에는 surface가 없다.
- 위치는 기존 목적별 button으로 먼저 요청하고, sensor+camera는 두 번째 button에서 요청한다.
- camera audio는 항상 false다.
- video frame을 canvas로 복사하거나 저장·upload하지 않는다.
- pose/calibration은 메모리만 사용하고 export/session/URL에 넣지 않는다.
- 기기가 숨겨지면 자동 stop한다.
- overlay close와 Earth/다른 body 이동도 stop을 호출한다.
- 모든 action은 최소 44px이며 keyboard Escape로 close한다.
- 상태·실패·confidence reason은 색만이 아니라 text/status로 표시한다.
- 카메라가 없어도 설명과 failure reason을 읽을 수 있다.
- disaster banner의 별도 상위 z-index 계약은 변경하지 않는다.

## 9. 성능·비용

- sensor event accept ceiling: 15 Hz.
- camera preference: ideal 1280×720, ideal 15 fps, max 20 fps, rear-facing preference.
- pose memory: 최근 32개 + counters.
- rAF/timer/polling/worker: 0.
- upload/API/DB/AI: 0.
- public path extra module request: 0 (`#dev` open 시에만 dynamic import).
- synthetic 30-minute 15 Hz replay: 27,000 samples, retained 32. 이는 bounded-memory test이며
  real-device thermal/battery 증거가 아니다.

실제 thermal, battery drain, camera hardware power와 low-end frame cost는 iOS/Android 30분
검증 전까지 `UNVERIFIED`다. 60 fps p95 <16.7 ms 같은 Word 수치는 hypothesis로 유지한다.

## 10. 자동 test gate

```text
node tools/test_aetherus_sky_ar.mjs
node tools/test_aetherus_observation_session.mjs
node tools/test_aetherus_observation_planner.mjs
node tools/test_aetherus_astronomy.mjs
node tools/test_aetherus_foundation.mjs
node tools/test_aetherus_photo_ownership.mjs
```

PR 고유 fixture:

1. portrait upright north/horizon W3C basis
2. Safari compass heading/accuracy normalization
3. center/right/behind perspective projection
4. Sydney south celestial pole altitude/azimuth와 screen center
5. calibration 전 LOW/HIDDEN
6. manual unverified calibration 뒤 최대 MEDIUM/BROAD_RING
7. stale target BLOCKED/HIDDEN
8. synthetic 30-minute/15 Hz 27,000 sample replay, buffer 32
9. granted permission에서 camera 1회, event ceiling, explicit release
10. orientation denied 시 camera request 0
11. page hidden 시 listener/track 0
12. getUserMedia pending 중 close 뒤 late stream stop, listener/track 0
13. source에 rAF/setInterval/fetch 없음
14. `#dev` guard와 dynamic import 유지

## 11. 실제 브라우저 gate

현재 개발 브라우저에서는 다음만 증명할 수 있다.

```text
desktop + #dev:
  Mars deep link → DEV button visible → overlay open
  no device observer → start disabled + reason visible
  unsupported sensor/camera → BLOCKED, cue hidden
  close → overlay hidden, console error 0

normal route without #dev:
  Sky AR button absent
  sky-ar.js request absent
  astronomy/planner/session regression unchanged
```

이 증거는 실제 mobile sensor/camera 증거를 대체하지 않는다.

## 12. TST-002 실기기 release gate — OPEN

다음 표를 실제 기기에서 모두 채우기 전에는 Word PR-05/Sky AR Core를 완료 처리하지 않는다.

| Device | Browser | Permission allow/deny | Absolute/relative | Manual calibration | South/north projection | 30 min thermal | release after stop/background | Status |
|---|---|---|---|---|---|---|---|---|
| iPhone physical | Safari current | pending | pending | pending | pending | pending | pending | `NOT_RUN` |
| Android physical | Chrome current | pending | pending | pending | pending | pending | pending | `NOT_RUN` |

실기기 절차:

1. HTTPS `#dev` Mars URL에서 위치를 별도로 허용한다.
2. sensor+rear camera를 허용한 경우와 거부한 경우를 각각 새 permission state에서 실행한다.
3. raw heading mode, compass accuracy, jitter, cue mode를 기록하되 raw trace는 저장하지 않는다.
4. 북쪽·수평 manual calibration 후 BROAD_RING만 열리는지 확인한다.
5. 자석/전자기기 근처에서 confidence가 LOW로 내려가 cue가 숨는지 확인한다.
6. 실제 남반구 기기 또는 승인된 virtual sensor oracle로 southern projection을 대조한다.
7. 화면 켠 상태 30분 동안 OS thermal warning, battery 변화, frame/jitter, camera interruption을 기록한다.
8. background, screen lock, Earth return, close 각각에서 browser camera indicator가 꺼지고
   diagnostics `listener 0 · live track 0 · loop 0`인지 확인한다.
9. 390×844에서 panel clipping/horizontal overflow와 44px controls를 확인한다.
10. console error와 기존 idle/released render delta를 확인한다.

## 13. 배포·rollback·다음 gate

현재 public release는 금지한다. 실기기 검수를 위해 운영 `#dev` probe를 배포하는 경우에도
release 값은 `DEV_PROBE_DEPLOYED / PUBLIC_NOT_RELEASED`로 기록하며 일반 route에 button/module
request가 없음을 production에서 다시 확인한다.

2026-08-12 02:08 UTC에 다음 DEV probe 세 파일만 운영에 반영했다.

- `/js/space/sky-ar.js` — SHA-256 `f0441c1d25fc2468699dd34096039a9a4cbb4780293d5fefae709cbc0298a43b`
- `/js/space/cosmic3d.js` — SHA-256 `0ecab95c785cb1dd57b8da0e30515c9e997cf0d18160a57ba9b9462c76a1e214`
- `/css/app.css` — SHA-256 `6fe7a31d5e785844c77c58ccea0a87a832bb85684be45b86fd0acbe3bf6b4140`

CloudFront invalidation은 `IBDOHJZ3INMIXMXR4H2HIMMBN9`로 생성됐다. 배포 계정에는
`cloudfront:GetInvalidation` 권한이 없어 waiter 상태 조회는 실패했지만, cache-busting 운영
URL에서 세 본문의 SHA-256이 로컬과 일치했고 `text/javascript`/`text/css`, `no-cache`,
`x-cache: Miss from cloudfront`를 확인했다. 운영 실제 브라우저에서도 `#dev`는 probe open/close,
resource evidence 0, console error 0을 통과했고 일반 route는 Sky AR button/section이 0이었다.

rollback은 다음 세 파일/hunk만 되돌린다.

- `prototype/js/space/sky-ar.js`
- `prototype/js/space/cosmic3d.js`의 Sky AR DEV seam
- `prototype/css/app.css`의 Sky AR styles

기존 astronomy, plan, local session, route, service worker, IndexedDB 원본은 변경하지 않는다.
다음 제품 PR은 Astrometry Core지만, Sky AR release gate의 실제 device evidence는 별도 open
gate로 남는다. Astrometry가 생기면 manual profile을 덮어쓰지 말고 plate-solved calibration
profile을 새 revision으로 추가한다.

## 14. 공식 API 근거

- W3C Device Orientation and Motion: `https://www.w3.org/TR/orientation-event/`
- MDN MediaDevices.getUserMedia: `https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia`
- MDN MediaStreamTrack.stop: `https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/stop`
- MDN ScreenOrientation.angle: `https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/angle`
