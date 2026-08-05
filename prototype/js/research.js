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

const SCHEMAS = {
  daily: [
    ['date', 'KST date', '집계 날짜'],
    ['model', '-', '예보 모델 식별자'],
    ['variable', '-', '기온 또는 풍속 변수 식별자'],
    ['lead', 'hour', '예보 선행시간'],
    ['me', 'variable unit', '예보-관측 차이의 평균'],
    ['mae', 'variable unit', '예보-관측 차이 절댓값의 평균'],
    ['rmse', 'variable unit', '예보-관측 차이 제곱 평균의 제곱근'],
    ['n', 'count', '계산에 쓴 지점×시각 표본 수'],
    ['lead_basis', '-', '선행시간 파일 선택 기준'],
    ['source', '-', '자료 출처'],
    ['generated', 'ISO 8601', '공개 산출물 생성시각'],
  ],
  stations: [
    ['observed_kst', 'KST', '관측시각'], ['station_id', '-', 'ASOS 지점번호'],
    ['station_name', '-', '관측소 이름'], ['lat', 'degree north', '위도'],
    ['lon', 'degree east', '경도'], ['alt_m', 'm', '해발고도'],
    ['temp_c', '°C', '기온'], ['humidity_pct', '%', '상대습도'],
    ['wind_ms', 'm/s', '풍속'], ['wind_dir_deg', 'degree', '풍향'],
    ['rain_mm', 'mm', '강수량'], ['pressure_hpa', 'hPa', '현지기압'],
    ['sea_pressure_hpa', 'hPa', '해면기압'], ['dewpoint_c', '°C', '이슬점온도'],
    ['solar', '원본 단위 미표기', '일사 원본값; 단위 확인 전 해석 보류'], ['cloud_tenths', 'tenths', '전운량'],
    ['source', '-', '자료 출처'], ['generated', 'ISO 8601', '공개 산출물 생성시각'],
  ],
  cases: [
    ['valid_kst', 'KST', '예보가 가리키는 시각과 관측시각'],
    ['station_id', '-', 'ASOS 지점번호'], ['model', '-', '예보 모델 식별자'],
    ['lead', 'hour', '예보 선행시간'], ['variable', '-', '기온 또는 풍속 변수 식별자'],
    ['observation', 'variable unit', 'ASOS 관측값'], ['forecast', 'variable unit', '모델 예보값'],
    ['forecast_minus_observation', 'variable unit', '예보-관측 차이'],
    ['issued_kst', 'KST', '예보 발표 기준시각'], ['source', '-', '자료 출처'],
    ['generated', 'ISO 8601', '공개 산출물 생성시각'],
  ],
};

function csvText(headers, rows) {
  return '\ufeff' + [headers, ...rows]
    .map(row => row.map(csvCell).join(','))
    .join('\n');
}

function downloadText(name, content, type) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([content], { type }));
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

