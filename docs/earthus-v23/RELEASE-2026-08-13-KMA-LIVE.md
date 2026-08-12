# KMA Live · TPW 공개 — 운영 배포 증거

> 배포일: 2026-08-13 KST
> 제품 범위: EARTHUS 기상청 자료 허브, HSR 레이더 수집, TPW 수증기 통로 공개
> AWS 리전: `ap-northeast-2`
> CloudFront 배포: `E193CZEBLWEB56`
> CloudFront 무효화: `I4N0TBE4KIBZOTXZWB3VBRXXCU`

## 1. 결과

지구 스타일 메뉴 맨 위에 **기상청 라이브**를 공개했다. 첫 화면의 아름다운 지구는
그대로이며, 사용자가 메뉴를 눌렀을 때만 필요한 자료를 탭별로 지연 로딩한다.

공개 탭은 다음과 같다.

| 탭 | 공개 자료 | 화면 계약 |
|---|---|---|
| 지금 | 전국 736개 AWS 분 관측 | 기온·습도·바람·강수, 원자료 지도 |
| 5일 예보 | 97개 대표 5km 격자 | 향후 12시간, 같은 유효시각 비교, 발표·수집시각 분리 |
| 특보 | 기상청 공식 특보 | Safety Hard Gate가 점수보다 먼저, UNKNOWN을 SAFE로 바꾸지 않음 |
| 하늘 | 낙뢰·HSR 레이더·AWS 우량 | 대지낙뢰와 구름방전을 분리하고 레이더와 우량계를 구분 |
| 상층 | 최신 10개 레윈존데·2010년 이후 일별 표본 | TPW·CAPE·K·LI 원값, 경험 백분위·표본수·결측수 |
| 산 | 산 정상 공식예보 | 관측과 예보를 혼동하지 않음 |
| 바다 | 기상청 부이·등표·파고부이 | 파고·수온·풍향풍속, 품질 제외 수 표시 |
| 생활 | 기상청 생활기상지수 | 원자료가 없으면 생성하지 않음 |
| 기록 | 평년·검증·낙뢰/특보 일별 기록 | 기간·표본·출처를 함께 표시 |

태풍·지진·천리안2A는 기존의 전용 Earthus 레이어를 유지한다. KMA Live에서 같은 자료를
중복 수집하지 않고, 관측·예보·특보·레이더·상층·해양 자료의 발견성과 판독성을 높였다.

## 2. 운영 수집 경로

이번 공개 화면이 사용하는 기상청 운영 경로는 아래와 같다.

| 기능 | 공개 객체 | 역할 |
|---|---|---|
| `kma-aws` | `wind/kma-aws.json` | ASOS 정시 관측 |
| `kma-aws-min` | `wind/kma-aws-min.json` | 736개 AWS 분 관측 |
| `kma-fcst` | `wind/kma-fcst.json` | 97개 대표격자 공식 단기예보 |
| `kma-warn` | `events/kma-warn.json` | 공식 특보와 Safety 입력 |
| `lightning` | `events/kma-lightning.json` | 최근 낙뢰·구름방전 |
| `kma-mountain` | `wind/kma-mountain.json` | 산악 예보 |
| `kma-life` | `wind/kma-life.json` | 생활기상지수 |
| `kma-normal` | `wind/kma-normal.json` | 1991–2020 평년값 |
| `kma-ocean` | `ocean/kma-buoy.json` | 부이·등표·파고부이 관측 |
| `kma-upper` | `wind/kma-upper.json` | 최신 레윈존데 원값 |
| `kma-verify` | `wind/series/verify-daily.json` | 일별 검증 집계 |
| `kma-radar` | `wind/kma-radar.png`, `.json` | HSR 공식 렌더 영상과 메타데이터 |

`kma-radar-schedule`은 서울 리전에서 `cron(0/5 * * * ? *)`로 활성화했다. Lambda 호출
권한과 대상 등록을 완료했고, 연속 생산시각의 운영 객체 갱신으로 실제 실행을 확인했다.
APIHub 응답은 PNG 서명·가로세로 크기·최소 바이트를 검증한 뒤에만 교체한다. 최신 시각이
아직 생산되지 않았으면 5분 단위로 이전 시각을 제한 재시도하며, 모두 실패하면 last-good을
덮어쓰지 않는다.

## 3. 자료 품질과 표현 원칙

- 결측은 `—` 또는 결측수로 보이며 `0`으로 바꾸지 않는다.
- 예보 순위는 97개 대표격자의 **같은 유효시각**만 비교한다. 관측 순위로 부르지 않는다.
- 기상청 표준 KST 문자열과 상층 UTC 문자열을 별도로 해석하고 화면에는 KST/UTC를 표시한다.
- 공식 특보는 Activity 점수보다 먼저 작동하며, 위치·구역 매칭 근거가 없으면 `UNKNOWN`이다.
- HSR 레이더 영상, AWS 우량계 관측, 낙뢰 관측을 서로 다른 근거로 표시한다.
- 상층 백분위는 확률이나 위험 판정이 아니라 2010년 이후 보유 표본 안의 경험적 위치다.
- 해양 파고가 30m를 넘으면 원값은 `whRaw`와 quality flag로 보존하되 지도·극값·요약에서는
  제외한다. 이번 검수에서 90.0m 원값이 같은 시각 주변 관측 0.6m와 맞지 않는 사례를 찾아
  이 규칙을 추가했다.
