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
  downloadBlob(name, [content], type);
}

function downloadBlob(name, parts, type) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob(parts, { type }));
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  bytes.forEach(byte => { value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8); });
  return (value ^ 0xffffffff) >>> 0;
}

function concatBytes(chunks) {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  chunks.forEach(chunk => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

function zipArchive(files, modifiedAt = new Date()) {
  if (!files.length || files.length > 65535) throw new Error('ZIP 파일 수 범위를 벗어났습니다.');
  const encoder = new TextEncoder();
  const year = Math.min(2107, Math.max(1980, modifiedAt.getUTCFullYear()));
  const dosTime = (modifiedAt.getUTCHours() << 11) | (modifiedAt.getUTCMinutes() << 5) | Math.floor(modifiedAt.getUTCSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((modifiedAt.getUTCMonth() + 1) << 5) | modifiedAt.getUTCDate();
  const locals = [];
  const centrals = [];
  let localOffset = 0;
  files.forEach(file => {
    const name = encoder.encode(file.name);
    const content = file.content instanceof Uint8Array ? file.content : encoder.encode(file.content);
    if (content.length > 0xffffffff || localOffset > 0xffffffff) throw new Error('ZIP32 크기 제한을 넘었습니다.');
    const checksum = crc32(content);
    const local = new Uint8Array(30 + name.length + content.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, content.length, true);
    localView.setUint32(22, content.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(content, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, content.length, true);
    centralView.setUint32(24, content.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centrals.push(central);
    localOffset += local.length;
  });
  const centralSize = centrals.reduce((total, central) => total + central.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  endView.setUint16(20, 0, true);
  return concatBytes([...locals, ...centrals, end]);
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

const QUALITY_FIELD_META = {
  total_rows: ['count', '선택 범위의 전체 행 수'],
  paired_n: ['count', '관측과 예보가 모두 있는 유효 표본 수'],
  missing_observation: ['count', '관측 결측 행 수'],
  missing_forecast: ['count', '예보 결측 행 수'],
  me: ['unit column', '예보-관측 차이의 평균'],
  mae: ['unit column', '예보-관측 차이 절댓값의 평균'],
  rmse: ['unit column', '예보-관측 차이 제곱 평균의 제곱근'],
  observed_n: ['count', '결측이 아닌 관측 행 수'],
  numeric_n: ['count', '숫자 통계에 사용한 행 수'],
  missing_n: ['count', '결측 행 수'],
  missing_pct: ['%', 'missing_n / total_rows x 100'],
  min: ['unit column', '숫자 관측 최솟값'],
  max: ['unit column', '숫자 관측 최댓값'],
  mean: ['unit column', '숫자 관측 평균'],
};

const TREND_FIELD_META = {
  date: ['KST date', '검증 날짜'],
  model: ['-', '예보 모델 식별자'],
  lead_hour: ['hour', '예보 선행시간'],
  variable: ['-', '변수 식별자'],
  unit: ['-', '검증값 단위'],
  n: ['count', '관측과 예보가 모두 있는 유효 표본 수'],
  me: ['unit column', '해당 날짜 예보-관측 차이의 평균'],
  mae: ['unit column', '해당 날짜 절대오차의 평균'],
  rmse: ['unit column', '해당 날짜 제곱평균오차의 제곱근'],
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
    if (filters.time !== 'all' && time !== filters.time && !time.endsWith(`T${filters.time}`)) return;
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

function rounded(value) {
  return finite(value) ? Number(Number(value).toFixed(3)) : null;
}

function extractQualitySummary(result) {
  const groups = new Map();
  if (result.dataset === 'cases') {
    result.rows.forEach(row => {
      const key = [row[6], row[7], row[8], row[9]].join('|');
      const group = groups.get(key) || {
        model: row[6], lead: row[7], variable: row[8], unit: row[9],
        total: 0, missingObservation: 0, missingForecast: 0, differences: [],
      };
      group.total += 1;
      if (!finite(row[10])) group.missingObservation += 1;
      if (!finite(row[11])) group.missingForecast += 1;
      if (finite(row[12])) group.differences.push(Number(row[12]));
      groups.set(key, group);
    });
    const headers = [
      'date', 'filter_time', 'filter_station', 'model', 'lead_hour', 'variable',
      'unit', 'total_rows', 'paired_n', 'missing_observation', 'missing_forecast',
      'me', 'mae', 'rmse', 'source', 'license', 'generated',
    ];
    const rows = [...groups.values()]
      .sort((left, right) => modelName(left.model).localeCompare(modelName(right.model), 'en')
        || Number(left.lead) - Number(right.lead)
        || left.variable.localeCompare(right.variable, 'en'))
      .map(group => {
        const n = group.differences.length;
        const mean = n ? group.differences.reduce((sum, value) => sum + value, 0) / n : null;
        const mae = n ? group.differences.reduce((sum, value) => sum + Math.abs(value), 0) / n : null;
        const rmse = n ? Math.sqrt(group.differences.reduce((sum, value) => sum + value ** 2, 0) / n) : null;
        return [
          result.date, result.filters.time, result.filters.station, group.model,
          group.lead, group.variable, group.unit, group.total, n,
          group.missingObservation, group.missingForecast, rounded(mean), rounded(mae),
          rounded(rmse), result.source, result.license, result.generated,
        ];
      });
    return {
      headers,
      rows,
      note: `모델×선행시간×변수 ${rows.length}개 조합 · ME·MAE·RMSE의 n은 관측과 예보가 모두 있는 행만 포함 · 한 날짜 표본은 장기 순위가 아님`,
    };
  }

  result.rows.forEach(row => {
    const key = [row[6], row[7]].join('|');
    const group = groups.get(key) || { variable: row[6], unit: row[7], total: 0, observed: 0, values: [] };
    group.total += 1;
    if (row[8] !== null && row[8] !== undefined && row[8] !== '') group.observed += 1;
    if (finite(row[8])) group.values.push(Number(row[8]));
    groups.set(key, group);
  });
  const headers = [
    'date', 'filter_time', 'filter_station', 'variable', 'unit', 'total_rows',
    'observed_n', 'numeric_n', 'missing_n', 'missing_pct', 'min', 'max', 'mean',
    'source', 'license', 'generated',
  ];
  const rows = [...groups.values()].sort((left, right) => left.variable.localeCompare(right.variable, 'en'))
    .map(group => {
      const n = group.values.length;
      const missing = group.total - group.observed;
      return [
        result.date, result.filters.time, result.filters.station, group.variable,
        group.unit, group.total, group.observed, n, missing, rounded(group.total ? missing / group.total * 100 : null),
        n ? rounded(Math.min(...group.values)) : null,
        n ? rounded(Math.max(...group.values)) : null,
        n ? rounded(group.values.reduce((sum, value) => sum + value, 0) / n) : null,
        result.source, result.license, result.generated,
      ];
    });
  return {
    headers,
    rows,
    note: `변수 ${rows.length}개 · observed_n은 결측이 아닌 값, numeric_n은 수치 계산 값 · missing_pct = missing_n / total_rows × 100`,
  };
}

const TREND_HEADERS = [
  'date', 'model', 'lead_hour', 'variable', 'unit', 'n', 'me', 'mae', 'rmse',
  'source', 'license', 'generated',
];

function extractDailyTrend(result) {
  if (result.dataset !== 'cases') return { headers: TREND_HEADERS, rows: [] };
  const groups = new Map();
  result.rows.forEach(row => {
    const date = String(row[0] || '').slice(0, 10);
    const key = [date, row[6], row[7], row[8], row[9]].join('|');
    const group = groups.get(key) || {
      date, model: row[6], lead: row[7], variable: row[8], unit: row[9],
      differences: [], source: row[14], license: row[15], generated: row[16],
    };
    if (finite(row[12])) group.differences.push(Number(row[12]));
    groups.set(key, group);
  });
  const rows = [...groups.values()].sort((left, right) =>
    left.date.localeCompare(right.date, 'en')
      || modelName(left.model).localeCompare(modelName(right.model), 'en')
      || Number(left.lead) - Number(right.lead)
      || left.variable.localeCompare(right.variable, 'en'))
    .map(group => {
      const n = group.differences.length;
      const me = n ? group.differences.reduce((sum, value) => sum + value, 0) / n : null;
      const mae = n ? group.differences.reduce((sum, value) => sum + Math.abs(value), 0) / n : null;
      const rmse = n ? Math.sqrt(group.differences.reduce((sum, value) => sum + value ** 2, 0) / n) : null;
      return [
        group.date, group.model, group.lead, group.variable, group.unit, n,
        rounded(me), rounded(mae), rounded(rmse), group.source, group.license, group.generated,
      ];
    });
  return { headers: TREND_HEADERS, rows };
}

function trendFilename(result) {
  return extractFilename(result).replace(/\.csv$/, '.daily-trend.csv');
}

function trendSvgMarkup(rows, context) {
  const { variable, metric, dateFrom, dateTo, sourceFileCount } = context;
  const info = variableInfo(variable);
  const metricIndex = { me: 6, mae: 7, rmse: 8 }[metric];
  const metricName = String(metric || '').toUpperCase();
  const records = rows.filter(row => row[3] === variable && finite(row[metricIndex]))
    .map(row => ({ date: row[0], model: row[1], lead: row[2], n: row[5], value: Number(row[metricIndex]), source: row[9] }));
  const allDates = calendarDates(dateFrom, dateTo);
  const values = records.map(record => record.value);
  let minimum = Math.min(0, ...values);
  let maximum = Math.max(0, ...values);
  if (minimum === maximum) maximum = minimum + 1;
  const padding = (maximum - minimum) * .08;
  minimum = minimum < 0 ? minimum - padding : 0;
  maximum += padding;
  const plot = { left: 66, right: 28, top: 102, bottom: 314 };
  const plotWidth = 860 - plot.left - plot.right;
  const plotHeight = plot.bottom - plot.top;
  const x = date => plot.left + (allDates.indexOf(date) / Math.max(allDates.length - 1, 1)) * plotWidth;
  const y = value => plot.bottom - ((value - minimum) / (maximum - minimum)) * plotHeight;
  const ticks = Array.from({ length: 5 }, (_, index) => minimum + (maximum - minimum) * index / 4).reverse();
  const colors = {
    'ecmwf_ifs025|24': '#7059c7', 'ecmwf_ifs025|48': '#9a86db',
    'gfs_seamless|24': '#3b8f79', 'gfs_seamless|48': '#6eae9d',
  };
  const series = new Map();
  records.forEach(record => {
    const key = `${record.model}|${record.lead}`;
    const list = series.get(key) || [];
    list.push(record);
    series.set(key, list);
  });
  const adjacent = (left, right) =>
    (new Date(`${right}T00:00:00Z`) - new Date(`${left}T00:00:00Z`)) / 86400000 === 1;
  const source = [...new Set(records.map(record => record.source).filter(Boolean))].join(' | ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 470" role="img" aria-labelledby="trendTitle trendDesc">
    <title id="trendTitle">${html(dateFrom)}부터 ${html(dateTo)}까지 ${html(info.name)} ${html(metricName)} 날짜별 품질 추세</title>
    <desc id="trendDesc">실제 공개 날짜별 검증값입니다. 날짜가 빠진 구간은 선으로 연결하지 않으며 각 점에 표본 수 n을 표시합니다.</desc>
    <rect width="860" height="470" fill="#f7f7f4"/>
    <text x="38" y="38" fill="#6b5abd" font-family="ui-monospace, SFMono-Regular, monospace" font-size="10" font-weight="700" letter-spacing="1.5">EARTHUS / DAILY QUALITY TREND</text>
    <text x="38" y="72" fill="#17191c" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="24" font-weight="650">${html(info.name)} ${html(metricName)} · ${html(dateFrom)} → ${html(dateTo)} <tspan fill="#646a73" font-size="14">(${html(info.unit)})</tspan></text>
    ${ticks.map(tick => `<line x1="${plot.left}" y1="${y(tick).toFixed(2)}" x2="832" y2="${y(tick).toFixed(2)}" stroke="#d7d8d3"/><text x="56" y="${(y(tick) + 3).toFixed(2)}" fill="#6b7078" text-anchor="end" font-family="ui-monospace, SFMono-Regular, monospace" font-size="9">${html(displayNumber(tick))}</text>`).join('')}
    ${[...series.entries()].map(([key, list]) => {
      const ordered = list.sort((left, right) => left.date.localeCompare(right.date, 'en'));
      const color = colors[key] || '#65717d';
      const lines = ordered.slice(1).map((record, index) => adjacent(ordered[index].date, record.date)
        ? `<line data-series-segment="${html(key)}" x1="${x(ordered[index].date).toFixed(2)}" y1="${y(ordered[index].value).toFixed(2)}" x2="${x(record.date).toFixed(2)}" y2="${y(record.value).toFixed(2)}" stroke="${color}" stroke-width="2"/>`
        : '').join('');
      const points = ordered.map(record => `<g data-series-point="${html(key)}"><circle cx="${x(record.date).toFixed(2)}" cy="${y(record.value).toFixed(2)}" r="4" fill="${color}"/><text x="${x(record.date).toFixed(2)}" y="${(y(record.value) - 9).toFixed(2)}" fill="#32363b" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-size="8">${html(displayNumber(record.value))} · n=${html(record.n)}</text></g>`).join('');
      return lines + points;
    }).join('')}
    ${[...new Set(records.map(record => record.date))].map(date => `<text x="${x(date).toFixed(2)}" y="337" fill="#555b63" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-size="8">${html(date.slice(5))}</text>`).join('')}
    ${[...series.keys()].map((key, index) => {
      const [model, lead] = key.split('|');
      return `<g><circle cx="${46 + index * 164}" cy="370" r="4" fill="${colors[key] || '#65717d'}"/><text x="${56 + index * 164}" y="373" fill="#363a40" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9">${html(modelName(model))} ${html(lead)}h</text></g>`;
    }).join('')}
    <line x1="38" y1="392" x2="822" y2="392" stroke="#c9cbc7"/>
    <text x="38" y="413" fill="#555b63" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="8.5">Source ${html(source)} · source files ${html(sourceFileCount)}</text>
    <text x="38" y="438" fill="#8a4d20" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" font-weight="700">Missing dates are not connected. Short ranges are not long-term model rankings.</text>
  </svg>`;
}

function qualityFilename(result) {
  return extractFilename(result).replace(/\.csv$/, '.quality.csv');
}

function renderQuality(result) {
  const summary = extractQualitySummary(result);
  state.qualityResult = { ...summary, filename: qualityFilename(result) };
  $('#qualityTable thead').innerHTML = `<tr>${summary.headers.map(header => `<th>${html(header)}</th>`).join('')}</tr>`;
  $('#qualityTable tbody').innerHTML = summary.rows.map(row =>
    `<tr>${row.map(value => `<td>${html(value ?? '')}</td>`).join('')}</tr>`).join('');
  $('#qualityNote').textContent = summary.note;
  $('#downloadQuality').disabled = summary.rows.length === 0;
}

function renderTrendChart() {
  const trend = state.trendResult;
  if (!trend?.available) return;
  const variable = $('#trendVariable').value;
  const metric = $('#trendMetric').value;
  const markup = trendSvgMarkup(trend.rows, {
    variable,
    metric,
    dateFrom: trend.result.dateFrom,
    dateTo: trend.result.dateTo,
    sourceFileCount: trend.result.sourceFiles.length,
  });
  $('.trend-canvas').innerHTML = markup;
  const info = variableInfo(variable);
  $('#trendNote').textContent = `${trend.result.includedDates.length}개 실제 날짜 · ${info.name} ${metric.toUpperCase()} · 점마다 n 표시 · 빠진 날짜는 연결하지 않음`;
}

function renderTrend(result) {
  const trend = extractDailyTrend(result);
  const variables = [...new Set(trend.rows.map(row => row[3]))].sort();
  const previous = $('#trendVariable').value;
  $('#trendVariable').innerHTML = variables.map(variable =>
    `<option value="${html(variable)}">${html(variableInfo(variable).name)} (${html(variableInfo(variable).unit)})</option>`).join('');
  if (variables.includes(previous)) $('#trendVariable').value = previous;
  const trendDates = [...new Set(trend.rows.map(row => row[0]))];
  const available = result.dataset === 'cases' && result.includedDates.length >= 2 && trendDates.length >= 2;
  state.trendResult = { ...trend, result, available };
  $('#downloadTrendCsv').disabled = !available;
  $('#downloadTrendSvg').disabled = !available;
  if (!available) {
    const reason = result.dataset !== 'cases'
      ? '날짜별 예보 검증 추세는 예보·관측 사례 자료에서만 만듭니다.'
      : `현재 선택에 실제 검증 날짜가 ${trendDates.length}일뿐입니다. 2일 이상부터 만듭니다.`;
    $('#trendNote').textContent = reason;
    $('.trend-canvas').innerHTML = `<p>${html(reason)}</p>`;
    return;
  }
  renderTrendChart();
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
  const options = dates.map(date => `<option value="${html(date)}">${html(date)}</option>`).join('');
  $('#extractFrom').innerHTML = options;
  $('#extractTo').innerHTML = options;
  if (dates.length) {
    $('#extractFrom').value = dates.at(-1);
    $('#extractTo').value = dates.at(-1);
  }
}

function extractRangeDates(dataset, from, to) {
  return Object.keys(extractIndex(dataset)?.dates || {}).sort()
    .filter(date => date >= from && date <= to);
}

function calendarDates(from, to) {
  const dates = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (Number.isFinite(cursor.getTime()) && cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function refillExtractFilters(days) {
  const dataset = $('#extractDataset').value;
  const previousTime = $('#extractTime').value;
  const previousStation = $('#extractStation').value;
  const previousVariable = $('#extractVariable').value;
  const times = [...new Set(days.flatMap(day => Object.keys(day.hours || {})
    .map(time => time.includes('T') ? time.split('T')[1] : time)))].sort();
  const stationMap = new Map();
  days.forEach(day => Object.entries(day.stationMeta || {}).forEach(([id, meta]) => stationMap.set(id, meta)));
  const stations = [...stationMap.entries()].sort((left, right) => Number(left[0]) - Number(right[0]));
  const variableMap = new Map();
  days.forEach(day => extractVariables(dataset, day).forEach(([value, label]) => variableMap.set(value, label)));
  const variables = [...variableMap.entries()].sort((left, right) => left[0].localeCompare(right[0], 'en'));
  $('#extractTime').innerHTML = `<option value="all">전체 시각 (${times.length})</option>`
    + times.map(time => `<option value="${html(time)}">${html(time)} KST</option>`).join('');
  $('#extractStation').innerHTML = `<option value="all">전체 관측소 (${stations.length})</option>`
    + stations.map(([id, meta]) => `<option value="${html(id)}">${html(meta.name || `지점 ${id}`)} (${html(id)})</option>`).join('');
  $('#extractVariable').innerHTML = `<option value="all">전체 변수 (${variables.length})</option>`
    + variables.map(([value, label]) => `<option value="${html(value)}">${html(label)}</option>`).join('');
  if ([...$('#extractTime').options].some(option => option.value === previousTime)) $('#extractTime').value = previousTime;
  if ([...$('#extractStation').options].some(option => option.value === previousStation)) $('#extractStation').value = previousStation;
  if ([...$('#extractVariable').options].some(option => option.value === previousVariable)) $('#extractVariable').value = previousVariable;
}

function buildRangeResult(dataset, days, filters, dateFrom, dateTo, index = extractIndex(dataset)) {
  const headers = EXTRACT_SCHEMAS[dataset];
  const orderedDays = [...days].sort((left, right) => left.date.localeCompare(right.date, 'en'));
  const rows = sortedRows(orderedDays.flatMap(day => customExtractRows(dataset, day, filters)), [0, 1, 6, 7, 8]);
  const includedDates = orderedDays.map(day => day.date);
  const missingCalendarDates = calendarDates(dateFrom, dateTo)
    .filter(date => !includedDates.includes(date));
  const unique = key => [...new Set(orderedDays.map(day => day[key]).filter(Boolean))];
  const sourceFiles = orderedDays.map(day => ({
    date: day.date,
    path: index?.dates?.[day.date]?.path,
    source: day.source,
    license: day.license,
    generated: day.generated,
  }));
  return {
    dataset,
    date: dateFrom === dateTo ? dateFrom : `${dateFrom}_to_${dateTo}`,
    dateFrom,
    dateTo,
    includedDates,
    missingCalendarDates,
    filters,
    headers,
    rows,
    source: unique('source').join(' | '),
    license: unique('license').join(' | '),
    generated: `${unique('generated').length} source snapshot(s); see manifest`,
    sourcePath: URLS[dataset],
    sourceFiles,
  };
}

function extractSelectionPath(result) {
  const parameters = new URLSearchParams({
    dataset: result.dataset,
    from: result.dateFrom,
    to: result.dateTo,
    time: result.filters.time,
    station: result.filters.station,
    variable: result.filters.variable,
  });
  return `/research.html?${parameters.toString()}`;
}

function extractSelectionUrl(result) {
  return `https://earthus.net${extractSelectionPath(result)}`;
}

function extractSelectionRequest() {
  if (typeof location === 'undefined') return null;
  const parameters = new URLSearchParams(location.search);
  if (!['dataset', 'from', 'to', 'time', 'station', 'variable'].some(key => parameters.has(key))) return null;
  return Object.fromEntries(['dataset', 'from', 'to', 'time', 'station', 'variable']
    .map(key => [key, parameters.get(key) || '']));
}

function setSelectValue(selector, value) {
  const select = $(selector);
  if (!value || ![...select.options].some(option => option.value === value)) return false;
  select.value = value;
  return true;
}

function syncExtractSelectionUrl(result) {
  if (typeof history === 'undefined' || typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return;
  history.replaceState(null, '', extractSelectionPath(result));
}

function renderExtract() {
  const dataset = $('#extractDataset').value;
  const days = state.extractDays;
  if (!days?.length) return;
  const filters = {
    time: $('#extractTime').value,
    station: $('#extractStation').value,
    variable: $('#extractVariable').value,
  };
  const dateFrom = $('#extractFrom').value;
  const dateTo = $('#extractTo').value;
  state.extractResult = buildRangeResult(dataset, days, filters, dateFrom, dateTo);
  const { headers, rows, includedDates, missingCalendarDates, sourceFiles } = state.extractResult;
  const preview = rows.slice(0, 5);
  $('#extractTable thead').innerHTML = `<tr>${headers.map(header => `<th>${html(header)}</th>`).join('')}</tr>`;
  $('#extractTable tbody').innerHTML = preview.map(row =>
    `<tr>${row.map(value => `<td>${html(value ?? '')}</td>`).join('')}</tr>`).join('');
  $('#extractStatus').textContent = `${dateFrom} → ${dateTo} · 실제 공개 날짜 ${includedDates.length}일 · 결과 ${rows.length.toLocaleString('ko-KR')}행 · 미리보기 ${preview.length}행`;
  $('#extractEvidence').textContent = `${state.extractResult.source || '출처 없음'} · 원본 파일 ${sourceFiles.length}개 · 달력상 누락 ${missingCalendarDates.length}일 · 결측은 빈칸`;
  $('#downloadExtract').disabled = rows.length === 0;
  $('#downloadExtractBundle').disabled = rows.length === 0;
  $('#downloadExtractNotebook').disabled = rows.length === 0;
  $('#copyExtractLink').disabled = rows.length === 0;
  $('#downloadExtractManifest').disabled = rows.length === 0;
  $('#downloadExtractReadme').disabled = rows.length === 0;
  $('#downloadExtractPython').disabled = rows.length === 0;
  renderQuality(state.extractResult);
  renderTrend(state.extractResult);
  syncExtractSelectionUrl(state.extractResult);
}

async function loadExtractRange() {
  const dataset = $('#extractDataset').value;
  const from = $('#extractFrom').value;
  const to = $('#extractTo').value;
  const dates = extractRangeDates(dataset, from, to);
  const token = (state.extractToken || 0) + 1;
  state.extractToken = token;
  $('#downloadExtract').disabled = true;
  $('#downloadExtractBundle').disabled = true;
  $('#downloadExtractNotebook').disabled = true;
  $('#copyExtractLink').disabled = true;
  $('#downloadExtractManifest').disabled = true;
  $('#downloadExtractReadme').disabled = true;
  $('#downloadExtractPython').disabled = true;
  $('#downloadQuality').disabled = true;
  $('#downloadTrendCsv').disabled = true;
  $('#downloadTrendSvg').disabled = true;
  $('#extractStatus').textContent = `${from || '시작일 없음'} → ${to || '종료일 없음'} 공개 파일을 불러오는 중입니다.`;
  if (!dates.length) {
    state.extractDays = [];
    $('#extractStatus').textContent = '선택 범위에 실제로 보유한 공개 날짜가 없습니다.';
    return;
  }
  state.extractCache ||= { cases: {}, stations: {} };
  try {
    const days = await Promise.all(dates.map(async date => {
      if (state.extractCache[dataset][date]) return state.extractCache[dataset][date];
      const day = await json(extractIndex(dataset).dates[date].path);
      state.extractCache[dataset][date] = day;
      return day;
    }));
    if (token !== state.extractToken) return;
    state.extractDays = days.sort((left, right) => left.date.localeCompare(right.date, 'en'));
    refillExtractFilters(state.extractDays);
    if (state.extractRequestedFilters) {
      setSelectValue('#extractTime', state.extractRequestedFilters.time);
      setSelectValue('#extractStation', state.extractRequestedFilters.station);
      setSelectValue('#extractVariable', state.extractRequestedFilters.variable);
      state.extractRequestedFilters = null;
    }
    renderExtract();
  } catch (error) {
    if (token !== state.extractToken) return;
    state.extractDays = [];
    $('#extractStatus').textContent = `범위 안 공개 파일을 모두 읽지 못해 추출을 중단했습니다. (${error.message})`;
  }
}

function extractFilename(result) {
  const compact = value => String(value || 'all').replace(/[^0-9a-z_-]+/gi, '-');
  return `earthus-${result.dataset}-${compact(result.date)}-${compact(result.filters.time)}-${compact(result.filters.station)}-${compact(result.filters.variable)}.csv`;
}

async function buildExtractManifest(result) {
  const filename = extractFilename(result);
  const content = csvText(result.headers, result.rows);
  const quality = extractQualitySummary(result);
  const qualityContent = csvText(quality.headers, quality.rows);
  const trend = extractDailyTrend(result);
  const trendDates = [...new Set(trend.rows.map(row => row[0]))];
  const trendAvailable = result.dataset === 'cases' && result.includedDates.length >= 2 && trendDates.length >= 2;
  const trendContent = trendAvailable ? csvText(trend.headers, trend.rows) : null;
  const [fileHash, qualityHash, trendHash] = await Promise.all([
    sha256(content),
    sha256(qualityContent),
    trendContent ? sha256(trendContent) : Promise.resolve(null),
  ]);
  const derivedFiles = [{
    role: 'quality-summary',
    name: qualityFilename(result),
    mediaType: 'text/csv; charset=utf-8',
    encoding: 'UTF-8 with BOM',
    lineEnding: 'LF',
    rows: quality.rows.length,
    bytes: new TextEncoder().encode(qualityContent).byteLength,
    sha256: qualityHash,
    fields: quality.headers.map(name => ({
      name,
      unit: QUALITY_FIELD_META[name]?.[0] || EXTRACT_FIELD_META[name]?.[0] || '-',
      description: QUALITY_FIELD_META[name]?.[1] || EXTRACT_FIELD_META[name]?.[1] || name,
    })),
    methodology: quality.note,
  }];
  if (trendAvailable) derivedFiles.push({
    role: 'daily-trend',
    name: trendFilename(result),
    mediaType: 'text/csv; charset=utf-8',
    encoding: 'UTF-8 with BOM',
    lineEnding: 'LF',
    rows: trend.rows.length,
    bytes: new TextEncoder().encode(trendContent).byteLength,
    sha256: trendHash,
    fields: trend.headers.map(name => ({
      name,
      unit: TREND_FIELD_META[name]?.[0] || EXTRACT_FIELD_META[name]?.[0] || '-',
      description: TREND_FIELD_META[name]?.[1] || EXTRACT_FIELD_META[name]?.[1] || name,
    })),
    methodology: '날짜 x 모델 x 선행시간 x 변수별 n, ME, MAE, RMSE; 빠진 날짜를 보간하지 않음',
  });
  return {
    schema: 'earthus.custom-extract-manifest.v2',
    manifestVersion: 2,
    createdAt: new Date().toISOString(),
    product: 'earthus Research Custom Extract 무료 미리보기',
    salesStatus: '유료 판매 잠금; 현재 공개 범위만 사용',
    selection: {
      dataset: result.dataset,
      dateFrom: result.dateFrom,
      dateTo: result.dateTo,
      includedDates: result.includedDates,
      includedDateCount: result.includedDates.length,
      missingCalendarDates: result.missingCalendarDates,
      time: result.filters.time,
      station: result.filters.station,
      variable: result.filters.variable,
      sharePath: extractSelectionPath(result),
      shareUrl: extractSelectionUrl(result),
      allToken: 'all means no additional filter inside the selected date range',
    },
    file: {
      name: filename,
      mediaType: 'text/csv; charset=utf-8',
      encoding: 'UTF-8 with BOM',
      lineEnding: 'LF',
      rows: result.rows.length,
      bytes: new TextEncoder().encode(content).byteLength,
      sha256: fileHash,
      fields: result.headers.map(name => ({
        name,
        unit: EXTRACT_FIELD_META[name]?.[0] || '-',
        description: EXTRACT_FIELD_META[name]?.[1] || name,
      })),
    },
    derivedFiles,
    provenance: {
      sourcePath: result.sourcePath,
      source: result.source,
      license: result.license,
      sourceGeneratedAt: result.generated,
      sourceFiles: result.sourceFiles,
    },
    methodology: {
      rowShape: result.dataset === 'cases'
        ? 'one valid time x station x model x lead time x variable per row'
        : 'one observed time x station x variable per row',
      missing: '결측은 빈칸이며 0으로 대체하지 않음',
      difference: 'forecast_minus_observation = forecast - observation; 소수 셋째 자리까지 보존',
      ordering: '시각, 지점번호, 변수와 모델·선행시간을 고정 순서로 정렬',
      scope: '운영 공개 인덱스의 시작일·종료일 사이에 실제로 있는 날짜 파일만 사용',
    },
    licensePage: 'https://earthus.net/legal/data-license.ko.md',
  };
}

async function downloadExtractManifest(result) {
  const manifest = await buildExtractManifest(result);
  const filename = extractFilename(result).replace(/\.csv$/, '.manifest.json');
  downloadText(filename, JSON.stringify(manifest, null, 2) + '\n', 'application/json;charset=utf-8');
}

function buildExtractReadme(result, manifest) {
  const label = result.dataset === 'cases' ? '예보·관측 사례' : 'ASOS 시간 관측';
  const sourceUrl = result.sourcePath ? `https://earthus.net${result.sourcePath}` : '자료 없음';
  const value = input => String(input ?? '자료 없음').replaceAll('|', '\\|').replace(/\s*\n\s*/g, ' ');
  const qualityFile = manifest.derivedFiles.find(file => file.role === 'quality-summary');
  const trendFile = manifest.derivedFiles.find(file => file.role === 'daily-trend');
  const manifestName = extractFilename(result).replace(/\.csv$/, '.manifest.json');
  const pythonName = extractFilename(result).replace(/\.csv$/, '.verify.py');
  const notebookName = extractFilename(result).replace(/\.csv$/, '.analysis.ipynb');
  const trendRows = trendFile ? `
| 날짜별 추세 CSV | \`${value(trendFile.name)}\` |
| 추세 CSV 행 수 | ${trendFile.rows.toLocaleString('ko-KR')} |
| 추세 CSV 바이트 | ${trendFile.bytes.toLocaleString('ko-KR')} (UTF-8 BOM 포함) |
| 추세 CSV SHA-256 | \`${trendFile.sha256}\` |` : '';
  const trendMethod = trendFile ? `\n- 날짜별 추세: ${value(trendFile.methodology)}` : '';
  return `# earthus Research Custom Extract

이 메모는 아래 CSV와 같은 선택 상태에서 생성되었습니다. CSV와 manifest를 함께 보관하세요.

## 파일 확인

| 항목 | 값 |
|---|---|
| CSV | \`${value(manifest.file.name)}\` |
| 행 수 | ${manifest.file.rows.toLocaleString('ko-KR')} |
| 바이트 | ${manifest.file.bytes.toLocaleString('ko-KR')} (UTF-8 BOM 포함) |
| SHA-256 | \`${manifest.file.sha256}\` |
| manifest | \`${value(manifestName)}\` |
| 분석 노트북 | \`${value(notebookName)}\` |
| 품질 CSV | \`${value(qualityFile.name)}\` |
| 품질 CSV 행 수 | ${qualityFile.rows.toLocaleString('ko-KR')} |
| 품질 CSV 바이트 | ${qualityFile.bytes.toLocaleString('ko-KR')} (UTF-8 BOM 포함) |
| 품질 CSV SHA-256 | \`${qualityFile.sha256}\` |${trendRows}
| manifest schema | \`${manifest.schema}\` |

## 로컬 검증

압축을 푼 폴더에서 Python 3로 아래 명령을 실행하세요. 외부 패키지와 네트워크는 필요 없습니다.

\`\`\`sh
python3 ${value(pythonName)}
\`\`\`

## 선택 조건

| 항목 | 값 |
|---|---|
| 자료 | ${value(label)} (${value(result.dataset)}) |
| 시작일 | ${value(result.dateFrom)} |
| 종료일 | ${value(result.dateTo)} |
| 실제 포함 날짜 | ${result.includedDates.length.toLocaleString('ko-KR')}일 |
| 달력상 누락 날짜 | ${result.missingCalendarDates.length ? value(result.missingCalendarDates.join(', ')) : '없음'} |
| 시각 | ${value(result.filters.time)} |
| 관측소 | ${value(result.filters.station)} |
| 변수 | ${value(result.filters.variable)} |
| 선택 복원 링크 | ${value(manifest.selection.shareUrl)} |

\`all\`은 선택 날짜 범위 안에서 해당 항목을 추가로 거르지 않았다는 뜻입니다.

## 출처와 이용조건

- 원본 공개 경로: ${value(sourceUrl)}
- 출처: ${value(result.source)}
- 이용조건: ${value(result.license)}
- 원본 산출물 생성시각: ${value(result.generated)}
- 이 메모 생성시각: ${value(manifest.createdAt)}
- 원본 파일: ${manifest.provenance.sourceFiles.length.toLocaleString('ko-KR')}개

${manifest.provenance.sourceFiles.map(file =>
    `- ${value(file.date)} · ${value(file.path)} · 생성 ${value(file.generated)}`).join('\n')}

## 방법

- 행 구조: ${value(manifest.methodology.rowShape)}
- 결측: ${value(manifest.methodology.missing)}
- 차이 계산: ${value(manifest.methodology.difference)}
- 정렬: ${value(manifest.methodology.ordering)}
- 범위: ${value(manifest.methodology.scope)}
- 품질 요약: ${value(qualityFile.methodology)}${trendMethod}

## 인용 메모

earthus, “Research Custom Extract — ${value(label)}, ${value(result.dateFrom)}–${value(result.dateTo)},”
원본 파일 ${manifest.provenance.sourceFiles.length}개, 접근 ${value(manifest.createdAt.slice(0, 10))},
${value(sourceUrl)}.

이 문구는 선택 자료를 식별하기 위한 작업 메모이며 공식 DOI가 아닙니다.
원자료 제공기관의 출처와 이용조건을 함께 표기하고, 한 날짜·짧은 기간의 표본으로
모델의 장기 성능 순위를 주장하지 마세요.
`;
}

function buildExtractPython(result, manifest) {
  const files = [manifest.file, ...manifest.derivedFiles].map(file => ({
    name: file.name,
    sha256: file.sha256,
    rows: file.rows,
    headers: file.fields.map(field => field.name),
  }));
  const expected = JSON.stringify(files);
  return `#!/usr/bin/env python3
"""Verify earthus Custom Extract files using only the Python standard library.

Put this script, the selected CSV, and every derived CSV from the matching
manifest in the same directory, then run: python3 ${extractFilename(result).replace(/\.csv$/, '.verify.py')}
"""
import csv
import hashlib
import json
from decimal import Decimal
from pathlib import Path

EXPECTED = json.loads(r'''${expected}''')
DATASET = ${JSON.stringify(result.dataset)}
ROOT = Path(__file__).resolve().parent


def verify_file(spec):
    path = ROOT / spec["name"]
    if not path.is_file():
        raise SystemExit(f"MISSING: {path.name}")
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != spec["sha256"]:
        raise SystemExit(
            f"SHA256 MISMATCH: {path.name} expected={spec['sha256']} actual={digest}"
        )
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != spec["headers"]:
            raise SystemExit(
                f"HEADER MISMATCH: {path.name} expected={spec['headers']} actual={reader.fieldnames}"
            )
        rows = list(reader)
    if len(rows) != spec["rows"]:
        raise SystemExit(
            f"ROW COUNT MISMATCH: {path.name} expected={spec['rows']} actual={len(rows)}"
        )
    print(f"OK {path.name}: rows={len(rows)} sha256={digest}")
    return rows


verified = {spec["name"]: verify_file(spec) for spec in EXPECTED}
main_name = EXPECTED[0]["name"]
if DATASET == "cases":
    checked = 0
    tolerance = Decimal("0.001")
    for number, row in enumerate(verified[main_name], start=2):
        observation = row.get("observation", "")
        forecast = row.get("forecast", "")
        difference = row.get("forecast_minus_observation", "")
        if not observation or not forecast or not difference:
            continue
        recomputed = Decimal(forecast) - Decimal(observation)
        if abs(recomputed - Decimal(difference)) > tolerance:
            raise SystemExit(
                f"DIFFERENCE MISMATCH: {main_name} line={number} "
                f"stored={difference} recomputed={recomputed}"
            )
        checked += 1
    print(f"OK forecast_minus_observation: checked={checked} tolerance={tolerance}")

print("VERIFIED: all listed files match the manifest snapshot.")
`;
}

function notebookSource(text) {
  const lines = text.replace(/^\n/, '').replace(/\n$/, '').split('\n');
  return lines.map((line, index) => index === lines.length - 1 ? line : `${line}\n`);
}

function buildExtractNotebook(result, manifest) {
  const mainName = extractFilename(result);
  const baseName = mainName.replace(/\.csv$/, '');
  const variableIndex = result.dataset === 'cases' ? 8 : 6;
  const firstVariable = result.filters.variable !== 'all'
    ? result.filters.variable
    : [...new Set(result.rows.map(row => row[variableIndex]).filter(Boolean))].sort()[0] || '';
  const markdown = `# earthus Custom Extract 분석 시작점

- 자료: \`${result.dataset}\`
- 실제 포함 날짜: ${result.includedDates.join(', ')}
- 달력상 누락 날짜: ${result.missingCalendarDates.length ? result.missingCalendarDates.join(', ') : '없음'}
- 선택 CSV: \`${mainName}\`
- manifest: \`${baseName}.manifest.json\`
- 차트 변수: \`${firstVariable || '자료 없음'}\`

이 노트북은 묶음에 들어 있는 CSV를 다시 읽어 표본 수와 통계를 계산합니다. 결측을 0으로
대체하지 않으며, 사례 자료의 차이는 저장된 차이 열이 아니라 \`forecast - observation\`으로
다시 계산합니다. 짧은 기간의 결과를 장기 모델 성능 순위로 해석하지 마세요.`;
  const loadCode = `from pathlib import Path
import csv
import html
import json
import math
import textwrap

ROOT = Path.cwd()
DATASET = ${JSON.stringify(result.dataset)}
CSV_FILE = ${JSON.stringify(mainName)}
MANIFEST_FILE = ${JSON.stringify(`${baseName}.manifest.json`)}
SVG_FILE = ${JSON.stringify(`${baseName}.analysis.svg`)}
CHART_VARIABLE = ${JSON.stringify(firstVariable)}

with (ROOT / MANIFEST_FILE).open("r", encoding="utf-8") as handle:
    manifest = json.load(handle)
with (ROOT / CSV_FILE).open("r", encoding="utf-8-sig", newline="") as handle:
    rows = list(csv.DictReader(handle))

assert len(rows) == manifest["file"]["rows"], "manifest와 CSV 행 수가 다릅니다. verify.py를 먼저 실행하세요."
print("dataset:", DATASET)
print("range:", manifest["selection"]["dateFrom"], "→", manifest["selection"]["dateTo"])
print("included dates:", manifest["selection"]["includedDateCount"])
print("rows:", len(rows))
print("source files:", len(manifest["provenance"]["sourceFiles"]))`;
  const summaryCode = `from collections import defaultdict

def number(value):
    try:
        parsed = float(value)
        return parsed if math.isfinite(parsed) else None
    except (TypeError, ValueError):
        return None

def metric_values(values):
    n = len(values)
    if not n:
        return {"n": 0, "me": None, "mae": None, "rmse": None}
    return {
        "n": n,
        "me": sum(values) / n,
        "mae": sum(abs(value) for value in values) / n,
        "rmse": math.sqrt(sum(value * value for value in values) / n),
    }

summary = []
if DATASET == "cases":
    groups = defaultdict(lambda: {"total": 0, "missing_observation": 0, "missing_forecast": 0, "differences": []})
    for row in rows:
        key = (row["model"], row["lead_hour"], row["variable"], row["unit"])
        group = groups[key]
        group["total"] += 1
        observation = number(row["observation"])
        forecast = number(row["forecast"])
        if observation is None:
            group["missing_observation"] += 1
        if forecast is None:
            group["missing_forecast"] += 1
        if observation is not None and forecast is not None:
            group["differences"].append(forecast - observation)
    for (model, lead, variable, unit), group in sorted(groups.items()):
        summary.append({"model": model, "lead_hour": lead, "variable": variable, "unit": unit,
                        "total_rows": group["total"], "missing_observation": group["missing_observation"],
                        "missing_forecast": group["missing_forecast"], **metric_values(group["differences"])})
    print("model\tlead\tvariable\tunit\ttotal\tn\tmissing_obs\tmissing_fc\tME\tMAE\tRMSE")
    for item in summary:
        print(item["model"], item["lead_hour"], item["variable"], item["unit"],
              item["total_rows"], item["n"], item["missing_observation"], item["missing_forecast"],
              *("" if item[key] is None else f'{item[key]:.3f}' for key in ("me", "mae", "rmse")), sep="\t")
else:
    groups = defaultdict(lambda: {"total": 0, "observed": 0, "values": []})
    for row in rows:
        key = (row["variable"], row["unit"])
        group = groups[key]
        group["total"] += 1
        if row["value"] != "":
            group["observed"] += 1
        parsed = number(row["value"])
        if parsed is not None:
            group["values"].append(parsed)
    for (variable, unit), group in sorted(groups.items()):
        values = group["values"]
        missing = group["total"] - group["observed"]
        summary.append({"variable": variable, "unit": unit, "total_rows": group["total"],
                        "observed_n": group["observed"], "numeric_n": len(values), "missing_n": missing,
                        "missing_pct": missing / group["total"] * 100 if group["total"] else None,
                        "min": min(values) if values else None, "max": max(values) if values else None,
                        "mean": sum(values) / len(values) if values else None})
    print("variable\tunit\ttotal\tobserved_n\tnumeric_n\tmissing_n\tmissing_pct\tmin\tmax\tmean")
    for item in summary:
        values = [item[key] for key in ("missing_pct", "min", "max", "mean")]
        print(item["variable"], item["unit"], item["total_rows"], item["observed_n"], item["numeric_n"],
              item["missing_n"], *("" if value is None else f'{value:.3f}' for value in values), sep="\t")`;
  const chartCode = `if DATASET == "cases":
    chart = [item for item in summary if item["variable"] == CHART_VARIABLE and item["mae"] is not None]
    chart = [{"label": f'{item["model"]} / {item["lead_hour"]}h', "value": item["mae"],
              "n": item["n"], "unit": item["unit"]} for item in chart]
    title = f"{CHART_VARIABLE} MAE — forecast minus observation"
    warning = "짧은 범위의 표본은 장기 모델 성능 순위가 아닙니다."
    value_label = lambda item: f'{item["value"]:.3f} {item["unit"]} · n={item["n"]}'
else:
    chart = [{"label": f'{item["variable"]} ({item["unit"]})', "value": item["missing_pct"],
              "n": item["observed_n"], "unit": "%"} for item in summary if item["missing_pct"] is not None]
    title = "ASOS variable missing rate"
    warning = "문자열 관측은 observed_n에는 포함하고 numeric_n과 분리합니다."
    value_label = lambda item: f'{item["value"]:.3f}% missing · observed_n={item["n"]}'

if not chart:
    raise RuntimeError("선택 자료에서 차트로 그릴 유효값이 없습니다.")

width = 960
left = 260
right = 250
row_height = 34
source = manifest["provenance"]["source"] or "출처 없음"
source_lines = textwrap.wrap(source, width=110) or ["출처 없음"]
height = 150 + row_height * len(chart) + 24 * len(source_lines) + 56
maximum = max(item["value"] for item in chart) or 1
plot_width = width - left - right
parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">',
         '<rect width="100%" height="100%" fill="#0b0c0f"/>',
         f'<text x="32" y="42" fill="#e9e9ec" font-size="24" font-family="sans-serif">{html.escape(title)}</text>',
         f'<text x="32" y="70" fill="#9da1ad" font-size="13" font-family="monospace">'
         f'{html.escape(manifest["selection"]["dateFrom"])} → {html.escape(manifest["selection"]["dateTo"])} · '
         f'actual dates {manifest["selection"]["includedDateCount"]} · source files {len(manifest["provenance"]["sourceFiles"])}</text>']
for index, item in enumerate(chart):
    y = 112 + index * row_height
    bar_width = item["value"] / maximum * plot_width
    parts.extend([
        f'<text x="32" y="{y + 16}" fill="#e9e9ec" font-size="12" font-family="monospace">{html.escape(item["label"])}</text>',
        f'<rect x="{left}" y="{y}" width="{bar_width:.2f}" height="20" rx="3" fill="#b6a4ff"/>',
        f'<text x="{left + bar_width + 8:.2f}" y="{y + 15}" fill="#e9e9ec" font-size="10" font-family="monospace">{html.escape(value_label(item))}</text>',
    ])
footer_y = 126 + row_height * len(chart)
parts.append(f'<text x="32" y="{footer_y}" fill="#efb879" font-size="12" font-family="sans-serif">{html.escape(warning)}</text>')
for index, line in enumerate(source_lines):
    parts.append(f'<text x="32" y="{footer_y + 28 + index * 20}" fill="#78d5ba" font-size="11" font-family="monospace">source: {html.escape(line)}</text>')
parts.append('</svg>')
svg = "\\n".join(parts)
(ROOT / SVG_FILE).write_text(svg + "\\n", encoding="utf-8")
print("saved:", SVG_FILE)

try:
    from IPython.display import SVG, display
    display(SVG(svg))
except ImportError:
    print("SVG 미리보기는 Jupyter에서 표시됩니다.")`;
  const codeCell = source => ({
    cell_type: 'code', execution_count: null, metadata: {}, outputs: [], source: notebookSource(source),
  });
  return JSON.stringify({
    cells: [
      { cell_type: 'markdown', metadata: {}, source: notebookSource(markdown) },
      codeCell(loadCode),
      codeCell(summaryCode),
      codeCell(chartCode),
    ],
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
      language_info: { name: 'python', version: '3' },
      earthus: { manifestSchema: manifest.schema, generatedAt: manifest.createdAt },
    },
    nbformat: 4,
    nbformat_minor: 5,
  }, null, 2) + '\n';
}

async function downloadExtractPython(result) {
  const manifest = await buildExtractManifest(result);
  const script = buildExtractPython(result, manifest);
  const filename = extractFilename(result).replace(/\.csv$/, '.verify.py');
  downloadText(filename, script, 'text/x-python;charset=utf-8');
}

async function downloadExtractNotebook(result) {
  const manifest = await buildExtractManifest(result);
  const notebook = buildExtractNotebook(result, manifest);
  const filename = extractFilename(result).replace(/\.csv$/, '.analysis.ipynb');
  downloadText(filename, notebook, 'application/x-ipynb+json;charset=utf-8');
}

async function buildExtractBundle(result) {
  const manifest = await buildExtractManifest(result);
  const quality = extractQualitySummary(result);
  const trend = extractDailyTrend(result);
  const mainName = extractFilename(result);
  const baseName = mainName.replace(/\.csv$/, '');
  const files = [
    { name: mainName, content: csvText(result.headers, result.rows) },
    { name: qualityFilename(result), content: csvText(quality.headers, quality.rows) },
  ];
  if (manifest.derivedFiles.some(file => file.role === 'daily-trend')) {
    files.push({ name: trendFilename(result), content: csvText(trend.headers, trend.rows) });
  }
  files.push(
    { name: `${baseName}.manifest.json`, content: JSON.stringify(manifest, null, 2) + '\n' },
    { name: `${baseName}.README.md`, content: buildExtractReadme(result, manifest) },
    { name: `${baseName}.verify.py`, content: buildExtractPython(result, manifest) },
    { name: `${baseName}.analysis.ipynb`, content: buildExtractNotebook(result, manifest) },
  );
  return {
    filename: `${baseName}.reproducible.zip`,
    files,
    bytes: zipArchive(files, new Date(manifest.createdAt)),
  };
}

async function downloadExtractBundle(result) {
  const bundle = await buildExtractBundle(result);
  downloadBlob(bundle.filename, [bundle.bytes], 'application/zip');
}

async function downloadExtractReadme(result) {
  const manifest = await buildExtractManifest(result);
  const readme = buildExtractReadme(result, manifest);
  const filename = extractFilename(result).replace(/\.csv$/, '.README.md');
  downloadText(filename, readme, 'text/markdown;charset=utf-8');
}

function initExtract() {
  state.extractCache = { cases: {}, stations: {} };
  if (state.caseDay?.date) state.extractCache.cases[state.caseDay.date] = state.caseDay;
  if (state.stationDay?.date) state.extractCache.stations[state.stationDay.date] = state.stationDay;
  const requested = extractSelectionRequest();
  if (requested && ['cases', 'stations'].includes(requested.dataset)) $('#extractDataset').value = requested.dataset;
  refillExtractDates();
  if (requested) {
    setSelectValue('#extractFrom', requested.from);
    setSelectValue('#extractTo', requested.to);
    if ($('#extractFrom').value > $('#extractTo').value) $('#extractTo').value = $('#extractFrom').value;
    state.extractRequestedFilters = requested;
  }
  $('#extractDataset').addEventListener('change', () => {
    state.extractRequestedFilters = null;
    refillExtractDates();
    loadExtractRange();
  });
  $('#extractFrom').addEventListener('change', () => {
    if ($('#extractFrom').value > $('#extractTo').value) $('#extractTo').value = $('#extractFrom').value;
    loadExtractRange();
  });
  $('#extractTo').addEventListener('change', () => {
    if ($('#extractTo').value < $('#extractFrom').value) $('#extractFrom').value = $('#extractTo').value;
    loadExtractRange();
  });
  ['#extractTime', '#extractStation', '#extractVariable'].forEach(selector =>
    $(selector).addEventListener('change', renderExtract));
  ['#trendVariable', '#trendMetric'].forEach(selector =>
    $(selector).addEventListener('change', renderTrendChart));
  $('#downloadExtract').addEventListener('click', () => {
    const result = state.extractResult;
    if (!result?.rows.length) return;
    download(extractFilename(result), result.headers, result.rows);
  });
  $('#downloadExtractBundle').addEventListener('click', async event => {
    const result = state.extractResult;
    if (!result?.rows.length) return;
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = '재현 묶음 만드는 중…';
    try {
      await downloadExtractBundle(result);
    } catch (error) {
      $('#error').hidden = false;
      $('#error').textContent = `재현 묶음을 만들지 못했습니다. (${error.message})`;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
  $('#downloadExtractNotebook').addEventListener('click', async event => {
    const result = state.extractResult;
    if (!result?.rows.length) return;
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = '분석 노트북 만드는 중…';
    try {
      await downloadExtractNotebook(result);
    } catch (error) {
      $('#error').hidden = false;
      $('#error').textContent = `분석 노트북을 만들지 못했습니다. (${error.message})`;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
  $('#copyExtractLink').addEventListener('click', async event => {
    const result = state.extractResult;
    if (!result?.rows.length) return;
    const button = event.currentTarget;
    const original = button.textContent;
    const url = extractSelectionUrl(result);
    syncExtractSelectionUrl(result);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(url);
      button.textContent = '현재 선택 링크 복사됨';
    } catch (error) {
      button.textContent = '주소창에 현재 선택 반영됨';
    }
    setTimeout(() => { button.textContent = original; }, 1800);
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
  $('#downloadExtractReadme').addEventListener('click', async event => {
    const result = state.extractResult;
    if (!result?.rows.length) return;
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = '인용 메모 만드는 중…';
    try {
      await downloadExtractReadme(result);
    } catch (error) {
      $('#error').hidden = false;
      $('#error').textContent = `인용·방법 메모를 만들지 못했습니다. (${error.message})`;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
  $('#downloadExtractPython').addEventListener('click', async event => {
    const result = state.extractResult;
    if (!result?.rows.length) return;
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = '검증 코드 만드는 중…';
    try {
      await downloadExtractPython(result);
    } catch (error) {
      $('#error').hidden = false;
      $('#error').textContent = `재현 Python 코드를 만들지 못했습니다. (${error.message})`;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
  $('#downloadQuality').addEventListener('click', () => {
    const summary = state.qualityResult;
    if (!summary?.rows.length) return;
    download(summary.filename, summary.headers, summary.rows);
  });
  $('#downloadTrendCsv').addEventListener('click', () => {
    const trend = state.trendResult;
    if (!trend?.available) return;
    download(trendFilename(trend.result), trend.headers, trend.rows);
  });
  $('#downloadTrendSvg').addEventListener('click', () => {
    const trend = state.trendResult;
    const svg = $('.trend-canvas svg');
    if (!trend?.available || !svg) return;
    const filename = trendFilename(trend.result).replace(/\.csv$/, `-${$('#trendVariable').value}-${$('#trendMetric').value}.svg`);
    downloadText(filename, `${svg.outerHTML}\n`, 'image/svg+xml;charset=utf-8');
  });
  loadExtractRange();
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
