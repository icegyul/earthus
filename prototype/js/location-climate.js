// 내 위치에서 가까운 장기 관측소의 해마다 한 줄인 1년 기온 자료
// ⚠️ 좌표 자체의 기온이 아니다. 가장 가까운 관측소 이름·거리·고도를 반드시 함께 보인다.

const INDEX = 'data/station-temp/index.json';
const MAX_KM = 40;

const km = (a1, o1, a2, o2) => {
  const r = Math.PI / 180;
  const h = Math.sin((a2 - a1) * r / 2) ** 2
    + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin((o2 - o1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

export async function climateSeriesAt(lat, lon) {
  const response = await fetch(INDEX, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`STATION_TEMP_INDEX_${response.status}`);
  const index = await response.json();
  const station = (index.stations || [])
    .map(item => ({ ...item, km: km(lat, lon, item.lat, item.lon) }))
    .sort((a, b) => a.km - b.km)[0];
  if (!station || station.km > MAX_KM) return null;
  const dataResponse = await fetch(station.path, { cache: 'no-cache' });
  if (!dataResponse.ok) throw new Error(`STATION_TEMP_${dataResponse.status}`);
  return { station: { ...station, km: Math.round(station.km) }, data: await dataResponse.json() };
}
