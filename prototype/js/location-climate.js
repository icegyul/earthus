// 내 위치에서 가까운 장기 관측소의 해마다 한 줄인 1년 기온 자료
// ⚠️ 좌표 자체의 기온이 아니다. 가장 가까운 관측소 이름·거리·고도를 반드시 함께 보인다.

const INDEX = 'data/station-temp/index.json';
const ASOS_INDEX = 'data/doy/index.json';
const MAX_KM = 40;
const LOCAL_ASOS_KM = 15;

const km = (a1, o1, a2, o2) => {
  const r = Math.PI / 180;
  const h = Math.sin((a2 - a1) * r / 2) ** 2
    + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin((o2 - o1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

export async function climateSeriesAt(lat, lon) {
  const [response, asosResponse] = await Promise.all([
    fetch(INDEX, { cache: 'no-cache' }),
    fetch(ASOS_INDEX, { cache: 'force-cache' }),
  ]);
  if (!response.ok) throw new Error(`STATION_TEMP_INDEX_${response.status}`);
  if (!asosResponse.ok) throw new Error(`ASOS_INDEX_${asosResponse.status}`);
  const [index, asosIndex] = await Promise.all([response.json(), asosResponse.json()]);
  const station = (index.stations || [])
    .map(item => ({ ...item, km: km(lat, lon, item.lat, item.lon) }))
    .sort((a, b) => a.km - b.km)[0];
  if (!station || station.km > MAX_KM) return null;

  /* ⚠️⚠️ 서울 화면에 인천 장기 곡선이 그대로 나왔던 사고를 막는다.
     `station-temp`는 올해까지 이어진 GHCN 관측소만 9곳이라, 가까운 ASOS가
     따로 있어도 다른 도시의 곡선을 대신 고를 수 있다. 거리 경고만 아래에 붙이면
     사용자는 이미 차트를 자기 도시 자료로 읽은 뒤다.
     → 15km 안에 실제 ASOS가 있고 장기 곡선의 지점이 다르면 차트를 그리지 않는다.
        위의 날짜별 평년 비교(data/doy)는 가까운 ASOS 정본을 계속 쓴다. */
  const local = (asosIndex.stations || [])
    .map(item => ({ ...item, km: km(lat, lon, item.la, item.lo) }))
    .sort((a, b) => a.km - b.km)[0];
  if (local && local.km <= LOCAL_ASOS_KM && Number(local.s) !== Number(station.id)) {
    return {
      unavailable: true,
      reason: 'station-mismatch',
      expectedStation: { id: local.s, name: local.n, km: Math.round(local.km) },
      referenceStation: { ...station, km: Math.round(station.km) },
    };
  }
  const dataResponse = await fetch(station.path, { cache: 'no-cache' });
  if (!dataResponse.ok) throw new Error(`STATION_TEMP_${dataResponse.status}`);
  return { station: { ...station, km: Math.round(station.km) }, data: await dataResponse.json() };
}
