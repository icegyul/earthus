# DATA SOURCE EXPANSION REGISTER — v0.6

## Tourism
- 한국관광 데이터랩: https://datalab.visitkorea.or.kr/
- 공공데이터포털 한국관광공사 OpenAPI 목록: https://www.data.go.kr/
- 확인된 활용군: 관광지 집중률 방문자 추이 예측, 지역별 방문자수, 기초지자체 중심 관광지, 관광지별 연관 관광지, 무장애, 생태관광, 관광사진, 캠핑, 오디오가이드, 반려동물, 웰니스, 지역별 관광 다양성, 지역별 관광 수요 강도, 지역별 관광 자원 수요.

주의: 이동통신 기반 방문자 수는 관광객과 동일하지 않으며, 집계 단위를 임의 합산하지 않는다. 집중률은 실제 인원 수가 아니라 상대 지수다.

## Environment — initial expansion
- AirKorea/KMA/current Earthus assets: air quality + weather/wind
- NASA FIRMS/current Earthus assets: wildfire hotspots
- 해양환경공단 실시간 해양수질자동측정망(OpenAPI 검토 대상)
- Copernicus Marine Ocean Colour: chlorophyll/suspended matter/transparency type signals
- Sentinel-1/Copernicus: oil-slick candidate detection input
- EMODnet Chemistry: beach/seafloor/micro-litter historical/monitoring products
- 국립환경과학원 토양오염실태조사: annual soil contamination observations
- US EPA Envirofacts/TRI/Superfund: industrial/toxic release and contaminated-site data
- NASA EMIT / other licensed methane plume products: detected greenhouse-gas plumes

## Public Action / NGO
No universal NGO activity API is assumed.
Collection strategy:
- official API/RSS/Atom when available
- official action/campaign/event page
- official event platform
- official social channel only as a secondary source
- news only as reported evidence

Initial organizations to evaluate:
- Greenpeace International / Greenpeace Korea
- WWF
- The Ocean Cleanup
- Ocean Conservancy

Before enabling any automatic fetch, robots/terms/licensing and rate limits must be registered in Source Governance.
