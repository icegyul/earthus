# Earthus · Aetherus Discovery Foundation

## 상태

`LOCAL_SHADOW_COMPLETE / CATALOG_AND_PROVIDER_EXTERNAL`. Sheet 043, 047, 050, 056, 061의
검색·모델·추천·공유·망원경 확장 계약을 합성 fixture로 검증했다.

## 보호 계약

- 별자리, 태양계 객체, 성단, 외계행성은 명시 type과 official/curated evidence를 가진다.
- 검색은 이름·alias·external ID만 사용하며 exact match와 이름으로 결정론적으로 정렬한다.
- 추천은 catalog에 저장된 relation, reason, evidence만 반환하고 임의 추천을 만들지 않는다.
- 공유 링크는 object reference와 view만 담고 exact 좌표, token, session을 제거한다.
- telescope provider는 registry의 rights record를 요구하며 DRAFT/off에서는 호출이 차단된다.

## 닫힌 gate

현재 policy는 `DRAFT + productionEnabled=false`다. 실제 Earth/Space catalog 정본, 검색 index,
추천 편집 검수, canonical production origin, telescope provider 약관·rate limit은 미연결이다.
