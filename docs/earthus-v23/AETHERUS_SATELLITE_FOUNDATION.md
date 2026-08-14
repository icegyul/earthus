# Aetherus Satellite Foundation — Sheets 91–101

## 상태

`LOCAL_SHADOW_COMPLETE / TLE_PROVIDER_AND_PROPAGATOR_EXTERNAL`. SatelliteObject identity, NORAD,
International Designator, explicit orbit class/elements/epoch/source, status evidence, calculated position,
ground track, private-location pass, info panel과 4개 filter를 합성 fixture로 검증했다.

## 보호 계약

- orbit class는 이름이나 고도에서 즉석 추정하지 않고 classification source와 함께 받는다.
- orbit epoch는 APPROVED freshness policy로 FRESH/STALE/EXPIRED_WARNING/UNUSABLE을 판정한다.
- 현재 위치·ground track·next pass는 source orbit revision과 propagator revision을 가진 계산값이다.
  실측/LIVE라고 표시하지 않는다.
- next pass는 exact 좌표 대신 private opaque locationRef만 저장하며 `observed=false`다.
- status active/inactive/decayed/lost/unknown은 official/curated evidence를 요구한다.
- Starlink/한국/과학/기상 filter는 constellation/countryCode/missionTypes 명시 필드만 사용한다.
- 위치 자료가 없거나 orbit revision/freshness가 맞지 않으면 marker를 만들지 않는다.

## 닫힌 gate

현재 policy는 `DRAFT + productionEnabled=false`다. 실제 TLE/OMM provider 약관·freshness,
SGP4 golden/epoch accuracy, pass visibility model, 사용자 위치 RLS, 운영 satellite registry,
실기기 AR/알림은 미연결이다.
