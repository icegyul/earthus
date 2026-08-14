# Aetherus Infrastructure Foundation — Sheets 233–245

## 상태

`LOCAL_POLICY_COMPLETE / CLOUD_INFRA_EXTERNAL`. CDN/cache tier, private original, cache key,
SWR fallback, bucket prefix, lifecycle/checksum, autoscaling proposal, 비용 원천 metric,
provider rate/circuit/retry와 incremental/full-resync plan을 합성 fixture로 검증했다.

## 보호 계약

- private original은 CDN public read를 허용하지 않고 owner-scoped signed read만 계획한다.
- cache key에는 rights revision을 포함하고 URL/token/signed URL을 입력받지 않는다.
- stale fallback은 origin failure와 명시된 제한 시간 안에서만 가능하다.
- checksum 불일치는 공개하지 않고 quarantine으로 보낸다.
- egress/storage/cache hit ratio는 source와 observation time이 있는 metric만 사용한다.
- 비용은 측정 소스 없이 추정하지 않아 `estimatedCost=null`로 유지한다.
- autoscaling은 증거가 있어도 proposal만 만들며 자동 적용하지 않는다.
- provider circuit/rate/retry와 schedule은 policy 값만 사용한다.
- full resync는 승인자·승인시각·사유 없이는 계획조차 만들지 않는다.

## 닫힌 gate

현재 policy는 `DRAFT + productionEnabled=false`다. 실제 CDN/bucket/lifecycle, KMS/signed URL,
cloud metric·가격표, autoscaling target, provider credential/약관, scheduler와 ingestion cursor store는
미연결이다. JSON의 수치는 합성 테스트 policy이며 운영 기준이 아니다.
