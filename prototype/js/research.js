const URLS = {
  daily: '/wind/series/verify-daily.json',
  cases: '/wind/series/verify-cases.json',
  stations: '/wind/series/stations.json',
};
const $ = selector => document.querySelector(selector);
const state = {};

const csvCell = value => {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const html = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const finite = value => value !== null && value !== '' && Number.isFinite(Number(value));
const modelName = model => ({
  gfs_seamless: 'GFS',
  ecmwf_ifs025: 'ECMWF IFS',
}[model] || model);
const variableInfo = variable => ({
  temperature_2m: { name: '기온', unit: '°C' },
  wind_speed_10m: { name: '풍속', unit: 'm/s' },
}[variable] || { name: variable, unit: '' });

function download(name, headers, rows) {
  const csv = '\ufeff' + [headers, ...rows]
    .map(row => row.map(csvCell).join(','))
    .join('\n');
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

async function json(url) {
  const response = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response.json();
}

function latest(index) {
  const days = Object.keys(index?.dates || {}).sort();
  return days.length ? days.at(-1) : null;
}

async function loadLatest(index) {
  const day = latest(index);
  if (!day) return null;
  return json(index.dates[day].path);
}

function pack(title, tag, description, meta, onClick, enabled = true) {
  const element = document.createElement('article');
  element.className = 'pack';
  element.innerHTML = `<span class="tag">${html(tag)}</span><h2>${html(title)}</h2><p>${html(description)}</p><dl>${meta
    .map(([key, value]) => `<dt>${html(key)}</dt><dd>${html(value)}</dd>`)
    .join('')}</dl>`;
  const button = document.createElement('button');
  button.textContent = enabled ? 'CSV 내려받기' : '자료 없음';
  button.disabled = !enabled;
  if (enabled) button.onclick = onClick;
  element.append(button);
  return element;
}

function dailyRows() {
  const rows = [];
  Object.entries(state.daily.days || {}).forEach(([day, records]) =>
    Object.entries(records).forEach(([key, value]) => {
      const [model, variable, lead] = key.split('|');
      rows.push([
        day, model, variable, lead, value.me, value.mae, value.rmse, value.n,
        state.daily.leadBasis, state.daily.source, state.daily.generated,
      ]);
    }));
  return rows;
}

function stationRows() {
  const rows = [];
  Object.entries(state.stationDay?.hours || {}).forEach(([time, hour]) =>
    (hour.stations || []).forEach(item => {
      const meta = state.stationDay.stationMeta?.[item.stationId] || {};
      const value = item.values || {};
      rows.push([
        time, item.stationId, meta.name, meta.lat, meta.lon, meta.alt,
        value.temp_c, value.humid_pct, value.wind_ms, value.wind_dir, value.rain_mm,
        value.pres_hpa, value.pres_sea, value.dewp_c, value.solar, value.cloud,
        state.stationDay.source, state.stationDay.generated,
      ]);
    }));
  return rows;
}

function caseRows() {
  const rows = [];
  Object.entries(state.caseDay?.hours || {}).forEach(([time, hour]) => {
    (hour.cases || []).forEach(item => {
      Object.entries(item.forecasts || {}).forEach(([model, leads]) => {
        Object.entries(leads).forEach(([lead, variables]) => {
          Object.entries(variables).forEach(([variable, forecast]) => {
            const observation = item.observation?.[variable];
            const difference = finite(observation) && finite(forecast)
              ? Number(forecast) - Number(observation)
              : null;
            rows.push([
              time, item.stationId, model, lead, variable, observation, forecast,
              difference, hour.issues?.[lead], state.caseDay.source, state.caseDay.generated,
            ]);
          });
        });
      });
    });
  });
  return rows;
}

function renderPacks() {
  const packs = $('#packs');
  packs.innerHTML = '';
  const daily = dailyRows();
  const stations = stationRows();
  const cases = caseRows();
  const dailyDays = Object.keys(state.daily.days || {}).sort();

  packs.append(pack(
    '일별 예보 검증',
    'DAILY SCORES',
    '모델·변수·선행시간별 ME·MAE·RMSE와 표본 수 n.',
    [['기간', `${state.daily.collectingSince} → ${dailyDays.at(-1)}`], ['행', daily.length], ['기준', state.daily.leadBasis]],
    () => download(
      'earthus-forecast-daily.csv',
      ['date', 'model', 'variable', 'lead', 'me', 'mae', 'rmse', 'n', 'lead_basis', 'source', 'generated'],
      daily,
    ),
    daily.length > 0,
  ));
  packs.append(pack(
    'ASOS 시간 관측',
    'STATION HOURS',
    '지점별 시간 관측과 좌표·해발고도. 결측 열은 빈칸.',
    [['날짜', state.stationDay?.date || '없음'], ['시각', state.stationDay?.hourCount || 0], ['행', stations.length]],
    () => download(
      `earthus-asos-${state.stationDay.date}.csv`,
      ['observed_kst', 'station_id', 'station_name', 'lat', 'lon', 'alt_m', 'temp_c', 'humidity_pct', 'wind_ms', 'wind_dir_deg', 'rain_mm', 'pressure_hpa', 'sea_pressure_hpa', 'dewpoint_c', 'solar', 'cloud_tenths', 'source', 'generated'],
      stations,
    ),
    stations.length > 0,
  ));
  packs.append(pack(
    '예보·관측 사례',
    'STATION CASES',
    '한 지점·한 시각의 관측, 모델 예보, 예보−관측 차이.',
    [['날짜', state.caseDay?.date || '없음'], ['시각', state.caseDay?.hourCount || 0], ['행', cases.length]],
    () => download(
      `earthus-forecast-cases-${state.caseDay.date}.csv`,
      ['valid_kst', 'station_id', 'model', 'lead', 'variable', 'observation', 'forecast', 'forecast_minus_observation', 'issued_kst', 'source', 'generated'],
      cases,
    ),
    cases.length > 0,
  ));

  $('#scope').textContent = `일별 집계 ${state.daily.count}일 · ASOS ${state.stationDay?.hourCount || 0}시각/${state.stationDay?.rowCount || 0}행 · 사례 ${state.caseDay?.hourCount || 0}시각/${cases.length}행`;
  $('#generated').textContent = `최신 생성 · ${state.daily.generated} · CSV는 브라우저에서 현재 공개 JSON을 변환`;
}

function formatTime(value) {
  return value ? `${String(value).replace('T', ' ')} KST` : '자료 없음';
}

function formatIssue(value) {
  const match = String(value || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]} ${match[4]}:00 KST` : (value || '자료 없음');
}

function displayNumber(value) {
  if (!finite(value)) return '결측';
  return Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

function refillStations() {
  const time = $('#worksheetTime').value;
  const select = $('#worksheetStation');
  const previous = select.value;
  const cases = state.caseDay?.hours?.[time]?.cases || [];
  const stationMeta = state.stationDay?.stationMeta || {};
  const ids = [...new Set(cases.map(item => String(item.stationId)))].sort((a, b) => Number(a) - Number(b));
  select.innerHTML = ids.map(id => {
    const name = stationMeta[id]?.name || `지점 ${id}`;
    return `<option value="${html(id)}">${html(name)} (${html(id)})</option>`;
  }).join('');
  if (ids.includes(previous)) select.value = previous;
}

function worksheetRows(item, hour, variable) {
  const rows = [];
  Object.entries(item.forecasts || {}).forEach(([model, leads]) =>
    Object.entries(leads).forEach(([lead, variables]) => {
      const observation = item.observation?.[variable];
      const forecast = variables?.[variable];
      const hasPair = finite(observation) && finite(forecast);
      rows.push({
        model: modelName(model),
        lead,
        issued: formatIssue(hour.issues?.[lead]),
        forecast,
        observation,
        difference: hasPair ? Number(forecast) - Number(observation) : null,
        n: hasPair ? 1 : 0,
      });
    }));
  return rows;
}

function renderWorksheet() {
  const time = $('#worksheetTime').value;
  const stationId = $('#worksheetStation').value;
  const variable = $('#worksheetVariable').value;
  const hour = state.caseDay?.hours?.[time];
  const item = (hour?.cases || []).find(entry => String(entry.stationId) === stationId);
  const worksheet = $('#worksheet');
  const printButton = $('#printWorksheet');
  if (!hour || !item) {
    worksheet.hidden = true;
    printButton.hidden = true;
    $('#worksheetStatus').textContent = '선택한 시각과 관측소의 사례가 없습니다.';
    return;
  }

  const info = variableInfo(variable);
  const station = state.stationDay?.stationMeta?.[stationId] || {};
  const rows = worksheetRows(item, hour, variable);
  const usable = rows.filter(row => row.n === 1).length;
  const position = finite(station.lat) && finite(station.lon)
    ? `${displayNumber(station.lat)}, ${displayNumber(station.lon)}`
    : '자료 없음';

  worksheet.innerHTML = `
    <header class="ws-header">
      <div><p>earthus / EVIDENCE WORKSHEET</p><h3>예보와 관측은 얼마나 달랐을까?</h3></div>
      <div class="ws-student">학년·반 ________ 번호 ________ 이름 __________________</div>
    </header>
    <section class="ws-meta">
      <div><b>유효시각</b><span>${html(formatTime(time))}</span></div>
      <div><b>관측소</b><span>${html(station.name || `지점 ${stationId}`)} (${html(stationId)})</span></div>
      <div><b>좌표·해발고도</b><span>${html(position)} · ${finite(station.alt) ? `${html(displayNumber(station.alt))} m` : '자료 없음'}</span></div>
      <div><b>변수</b><span>${html(info.name)} (${html(info.unit)})</span></div>
    </section>
    <table class="ws-table">
      <thead><tr><th>모델</th><th>선행시간</th><th>발표시각</th><th>예보</th><th>관측</th><th>예보 − 관측</th><th>n</th></tr></thead>
      <tbody>${rows.map(row => `<tr>
        <td>${html(row.model)}</td><td>${html(row.lead)}</td><td>${html(row.issued)}</td>
        <td>${html(displayNumber(row.forecast))}</td><td>${html(displayNumber(row.observation))}</td>
        <td>${html(displayNumber(row.difference))}</td><td>${row.n}</td>
      </tr>`).join('')}</tbody>
    </table>
    <p class="ws-method"><b>계산:</b> 차이 = 예보 − 관측. 양수면 예보가 관측보다 높고, 음수면 낮습니다. 각 행은 한 관측소×한 시각의 표본이므로 값 쌍이 있을 때 n=1입니다.</p>
    <ol class="ws-questions">
      <li><b>질문 1.</b> 각 행의 차이 절댓값을 계산하고, 가장 작은 행의 모델·선행시간을 쓰세요.<div></div></li>
      <li><b>질문 2.</b> 같은 모델의 24h와 48h를 비교하세요. 이 한 사례만으로 어느 선행시간이 항상 더 잘 맞는다고 말할 수 없는 이유도 쓰세요.<div></div></li>
      <li><b>질문 3.</b> 관측소의 한 지점 값과 모델 격자 값이 다를 수 있는 이유를 두 가지 적으세요.<div></div></li>
      <li><b>질문 4.</b> 다른 사람이 이 표를 다시 계산하려면 아래 출처 외에 어떤 정보가 필요한지 쓰세요.<div></div></li>
    </ol>
    <footer class="ws-source">
      <p><b>출처</b> ${html(state.caseDay.source || '자료 없음')}</p>
      <p><b>자료 생성</b> ${html(state.caseDay.generated || '자료 없음')} · <b>표에 쓴 유효 행</b> ${usable}/${rows.length}</p>
      <p>⚠️ 결측은 0이 아니며, 빈칸을 임의로 메우지 않습니다. 이 한 사례는 모델의 장기 성능 순위를 뜻하지 않습니다.</p>
    </footer>`;
  worksheet.hidden = false;
  printButton.hidden = false;
  $('#worksheetStatus').textContent = `${formatTime(time)} · ${station.name || `지점 ${stationId}`} · ${info.name} · 유효 행 ${usable}/${rows.length}`;
}

function initWorksheet() {
  const times = Object.keys(state.caseDay?.hours || {}).sort();
  const timeSelect = $('#worksheetTime');
  timeSelect.innerHTML = times.map(time => `<option value="${html(time)}">${html(formatTime(time))}</option>`).join('');
  if (times.length) timeSelect.value = times.at(-1);
  refillStations();
  timeSelect.addEventListener('change', () => {
    refillStations();
    renderWorksheet();
  });
  $('#worksheetStation').addEventListener('change', renderWorksheet);
  $('#worksheetVariable').addEventListener('change', renderWorksheet);
  $('#makeWorksheet').addEventListener('click', renderWorksheet);
  $('#printWorksheet').addEventListener('click', () => window.print());
  renderWorksheet();
}

async function boot() {
  try {
    [state.daily, state.caseIndex, state.stationIndex] = await Promise.all([
      json(URLS.daily), json(URLS.cases), json(URLS.stations),
    ]);
    [state.caseDay, state.stationDay] = await Promise.all([
      loadLatest(state.caseIndex), loadLatest(state.stationIndex),
    ]);
    renderPacks();
    initWorksheet();
  } catch (error) {
    $('#error').hidden = false;
    $('#error').textContent = `Research Pack 자료를 읽지 못했습니다. (${error.message})`;
  }
}

boot();
