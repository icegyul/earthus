/* earthus 내 관측소
 *
 * ⚠️ 공개된 현재 ASOS와 날짜별 관측 이력만 읽는다. 30일·작년 자료가
 *    실제로 생기기 전에는 계산하거나 복원했다고 쓰지 않는다.
 */

const CURRENT_URL = '/wind/kma-aws.json';
const HISTORY_INDEX_URL = '/wind/series/stations.json';
const SAVED_KEY = 'earthus.adoptedStationV1';
const SVG_NS = 'http://www.w3.org/2000/svg';
const $ = selector => document.querySelector(selector);

const state = { current: null, historyIndex: null, historyDoc: null, stationId: null };
const FIELDS = [
  ['temp_c', '기온', '°C', 1], ['humid_pct', '습도', '%', 0], ['wind_ms', '풍속', 'm/s', 1],
  ['wind_dir', '풍향', '°', 0], ['rain_mm', '강수량', 'mm', 1], ['pres_hpa', '현지기압', 'hPa', 1],
];

function svg(tag, attrs = {}, text = null) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text != null) node.textContent = text;
  return node;
}

function selectedStation() {
  return (state.current?.stations || []).find(station => station.id === state.stationId) || null;
}

function formatObserved(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 10) return value || '관측 시각 없음';
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)} ${digits.slice(8, 10)}:00 KST`;
}

function formatGenerated(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '생성 시각 없음';
  return `${new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Seoul',
  }).format(date)} KST`;
}

function renderPicker() {
  const picker = $('#stationPicker');
  picker.innerHTML = '';
  const stations = [...(state.current?.stations || [])]
    .filter(station => station.lat != null && station.lon != null)
    .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), 'ko'));
  if (!stations.some(station => station.id === state.stationId)) {
    const saved = localStorage.getItem(SAVED_KEY);
    state.stationId = stations.some(station => station.id === saved)
      ? saved : stations.find(station => station.id === '108')?.id || stations[0]?.id || null;
  }
  stations.forEach(station => {
    const item = document.createElement('option');
    item.value = station.id;
    item.textContent = `${station.name || station.id} · ${station.id}`;
    picker.append(item);
  });
  picker.value = state.stationId || '';
  paintSaved();
}

function paintSaved() {
  const saved = localStorage.getItem(SAVED_KEY);
  const active = saved && saved === state.stationId;
  const button = $('#saveStation');
  button.classList.toggle('saved', Boolean(active));
  button.textContent = active ? '저장됨 · 이 기기의 내 관측소' : '이 지점을 내 관측소로 저장';
}

function renderCurrent() {
  const station = selectedStation();
  if (!station) return;
  $('#stationName').textContent = station.name || `ASOS ${station.id}`;
  const place = [`지점 ${station.id}`, station.alt != null ? `해발 ${station.alt}m` : null,
    station.lat != null && station.lon != null ? `${station.lat.toFixed(4)}, ${station.lon.toFixed(4)}` : null]
    .filter(Boolean).join(' · ');
  $('#stationMeta').textContent = place;
  $('#observedTime').textContent = formatObserved(state.current.observedKst);
  const grid = $('#currentGrid');
  grid.innerHTML = '';
  FIELDS.forEach(([field, label, unit, digits]) => {
    const value = station[field];
    const card = document.createElement('article');
    card.className = `current-card${Number.isFinite(Number(value)) ? '' : ' missing'}`;
    const title = document.createElement('span');
    const number = document.createElement('strong');
    title.textContent = label;
    number.textContent = Number.isFinite(Number(value)) ? `${Number(value).toFixed(digits)} ${unit}` : '자료 없음';
    card.append(title, number);
    grid.append(card);
  });
}

function stationHistory() {
  const rows = [];
  Object.entries(state.historyDoc?.hours || {}).forEach(([time, hour]) => {
    const item = (hour.stations || []).find(candidate => candidate.stationId === state.stationId);
    if (!item) return;
    rows.push({ time, temp: item.values?.temp_c, wind: item.values?.wind_ms });
  });
  return rows.sort((a, b) => a.time.localeCompare(b.time));
}

function renderSparkline(selector, rows, field, className, rangeSelector, unit) {
  const chart = $(selector);
  chart.innerHTML = '';
  const values = rows.map(row => Number(row[field])).filter(Number.isFinite);
  if (!values.length) {
    chart.append(svg('text', { x: 320, y: 92, 'text-anchor': 'middle', class: 'chart-empty' }, '아직 기록된 값이 없습니다'));
    $(rangeSelector).textContent = '결측은 0으로 표시하지 않습니다.';
    return;
  }
  const width = 640, height = 180, pad = 20;
  const min = Math.min(...values), max = Math.max(...values);
  const span = Math.max(max - min, .5);
  const x = index => pad + (rows.length <= 1 ? (width - pad * 2) / 2 : index / (rows.length - 1) * (width - pad * 2));
  const y = value => pad + (1 - (value - min) / span) * (height - pad * 2);
  [pad, height - pad].forEach(yy => chart.append(svg('line', { x1: pad, y1: yy, x2: width - pad, y2: yy, class: 'chart-grid' })));
  let path = '', open = false;
  rows.forEach((row, index) => {
    const value = Number(row[field]);
    if (!Number.isFinite(value)) { open = false; return; }
    path += `${open ? ' L' : ' M'} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`;
    open = true;
  });
  if (path) chart.append(svg('path', { d: path.trim(), class: `chart-${className}` }));
  rows.forEach((row, index) => {
    const value = Number(row[field]);
    if (!Number.isFinite(value)) return;
    const dot = svg('circle', { cx: x(index), cy: y(value), r: 6, class: `chart-dot ${className}` });
    dot.append(svg('title', {}, `${row.time} · ${value.toFixed(1)} ${unit}`));
    chart.append(dot);
  });
  $(rangeSelector).textContent = `${rows[0].time.replace('T', ' ')} → ${rows[rows.length - 1].time.replace('T', ' ')} · 최저 ${min.toFixed(1)} / 최고 ${max.toFixed(1)} ${unit}`;
}

function renderHistory() {
  const rows = stationHistory();
  renderSparkline('#tempChart', rows, 'temp', 'temp', '#tempRange', '°C');
  renderSparkline('#windChart', rows, 'wind', 'wind', '#windRange', 'm/s');
  $('#historyCount').textContent = `${rows.length}개 관측 시각`;
  $('#historyNote').textContent = rows.length
    ? `현재 날짜별 관측 파일 ${state.historyDoc.date} 안에서 이 지점의 관측 ${rows.length}개를 표시합니다. 날짜가 바뀌면 최신 날짜부터 읽습니다.`
    : '이 지점에는 아직 공개 시간 관측이 없습니다. 자료가 생길 때까지 빈칸으로 둡니다.';
}

function addDays(day, count) {
  const date = new Date(`${day}T00:00:00+09:00`);
  date.setDate(date.getDate() + count);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(date);
}

function renderReadiness() {
  const since = state.historyIndex?.collectingSince;
  const rows = stationHistory();
  $('#nowReady').textContent = rows.length ? `제공 중 · ${rows.length}시각` : '자료 축적 시작';
  if (!since) {
    $('#monthNote').textContent = '공개 기록 시작일을 확인할 수 없어 날짜를 만들지 않습니다.';
    $('#yearNote').textContent = '공개 기록 시작일을 확인할 수 없어 날짜를 만들지 않습니다.';
    return;
  }
  $('#monthNote').textContent = `${since} 시작 · 빠르면 ${addDays(since, 30)} 이후 실제 30일 충족 여부를 계산합니다.`;
  $('#yearNote').textContent = `${since} 시작 · 빠르면 ${addDays(since, 365)} 이후 같은 날짜 기록이 생깁니다.`;
}

function renderAll() {
  renderCurrent();
  renderHistory();
  renderReadiness();
  $('#sourceLine').textContent = `출처 · ${state.current.source || '기상청 지상관측 (API허브)'}`;
  $('#generatedLine').textContent = `자료 생성 · ${formatGenerated(state.current.generated)} · 현재 ${state.current.count ?? '—'}지점`;
}

async function loadLatestHistory(index) {
  const days = Object.keys(index?.dates || {}).sort();
  if (!days.length) return null;
  const day = days[days.length - 1];
  const path = index.dates[day].path || `/wind/series/stations/${day}.json`;
  const response = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`관측 이력 HTTP ${response.status}`);
  return response.json();
}

async function boot() {
  try {
    const [currentResponse, indexResponse] = await Promise.all([
      fetch(`${CURRENT_URL}?t=${Date.now()}`, { cache: 'no-store' }),
      fetch(`${HISTORY_INDEX_URL}?t=${Date.now()}`, { cache: 'no-store' }),
    ]);
    if (!currentResponse.ok) throw new Error(`현재 관측 HTTP ${currentResponse.status}`);
    state.current = await currentResponse.json();
    if (!state.current || !Array.isArray(state.current.stations)) throw new Error('관측소 목록이 없습니다');
    if (indexResponse.ok) {
      state.historyIndex = await indexResponse.json();
      state.historyDoc = await loadLatestHistory(state.historyIndex);
    }
    renderPicker();
    renderAll();
  } catch (error) {
    $('#errorBanner').hidden = false;
    $('#errorBanner').textContent = `관측소 자료를 읽지 못했습니다. 자료 없음과 읽기 실패를 구분합니다. (${error.message})`;
  }
}

$('#stationPicker').addEventListener('change', event => {
  state.stationId = event.target.value;
  paintSaved();
  renderAll();
});
$('#saveStation').addEventListener('click', () => {
  if (!state.stationId) return;
  localStorage.setItem(SAVED_KEY, state.stationId);
  paintSaved();
});

boot();