- 각 객체와 화면에는 출처·관측/발표/수집시각·단위·라이선스를 보존한다.

이번에 사용하는 기상청/공공데이터 경로는 각 데이터셋에 표시된 공공누리 제1유형의
출처표시 조건을 화면과 캐시에 반영했다. 이 문장은 기상청 전체 카탈로그에 대한 포괄 허가가
아니며, 새 데이터셋은 `DataSource`의 license·region·redistribution을 다시 확인한 뒤 연결한다.

## 4. TPW 수증기 통로 공개

PD의 “자료가 들어오면 최대한 적용하고 재미있고 판독 가능하게 표현”하라는 공개 지시와
실자료 검수를 공개 승인으로 기록하고 `TPW_READY=true`를 운영 반영했다.

- NOAA/NCEP GFS 모델분석 총가강수량 1° 격자: 91×36 = 3,276/3,276
- 결측: 0
- 검수 범위: 4.7–77.4 mm
- 화면 명칭: **수증기 통로**
- 화면 고지: 위성관측·강수량·예보가 아니라 모델분석 TPW
- 지도: 단계색, 등치선, 단위·유효시각·해상도·원격자수, 도시/지점 값과 출처

판매 `SALES_OPEN`, Decision 공개, 예약 실행, SNS 자동 게시 flag는 열지 않았다.

## 5. 자동검사

- KMA Live: 25/25
- Continuous Layers: 40/40
- Safety Engine: 23/23
- PR-11 release gate: TPW 공개, 판매·Decision·자동 게시 닫힘
- TPW layer: PASS
- AETHERUS foundation: PASS
- 모든 변경 Python handler `py_compile`: PASS
- 모든 변경 JavaScript `node --check`: PASS
- `git diff --check`: PASS

## 6. 운영 실화면

데스크톱 운영 화면에서 다음을 확인했다.

- 메뉴 요약: `736개 실측 · 5일 공식예보 · 레이더 · 특보 · 상층 · 바다`
- 5일 예보: 대표격자 97/97, 실패 0, 유효시각과 발표·수집시각 표시
- HSR 레이더: 1035×1020 PNG, 검수 시점 38,942 bytes, `image/png`, 180초 캐시
- 상층: 10개 관측소, 2010년 이후 6,060일 표본, 원값·백분위·결측수 표시
- 바다: 당시 운영 응답 170개 지점, 고정 숫자가 아니라 응답 count 표시
- TPW: 단계색·등치선·도시값·모델분석 고지와 출처 표시
- EARTHUS origin JavaScript error: 0

390×844 운영 화면에서도 기상청 라이브 진입·가로 스크롤 탭·실자료 표시를 확인했다.
문서 가로 overflow는 0이고 JavaScript error도 0이었다. 첫 Earth에는 기상 자료 패널이나
수치층을 자동으로 열지 않는다.

## 7. 파일 무결성과 헤더

CloudFront cache-busting GET의 SHA-256이 배포한 로컬 파일과 일치했다.

| 운영 경로 | SHA-256 |
|---|---|
| `/js/korea.js` | `95726bb24f13559c228a71d4d873b89b5d09049bd6c7065a0a363129b9caebbf` |
| `/js/kma-live-metrics.js` | `34b88ace3c86a623dbab08c584abda7e1d5634efe7c896f1620f45dd59d95692` |
| `/js/ui-korea.js` | `505a4d1b1049817c926403dab44d500b7f7963f83e29130ae511e48e6ac3791d` |
| `/js/layerbar.js` | `bf6ade228b1ac5fa9f16087db1e3023aad45e83e494c8057e5145e6cbc2d697d` |
| `/js/ui-apikeys.js` | `494f3777906bfee85a6a4cbd795b6cfa9c0e147f94397458cecfe19be7aed32c` |
| `/js/changelog.js` | `b0bb47dd0786b27d04c53308418555eab8e6fd049ba230a21dd1102b34c2f1c3` |
| `/css/kma-live.css` | `fb14e959d6a2998e52350d06abe592892dd40824c4de348d4bfd52fb56cacd65` |

JS는 `text/javascript; charset=utf-8`, CSS는 `text/css; charset=utf-8`, 레이더는
`image/png`를 확인했다. 배포 계정에는 `cloudfront:GetInvalidation` 권한이 없어 waiter는
거부됐지만, 무효화 생성 성공과 CDN 실제 바이트·운영 UI로 반영을 별도 입증했다.

## 8. 롤백과 운영 확인

- UI 롤백은 위 정적 파일만 이전 커밋 버전으로 같은 Content-Type과 cache header로 올린 뒤
  CloudFront 무효화를 만든다.
- TPW만 긴급 비공개할 때는 `config.local.js`의 `TPW_READY=false`를 배포한다. 판매·Decision
  flag와 함께 바꾸지 않는다.
- 레이더 문제가 생기면 EventBridge 규칙을 중지해 last-good을 보존하고 Lambda 로그와
  `wind/kma-radar.json`을 먼저 확인한다. 검증되지 않은 PNG를 수동 덮어쓰지 않는다.
- 새 기상청 데이터셋을 붙일 때는 출처·시각·단위·결측·license·region·redistribution과
  서울 리전에서의 실제 응답/네트워크를 검증한 뒤 공개한다.
