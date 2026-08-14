# Ocean Vessel Lite Foundation — O5 shadow

## 상태

`LOCAL_SHADOW_COMPLETE / ALL_PROVIDERS_DRAFT`. AIS provider manifest, coverage, freshness,
redistribution, history, remote feature flag와 query limit 계약을 fixture로 검증했다. 운영 manifest의
두 provider slot은 모두 `DRAFT + OFF`이고 좌표·외부 링크를 제공하지 않는다.

## 상태 의미

| 상태 | 의미 |
|---|---|
| `LIVE` | 승인 provider의 live freshness 이내. observed/received UTC와 attribution 표시 필수 |
| `DELAYED` | 표시 가능 기간이지만 live 기준 밖. 실시간 배지 금지 |
| `HISTORICAL` | history 권리가 승인된 과거 재생. 현재 위치로 사용 금지 |
| `EXTERNAL` | 원시 좌표 재배포 없이 승인된 HTTPS provider 링크만 제공 |
| `UNAVAILABLE` | provider, 권리, coverage, query, freshness 또는 데이터가 없음. marker/track 0 |

## 보호 계약

- `APPROVED` provider는 승인 coverage polygon, freshness 세 구간, terms URL,
  license revision, review UTC, attribution을 모두 가져야 한다.
- public response는 provider `APPROVED + PUBLIC` 조합에서만 열린다. `OFF`와 `SHADOW`는 fail-closed다.
- `redistribution=false`면 원시 좌표를 Earthus 응답에 넣지 않는다.
- history는 `historyAllowed=true`일 때만 `HISTORICAL` track으로 보낸다.
- LIVE는 provider latency class가 LIVE이고 `liveMaxAgeSeconds` 이내일 때만 쓴다.
- stale 위치는 provider의 최대 표시 기간 안에서만 DELAYED로 보이며 실시간 배지는 없다.
- coverage 밖, 너무 넓은 bbox, 낮은 zoom, 최대 표시 시간 초과에는 marker를 만들지 않는다.
- bbox 결과 수는 provider manifest의 서버 limit로 잘리고 `truncated`를 명시한다.
- MMSI, 좌표, 속도, 방향, observed/received 시각은 검증할 뿐 추정·보간하지 않는다.
- 자체 AIS 수신기와 글로벌 위성 AIS는 O5 선행조건이 아니다.

## 검증

`tools/test_ocean_vessel_lite.mjs`가 다음을 검증한다.

- OT-009: 미지원 해역 `UNAVAILABLE`, marker/track 0.
- OT-010: stale 위치 `DELAYED`, 실시간 배지 제거.
- fresh LIVE의 source/receive time과 license evidence.
- history 권리가 있는 과거 좌표만 HISTORICAL 재생.
- redistribution 금지 provider는 raw coordinate 0, 승인 external link만 반환.
- remote OFF, bbox/zoom/result-count gate와 운영 DRAFT manifest.
- module 내부 network/timer/animation side effect 없음.

## 닫힌 gate

1. 실제 공급자 명칭·약관·상업 이용·재표시·cache/history 권리 법무 검토.
2. 실제 coverage polygon과 제외 선박/해역, latency SLA, rate limit 측정.
3. server bbox query, API key, stream ingestion, provider health와 원격 kill switch.
4. 운영 attribution UI, provider 장애·약관변경 훈련, 비용 계측.
5. 글로벌 AIS, 항적 보관, 지오펜스·입출항 알림, B2B SLA.