function download(name, headers, rows) {
  downloadText(name, csvText(headers, rows), 'text/csv;charset=utf-8');
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
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

function pack(title, tag, description, meta, onClick, enabled = true, buttonText = 'CSV 내려받기') {
  const element = document.createElement('article');
  element.className = 'pack';
  element.innerHTML = `<span class="tag">${html(tag)}</span><h2>${html(title)}</h2><p>${html(description)}</p><dl>${meta
    .map(([key, value]) => `<dt>${html(key)}</dt><dd>${html(value)}</dd>`)
    .join('')}</dl>`;
  const button = document.createElement('button');
  button.textContent = enabled ? buttonText : '자료 없음';
  button.disabled = !enabled;
  if (enabled) button.onclick = async () => {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = '만드는 중…';
    try {
      await onClick();
    } catch (error) {
      $('#error').hidden = false;
      $('#error').textContent = `파일을 만들지 못했습니다. (${error.message})`;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  };
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

function stationRows(day = state.stationDay) {
  const rows = [];
  Object.entries(day?.hours || {}).forEach(([time, hour]) =>
    (hour.stations || []).forEach(item => {
      const meta = day.stationMeta?.[item.stationId] || {};
      const value = item.values || {};
      rows.push([
        time, item.stationId, meta.name, meta.lat, meta.lon, meta.alt,
        value.temp_c, value.humid_pct, value.wind_ms, value.wind_dir, value.rain_mm,
        value.pres_hpa, value.pres_sea, value.dewp_c, value.solar, value.cloud,
        day.source, day.generated,
      ]);
    }));
  return rows;
}

function caseRows(day = state.caseDay) {
  const rows = [];
  Object.entries(day?.hours || {}).forEach(([time, hour]) => {
    (hour.cases || []).forEach(item => {
      Object.entries(item.forecasts || {}).forEach(([model, leads]) => {
        Object.entries(leads).forEach(([lead, variables]) => {
          Object.entries(variables).forEach(([variable, forecast]) => {
            const observation = item.observation?.[variable];
            const difference = finite(observation) && finite(forecast)
              ? Number((Number(forecast) - Number(observation)).toFixed(3))
              : null;
            rows.push([
              time, item.stationId, model, lead, variable, observation, forecast,
              difference, hour.issues?.[lead], day.source, day.generated,
            ]);
          });
        });
      });
    });
  });
  return rows;
}

function sortedRows(rows, columns) {
  return rows.sort((left, right) => {
    for (const column of columns) {
      const a = String(left[column] ?? '');
      const b = String(right[column] ?? '');
      const compared = a.localeCompare(b, 'en', { numeric: true });
      if (compared) return compared;
    }
    return 0;
  });
}

function dataFiles() {
  const daily = sortedRows(dailyRows(), [0, 1, 2, 3]);
  const stations = sortedRows(stationRows(), [0, 1]);
  const cases = sortedRows(caseRows(), [0, 1, 2, 3, 4]);
  return {
    daily: {
      name: 'earthus-forecast-daily.csv', schema: SCHEMAS.daily, rows: daily,
      sourcePath: URLS.daily, source: state.daily.source, generated: state.daily.generated,
      scope: { from: state.daily.collectingSince, through: Object.keys(state.daily.days || {}).sort().at(-1), leadBasis: state.daily.leadBasis },
    },
    stations: {
      name: `earthus-asos-${state.stationDay?.date || 'no-data'}.csv`, schema: SCHEMAS.stations, rows: stations,
      sourcePath: state.stationIndex?.dates?.[state.stationDay?.date]?.path || URLS.stations,
      source: state.stationDay?.source, generated: state.stationDay?.generated,
      scope: { date: state.stationDay?.date, hours: state.stationDay?.hourCount || 0 },
    },
    cases: {
      name: `earthus-forecast-cases-${state.caseDay?.date || 'no-data'}.csv`, schema: SCHEMAS.cases, rows: cases,
      sourcePath: state.caseIndex?.dates?.[state.caseDay?.date]?.path || URLS.cases,
      source: state.caseDay?.source, generated: state.caseDay?.generated,
      scope: { date: state.caseDay?.date, hours: state.caseDay?.hourCount || 0 },
    },
  };
}

async function buildManifest(files) {
  const listed = await Promise.all(Object.values(files).map(async file => {
    const headers = file.schema.map(field => field[0]);
    const content = csvText(headers, file.rows);
    return {
      name: file.name,
      mediaType: 'text/csv; charset=utf-8',
      encoding: 'UTF-8 with BOM',
      lineEnding: 'LF',
      rows: file.rows.length,
      bytes: new TextEncoder().encode(content).byteLength,
      sha256: await sha256(content),
      sourcePath: file.sourcePath,
      source: file.source,
      sourceGeneratedAt: file.generated,
      scope: file.scope,
      fields: file.schema.map(([name, unit, description]) => ({ name, unit, description })),
    };
  }));
  return {
    schema: 'earthus.research-manifest.v1',
    manifestVersion: 1,
    createdAt: new Date().toISOString(),
    product: 'earthus Research Pack 무료 미리보기',
    salesStatus: '유료 판매 잠금; 현재 공개 범위만 사용',
    files: listed,
    methodology: {
      difference: 'forecast_minus_observation = forecast - observation',
      missing: '결측은 빈칸으로 두며 0으로 메우지 않음',
      leadBasis: state.daily.leadBasis,
      leadSelection: '관측 유효시각에서 24·48시간을 뺀 발표 기준시각의 예보 파일 선택',
      comparison: '한 사례나 짧은 기간으로 모델 장기 성능 순위를 판정하지 않음',
      spatialCaution: 'ASOS는 지점 관측이고 모델은 격자 예보이므로 공간 대표성이 다름',
    },
    license: 'https://earthus.net/legal/data-license.ko.md',
  };
}

async function downloadManifest(files) {
  const manifest = await buildManifest(files);
  downloadText(
    `earthus-research-manifest-${state.caseDay?.date || 'latest'}.json`,
    JSON.stringify(manifest, null, 2) + '\n',
    'application/json;charset=utf-8',
  );
}

function renderPacks() {
  const packs = $('#packs');
  packs.innerHTML = '';
  const files = dataFiles();
  const daily = files.daily;
  const stations = files.stations;
  const cases = files.cases;

  packs.append(pack(
    '일별 예보 검증',
    'DAILY SCORES',
    '모델·변수·선행시간별 ME·MAE·RMSE와 표본 수 n.',
    [['기간', `${daily.scope.from} → ${daily.scope.through}`], ['행', daily.rows.length], ['기준', daily.scope.leadBasis]],
    () => download(daily.name, daily.schema.map(field => field[0]), daily.rows),
    daily.rows.length > 0,
  ));
  packs.append(pack(
    'ASOS 시간 관측',
    'STATION HOURS',
    '지점별 시간 관측과 좌표·해발고도. 결측 열은 빈칸.',
    [['날짜', stations.scope.date || '없음'], ['시각', stations.scope.hours], ['행', stations.rows.length]],
    () => download(stations.name, stations.schema.map(field => field[0]), stations.rows),
    stations.rows.length > 0,
  ));
  packs.append(pack(
    '예보·관측 사례',
    'STATION CASES',
    '한 지점·한 시각의 관측, 모델 예보, 예보−관측 차이.',
    [['날짜', cases.scope.date || '없음'], ['시각', cases.scope.hours], ['행', cases.rows.length]],
    () => download(cases.name, cases.schema.map(field => field[0]), cases.rows),
    cases.rows.length > 0,
  ));
  packs.append(pack(
    '재현성 manifest',
    'SCHEMA + CHECKSUM',
    'CSV 3종의 열·단위·범위·방법론과 정확한 파일 SHA-256 체크섬.',
    [['파일', 'CSV 3종'], ['스키마', `${Object.values(SCHEMAS).reduce((sum, schema) => sum + schema.length, 0)}개 열`], ['체크섬', 'SHA-256']],
    () => downloadManifest(files),
    Object.values(files).every(file => file.rows.length > 0),
    'JSON 내려받기',
  ));

  $('#scope').textContent = `일별 집계 ${state.daily.count}일 · ASOS ${stations.scope.hours}시각/${stations.rows.length}행 · 사례 ${cases.scope.hours}시각/${cases.rows.length}행`;
  $('#generated').textContent = `최신 생성 · ${state.daily.generated} · CSV는 브라우저에서 현재 공개 JSON을 변환`;
}

const EXTRACT_SCHEMAS = {
  cases: [
    'valid_kst', 'station_id', 'station_name', 'lat', 'lon', 'alt_m', 'model',
    'lead_hour', 'variable', 'unit', 'observation', 'forecast',
    'forecast_minus_observation', 'issued_kst', 'source', 'license', 'generated',
  ],
  stations: [
    'observed_kst', 'station_id', 'station_name', 'lat', 'lon', 'alt_m',
    'variable', 'unit', 'value', 'source', 'license', 'generated',
  ],
};

const EXTRACT_FIELD_META = {
  valid_kst: ['KST', '예보 유효시각과 관측시각'],
  observed_kst: ['KST', 'ASOS 관측시각'],
  station_id: ['-', 'ASOS 지점번호'],
  station_name: ['-', '관측소 이름'],
  lat: ['degree north', '위도'],
  lon: ['degree east', '경도'],
  alt_m: ['m', '해발고도'],
  model: ['-', '예보 모델 식별자'],
  lead_hour: ['hour', '예보 선행시간'],
  variable: ['-', '변수 식별자'],
  unit: ['-', '해당 행 값의 단위'],
  observation: ['unit column', 'ASOS 관측값'],
  forecast: ['unit column', '모델 예보값'],
  forecast_minus_observation: ['unit column', '예보에서 관측을 뺀 값'],
  issued_kst: ['KST', '예보 발표 기준시각'],
  value: ['unit column', 'ASOS 관측 변수값'],
  source: ['-', '자료 출처'],
  license: ['-', '자료 이용조건'],
  generated: ['ISO 8601', '원본 공개 산출물 생성시각'],
};

function stationFieldUnit(day, variable) {
  const label = day.fields?.[variable] || '';
  const match = label.match(/\(([^()]*)\)$/);
  return match ? match[1] : '-';
}

function customExtractRows(dataset, day, filters) {
  const rows = [];
  const accepts = (selected, value) => selected === 'all' || String(selected) === String(value);
  Object.entries(day?.hours || {}).forEach(([time, hour]) => {
    if (!accepts(filters.time, time)) return;
    if (dataset === 'cases') {
      (hour.cases || []).forEach(item => {
        if (!accepts(filters.station, item.stationId)) return;
        const meta = day.stationMeta?.[item.stationId] || {};
        Object.entries(item.forecasts || {}).forEach(([model, leads]) =>
          Object.entries(leads).forEach(([lead, variables]) =>
            Object.entries(variables).forEach(([variable, forecast]) => {
              if (!accepts(filters.variable, variable)) return;
              const observation = item.observation?.[variable];
              const difference = finite(observation) && finite(forecast)
                ? Number((Number(forecast) - Number(observation)).toFixed(3))
                : null;
              rows.push([
                time, item.stationId, meta.name, meta.lat, meta.lon, meta.alt, model,
                Number.parseFloat(lead), variable, variableInfo(variable).unit,
                observation, forecast, difference, formatIssue(hour.issues?.[lead]),
                day.source, day.license, day.generated,
              ]);
            })));
      });
      return;
    }
    (hour.stations || []).forEach(item => {
      if (!accepts(filters.station, item.stationId)) return;
      const meta = day.stationMeta?.[item.stationId] || {};
      Object.keys(day.fields || {}).forEach(variable => {
        if (!accepts(filters.variable, variable)) return;
        rows.push([
          time, item.stationId, meta.name, meta.lat, meta.lon, meta.alt, variable,
          stationFieldUnit(day, variable), item.values?.[variable], day.source,
          day.license, day.generated,
        ]);
      });
    });
  });
  return sortedRows(rows, [0, 1, 6, 7, 8]);
}

function extractIndex(dataset) {
  return dataset === 'cases' ? state.caseIndex : state.stationIndex;
}

function extractVariables(dataset, day) {
  if (dataset === 'cases') {
    return (day.vars || []).map(variable => [
      variable, `${variableInfo(variable).name} (${variableInfo(variable).unit})`,
    ]);
  }
  return Object.entries(day.fields || {});
}

function refillExtractDates() {
  const dataset = $('#extractDataset').value;
  const dates = Object.keys(extractIndex(dataset)?.dates || {}).sort();
  $('#extractDate').innerHTML = dates.map(date =>
    `<option value="${html(date)}">${html(date)}</option>`).join('');
  if (dates.length) $('#extractDate').value = dates.at(-1);
}

function refillExtractFilters(day) {
  const dataset = $('#extractDataset').value;
  const previousTime = $('#extractTime').value;
  const previousStation = $('#extractStation').value;
  const previousVariable = $('#extractVariable').value;
  const times = Object.keys(day.hours || {}).sort();
  const stations = Object.entries(day.stationMeta || {}).sort((left, right) => Number(left[0]) - Number(right[0]));
  const variables = extractVariables(dataset, day);
  $('#extractTime').innerHTML = `<option value="all">전체 시각 (${times.length})</option>`
    + times.map(time => `<option value="${html(time)}">${html(formatTime(time))}</option>`).join('');
  $('#extractStation').innerHTML = `<option value="all">전체 관측소 (${stations.length})</option>`
    + stations.map(([id, meta]) => `<option value="${html(id)}">${html(meta.name || `지점 ${id}`)} (${html(id)})</option>`).join('');
  $('#extractVariable').innerHTML = `<option value="all">전체 변수 (${variables.length})</option>`
    + variables.map(([value, label]) => `<option value="${html(value)}">${html(label)}</option>`).join('');
  if ([...$('#extractTime').options].some(option => option.value === previousTime)) $('#extractTime').value = previousTime;
  if ([...$('#extractStation').options].some(option => option.value === previousStation)) $('#extractStation').value = previousStation;
  if ([...$('#extractVariable').options].some(option => option.value === previousVariable)) $('#extractVariable').value = previousVariable;
}

function renderExtract() {
  const dataset = $('#extractDataset').value;
  const day = state.extractDay;
  if (!day) return;
  const filters = {
    time: $('#extractTime').value,
    station: $('#extractStation').value,
    variable: $('#extractVariable').value,
  };
  const headers = EXTRACT_SCHEMAS[dataset];
  const rows = customExtractRows(dataset, day, filters);
  state.extractResult = {
    dataset, date: day.date, filters, headers, rows,
    source: day.source, license: day.license, generated: day.generated,
    sourcePath: extractIndex(dataset)?.dates?.[day.date]?.path,
  };
  const preview = rows.slice(0, 5);
  $('#extractTable thead').innerHTML = `<tr>${headers.map(header => `<th>${html(header)}</th>`).join('')}</tr>`;
  $('#extractTable tbody').innerHTML = preview.map(row =>
    `<tr>${row.map(value => `<td>${html(value ?? '')}</td>`).join('')}</tr>`).join('');
  $('#extractStatus').textContent = `${day.date} · 결과 ${rows.length.toLocaleString('ko-KR')}행 · 미리보기 ${preview.length}행 · 결측은 빈칸`;
  $('#extractEvidence').textContent = `${day.source || '출처 없음'} · 생성 ${day.generated || '시각 없음'} · ${day.license || '이용조건 없음'}`;
  $('#downloadExtract').disabled = rows.length === 0;
  $('#downloadExtractManifest').disabled = rows.length === 0;
}

async function loadExtractDay() {
  const dataset = $('#extractDataset').value;
  const date = $('#extractDate').value;
  const entry = extractIndex(dataset)?.dates?.[date];
  const token = (state.extractToken || 0) + 1;
  state.extractToken = token;
  $('#downloadExtract').disabled = true;
  $('#downloadExtractManifest').disabled = true;
  $('#extractStatus').textContent = `${date || '날짜 없음'} 자료를 불러오는 중입니다.`;
  if (!entry) {
    state.extractDay = null;
    $('#extractStatus').textContent = '실제로 보유한 공개 날짜가 없습니다.';
    return;
  }
  state.extractCache ||= { cases: {}, stations: {} };
  try {
    const day = state.extractCache[dataset][date] || await json(entry.path);
    if (token !== state.extractToken) return;
    state.extractCache[dataset][date] = day;
    state.extractDay = day;
    refillExtractFilters(day);
    renderExtract();
  } catch (error) {
    if (token !== state.extractToken) return;
    state.extractDay = null;
    $('#extractStatus').textContent = `선택한 공개 자료를 읽지 못했습니다. (${error.message})`;
  }
}

function extractFilename(result) {
  const compact = value => String(value || 'all').replace(/[^0-9a-z_-]+/gi, '-');
  return `earthus-${result.dataset}-${compact(result.date)}-${compact(result.filters.time)}-${compact(result.filters.station)}-${compact(result.filters.variable)}.csv`;
}

async function buildExtractManifest(result) {
  const filename = extractFilename(result);
  const content = csvText(result.headers, result.rows);
  return {
    schema: 'earthus.custom-extract-manifest.v1',
    manifestVersion: 1,
    createdAt: new Date().toISOString(),
    product: 'earthus Research Custom Extract 무료 미리보기',
    salesStatus: '유료 판매 잠금; 현재 공개 범위만 사용',
    selection: {
      dataset: result.dataset,
      date: result.date,
      time: result.filters.time,
      station: result.filters.station,
      variable: result.filters.variable,
      allToken: 'all means no additional filter inside the selected date',
    },
    file: {
      name: filename,
      mediaType: 'text/csv; charset=utf-8',
      encoding: 'UTF-8 with BOM',
      lineEnding: 'LF',
      rows: result.rows.length,
      bytes: new TextEncoder().encode(content).byteLength,
      sha256: await sha256(content),
      fields: result.headers.map(name => ({
        name,
        unit: EXTRACT_FIELD_META[name]?.[0] || '-',
        description: EXTRACT_FIELD_META[name]?.[1] || name,
      })),
    },
    provenance: {
      sourcePath: result.sourcePath,
      source: result.source,
      license: result.license,
      sourceGeneratedAt: result.generated,
    },
    methodology: {
      rowShape: result.dataset === 'cases'
        ? 'one valid time x station x model x lead time x variable per row'
        : 'one observed time x station x variable per row',
      missing: '결측은 빈칸이며 0으로 대체하지 않음',
      difference: 'forecast_minus_observation = forecast - observation; 소수 셋째 자리까지 보존',
      ordering: '시각, 지점번호, 변수와 모델·선행시간을 고정 순서로 정렬',
      scope: '운영 공개 인덱스에 실제로 있는 선택 날짜만 사용',
    },
    licensePage: 'https://earthus.net/legal/data-license.ko.md',
  };
}

async function downloadExtractManifest(result) {
  const manifest = await buildExtractManifest(result);
  const filename = extractFilename(result).replace(/\.csv$/, '.manifest.json');
  downloadText(filename, JSON.stringify(manifest, null, 2) + '\n', 'application/json;charset=utf-8');
}

function initExtract() {
  state.extractCache = { cases: {}, stations: {} };
  if (state.caseDay?.date) state.extractCache.cases[state.caseDay.date] = state.caseDay;
  if (state.stationDay?.date) state.extractCache.stations[state.stationDay.date] = state.stationDay;
  refillExtractDates();
  $('#extractDataset').addEventListener('change', () => {
    refillExtractDates();
    loadExtractDay();
  });
  $('#extractDate').addEventListener('change', loadExtractDay);
  ['#extractTime', '#extractStation', '#extractVariable'].forEach(selector =>
    $(selector).addEventListener('change', renderExtract));
  $('#downloadExtract').addEventListener('click', () => {
    const result = state.extractResult;
    if (!result?.rows.length) return;
    download(extractFilename(result), result.headers, result.rows);
  });
  $('#downloadExtractManifest').addEventListener('click', async event => {
    const result = state.extractResult;
    if (!result?.rows.length) return;
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = '체크섬 계산 중…';
    try {
      await downloadExtractManifest(result);
    } catch (error) {
      $('#error').hidden = false;
      $('#error').textContent = `추출 manifest를 만들지 못했습니다. (${error.message})`;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
  loadExtractDay();
}

const FIGURE_METRICS = {
  mae: { name: 'MAE', description: 'Mean absolute error' },
  me: { name: 'ME', description: 'Mean forecast minus observation' },
  rmse: { name: 'RMSE', description: 'Root mean square error' },
};

function figureRecords(date, variable, metric) {
  return Object.entries(state.daily.days?.[date] || {}).flatMap(([key, values]) => {
    const [model, recordVariable, lead] = key.split('|');
    if (recordVariable !== variable || !finite(values?.[metric])) return [];
    const leadHours = Number.parseFloat(lead);
    return [{ model, lead: Number.isFinite(leadHours) ? leadHours : lead, value: Number(values[metric]), n: values.n }];
  }).sort((left, right) => {
    const modelOrder = modelName(left.model).localeCompare(modelName(right.model), 'en');
    return modelOrder || Number(left.lead) - Number(right.lead);
  });
}

function svgLines(value, maxLength = 105) {
  const words = String(value || 'Source unavailable').split(/\s+/);
  const lines = [''];
  words.forEach(word => {
    const current = lines.at(-1);
    if (current && `${current} ${word}`.length > maxLength) lines.push(word);
    else lines[lines.length - 1] = current ? `${current} ${word}` : word;
  });
  return lines.slice(0, 2);
}

function figureSvgMarkup(records, context) {
  const { date, variable, metric, source, generated } = context;
  const info = variableInfo(variable);
  const metricInfo = FIGURE_METRICS[metric] || FIGURE_METRICS.mae;
  const values = records.map(record => record.value);
  let minimum = Math.min(0, ...values);
  let maximum = Math.max(0, ...values);
  if (minimum === maximum) maximum = minimum + 1;
  const padding = (maximum - minimum) * .08;
  minimum = minimum < 0 ? minimum - padding : 0;
  maximum += padding;

  const plot = { left: 74, right: 28, top: 104, bottom: 329 };
  const width = 860;
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = plot.bottom - plot.top;
  const y = value => plot.bottom - ((value - minimum) / (maximum - minimum)) * plotHeight;
  const zeroY = y(0);
  const step = plotWidth / Math.max(records.length, 1);
  const barWidth = Math.min(86, step * .56);
  const ticks = Array.from({ length: 5 }, (_, index) => minimum + (maximum - minimum) * index / 4).reverse();
  const sourceLines = svgLines(`Source ${source}`);
  const palette = { gfs_seamless: '#3b8f79', ecmwf_ifs025: '#7059c7' };
  const title = `${date} ${info.name} ${metricInfo.name}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 470" role="img" aria-labelledby="figureTitle figureDesc">
    <title id="figureTitle">${html(title)} forecast observation verification chart</title>
    <desc id="figureDesc">${html(metricInfo.description)}. Each bar is a model and lead-time pair. Sample size n is shown below each bar.</desc>
    <rect width="860" height="470" fill="#f7f7f4"/>
    <text x="38" y="38" fill="#6b5abd" font-family="ui-monospace, SFMono-Regular, monospace" font-size="10" font-weight="700" letter-spacing="1.5">EARTHUS / FORECAST VERIFICATION</text>
    <text x="38" y="72" fill="#17191c" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="25" font-weight="650">${html(title)} <tspan fill="#646a73" font-size="15" font-weight="500">(${html(info.unit)})</tspan></text>
    <text x="822" y="40" fill="#646a73" text-anchor="end" font-family="ui-monospace, SFMono-Regular, monospace" font-size="9">${html(metricInfo.description)}</text>
    ${ticks.map(tick => {
      const tickY = y(tick);
      return `<line x1="${plot.left}" y1="${tickY.toFixed(2)}" x2="${width - plot.right}" y2="${tickY.toFixed(2)}" stroke="#d7d8d3" stroke-width="1"/><text x="${plot.left - 10}" y="${(tickY + 3).toFixed(2)}" fill="#6b7078" text-anchor="end" font-family="ui-monospace, SFMono-Regular, monospace" font-size="9">${html(displayNumber(tick))}</text>`;
    }).join('')}
    <line x1="${plot.left}" y1="${zeroY.toFixed(2)}" x2="${width - plot.right}" y2="${zeroY.toFixed(2)}" stroke="#32363b" stroke-width="1.5"/>
    ${records.map((record, index) => {
      const x = plot.left + step * index + (step - barWidth) / 2;
      const valueY = y(record.value);
      const top = Math.min(valueY, zeroY);
      const height = Math.max(1.5, Math.abs(zeroY - valueY));
      const labelY = record.value >= 0 ? top - 8 : top + height + 15;
      return `<g><rect x="${x.toFixed(2)}" y="${top.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${height.toFixed(2)}" rx="3" fill="${palette[record.model] || '#65717d'}" opacity="${Number(record.lead) === 24 ? '1' : '.68'}"/><text x="${(x + barWidth / 2).toFixed(2)}" y="${labelY.toFixed(2)}" fill="#202328" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-size="10" font-weight="700">${html(displayNumber(record.value))}</text><text x="${(x + barWidth / 2).toFixed(2)}" y="350" fill="#202328" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" font-weight="650">${html(modelName(record.model))}</text><text x="${(x + barWidth / 2).toFixed(2)}" y="366" fill="#6b7078" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-size="9">${html(record.lead)}h | n=${html(record.n)}</text></g>`;
    }).join('')}
    <line x1="38" y1="388" x2="822" y2="388" stroke="#c9cbc7"/>
    ${sourceLines.map((line, index) => `<text x="38" y="${407 + index * 13}" fill="#555b63" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="8.5">${html(line)}</text>`).join('')}
    <text x="38" y="445" fill="#555b63" font-family="ui-monospace, SFMono-Regular, monospace" font-size="8.5">Generated ${html(generated || 'unavailable')} | period ${html(date)} | unit ${html(info.unit)}</text>
    <text x="822" y="445" fill="#8a4d20" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" font-weight="700">One-day samples are not a long-term model ranking.</text>
  </svg>`;
}

function renderFigure() {
  const date = $('#figureDate').value;
  const variable = $('#figureVariable').value;
  const metric = $('#figureMetric').value;
  const records = figureRecords(date, variable, metric);
  const canvas = $('.figure-canvas');
  const button = $('#downloadFigure');
  if (!records.length) {
    canvas.innerHTML = '<p class="figure-empty">No records match this date, variable, and metric.</p>';
    button.disabled = true;
    return;
  }
  const markup = figureSvgMarkup(records, {
    date, variable, metric, source: state.daily.source, generated: state.daily.generated,
  });
  canvas.innerHTML = markup;
  button.disabled = false;
  button.dataset.filename = `earthus-verify-${date}-${variable}-${metric}.svg`;
  $('#figureWarning').textContent = `${date} | ${variableInfo(variable).name} | ${FIGURE_METRICS[metric].name} | ${records.length} model-lead samples. `
    + '\uD55C \uB0A0\uC758 \uD45C\uBCF8\uC740 \uC7A5\uAE30 \uC131\uB2A5 \uC21C\uC704\uAC00 \uC544\uB2D9\uB2C8\uB2E4.';
}

function initFigure() {
  const dates = Object.keys(state.daily.days || {}).sort();
  const dateSelect = $('#figureDate');
  dateSelect.innerHTML = dates.map(date => `<option value="${html(date)}">${html(date)}</option>`).join('');
  if (dates.length) dateSelect.value = dates.at(-1);
  ['#figureDate', '#figureVariable', '#figureMetric'].forEach(selector =>
    $(selector).addEventListener('change', renderFigure));
  $('#downloadFigure').addEventListener('click', event => {
    const svg = $('.figure-canvas svg');
    if (!svg) return;
    downloadText(event.currentTarget.dataset.filename, `${svg.outerHTML}\n`, 'image/svg+xml;charset=utf-8');
  });
  renderFigure();
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
    initExtract();
    initFigure();
    initWorksheet();
  } catch (error) {
    $('#error').hidden = false;
    $('#error').textContent = `Research Pack 자료를 읽지 못했습니다. (${error.message})`;
  }
}

boot();
