# LAB 분석 보고서 공통 계약

> 2026-08-11 확정. 태풍과 이후 이동 현상의 종료 보고서는 모두 EARTHUS `LAB > 분석 보고서`에 쌓인다.

## 1. 역할

LAB은 계산 결과를 홍보하는 카드 모음이 아니다. 사건 당시 입력·계산 회차·결측을 보존하고,
종료 뒤 확인된 관측과 대조해 같은 방식으로 읽게 하는 기록소다.

- 현재 관측, 기관 발표, 공식 경보, 출처, 시각, 방법론과 안전 정보: 무료
- 개인화 계산, 장기 이력, 저장된 계산 회차, 종료 검증 상세: 구독·관리자
- `PRELIMINARY_REPORT`는 잠정이며 `FINAL_REPORT`만 확인된 최종 자료와 대조한다.
- 한 사건 결과로 기관의 장기 우열을 선언하지 않는다.
- 실제 보고서가 없으면 0건이라고 쓰며 예시 보고서를 만들지 않는다.

## 2. 대상

1. 태풍
2. 산불 연기·화산재
3. 황사·미세먼지
4. 해류 표류
5. 철새 이동
6. 해파리·적조
7. 오로라 관측 가능 지역
8. 위성·우주잔해 재진입

태풍을 포함하면 LAB의 계산 보고서 종류는 8개다. 새 종류를 추가할 때는 화면에 하드코딩한
카드를 먼저 만들지 말고 이 계약과 색인 수집기부터 확장한다.

## 3. 상태

```text
DETECTED → ACTIVE → VERIFYING → PRELIMINARY_REPORT → FINAL_REPORT
```

- `DETECTED`: 원자료에서 처음 확인
- `ACTIVE`: 계산 회차를 보존하는 중
- `VERIFYING`: 입력에서 사라졌지만 종료를 단정하지 않고 확인하는 중
- `PRELIMINARY_REPORT`: 정한 대기시간이 지났으나 최종 검증 자료가 없음
- `FINAL_REPORT`: 이름·기간·대상이 맞는 최종 관측 자료를 확인해 대조 완료

현상별 종료 조건과 대기시간은 다르며 각 계산기의 방법론에 공개한다.

## 4. 공개 색인

공통 공개 경로는 `ocean/lab-reports.json`이다. `aws/lab-report-index`가 실제로 존재하는
현상별 목록만 읽어 생성한다.

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-11T00:00:00Z",
  "count": 1,
  "reports": [{
    "id": "cyclone:WP012026",
    "kind": "cyclone",
    "title": "태풍 이름",
    "status": "ACTIVE",
    "access": "pro",
    "detectedAt": "2026-08-10T00:00:00Z",
    "lastSeen": "2026-08-11T00:00:00Z",
    "snapshotCount": 4,
    "sourceCount": 5,
    "sampleCount": 120,
    "confidence": "medium",
    "summary": "확인된 사실만 쓴 한 문장"
  }]
}
```

공개 색인에는 원행, 계산 좌표, 기관별 상세 오차, 개인 위치를 넣지 않는다. 화면을 숨기는 것만으로
유료 자료를 보호하지 않는다. 상세 자료는 비공개 저장소와 서버 권한 확인을 통과한 응답으로 분리한다.

## 5. 현상별 입력 파일

| 종류 | 입력 목록 |
|---|---|
| 태풍 | `ocean/cyclone-reports.json` |
| 산불 연기·화산재 | `analysis/smoke-ash-reports.json` |
| 황사·미세먼지 | `analysis/air-pollution-reports.json` |
| 해류 표류 | `analysis/ocean-drift-reports.json` |
| 철새 이동 | `analysis/bird-migration-reports.json` |
| 해파리·적조 | `analysis/marine-bloom-reports.json` |
| 오로라 | `analysis/aurora-reports.json` |
| 위성·우주잔해 재진입 | `analysis/space-reentry-reports.json` |

현상별 `analysis/` 입력은 Lambda가 읽는 내부 수집 경로다. CloudFront에 새 공개 동작을 만들지
않고, 브라우저용 최소 색인만 기존 공개 데이터 경로인 `ocean/`에 둔다.

## 6. 현상별 보고서가 반드시 남길 것

- 입력 자료별 출처, 관측/발표/수신/유효 시각과 이용조건
- 버린 자료 수와 이유, 결측, 공간·시간 해상도
- 계산식 버전, 공개 가중치와 중단 임계값
- 점 또는 시간대별 독립 자료군 수, 표본 수 `n`, 분산과 신뢰등급
- 당시 화면에 공개한 중심 참고선·가능 범위 또는 관측 가능성 점수
- 종료 판정 근거와 최종 검증 자료
- 기준선 대비 오차와 현상별 적절한 검증 지표
- 다음 사건에서 바꿀 항목과 바꾸지 않을 항목

정확한 충돌 지점·건강 영향·구조 가능성처럼 자료가 보장하지 않는 결론은 만들지 않는다.
