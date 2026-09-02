# 공공데이터포털 문의 초안 — 지역별 관광 다양성 / 관광 수요 강도

두 데이터셋이 정상 응답(HTTP 200, `resultCode` 정상)을 주면서 항목만 비어 옵니다. 요청 형식·기준월·지역코드를 모두 배제한 뒤 남은 확인 사항을 문의합니다. 아래 본문을 데이터셋 페이지의 "문의하기"에 그대로 붙여 넣으면 됩니다.

- 한국관광공사_지역별 관광 다양성 — https://www.data.go.kr/data/15151365/openapi.do
- 한국관광공사_지역별 관광 수요 강도 — https://www.data.go.kr/data/15151868/openapi.do

---

## 문의 본문

안녕하십니까. 활용신청 승인(2026-08-15) 후 위 두 오픈API를 호출하고 있으나, 정상 응답에 항목이 계속 비어 있어 문의드립니다.

**증상**: `resultCode`가 정상이고 HTTP 오류나 인증 오류도 없으나 `items`가 항상 비어 있습니다. 요청 자체가 거부되는 것이 아니라 결과가 0건으로 옵니다.

**저희가 배제한 것**

1. 기준월(`baseYm`) — 202601·202602·202603·202604·202605·202606·202512·202511·202510·202509·202506·202503·202412 총 13개월을 각각 호출했고 전부 0건이었습니다.
2. 지역코드 체계(`areaCd`) — 법정동 시도코드(`11`, 서울)와 TourAPI 지역코드(`1` 서울, `31` 경기)를 모두 시도했고 전부 0건이었습니다.
3. 시군구코드(`signguCd`) 동반 여부 — `areaCd`만 보낸 경우와 `areaCd`+`signguCd`(`11`+`11110`, 종로구)를 함께 보낸 경우 모두 0건이었습니다.
4. 저희 구현 오류 — 같은 인증키와 같은 호출 계층으로 한국관광공사_관광지별 연관 관광지 정보, 기초지자체 중심 관광지 정보, 관광지 집중률 방문자 추이 예측 정보, 빅데이터 지역별 방문자수는 정상적으로 데이터를 수신하고 있습니다.

**여쭙고 싶은 것**

1. 현재 이 두 API가 실제 데이터를 제공하는 **기준연월 범위**가 어떻게 됩니까? (제공 가능한 `baseYm` 예시를 하나 알려주시면 확인이 가능합니다)
2. `areaCd`에 사용해야 하는 **지역코드 체계**가 무엇입니까? 법정동 코드입니까, TourAPI 지역코드입니까?
3. `signguCd`, `touDivIxCd`(다양성) / `tarSjrnDsIxCd`(수요 강도) 중 **응답을 받기 위해 반드시 함께 보내야 하는 값**이 있습니까? 활용가이드에는 선택으로 표기되어 있습니다.
4. 활용신청 승인과 별개로 **데이터 제공이 시작되는 시점**이 따로 있습니까?

정상 응답을 받은 요청의 파라미터 예시를 하나만 알려주시면 곧바로 대조해 보겠습니다. 감사합니다.

---

## 답이 오면 할 일

지역 전역 수집기는 이미 만들어져 있으므로 호출 한 번이면 채워집니다.

```bash
aws lambda invoke --function-name tourism-flow --region ap-northeast-2 --profile earthus-deploy --cli-read-timeout 0 --cli-binary-format raw-in-base64-out --payload '{"task":"KTO_SWEEP_BATCH","budgetSeconds":220,"baseYm":"<확인된 기준월>","jobs":[{"service":"diversity","operation":"areaTouDivList"},{"service":"diversity","operation":"areaExpDivList"},{"service":"diversity","operation":"areaIntlDivList"},{"service":"demandStrength","operation":"areaTarSjrnDsList"},{"service":"demandStrength","operation":"areaTarExpDsList"}]}' /tmp/kto.json
```

지역코드 체계가 다른 것으로 확인되면 진단용 `regionCodes` 옵션으로 먼저 한 지역만 확인할 수 있습니다(`aws/tourism-flow/kto_collector.py`의 `_run_region_sweep`).

채워진 뒤에는 `tools/build_kto_discovery.py`의 `SERVICES`에 두 서비스를 추가하고, 발견 점수의 `diversity`·`dwell` 성분으로 연결하면 됩니다(설계는 `COMPETITION_2026_ENTRY_ANALYSIS.md` 3.3.3).
