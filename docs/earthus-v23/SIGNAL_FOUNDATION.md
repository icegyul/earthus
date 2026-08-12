# Signal Foundation — PR-01 실행 계약

> 기준일: 2026-08-12 KST
> 상태: **로컬 구현·계약 검증 완료 / AWS 배포·스케줄·reader 전환 미승인**

## 1. 목적과 비목적

64개 기존 source handler를 한 번에 바꾸지 않는다. 대표 입력 3종을 그대로 읽어
`earth.signal.v1` 비공개 shadow를 만들고, 이후 Safety·Activity·Live가 같은 시간·좌표·
단위·결측·정정 계약을 쓸 수 있는지 먼저 검증한다.

```text
기존 공개 JSON ─────────────→ 기존 화면 reader (변경 없음)
       └→ signal-foundation → archive/canonical/v1/*.json (비공개 shadow)
```

- 기존 writer, 공개 객체, UI, Safety, Activity, AETHERUS를 수정하지 않는다.
- shadow는 판단 정본·화면 정본·운영 cutover가 아니다.
- 공식 특보의 구역 경계가 없으면 대표점으로 안전 판정을 만들지 않는다.
- 배포·스케줄·운영 데이터 생성은 별도 승인 전 하지 않는다.

## 2. 코드와 schema

- 실행 코드: `aws/signal-foundation/`
- 단일 signal schema: `schema/earth-signal-v1.schema.json`
- batch schema: `schema/earth-signal-batch-v1.schema.json`
- fixture: `aws/signal-foundation/fixtures/`
- processor version: 환경변수 `PROCESSOR_VERSION`이 있으면 그 값을 쓰고, 없으면
  `canonical.py`, `adapters.py`, `handler.py`의 코드 SHA-256을 자동 기록한다. `dev`는 쓰지 않는다.

모든 batch는 원 객체의 bucket/key/bytes/ETag/lastModified/SHA-256, 처리 시각, 원 행 수,
canonical 행 수, 거절 수와 이유를 남긴다. 단일 signal은 source time 원문, UTC 시각,
source/canonical 단위, 변환 version, 좌표 변환, 결측 이유, revision과 `supersedes`를 남긴다.
PR-02부터 batch와 signal 양쪽에 안정된 `sourceId`와 source metadata를 둔다. 빈 batch도
권리·freshness 평가에서 출처를 잃지 않는다.

## 3. 호환 adapter 3종

| 입력 | canonical | 안전 규칙 |
|---|---|---|
| `events/kma-warn.json` | `weather.warning` | 현 좌표는 구역 내 관측소 평균일 뿐이다. 공식 polygon mapping 전까지 `geometry=null`, `value=null`, `REGION_UNMAPPED`, `quality=UNKNOWN` |
| `wind/kma-aws-min.json` | `weather.surface.temperature` | 관측소별 기온만 1차 변환. 원 결측은 `null/NOT_REPORTED`; 좌표 없음은 공간 품질 `UNKNOWN` |
| `wind/tpw-ea.json` | `weather.total_column_water_vapour` | GFS 모델 분석장이다. `observedAt=null`, run/valid 시각 분리, `kg/m²→mm` 1:1 변환 version 기록, 강수·위성 관측으로 승격 금지 |

산출물은 각각 `archive/canonical/v1/kma-warning.json`,
`kma-aws-temperature.json`, `noaa-gfs-tpw.json`이다.

## 4. 2026-08-12 검증 증거

- 자동검사 12개 통과: CAN-01~08, 3,276칸 TPW 용량, 원본/비공개 shadow 격리,
  이전 shadow 권한 오류 비은폐, adapter 부분 실패 격리.
- 실제 공개 `events/kma-warn.json`: 원 29건 → canonical 29건, parser 거절 0.
  공식 경계 미매핑 29건은 모두 `UNKNOWN`이며 Safety 입력으로 승격하지 않았다.
- 실제 공개 `wind/kma-aws-min.json`: 두 차례 모두 원 736지점 → canonical 736건,
  parser 거절 0. 실시간 원자료의 기온 결측은 첫 확인 11건, 최종 재확인 9건이었고
  어느 경우도 0으로 바꾸지 않고 `null/NOT_REPORTED`로 유지했다.
- PR-00A 실제 NOAA GRIB 기준은 91×36=3,276칸이다. 동일 크기 canonical scale 검사는
  3,276건을 0.08초, JSON 4,818,284 bytes 안에서 만들었다. 로컬 Python에는 배포용
  ecCodes native package가 없어 이번 검사에서 NOAA GRIB를 다시 해독했다고 주장하지 않는다.
- S3 bucket policy를 읽기 전용 확인했다. 익명 공개는 `app/celestrak/clouds/wind/events/ocean/solar`
  프리픽스에만 허용되며 `archive/`는 제외된다. `Cache-Control: private, no-store`는 캐시
  지시일 뿐 접근제어가 아니므로, 운영 검수에서는 익명 GET 403도 별도로 확인한다.

## 5. 운영 전환 gate

다음을 모두 통과하고 PD가 승인하기 전에는 Lambda를 만들거나 schedule을 등록하지 않는다.

1. Python 3.12 서울 리전에서 3 source GET과 3 shadow PUT 성공
2. IAM은 해당 source GET과 `archive/canonical/v1/*` PUT/GET만 허용하도록 축소
3. 세 객체 `Content-Type=application/json; charset=utf-8`, `private, no-store`, 익명 GET 403
4. 실제 TPW 3,276칸 변환 시간·peak memory·객체 크기와 KMA 실제 행 수 기록
5. 같은 입력 2회는 같은 signalId, 정정 입력은 새 revision과 `supersedes` 연결
6. adapter 하나 실패 시 다른 shadow는 만들되 전체 결과 `ok=false`, 실패 이유와 경보 기록
7. 기존 공개 객체 hash 불변, 기존 UI network/표시/판단 불변
8. retention·비용·schedule 주기 승인과 rollback rehearsal

운영 검수 후에도 PR-02/05 전까지 canonical은 shadow다. authoritative reader 전환은
dual-read diff와 canary, Safety replay, feature flag rollback을 별도 승인받는다.

## 6. 로컬 재검사

```bash
python3 -m unittest aws/signal-foundation/test_signal_foundation.py
```

Python 3.9의 boto3 지원 종료 경고는 로컬 도구 경고다. 운영 계약은 Python 3.12이며,
경고를 숨겨 성공처럼 만들지 않는다.
