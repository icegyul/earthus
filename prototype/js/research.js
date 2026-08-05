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

const TRACE_HEADERS = [
  'valid_kst', 'station_id', 'station_name', 'lat', 'lon', 'alt_m', 'series',
  'model', 'lead_hour', 'variable', 'unit', 'value', 'n', 'issued_kst',
  'source', 'license', 'generated',
];

function buildTraceResult(day, stationId, variable, lead) {
  const meta = day.stationMeta?.[stationId] || {};
  const leadKey = `${lead}h`;
  const models = [...new Set(day.models || [])].sort((left, right) =>
    modelName(left).localeCompare(modelName(right), 'en'));
  const rows = [];
  Object.entries(day.hours || {}).sort(([left], [right]) => left.localeCompare(right, 'en'))
    .forEach(([valid, hour]) => {
      const item = (hour.cases || []).find(record => String(record.stationId) === String(stationId));
      const observation = item?.observation?.[variable];
      rows.push([
        valid, stationId, meta.name, meta.lat, meta.lon, meta.alt, 'observation', '', '',
        variable, variableInfo(variable).unit, observation, finite(observation) ? 1 : 0, '',
        day.source, day.license, day.generated,
      ]);
      models.forEach(model => {
        const forecast = item?.forecasts?.[model]?.[leadKey]?.[variable];
        rows.push([
          valid, stationId, meta.name, meta.lat, meta.lon, meta.alt, 'forecast', model, lead,
          variable, variableInfo(variable).unit, forecast, finite(forecast) ? 1 : 0,
          hour.issues?.[leadKey] ? formatIssue(hour.issues[leadKey]) : '', day.source, day.license, day.generated,
        ]);
      });
    });
  return {
    date: day.date,
    stationId: String(stationId),
    stationName: meta.name || `지점 ${stationId}`,
    variable,
    unit: variableInfo(variable).unit,
    lead: Number(lead),
    models,
    headers: TRACE_HEADERS,
    rows,
    source: day.source,
    license: day.license,
    generated: day.generated,
  };
}

function traceTimeMillis(value) {
  return Date.parse(`${value}:00+09:00`);
}

function traceSeriesSegments(points) {
  const segments = [];
  points.forEach(point => {
    const previous = segments.at(-1)?.at(-1);
    if (!previous || traceTimeMillis(point.time) - traceTimeMillis(previous.time) > 90 * 60 * 1000) {
      segments.push([point]);
    } else {
      segments.at(-1).push(point);
    }
  });
  return segments;
}

function traceFilename(result, extension) {
  const compact = value => String(value || 'none').replace(/[^0-9a-z_-]+/gi, '-');
  return `earthus-station-trace-${compact(result.date)}-${compact(result.stationId)}-${compact(result.variable)}-${compact(result.lead)}h.${extension}`;
}

function traceSvgMarkup(result) {
  const times = [...new Set(result.rows.map(row => row[0]))].sort();
  const definitions = [
    { id: 'observation', label: 'ASOS observation', color: '#087f5b', matches: row => row[6] === 'observation' },
    ...result.models.map((model, index) => ({
      id: model,
      label: `${modelName(model)} ${result.lead}h`,
      color: ['#5f3dc4', '#d97706', '#1971c2'][index % 3],
      matches: row => row[6] === 'forecast' && row[7] === model,
    })),
  ];
  const series = definitions.map(definition => ({
    ...definition,
    points: result.rows.filter(definition.matches).filter(row => finite(row[11]))
      .map(row => ({ time: row[0], value: Number(row[11]), n: Number(row[12]) })),
  }));
  const values = series.flatMap(item => item.points.map(point => point.value));
  if (!times.length || !values.length) return '';
  let minimum = Math.min(...values);
  let maximum = Math.max(...values);
  if (minimum === maximum) {
    minimum -= 1;
    maximum += 1;
  }
  const padding = (maximum - minimum) * .1;
  minimum -= padding;
  maximum += padding;
  const width = 900;
  const sourceLines = svgLines(result.source, 112);
  const height = 485 + sourceLines.length * 18;
  const left = 72;
  const right = 32;
  const top = 126;
  const bottom = 356;
  const plotWidth = width - left - right;
  const x = time => {
    const index = times.indexOf(time);
    return left + (times.length === 1 ? plotWidth / 2 : index / (times.length - 1) * plotWidth);
  };
  const y = value => bottom - (value - minimum) / (maximum - minimum) * (bottom - top);
  const chunks = [
    `<svg id="traceSvg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="traceTitle traceDesc" xmlns="http://www.w3.org/2000/svg">`,
    `<title id="traceTitle">${html(result.stationName)} ${html(variableInfo(result.variable).name)} 관측과 모델 시간 추적</title>`,
    `<desc id="traceDesc">${html(result.date)} 실제 공개 시각의 ASOS 관측과 ${html(result.lead)}시간 GFS·ECMWF 모델값. 빠진 시각과 결측은 연결하지 않음.</desc>`,
    `<rect width="${width}" height="${height}" fill="#f7f7f4"/>`,
    `<text x="32" y="38" fill="#15171c" font-size="23" font-family="sans-serif" font-weight="700">${html(result.stationName)} (${html(result.stationId)}) · ${html(variableInfo(result.variable).name)} ${html(result.unit)}</text>`,
    `<text x="32" y="63" fill="#5d626c" font-size="12" font-family="monospace">${html(result.date)} · ${html(result.lead)}h forecast issue · actual public times ${times.length}</text>`,
  ];
  let legendX = 32;
  series.forEach(item => {
    chunks.push(`<circle cx="${legendX + 5}" cy="91" r="5" fill="${item.color}"/>`);
    chunks.push(`<text x="${legendX + 16}" y="95" fill="#30343b" font-size="11" font-family="monospace">${html(item.label)} · n=${item.points.length}/${times.length}</text>`);
    legendX += Math.max(190, item.label.length * 8 + 92);
  });
  for (let tick = 0; tick <= 4; tick += 1) {
    const value = minimum + (maximum - minimum) * tick / 4;
    const position = y(value);
    chunks.push(`<line x1="${left}" y1="${position}" x2="${width - right}" y2="${position}" stroke="#d5d7db" stroke-width="1"/>`);
    chunks.push(`<text x="${left - 9}" y="${position + 4}" text-anchor="end" fill="#676c75" font-size="10" font-family="monospace">${value.toFixed(2)}</text>`);
  }
  const labelStep = Math.max(1, Math.ceil(times.length / 8));
  times.forEach((time, index) => {
    if (index % labelStep && index !== times.length - 1) return;
    chunks.push(`<text x="${x(time)}" y="380" text-anchor="middle" fill="#565b65" font-size="10" font-family="monospace">${html(time.split('T')[1] || time)}</text>`);
  });
  series.forEach(item => {
    traceSeriesSegments(item.points).filter(segment => segment.length > 1).forEach((segment, index) => {
      const path = segment.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'} ${x(point.time).toFixed(2)} ${y(point.value).toFixed(2)}`).join(' ');
      chunks.push(`<path data-series="${html(item.id)}" data-segment="${index}" d="${path}" fill="none" stroke="${item.color}" stroke-width="2.5"/>`);
    });
    item.points.forEach(point => {
      chunks.push(`<circle cx="${x(point.time)}" cy="${y(point.value)}" r="4" fill="${item.color}"><title>${html(item.label)} · ${html(point.time)} · ${point.value} ${html(result.unit)} · n=${point.n}</title></circle>`);
    });
  });
  chunks.push(`<text x="32" y="414" fill="#a45b08" font-size="11" font-family="sans-serif">실제 공개 사례의 사후 대조이며 예보가 아닙니다. 결측·빠진 시각은 잇지 않습니다.</text>`);
  sourceLines.forEach((line, index) => chunks.push(`<text x="32" y="${440 + index * 18}" fill="#087f5b" font-size="10" font-family="monospace">source: ${html(line)}</text>`));
  chunks.push(`<text x="32" y="${452 + sourceLines.length * 18}" fill="#6b7079" font-size="10" font-family="monospace">source generated: ${html(result.generated)} · license: ${html(result.license)}</text>`);
  chunks.push('</svg>');
  return chunks.join('');
}

const TRACE_FIELD_META = {
  series: ['-', 'observation 또는 forecast 계열 구분'],
  model: ['-', '예보 모델 식별자; 관측 행은 빈칸'],
  lead_hour: ['hour', '예보 선행시간; 관측 행은 빈칸'],
  value: ['variable unit', '관측 또는 모델값'],
  n: ['count', '해당 행 값이 유효하면 1, 결측이면 0'],
  issued_kst: ['KST', '예보 발표 기준시각; 관측 행은 빈칸'],
};

async function buildTraceManifest(result) {
  const csvName = traceFilename(result, 'csv');
  const svgName = traceFilename(result, 'svg');
  const csvContent = csvText(result.headers, result.rows);
  const svgContent = `${traceSvgMarkup(result)}\n`;
  const [csvHash, svgHash] = await Promise.all([sha256(csvContent), sha256(svgContent)]);
  const times = [...new Set(result.rows.map(row => row[0]))].sort();
  return {
    schema: 'earthus.station-trace-manifest.v1',
    manifestVersion: 1,
    createdAt: new Date().toISOString(),
    product: 'earthus Research Station Trace 무료 미리보기',
    salesStatus: '유료 판매 잠금; 현재 공개 사례 범위만 사용',
    selection: {
      date: result.date,
      stationId: result.stationId,
      stationName: result.stationName,
      variable: result.variable,
      unit: result.unit,
      leadHour: result.lead,
      actualTimes: times,
      actualTimeCount: times.length,
      models: result.models,
    },
    files: [
      {
        role: 'trace-data', name: csvName, mediaType: 'text/csv; charset=utf-8',
        encoding: 'UTF-8 with BOM', lineEnding: 'LF', rows: result.rows.length,
        bytes: new TextEncoder().encode(csvContent).byteLength, sha256: csvHash,
        fields: result.headers.map(name => ({
          name,
          unit: TRACE_FIELD_META[name]?.[0] || EXTRACT_FIELD_META[name]?.[0] || '-',
          description: TRACE_FIELD_META[name]?.[1] || EXTRACT_FIELD_META[name]?.[1] || name,
        })),
      },
      {
        role: 'trace-figure', name: svgName, mediaType: 'image/svg+xml; charset=utf-8',
        encoding: 'UTF-8', lineEnding: 'LF',
        bytes: new TextEncoder().encode(svgContent).byteLength, sha256: svgHash,
      },
    ],
    provenance: { source: result.source, license: result.license, sourceGeneratedAt: result.generated },
    methodology: {
      rowShape: 'one valid time x observation/model series per row',
      value: 'observation rows use ASOS observation; forecast rows use the selected model and lead time',
      missing: '결측은 빈칸이며 n=0; 0으로 대체하지 않음',
      line: '유효값만 표시하고 인접 유효 시각 간격이 90분을 넘으면 SVG 선을 끊음',
      warning: '실제 공개 사례의 사후 대조이며 예보가 아님',
    },
    licensePage: 'https://earthus.net/legal/data-license.ko.md',
  };
}

function buildTraceReadme(result, manifest) {
  const dataFile = manifest.files.find(file => file.role === 'trace-data');
  const figureFile = manifest.files.find(file => file.role === 'trace-figure');
  return `# earthus Station Trace

## 선택

- 날짜: ${result.date}
- 관측소: ${result.stationName} (${result.stationId})
- 변수: ${result.variable} (${result.unit})
- 선행시간: ${result.lead}시간
- 실제 공개 시각: ${manifest.selection.actualTimeCount}개

## 파일

| 역할 | 파일 | 행/바이트 | SHA-256 |
|---|---|---:|---|
| long-format CSV | \`${dataFile.name}\` | ${dataFile.rows}행 / ${dataFile.bytes}바이트 | \`${dataFile.sha256}\` |
| 근거 포함 SVG | \`${figureFile.name}\` | ${figureFile.bytes}바이트 | \`${figureFile.sha256}\` |

## 방법과 한계

- CSV 한 행은 유효시각 × 관측 또는 모델 계열입니다.
- 결측은 빈칸과 n=0으로 남기며 0으로 채우지 않습니다.
- SVG는 유효값만 그리고, 인접 유효 시각 간격이 90분을 넘으면 선을 끊습니다.
- 실제 공개 사례의 사후 대조이며 미래 예보가 아닙니다.
- 출처: ${result.source}
- 이용조건: ${result.license}
- 원본 생성시각: ${result.generated}

## 검증

같은 폴더에서 \`python3 ${traceFilename(result, 'verify.py')}\`를 실행하세요.
Python 표준 라이브러리만 사용하며 CSV와 SVG의 SHA-256, CSV 열 순서와 행 수를 검사합니다.

이 묶음은 공식 DOI가 아닙니다. 원자료 제공기관 출처와 이용조건을 함께 표기하세요.
`;
}

function buildTracePython(result, manifest) {
  const expected = JSON.stringify(manifest.files.map(file => ({
    name: file.name,
    sha256: file.sha256,
    rows: file.rows,
    headers: file.fields?.map(field => field.name),
  })));
  return `#!/usr/bin/env python3
import csv
import hashlib
import json
from pathlib import Path

EXPECTED = json.loads(r'''${expected}''')
ROOT = Path(__file__).resolve().parent

for spec in EXPECTED:
    path = ROOT / spec["name"]
    if not path.is_file():
        raise SystemExit(f"MISSING: {path.name}")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != spec["sha256"]:
        raise SystemExit(f"SHA256 MISMATCH: {path.name} expected={spec['sha256']} actual={digest}")
    if spec.get("headers"):
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if reader.fieldnames != spec["headers"]:
                raise SystemExit(f"HEADER MISMATCH: {path.name}")
            rows = sum(1 for _ in reader)
        if rows != spec["rows"]:
            raise SystemExit(f"ROW COUNT MISMATCH: {path.name} expected={spec['rows']} actual={rows}")
        print(f"OK {path.name}: rows={rows} sha256={digest}")
    else:
        print(f"OK {path.name}: sha256={digest}")

print("VERIFIED: Station Trace CSV and SVG match this snapshot.")
`;
}

async function buildTraceBundle(result) {
  const manifest = await buildTraceManifest(result);
  const baseName = traceFilename(result, 'csv').replace(/\.csv$/, '');
  const files = [
    { name: traceFilename(result, 'csv'), content: csvText(result.headers, result.rows) },
    { name: traceFilename(result, 'svg'), content: `${traceSvgMarkup(result)}\n` },
    { name: `${baseName}.manifest.json`, content: JSON.stringify(manifest, null, 2) + '\n' },
    { name: `${baseName}.README.md`, content: buildTraceReadme(result, manifest) },
    { name: `${baseName}.verify.py`, content: buildTracePython(result, manifest) },
  ];
  return {
    filename: `${baseName}.reproducible.zip`,
    files,
    bytes: zipArchive(files, new Date(manifest.createdAt)),
    manifest,
  };
}

function refillTraceControls(day) {
  const station = $('#traceStation');
  const variable = $('#traceVariable');
  const lead = $('#traceLead');
  const previousStation = station.value;
  const previousVariable = variable.value;
  const previousLead = lead.value;
  const stationIds = [...new Set(Object.values(day.hours || {}).flatMap(hour =>
    (hour.cases || []).map(item => String(item.stationId))))].sort((left, right) => Number(left) - Number(right));
  station.innerHTML = stationIds.map(id => `<option value="${html(id)}">${html(day.stationMeta?.[id]?.name || `지점 ${id}`)} (${html(id)})</option>`).join('');
  variable.innerHTML = (day.vars || []).map(value => `<option value="${html(value)}">${html(variableInfo(value).name)} (${html(variableInfo(value).unit)})</option>`).join('');
  lead.innerHTML = (day.leadsHours || []).map(value => `<option value="${html(value)}">${html(value)}시간</option>`).join('');
  setSelectValue('#traceStation', previousStation);
  setSelectValue('#traceVariable', previousVariable);
  setSelectValue('#traceLead', previousLead);
}

function renderTrace() {
  const day = state.traceDay;
  if (!day) return;
  const result = buildTraceResult(day, $('#traceStation').value, $('#traceVariable').value, $('#traceLead').value);
  const markup = traceSvgMarkup(result);
  state.traceResult = result;
  $('.trace-canvas').innerHTML = markup || '<p class="figure-empty">선택 범위에 그릴 유효 관측·모델값이 없습니다.</p>';
  $('#downloadTraceCsv').disabled = !result.rows.length;
  $('#downloadTraceSvg').disabled = !markup;
  $('#downloadTraceBundle').disabled = !result.rows.length || !markup;
  const valid = result.rows.filter(row => finite(row[11])).length;
  $('#traceWarning').textContent = `${result.date} · ${result.stationName} (${result.stationId}) · ${variableInfo(result.variable).name} · ${result.lead}시간 · 유효 ${valid}/${result.rows.length}행`;
}

async function loadTraceDay() {
  const date = $('#traceDate').value;
  $('#downloadTraceCsv').disabled = true;
  $('#downloadTraceSvg').disabled = true;
  $('#downloadTraceBundle').disabled = true;
  $('#traceWarning').textContent = `${date || '날짜 없음'} 실제 공개 사례를 불러오는 중입니다.`;
  try {
    const day = state.extractCache.cases[date] || await json(state.caseIndex.dates[date].path);
    state.extractCache.cases[date] = day;
    state.traceDay = day;
    refillTraceControls(day);
    renderTrace();
  } catch (error) {
    state.traceDay = null;
    $('.trace-canvas').innerHTML = `<p class="figure-empty">사례 파일을 읽지 못했습니다. (${html(error.message)})</p>`;
    $('#traceWarning').textContent = '실제 사례를 읽지 못해 차트를 만들지 않았습니다.';
  }
}

function initTrace() {
  const dates = Object.keys(state.caseIndex?.dates || {}).sort();
  $('#traceDate').innerHTML = dates.map(date => `<option value="${html(date)}">${html(date)}</option>`).join('');
  if (dates.length) $('#traceDate').value = dates.at(-1);
  $('#traceDate').addEventListener('change', loadTraceDay);
  ['#traceStation', '#traceVariable', '#traceLead'].forEach(selector => $(selector).addEventListener('change', renderTrace));
  $('#downloadTraceCsv').addEventListener('click', () => {
    const result = state.traceResult;
    if (!result?.rows.length) return;
    download(traceFilename(result, 'csv'), result.headers, result.rows);
  });
  $('#downloadTraceSvg').addEventListener('click', () => {
    const result = state.traceResult;
    if (!result) return;
    downloadText(traceFilename(result, 'svg'), `${traceSvgMarkup(result)}\n`, 'image/svg+xml;charset=utf-8');
  });
  $('#downloadTraceBundle').addEventListener('click', async event => {
    const result = state.traceResult;
    if (!result?.rows.length) return;
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Trace 묶음 만드는 중…';
    try {
      const bundle = await buildTraceBundle(result);
      downloadBlob(bundle.filename, [bundle.bytes], 'application/zip');
    } catch (error) {
      $('#error').hidden = false;
      $('#error').textContent = `Trace 재현 묶음을 만들지 못했습니다. (${error.message})`;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
  if (dates.length) loadTraceDay();
}

const DISTRIBUTION_HEADERS = [
  'valid_kst', 'station_id', 'station_name', 'lat', 'lon', 'alt_m', 'model',
  'lead_hour', 'variable', 'unit', 'observation', 'forecast',
  'forecast_minus_observation', 'n', 'issued_kst', 'source', 'license', 'generated',
];

function linearQuantile(sorted, probability) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function equalWidthHistogram(values, binCount) {
  if (!values.length) return { bins: [], minimum: null, maximum: null, width: null };
  let minimum = Math.min(...values);
  let maximum = Math.max(...values);
  if (minimum === maximum) {
    minimum -= .5;
    maximum += .5;
  }
  const width = (maximum - minimum) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    from: minimum + width * index,
    to: minimum + width * (index + 1),
    count: 0,
  }));
  values.forEach(value => {
    const index = Math.min(binCount - 1, Math.max(0, Math.floor((value - minimum) / width)));
    bins[index].count += 1;
  });
  return { bins, minimum, maximum, width };
}

function buildDistributionResult(day, model, lead, variable, binCount = 15) {
  const leadKey = `${lead}h`;
  const rows = [];
  Object.entries(day.hours || {}).sort(([left], [right]) => left.localeCompare(right, 'en'))
    .forEach(([valid, hour]) => {
      (hour.cases || []).forEach(item => {
        const stationId = String(item.stationId);
        const meta = day.stationMeta?.[stationId] || {};
        const observation = item.observation?.[variable];
        const forecast = item.forecasts?.[model]?.[leadKey]?.[variable];
        const paired = finite(observation) && finite(forecast);
        rows.push([
          valid, stationId, meta.name, meta.lat, meta.lon, meta.alt, model, Number(lead),
          variable, variableInfo(variable).unit, observation, forecast,
          paired ? rounded(Number(forecast) - Number(observation)) : null, paired ? 1 : 0,
          hour.issues?.[leadKey] ? formatIssue(hour.issues[leadKey]) : '',
          day.source, day.license, day.generated,
        ]);
      });
    });
  const errors = rows.map(row => row[12]).filter(finite).map(Number).sort((left, right) => left - right);
  const n = errors.length;
  const mean = n ? errors.reduce((sum, value) => sum + value, 0) / n : null;
  const stats = {
    totalRows: rows.length,
    n,
    missingObservation: rows.filter(row => !finite(row[10])).length,
    missingForecast: rows.filter(row => !finite(row[11])).length,
    min: n ? errors[0] : null,
    p10: linearQuantile(errors, .1),
    p25: linearQuantile(errors, .25),
    median: linearQuantile(errors, .5),
    p75: linearQuantile(errors, .75),
    p90: linearQuantile(errors, .9),
    max: n ? errors.at(-1) : null,
    me: mean,
    mae: n ? errors.reduce((sum, value) => sum + Math.abs(value), 0) / n : null,
    rmse: n ? Math.sqrt(errors.reduce((sum, value) => sum + value ** 2, 0) / n) : null,
  };
  return {
    date: day.date,
    model,
    lead: Number(lead),
    variable,
    unit: variableInfo(variable).unit,
    binCount: Number(binCount),
    headers: DISTRIBUTION_HEADERS,
    rows,
    errors,
    stats,
    histogram: equalWidthHistogram(errors, Number(binCount)),
    source: day.source,
    license: day.license,
    generated: day.generated,
  };
}

function distributionFilename(result, extension) {
  const compact = value => String(value || 'none').replace(/[^0-9a-z_-]+/gi, '-');
  return `earthus-error-distribution-${compact(result.date)}-${compact(result.model)}-${compact(result.lead)}h-${compact(result.variable)}-${result.binCount}bins.${extension}`;
}

function distributionSvgMarkup(result) {
  const { bins, minimum, maximum } = result.histogram;
  if (!bins.length) return '';
  const width = 900;
  const sourceLines = svgLines(result.source, 112);
  const height = 500 + sourceLines.length * 18;
  const plot = { left: 68, right: 30, top: 154, bottom: 348 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = plot.bottom - plot.top;
  const maximumCount = Math.max(1, ...bins.map(bin => bin.count));
  const barStep = plotWidth / bins.length;
  const barWidth = Math.max(1, barStep - 2);
  const x = value => plot.left + (value - minimum) / (maximum - minimum) * plotWidth;
  const y = count => plot.bottom - count / maximumCount * plotHeight;
  const stat = value => finite(value) ? Number(value).toFixed(3) : 'NA';
  const chunks = [
    `<svg id="distributionSvg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="distributionTitle distributionDesc" xmlns="http://www.w3.org/2000/svg">`,
    `<title id="distributionTitle">${html(result.date)} ${html(modelName(result.model))} ${html(result.lead)}시간 ${html(variableInfo(result.variable).name)} 오차 분포</title>`,
    `<desc id="distributionDesc">forecast minus observation 개별 표본의 ${bins.length}개 등간격 히스토그램. n과 결측, 분위수를 함께 표시.</desc>`,
    `<rect width="${width}" height="${height}" fill="#f7f7f4"/>`,
    `<text x="34" y="38" fill="#15171c" font-size="23" font-family="sans-serif" font-weight="700">${html(modelName(result.model))} ${html(result.lead)}h · ${html(variableInfo(result.variable).name)} 오차 분포</text>`,
    `<text x="34" y="62" fill="#5d626c" font-size="11" font-family="monospace">${html(result.date)} · forecast − observation (${html(result.unit)}) · equal-width ${bins.length} bins</text>`,
    `<text x="34" y="91" fill="#30343b" font-size="11" font-family="monospace">n ${result.stats.n}/${result.stats.totalRows} · missing obs ${result.stats.missingObservation} · missing forecast ${result.stats.missingForecast}</text>`,
    `<text x="34" y="116" fill="#5f3dc4" font-size="11" font-family="monospace">ME ${stat(result.stats.me)} · median ${stat(result.stats.median)} · MAE ${stat(result.stats.mae)} · RMSE ${stat(result.stats.rmse)} · p10 ${stat(result.stats.p10)} · p90 ${stat(result.stats.p90)}</text>`,
  ];
  for (let tick = 0; tick <= 4; tick += 1) {
    const count = maximumCount * tick / 4;
    const position = y(count);
    chunks.push(`<line x1="${plot.left}" y1="${position}" x2="${width - plot.right}" y2="${position}" stroke="#d5d7db"/>`);
    chunks.push(`<text x="${plot.left - 8}" y="${position + 4}" text-anchor="end" fill="#676c75" font-size="9" font-family="monospace">${Math.round(count)}</text>`);
  }
  bins.forEach((bin, index) => {
    const barX = plot.left + index * barStep + 1;
    const barY = y(bin.count);
    const percentage = result.stats.n ? bin.count / result.stats.n * 100 : 0;
    chunks.push(`<rect x="${barX.toFixed(2)}" y="${barY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(0, plot.bottom - barY).toFixed(2)}" fill="#7059c7"><title>${bin.from.toFixed(3)} ≤ error ${index === bins.length - 1 ? '≤' : '&lt;'} ${bin.to.toFixed(3)} ${html(result.unit)} · count ${bin.count} · ${percentage.toFixed(2)}%</title></rect>`);
  });
  if (minimum <= 0 && maximum >= 0) {
    chunks.push(`<line x1="${x(0)}" y1="${plot.top}" x2="${x(0)}" y2="${plot.bottom}" stroke="#d97706" stroke-width="2"/>`);
    chunks.push(`<text x="${x(0) + 5}" y="${plot.top + 12}" fill="#a45b08" font-size="9" font-family="monospace">zero error</text>`);
  }
  const labelStep = Math.max(1, Math.ceil(bins.length / 7));
  bins.forEach((bin, index) => {
    if (index % labelStep && index !== bins.length - 1) return;
    chunks.push(`<text x="${plot.left + index * barStep}" y="370" text-anchor="middle" fill="#565b65" font-size="9" font-family="monospace">${bin.from.toFixed(2)}</text>`);
  });
  chunks.push(`<text x="${width - plot.right}" y="370" text-anchor="end" fill="#565b65" font-size="9" font-family="monospace">${maximum.toFixed(2)} ${html(result.unit)}</text>`);
  chunks.push(`<text x="34" y="406" fill="#a45b08" font-size="11" font-family="sans-serif">한 날짜의 분포는 장기 모델 성능 순위가 아닙니다. 결측은 0으로 넣지 않았습니다.</text>`);
  chunks.push(`<text x="34" y="428" fill="#5d626c" font-size="10" font-family="monospace">quantile: linear interpolation at (n−1)×p · last histogram edge inclusive</text>`);
  sourceLines.forEach((line, index) => chunks.push(`<text x="34" y="${454 + index * 18}" fill="#087f5b" font-size="10" font-family="monospace">source: ${html(line)}</text>`));
  chunks.push(`<text x="34" y="${466 + sourceLines.length * 18}" fill="#6b7079" font-size="10" font-family="monospace">source generated: ${html(result.generated)} · license: ${html(result.license)}</text>`);
  chunks.push('</svg>');
  return chunks.join('');
}

async function buildDistributionManifest(result) {
  const csvName = distributionFilename(result, 'csv');
  const svgName = distributionFilename(result, 'svg');
  const csvContent = csvText(result.headers, result.rows);
  const svgContent = `${distributionSvgMarkup(result)}\n`;
  const [csvHash, svgHash] = await Promise.all([sha256(csvContent), sha256(svgContent)]);
  return {
    schema: 'earthus.error-distribution-manifest.v1',
    manifestVersion: 1,
    createdAt: new Date().toISOString(),
    product: 'earthus Research Error Distribution 무료 미리보기',
    salesStatus: '유료 판매 잠금; 현재 공개 사례 범위만 사용',
    selection: {
      date: result.date,
      model: result.model,
      leadHour: result.lead,
      variable: result.variable,
      unit: result.unit,
      binCount: result.binCount,
    },
    statistics: result.stats,
    histogram: {
      method: 'equal-width bins from actual minimum to maximum; last upper edge inclusive',
      minimum: result.histogram.minimum,
      maximum: result.histogram.maximum,
      width: result.histogram.width,
      bins: result.histogram.bins,
    },
    files: [
      {
        role: 'error-samples', name: csvName, mediaType: 'text/csv; charset=utf-8',
        encoding: 'UTF-8 with BOM', lineEnding: 'LF', rows: result.rows.length,
        bytes: new TextEncoder().encode(csvContent).byteLength, sha256: csvHash,
        fields: result.headers.map(name => ({
          name,
          unit: EXTRACT_FIELD_META[name]?.[0] || TRACE_FIELD_META[name]?.[0] || '-',
          description: EXTRACT_FIELD_META[name]?.[1] || TRACE_FIELD_META[name]?.[1] || name,
        })),
      },
      {
        role: 'error-histogram', name: svgName, mediaType: 'image/svg+xml; charset=utf-8',
        encoding: 'UTF-8', lineEnding: 'LF',
        bytes: new TextEncoder().encode(svgContent).byteLength, sha256: svgHash,
      },
    ],
    provenance: { source: result.source, license: result.license, sourceGeneratedAt: result.generated },
    methodology: {
      difference: 'forecast_minus_observation = forecast - observation; CSV stores three decimal places',
      statistics: 'n, ME, MAE, RMSE and quantiles are calculated from the CSV error values',
      quantile: 'linear interpolation at position (n - 1) x probability',
      missing: '관측 또는 예보 결측은 빈칸과 n=0이며 분포 계산에서 제외; 0으로 대체하지 않음',
      warning: '한 날짜 분포는 장기 모델 성능 순위가 아님',
    },
    licensePage: 'https://earthus.net/legal/data-license.ko.md',
  };
}

function buildDistributionReadme(result, manifest) {
  const dataFile = manifest.files.find(file => file.role === 'error-samples');
  const figureFile = manifest.files.find(file => file.role === 'error-histogram');
  const stat = value => finite(value) ? Number(value).toFixed(3) : 'NA';
  return `# earthus Error Distribution

## 선택과 표본

- 날짜: ${result.date}
- 모델: ${modelName(result.model)} (\`${result.model}\`)
- 선행시간: ${result.lead}시간
- 변수: ${result.variable} (${result.unit})
- 유효 n: ${result.stats.n}/${result.stats.totalRows}
- 결측 관측/예보: ${result.stats.missingObservation}/${result.stats.missingForecast}
- ME/중앙값/MAE/RMSE: ${stat(result.stats.me)} / ${stat(result.stats.median)} / ${stat(result.stats.mae)} / ${stat(result.stats.rmse)}
- p10/p90: ${stat(result.stats.p10)} / ${stat(result.stats.p90)}

## 파일

| 역할 | 파일 | 행/바이트 | SHA-256 |
|---|---|---:|---|
| 개별 오차 CSV | \`${dataFile.name}\` | ${dataFile.rows}행 / ${dataFile.bytes}바이트 | \`${dataFile.sha256}\` |
| 히스토그램 SVG | \`${figureFile.name}\` | ${figureFile.bytes}바이트 | \`${figureFile.sha256}\` |

## 방법과 한계

- 오차는 \`forecast - observation\`이며 CSV의 소수 셋째 자리 값을 통계에 사용합니다.
- 분위수는 \`(n−1)×p\` 위치에서 선형 보간합니다.
- 실제 최솟값–최댓값을 ${result.binCount}개 등간격으로 나누고 마지막 상한만 포함합니다.
- 결측은 빈칸과 n=0이며 통계에서 제외합니다. 0으로 채우지 않습니다.
- 한 날짜의 분포는 장기 모델 성능 순위가 아닙니다.
- 출처: ${result.source}
- 이용조건: ${result.license}
- 원본 생성시각: ${result.generated}

## 검증

같은 폴더에서 \`python3 ${distributionFilename(result, 'verify.py')}\`를 실행하세요.
Python 표준 라이브러리만 사용하며 CSV와 SVG의 SHA-256, CSV 열 순서와 행 수를 검사합니다.

이 묶음은 공식 DOI가 아닙니다. 원자료 제공기관 출처와 이용조건을 함께 표기하세요.
`;
}

function buildDistributionPython(result, manifest) {
  const expected = JSON.stringify(manifest.files.map(file => ({
    name: file.name,
    sha256: file.sha256,
    rows: file.rows,
    headers: file.fields?.map(field => field.name),
  })));
  return `#!/usr/bin/env python3
import csv
import hashlib
import json
from pathlib import Path

EXPECTED = json.loads(r'''${expected}''')
ROOT = Path(__file__).resolve().parent

for spec in EXPECTED:
    path = ROOT / spec["name"]
    if not path.is_file():
        raise SystemExit(f"MISSING: {path.name}")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != spec["sha256"]:
        raise SystemExit(f"SHA256 MISMATCH: {path.name} expected={spec['sha256']} actual={digest}")
    if spec.get("headers"):
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if reader.fieldnames != spec["headers"]:
                raise SystemExit(f"HEADER MISMATCH: {path.name}")
            rows = sum(1 for _ in reader)
        if rows != spec["rows"]:
            raise SystemExit(f"ROW COUNT MISMATCH: {path.name} expected={spec['rows']} actual={rows}")
        print(f"OK {path.name}: rows={rows} sha256={digest}")
    else:
        print(f"OK {path.name}: sha256={digest}")

print("VERIFIED: Error Distribution CSV and SVG match this snapshot.")
`;
}

async function buildDistributionBundle(result) {
  const manifest = await buildDistributionManifest(result);
  const baseName = distributionFilename(result, 'csv').replace(/\.csv$/, '');
  const files = [
    { name: distributionFilename(result, 'csv'), content: csvText(result.headers, result.rows) },
    { name: distributionFilename(result, 'svg'), content: `${distributionSvgMarkup(result)}\n` },
    { name: `${baseName}.manifest.json`, content: JSON.stringify(manifest, null, 2) + '\n' },
    { name: `${baseName}.README.md`, content: buildDistributionReadme(result, manifest) },
    { name: `${baseName}.verify.py`, content: buildDistributionPython(result, manifest) },
  ];
  return {
    filename: `${baseName}.reproducible.zip`,
    files,
    bytes: zipArchive(files, new Date(manifest.createdAt)),
    manifest,
  };
}

function refillDistributionControls(day) {
  const previous = {
    model: $('#distributionModel').value,
    lead: $('#distributionLead').value,
    variable: $('#distributionVariable').value,
  };
  $('#distributionModel').innerHTML = (day.models || []).map(model => `<option value="${html(model)}">${html(modelName(model))}</option>`).join('');
  $('#distributionLead').innerHTML = (day.leadsHours || []).map(lead => `<option value="${html(lead)}">${html(lead)}시간</option>`).join('');
  $('#distributionVariable').innerHTML = (day.vars || []).map(variable => `<option value="${html(variable)}">${html(variableInfo(variable).name)} (${html(variableInfo(variable).unit)})</option>`).join('');
  setSelectValue('#distributionModel', previous.model);
  setSelectValue('#distributionLead', previous.lead);
  setSelectValue('#distributionVariable', previous.variable);
}

function renderDistribution() {
  const day = state.distributionDay;
  if (!day) return;
  const result = buildDistributionResult(
    day,
    $('#distributionModel').value,
    $('#distributionLead').value,
    $('#distributionVariable').value,
    Number($('#distributionBins').value),
  );
  const markup = distributionSvgMarkup(result);
  state.distributionResult = result;
  $('.distribution-canvas').innerHTML = markup || '<p class="figure-empty">선택 조건에 유효한 관측·예보 쌍이 없습니다.</p>';
  $('#downloadDistributionCsv').disabled = !result.rows.length;
  $('#downloadDistributionSvg').disabled = !markup;
  $('#downloadDistributionBundle').disabled = !result.rows.length || !markup;
  $('#distributionWarning').textContent = `${result.date} · ${modelName(result.model)} ${result.lead}시간 · ${variableInfo(result.variable).name} · 유효 n=${result.stats.n}/${result.stats.totalRows} · ${result.binCount}구간`;
}

async function loadDistributionDay() {
  const date = $('#distributionDate').value;
  $('#downloadDistributionCsv').disabled = true;
  $('#downloadDistributionSvg').disabled = true;
  $('#downloadDistributionBundle').disabled = true;
  $('#distributionWarning').textContent = `${date || '날짜 없음'} 실제 공개 사례를 불러오는 중입니다.`;
  try {
    const day = state.extractCache.cases[date] || await json(state.caseIndex.dates[date].path);
    state.extractCache.cases[date] = day;
    state.distributionDay = day;
    refillDistributionControls(day);
    renderDistribution();
  } catch (error) {
    state.distributionDay = null;
    $('.distribution-canvas').innerHTML = `<p class="figure-empty">사례 파일을 읽지 못했습니다. (${html(error.message)})</p>`;
    $('#distributionWarning').textContent = '실제 사례를 읽지 못해 분포를 만들지 않았습니다.';
  }
}

function initDistribution() {
  const dates = Object.keys(state.caseIndex?.dates || {}).sort();
  $('#distributionDate').innerHTML = dates.map(date => `<option value="${html(date)}">${html(date)}</option>`).join('');
  if (dates.length) $('#distributionDate').value = dates.at(-1);
  $('#distributionDate').addEventListener('change', loadDistributionDay);
  ['#distributionModel', '#distributionLead', '#distributionVariable', '#distributionBins']
    .forEach(selector => $(selector).addEventListener('change', renderDistribution));
  $('#downloadDistributionCsv').addEventListener('click', () => {
    const result = state.distributionResult;
    if (!result?.rows.length) return;
    download(distributionFilename(result, 'csv'), result.headers, result.rows);
  });
  $('#downloadDistributionSvg').addEventListener('click', () => {
    const result = state.distributionResult;
    if (!result || !distributionSvgMarkup(result)) return;
    downloadText(distributionFilename(result, 'svg'), `${distributionSvgMarkup(result)}\n`, 'image/svg+xml;charset=utf-8');
  });
  $('#downloadDistributionBundle').addEventListener('click', async event => {
    const result = state.distributionResult;
    if (!result?.rows.length || !distributionSvgMarkup(result)) return;
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = '분포 묶음 만드는 중…';
    try {
      const bundle = await buildDistributionBundle(result);
      downloadBlob(bundle.filename, [bundle.bytes], 'application/zip');
    } catch (error) {
      $('#error').hidden = false;
      $('#error').textContent = `분포 재현 묶음을 만들지 못했습니다. (${error.message})`;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
  if (dates.length) loadDistributionDay();
}

function buildSpatialResult(day, time, model, lead, variable) {
  const hour = day.hours?.[time] || { cases: [] };
  const leadKey = `${lead}h`;
  const rows = (hour.cases || []).map(item => {
    const stationId = String(item.stationId);
    const meta = day.stationMeta?.[stationId] || {};
    const observation = item.observation?.[variable];
    const forecast = item.forecasts?.[model]?.[leadKey]?.[variable];
    const paired = finite(observation) && finite(forecast);
    return [
      time, stationId, meta.name, meta.lat, meta.lon, meta.alt, model, Number(lead),
      variable, variableInfo(variable).unit, observation, forecast,
      paired ? rounded(Number(forecast) - Number(observation)) : null, paired ? 1 : 0,
      hour.issues?.[leadKey] ? formatIssue(hour.issues[leadKey]) : '',
      day.source, day.license, day.generated,
    ];
  }).sort((left, right) => Number(left[1]) - Number(right[1]));
  const errors = rows.map(row => row[12]).filter(finite).map(Number);
  const n = errors.length;
  const coordinates = rows.filter(row => finite(row[3]) && finite(row[4]));
  const latitudes = coordinates.map(row => Number(row[3]));
  const longitudes = coordinates.map(row => Number(row[4]));
  const mean = n ? errors.reduce((sum, value) => sum + value, 0) / n : null;
  return {
    date: day.date,
    time,
    model,
    lead: Number(lead),
    variable,
    unit: variableInfo(variable).unit,
    headers: DISTRIBUTION_HEADERS,
    rows,
    stats: {
      totalRows: rows.length,
      n,
      missingObservation: rows.filter(row => !finite(row[10])).length,
      missingForecast: rows.filter(row => !finite(row[11])).length,
      me: mean,
      mae: n ? errors.reduce((sum, value) => sum + Math.abs(value), 0) / n : null,
      rmse: n ? Math.sqrt(errors.reduce((sum, value) => sum + value ** 2, 0) / n) : null,
      maximumAbsoluteError: n ? Math.max(...errors.map(Math.abs)) : null,
    },
    extent: coordinates.length ? {
      minLat: Math.min(...latitudes), maxLat: Math.max(...latitudes),
      minLon: Math.min(...longitudes), maxLon: Math.max(...longitudes),
    } : null,
    source: day.source,
    license: day.license,
    generated: day.generated,
  };
}

function spatialErrorColor(value, maximumAbsoluteError) {
  if (!finite(value)) return '#ffffff';
  const ratio = maximumAbsoluteError ? Math.min(1, Math.abs(Number(value)) / maximumAbsoluteError) : 0;
  const start = [225, 228, 232];
  const end = Number(value) < 0 ? [35, 93, 178] : Number(value) > 0 ? [196, 53, 53] : [122, 128, 136];
  const rgb = start.map((channel, index) => Math.round(channel + (end[index] - channel) * ratio));
  return `rgb(${rgb.join(',')})`;
}

function spatialFilename(result, extension) {
  const compact = value => String(value || 'none').replace(/[^0-9a-z_-]+/gi, '-');
  const time = String(result.time || '').split('T')[1] || result.time;
  return `earthus-spatial-error-${compact(result.date)}-${compact(time)}-${compact(result.model)}-${compact(result.lead)}h-${compact(result.variable)}.${extension}`;
}

function spatialSvgMarkup(result) {
  if (!result.extent || !result.rows.length) return '';
  const width = 900;
  const sourceLines = svgLines(result.source, 112);
  const height = 622 + sourceLines.length * 18;
  const plot = { left: 72, right: 190, top: 112, bottom: 506 };
  const lonPadding = Math.max(.25, (result.extent.maxLon - result.extent.minLon) * .05);
  const latPadding = Math.max(.25, (result.extent.maxLat - result.extent.minLat) * .05);
  const minLon = result.extent.minLon - lonPadding;
  const maxLon = result.extent.maxLon + lonPadding;
  const minLat = result.extent.minLat - latPadding;
  const maxLat = result.extent.maxLat + latPadding;
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = plot.bottom - plot.top;
  const x = lon => plot.left + (lon - minLon) / (maxLon - minLon) * plotWidth;
  const y = lat => plot.bottom - (lat - minLat) / (maxLat - minLat) * plotHeight;
  const maximumAbsoluteError = result.stats.maximumAbsoluteError || 0;
  const stat = value => finite(value) ? Number(value).toFixed(3) : 'NA';
  const validRows = result.rows.filter(row => finite(row[12]) && finite(row[3]) && finite(row[4]));
  const labelRows = [...validRows].sort((left, right) => Math.abs(Number(right[12])) - Math.abs(Number(left[12]))).slice(0, 5);
  const longitudeTicks = [];
  for (let value = Math.ceil(minLon); value <= Math.floor(maxLon); value += 1) longitudeTicks.push(value);
  const latitudeTicks = [];
  for (let value = Math.ceil(minLat); value <= Math.floor(maxLat); value += 1) latitudeTicks.push(value);
  const chunks = [
    `<svg id="spatialSvg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="spatialTitle spatialDesc" xmlns="http://www.w3.org/2000/svg">`,
    `<title id="spatialTitle">${html(result.time)} ${html(modelName(result.model))} ${html(result.lead)}시간 ${html(variableInfo(result.variable).name)} 지점 오차</title>`,
    `<desc id="spatialDesc">ASOS 위경도 좌표에 forecast minus observation을 표시한 산점도. 행정경계 지도가 아님.</desc>`,
    '<defs><linearGradient id="spatialLegend" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#235db2"/><stop offset="0.5" stop-color="#e1e4e8"/><stop offset="1" stop-color="#c43535"/></linearGradient></defs>',
    `<rect width="${width}" height="${height}" fill="#f7f7f4"/>`,
    `<text x="34" y="38" fill="#15171c" font-size="23" font-family="sans-serif" font-weight="700">${html(modelName(result.model))} ${html(result.lead)}h · ${html(variableInfo(result.variable).name)} 공간 오차</text>`,
    `<text x="34" y="63" fill="#5d626c" font-size="11" font-family="monospace">${html(result.time)} · forecast − observation (${html(result.unit)}) · ASOS longitude/latitude scatter</text>`,
    `<text x="34" y="88" fill="#30343b" font-size="11" font-family="monospace">n ${result.stats.n}/${result.stats.totalRows} · missing obs ${result.stats.missingObservation} · missing forecast ${result.stats.missingForecast} · ME ${stat(result.stats.me)} · MAE ${stat(result.stats.mae)} · RMSE ${stat(result.stats.rmse)}</text>`,
  ];
  longitudeTicks.forEach(value => {
    chunks.push(`<line x1="${x(value)}" y1="${plot.top}" x2="${x(value)}" y2="${plot.bottom}" stroke="#d6d8dc"/>`);
    chunks.push(`<text x="${x(value)}" y="${plot.bottom + 18}" text-anchor="middle" fill="#60656e" font-size="9" font-family="monospace">${value}°E</text>`);
  });
  latitudeTicks.forEach(value => {
    chunks.push(`<line x1="${plot.left}" y1="${y(value)}" x2="${width - plot.right}" y2="${y(value)}" stroke="#d6d8dc"/>`);
    chunks.push(`<text x="${plot.left - 9}" y="${y(value) + 3}" text-anchor="end" fill="#60656e" font-size="9" font-family="monospace">${value}°N</text>`);
  });
  chunks.push(`<rect x="${plot.left}" y="${plot.top}" width="${plotWidth}" height="${plotHeight}" fill="none" stroke="#aeb2b8"/>`);
  result.rows.filter(row => finite(row[3]) && finite(row[4])).forEach(row => {
    const error = row[12];
    const ratio = finite(error) && maximumAbsoluteError ? Math.abs(Number(error)) / maximumAbsoluteError : 0;
    const radius = finite(error) ? 3.5 + ratio * 4.5 : 3.5;
    const fill = spatialErrorColor(error, maximumAbsoluteError);
    const stroke = finite(error) ? '#ffffff' : '#858b94';
    const dash = finite(error) ? '' : ' stroke-dasharray="2 2"';
    chunks.push(`<circle data-station="${html(row[1])}" cx="${x(Number(row[4])).toFixed(2)}" cy="${y(Number(row[3])).toFixed(2)}" r="${radius.toFixed(2)}" fill="${fill}" stroke="${stroke}" stroke-width="1"${dash}><title>${html(row[2] || row[1])} (${html(row[1])}) · ${finite(error) ? `${Number(error).toFixed(3)} ${result.unit}` : 'missing'} · observation ${finite(row[10]) ? row[10] : 'missing'} · forecast ${finite(row[11]) ? row[11] : 'missing'} · n=${row[13]}</title></circle>`);
  });
  labelRows.forEach(row => {
    chunks.push(`<text x="${(x(Number(row[4])) + 7).toFixed(2)}" y="${(y(Number(row[3])) - 7).toFixed(2)}" fill="#202329" stroke="#f7f7f4" stroke-width="3" paint-order="stroke" font-size="9" font-family="monospace">${html(row[2] || row[1])} ${Number(row[12]).toFixed(2)}</text>`);
  });
  const legendX = width - 126;
  chunks.push(`<text x="${legendX - 22}" y="146" fill="#30343b" font-size="10" font-family="monospace">error (${html(result.unit)})</text>`);
  chunks.push(`<rect x="${legendX}" y="166" width="18" height="220" fill="url(#spatialLegend)" stroke="#aeb2b8"/>`);
  chunks.push(`<text x="${legendX + 26}" y="174" fill="#8f2d2d" font-size="9" font-family="monospace">+${maximumAbsoluteError.toFixed(2)}</text>`);
  chunks.push(`<text x="${legendX + 26}" y="280" fill="#60656e" font-size="9" font-family="monospace">0</text>`);
  chunks.push(`<text x="${legendX + 26}" y="388" fill="#234f92" font-size="9" font-family="monospace">−${maximumAbsoluteError.toFixed(2)}</text>`);
  chunks.push(`<circle cx="${legendX + 8}" cy="420" r="4" fill="#fff" stroke="#858b94" stroke-dasharray="2 2"/><text x="${legendX + 20}" y="423" fill="#60656e" font-size="9" font-family="monospace">missing</text>`);
  chunks.push(`<text x="34" y="548" fill="#a45b08" font-size="11" font-family="sans-serif">행정경계 지도가 아닌 ASOS 좌표 산점도입니다. 지점·격자 공간 대표성이 다릅니다.</text>`);
  chunks.push(`<text x="34" y="569" fill="#5d626c" font-size="10" font-family="monospace">point size = |error|; labels = five largest |error|; missing is hollow</text>`);
  sourceLines.forEach((line, index) => chunks.push(`<text x="34" y="${594 + index * 18}" fill="#087f5b" font-size="10" font-family="monospace">source: ${html(line)}</text>`));
  chunks.push(`<text x="34" y="${606 + sourceLines.length * 18}" fill="#6b7079" font-size="10" font-family="monospace">source generated: ${html(result.generated)} · license: ${html(result.license)}</text>`);
  chunks.push('</svg>');
  return chunks.join('');
}

async function buildSpatialManifest(result) {
  const csvName = spatialFilename(result, 'csv');
  const svgName = spatialFilename(result, 'svg');
  const csvContent = csvText(result.headers, result.rows);
  const svgContent = `${spatialSvgMarkup(result)}\n`;
  const [csvHash, svgHash] = await Promise.all([sha256(csvContent), sha256(svgContent)]);
  return {
    schema: 'earthus.spatial-error-manifest.v1',
    manifestVersion: 1,
    createdAt: new Date().toISOString(),
    product: 'earthus Research Spatial Error Plot 무료 미리보기',
    salesStatus: '유료 판매 잠금; 현재 공개 사례 범위만 사용',
    selection: {
      date: result.date,
      validTime: result.time,
      model: result.model,
      leadHour: result.lead,
      variable: result.variable,
      unit: result.unit,
    },
    statistics: result.stats,
    spatialExtent: result.extent,
    files: [
      {
        role: 'spatial-error-data', name: csvName, mediaType: 'text/csv; charset=utf-8',
        encoding: 'UTF-8 with BOM', lineEnding: 'LF', rows: result.rows.length,
        bytes: new TextEncoder().encode(csvContent).byteLength, sha256: csvHash,
        fields: result.headers.map(name => ({
          name,
          unit: EXTRACT_FIELD_META[name]?.[0] || TRACE_FIELD_META[name]?.[0] || '-',
          description: EXTRACT_FIELD_META[name]?.[1] || TRACE_FIELD_META[name]?.[1] || name,
        })),
      },
      {
        role: 'spatial-error-figure', name: svgName, mediaType: 'image/svg+xml; charset=utf-8',
        encoding: 'UTF-8', lineEnding: 'LF',
        bytes: new TextEncoder().encode(svgContent).byteLength, sha256: svgHash,
      },
    ],
    provenance: { source: result.source, license: result.license, sourceGeneratedAt: result.generated },
    methodology: {
      rowShape: 'one ASOS station at the selected valid time per row',
      difference: 'forecast_minus_observation = forecast - observation; CSV stores three decimal places',
      statistics: 'n, ME, MAE, RMSE and maximumAbsoluteError are calculated from the CSV error values',
      coordinates: 'station latitude and longitude from the public case metadata; no administrative boundaries',
      visualEncoding: 'color shows signed error; point size shows absolute error; five largest absolute errors are labelled',
      missing: '관측 또는 예보 결측은 빈칸·n=0·속이 빈 점이며 0으로 대체하지 않음',
      warning: 'ASOS 지점 관측과 모델 격자의 공간 대표성이 다름',
    },
    licensePage: 'https://earthus.net/legal/data-license.ko.md',
  };
}

function buildSpatialReadme(result, manifest) {
  const dataFile = manifest.files.find(file => file.role === 'spatial-error-data');
  const figureFile = manifest.files.find(file => file.role === 'spatial-error-figure');
  const stat = value => finite(value) ? Number(value).toFixed(3) : 'NA';
  return `# earthus Spatial Error Plot

## 선택과 표본

- 날짜: ${result.date}
- 유효시각: ${result.time}
- 모델: ${modelName(result.model)} (\`${result.model}\`)
- 선행시간: ${result.lead}시간
- 변수: ${result.variable} (${result.unit})
- 유효 n: ${result.stats.n}/${result.stats.totalRows}
- 결측 관측/예보: ${result.stats.missingObservation}/${result.stats.missingForecast}
- ME/MAE/RMSE/최대 절대오차: ${stat(result.stats.me)} / ${stat(result.stats.mae)} / ${stat(result.stats.rmse)} / ${stat(result.stats.maximumAbsoluteError)}

## 파일

| 역할 | 파일 | 행/바이트 | SHA-256 |
|---|---|---:|---|
| 지점별 오차 CSV | \`${dataFile.name}\` | ${dataFile.rows}행 / ${dataFile.bytes}바이트 | \`${dataFile.sha256}\` |
| 위·경도 산점도 SVG | \`${figureFile.name}\` | ${figureFile.bytes}바이트 | \`${figureFile.sha256}\` |

## 방법과 한계

- CSV 한 행은 선택한 유효시각의 ASOS 지점 하나입니다.
- 오차는 \`forecast - observation\`이며 CSV의 소수 셋째 자리 값을 통계에 사용합니다.
- SVG 색은 오차 부호, 점 크기는 절댓값이며 절댓값 상위 5개 지점만 라벨을 붙입니다.
- 결측은 빈칸·n=0·속이 빈 점으로 남기며 0으로 채우지 않습니다.
- 그림은 지점 위·경도 산점도이며 행정경계 지도가 아닙니다.
- ASOS 지점 관측과 모델 격자의 공간 대표성은 서로 다릅니다.
- 출처: ${result.source}
- 이용조건: ${result.license}
- 원본 생성시각: ${result.generated}

## 검증

같은 폴더에서 \`python3 ${spatialFilename(result, 'verify.py')}\`를 실행하세요.
Python 표준 라이브러리만 사용하며 파일 SHA-256·SVG XML·CSV 열/행·선택 조건·
결측 n·예보−관측 차이·요약 통계를 검사합니다.

이 묶음은 공식 DOI가 아닙니다. 원자료 제공기관 출처와 이용조건을 함께 표기하세요.
`;
}

function buildSpatialPython(result, manifest) {
  const expectedFiles = JSON.stringify(manifest.files.map(file => ({
    role: file.role,
    name: file.name,
    sha256: file.sha256,
    rows: file.rows,
    headers: file.fields?.map(field => field.name),
  })));
  const expectedSnapshot = JSON.stringify({
    selection: manifest.selection,
    statistics: manifest.statistics,
    spatialExtent: manifest.spatialExtent,
  });
  return `#!/usr/bin/env python3
import csv
import hashlib
import json
import math
from pathlib import Path
from xml.etree import ElementTree

EXPECTED_FILES = json.loads(r'''${expectedFiles}''')
EXPECTED = json.loads(r'''${expectedSnapshot}''')
ROOT = Path(__file__).resolve().parent

for spec in EXPECTED_FILES:
    path = ROOT / spec["name"]
    if not path.is_file():
        raise SystemExit(f"MISSING: {path.name}")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != spec["sha256"]:
        raise SystemExit(f"SHA256 MISMATCH: {path.name} expected={spec['sha256']} actual={digest}")
    if spec["role"] == "spatial-error-figure":
        try:
            ElementTree.parse(path)
        except ElementTree.ParseError as error:
            raise SystemExit(f"SVG XML INVALID: {path.name}: {error}")
    print(f"OK {path.name}: sha256={digest}")

csv_spec = next(spec for spec in EXPECTED_FILES if spec["role"] == "spatial-error-data")
csv_path = ROOT / csv_spec["name"]
with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
    reader = csv.DictReader(handle)
    if reader.fieldnames != csv_spec["headers"]:
        raise SystemExit(f"HEADER MISMATCH: {csv_path.name}")
    rows = list(reader)
if len(rows) != csv_spec["rows"]:
    raise SystemExit(f"ROW COUNT MISMATCH: {csv_path.name} expected={csv_spec['rows']} actual={len(rows)}")

selection = EXPECTED["selection"]
errors = []
missing_observation = 0
missing_forecast = 0
latitudes = []
longitudes = []

def number(value):
    return None if value == "" else float(value)

for row_number, row in enumerate(rows, start=2):
    if row["valid_kst"] != selection["validTime"]:
        raise SystemExit(f"VALID TIME MISMATCH: row {row_number}")
    if row["model"] != selection["model"] or float(row["lead_hour"]) != float(selection["leadHour"]):
        raise SystemExit(f"MODEL OR LEAD MISMATCH: row {row_number}")
    if row["variable"] != selection["variable"] or row["unit"] != selection["unit"]:
        raise SystemExit(f"VARIABLE OR UNIT MISMATCH: row {row_number}")
    observation = number(row["observation"])
    forecast = number(row["forecast"])
    stored_error = number(row["forecast_minus_observation"])
    n = int(row["n"])
    if observation is None:
        missing_observation += 1
    if forecast is None:
        missing_forecast += 1
    if observation is not None and forecast is not None:
        if n != 1 or stored_error is None:
            raise SystemExit(f"PAIRED N/ERROR MISMATCH: row {row_number}")
        if abs(stored_error - (forecast - observation)) > 0.000501:
            raise SystemExit(f"ERROR VALUE MISMATCH: row {row_number}")
        errors.append(stored_error)
    elif n != 0 or stored_error is not None:
        raise SystemExit(f"MISSING VALUE SEMANTICS MISMATCH: row {row_number}")
    latitude = number(row["lat"])
    longitude = number(row["lon"])
    if latitude is not None and longitude is not None:
        latitudes.append(latitude)
        longitudes.append(longitude)

actual_stats = {
    "totalRows": len(rows),
    "n": len(errors),
    "missingObservation": missing_observation,
    "missingForecast": missing_forecast,
    "me": sum(errors) / len(errors) if errors else None,
    "mae": sum(abs(value) for value in errors) / len(errors) if errors else None,
    "rmse": math.sqrt(sum(value * value for value in errors) / len(errors)) if errors else None,
    "maximumAbsoluteError": max((abs(value) for value in errors), default=None),
}

def assert_same(label, actual, expected):
    if actual is None or expected is None:
        if actual is not expected:
            raise SystemExit(f"{label} MISMATCH: expected={expected} actual={actual}")
    elif not math.isclose(float(actual), float(expected), rel_tol=1e-12, abs_tol=1e-12):
        raise SystemExit(f"{label} MISMATCH: expected={expected} actual={actual}")

for key, expected in EXPECTED["statistics"].items():
    assert_same(f"STAT {key}", actual_stats[key], expected)

actual_extent = {
    "minLat": min(latitudes), "maxLat": max(latitudes),
    "minLon": min(longitudes), "maxLon": max(longitudes),
} if latitudes else None
if actual_extent is None or EXPECTED["spatialExtent"] is None:
    if actual_extent is not EXPECTED["spatialExtent"]:
        raise SystemExit("SPATIAL EXTENT MISMATCH")
else:
    for key, expected in EXPECTED["spatialExtent"].items():
        assert_same(f"EXTENT {key}", actual_extent[key], expected)

print(f"OK {csv_path.name}: rows={len(rows)} n={len(errors)}")
print("VERIFIED: Spatial Error CSV and SVG match this snapshot and recomputed statistics.")
`;
}

async function buildSpatialBundle(result) {
  const manifest = await buildSpatialManifest(result);
  const baseName = spatialFilename(result, 'csv').replace(/\.csv$/, '');
  const files = [
    { name: spatialFilename(result, 'csv'), content: csvText(result.headers, result.rows) },
    { name: spatialFilename(result, 'svg'), content: `${spatialSvgMarkup(result)}\n` },
    { name: `${baseName}.manifest.json`, content: JSON.stringify(manifest, null, 2) + '\n' },
    { name: `${baseName}.README.md`, content: buildSpatialReadme(result, manifest) },
    { name: `${baseName}.verify.py`, content: buildSpatialPython(result, manifest) },
  ];
  return {
    filename: `${baseName}.reproducible.zip`,
    files,
    bytes: zipArchive(files, new Date(manifest.createdAt)),
    manifest,
  };
}

function refillSpatialControls(day) {
  const previous = {
    time: $('#spatialTime').value,
    model: $('#spatialModel').value,
    lead: $('#spatialLead').value,
    variable: $('#spatialVariable').value,
  };
  const times = Object.keys(day.hours || {}).sort();
  $('#spatialTime').innerHTML = times.map(time => `<option value="${html(time)}">${html(time.split('T')[1] || time)} KST</option>`).join('');
  $('#spatialModel').innerHTML = (day.models || []).map(model => `<option value="${html(model)}">${html(modelName(model))}</option>`).join('');
  $('#spatialLead').innerHTML = (day.leadsHours || []).map(lead => `<option value="${html(lead)}">${html(lead)}시간</option>`).join('');
  $('#spatialVariable').innerHTML = (day.vars || []).map(variable => `<option value="${html(variable)}">${html(variableInfo(variable).name)} (${html(variableInfo(variable).unit)})</option>`).join('');
  setSelectValue('#spatialTime', previous.time);
  setSelectValue('#spatialModel', previous.model);
  setSelectValue('#spatialLead', previous.lead);
  setSelectValue('#spatialVariable', previous.variable);
}

function renderSpatial() {
  const day = state.spatialDay;
  if (!day) return;
  const result = buildSpatialResult(
    day,
    $('#spatialTime').value,
    $('#spatialModel').value,
    $('#spatialLead').value,
    $('#spatialVariable').value,
  );
  const markup = spatialSvgMarkup(result);
  state.spatialResult = result;
  $('.spatial-canvas').innerHTML = markup || '<p class="figure-empty">선택 조건에 좌표와 유효 오차가 없습니다.</p>';
  $('#downloadSpatialCsv').disabled = !result.rows.length;
  $('#downloadSpatialSvg').disabled = !markup;
  $('#downloadSpatialBundle').disabled = !result.rows.length || !markup;
  $('#spatialWarning').textContent = `${result.time} · ${modelName(result.model)} ${result.lead}시간 · ${variableInfo(result.variable).name} · 유효 n=${result.stats.n}/${result.stats.totalRows}`;
}

async function loadSpatialDay() {
  const date = $('#spatialDate').value;
  $('#downloadSpatialCsv').disabled = true;
  $('#downloadSpatialSvg').disabled = true;
  $('#downloadSpatialBundle').disabled = true;
  $('#spatialWarning').textContent = `${date || '날짜 없음'} 실제 공개 사례를 불러오는 중입니다.`;
  try {
    const day = state.extractCache.cases[date] || await json(state.caseIndex.dates[date].path);
    state.extractCache.cases[date] = day;
    state.spatialDay = day;
    refillSpatialControls(day);
    renderSpatial();
  } catch (error) {
    state.spatialDay = null;
    $('.spatial-canvas').innerHTML = `<p class="figure-empty">사례 파일을 읽지 못했습니다. (${html(error.message)})</p>`;
    $('#spatialWarning').textContent = '실제 사례를 읽지 못해 공간 오차를 만들지 않았습니다.';
  }
}

function initSpatial() {
  const dates = Object.keys(state.caseIndex?.dates || {}).sort();
  $('#spatialDate').innerHTML = dates.map(date => `<option value="${html(date)}">${html(date)}</option>`).join('');
  if (dates.length) $('#spatialDate').value = dates.at(-1);
  $('#spatialDate').addEventListener('change', loadSpatialDay);
  ['#spatialTime', '#spatialModel', '#spatialLead', '#spatialVariable']
    .forEach(selector => $(selector).addEventListener('change', renderSpatial));
  $('#downloadSpatialCsv').addEventListener('click', () => {
    const result = state.spatialResult;
    if (!result?.rows.length) return;
    download(spatialFilename(result, 'csv'), result.headers, result.rows);
  });
  $('#downloadSpatialSvg').addEventListener('click', () => {
    const result = state.spatialResult;
    if (!result || !spatialSvgMarkup(result)) return;
    downloadText(spatialFilename(result, 'svg'), `${spatialSvgMarkup(result)}\n`, 'image/svg+xml;charset=utf-8');
  });
  $('#downloadSpatialBundle').addEventListener('click', async event => {
    const result = state.spatialResult;
    if (!result?.rows.length || !spatialSvgMarkup(result)) return;
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = '공간 묶음 만드는 중…';
    try {
      const bundle = await buildSpatialBundle(result);
      downloadBlob(bundle.filename, [bundle.bytes], 'application/zip');
    } catch (error) {
      $('#error').hidden = false;
      $('#error').textContent = `공간 재현 묶음을 만들지 못했습니다. (${error.message})`;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
  if (dates.length) loadSpatialDay();
}

const PAIRED_HEADERS = [
  'valid_kst', 'station_id', 'station_name', 'lat', 'lon', 'alt_m',
  'model_a', 'model_b', 'lead_hour', 'variable', 'unit', 'observation',
  'forecast_a', 'forecast_b', 'error_a', 'error_b', 'absolute_error_a',
  'absolute_error_b', 'absolute_error_a_minus_b', 'lower_absolute_error_model',
  'n', 'issued_kst', 'source', 'license', 'generated',
];

function buildPairedResult(day, modelA, modelB, lead, variable) {
  const leadKey = `${lead}h`;
  const rows = [];
  Object.entries(day.hours || {}).sort(([left], [right]) => left.localeCompare(right, 'en'))
    .forEach(([valid, hour]) => {
      [...(hour.cases || [])].sort((left, right) => Number(left.stationId) - Number(right.stationId))
        .forEach(item => {
          const stationId = String(item.stationId);
          const meta = day.stationMeta?.[stationId] || {};
          const observation = item.observation?.[variable];
          const forecastA = item.forecasts?.[modelA]?.[leadKey]?.[variable];
          const forecastB = item.forecasts?.[modelB]?.[leadKey]?.[variable];
          const validA = finite(observation) && finite(forecastA);
          const validB = finite(observation) && finite(forecastB);
          const paired = modelA !== modelB && validA && validB;
          const errorA = validA ? rounded(Number(forecastA) - Number(observation)) : null;
          const errorB = validB ? rounded(Number(forecastB) - Number(observation)) : null;
          const absoluteA = validA ? Math.abs(errorA) : null;
          const absoluteB = validB ? Math.abs(errorB) : null;
          const difference = paired ? rounded(absoluteA - absoluteB) : null;
          const lower = !paired ? '' : absoluteA < absoluteB ? modelA : absoluteB < absoluteA ? modelB : 'tie';
          rows.push([
            valid, stationId, meta.name, meta.lat, meta.lon, meta.alt,
            modelA, modelB, Number(lead), variable, variableInfo(variable).unit, observation,
            forecastA, forecastB, errorA, errorB, absoluteA, absoluteB, difference, lower,
            paired ? 1 : 0, hour.issues?.[leadKey] ? formatIssue(hour.issues[leadKey]) : '',
            day.source, day.license, day.generated,
          ]);
        });
    });
  const pairedRows = rows.filter(row => row[20] === 1);
  const errorsA = pairedRows.map(row => Number(row[14]));
  const errorsB = pairedRows.map(row => Number(row[15]));
  const absoluteA = pairedRows.map(row => Number(row[16]));
  const absoluteB = pairedRows.map(row => Number(row[17]));
  const differences = pairedRows.map(row => Number(row[18])).sort((left, right) => left - right);
  const n = pairedRows.length;
  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    date: day.date,
    modelA,
    modelB,
    lead: Number(lead),
    variable,
    unit: variableInfo(variable).unit,
    headers: PAIRED_HEADERS,
    rows,
    actualTimes: Object.keys(day.hours || {}).sort(),
    stats: {
      totalRows: rows.length,
      n,
      missingObservation: rows.filter(row => !finite(row[11])).length,
      missingModelA: rows.filter(row => !finite(row[12])).length,
      missingModelB: rows.filter(row => !finite(row[13])).length,
      modelALower: pairedRows.filter(row => row[19] === modelA).length,
      modelBLower: pairedRows.filter(row => row[19] === modelB).length,
      ties: pairedRows.filter(row => row[19] === 'tie').length,
      meA: average(errorsA),
      meB: average(errorsB),
      maeA: average(absoluteA),
      maeB: average(absoluteB),
      rmseA: n ? Math.sqrt(errorsA.reduce((sum, value) => sum + value ** 2, 0) / n) : null,
      rmseB: n ? Math.sqrt(errorsB.reduce((sum, value) => sum + value ** 2, 0) / n) : null,
      meanAbsoluteErrorDifference: average(differences),
      medianAbsoluteErrorDifference: linearQuantile(differences, .5),
    },
    source: day.source,
    license: day.license,
    generated: day.generated,
  };
}

function pairedFilename(result, extension) {
  const compact = value => String(value || 'none').replace(/[^0-9a-z_-]+/gi, '-');
  return `earthus-paired-model-${compact(result.date)}-${compact(result.modelA)}-vs-${compact(result.modelB)}-${compact(result.lead)}h-${compact(result.variable)}.${extension}`;
}

function pairedSvgMarkup(result) {
  const pairedRows = result.rows.filter(row => row[20] === 1);
  if (result.modelA === result.modelB || !pairedRows.length) return '';
  const width = 900;
  const sourceLines = svgLines(result.source, 112);
  const height = 700 + sourceLines.length * 18;
  const plot = { left: 72, top: 122, size: 420 };
  const right = plot.left + plot.size;
  const bottom = plot.top + plot.size;
  const observedMaximum = Math.max(...pairedRows.flatMap(row => [Number(row[16]), Number(row[17])]));
  const maximum = observedMaximum > 0 ? observedMaximum * 1.05 : 1;
  const x = value => plot.left + Number(value) / maximum * plot.size;
  const y = value => bottom - Number(value) / maximum * plot.size;
  const stat = value => finite(value) ? Number(value).toFixed(3) : 'NA';
  const color = row => row[19] === result.modelA ? '#3b8f79' : row[19] === result.modelB ? '#7059c7' : '#7a8089';
  const chunks = [
    `<svg id="pairedSvg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="pairedTitle pairedDesc" xmlns="http://www.w3.org/2000/svg">`,
    `<title id="pairedTitle">${html(result.date)} ${html(modelName(result.modelA))}와 ${html(modelName(result.modelB))}의 같은 표본 절대오차 비교</title>`,
    `<desc id="pairedDesc">같은 지점, 같은 유효시각, 같은 관측값을 가진 표본의 두 모델 절대오차 산점도. 대각선 위는 모델 A 절대오차가 더 작고 아래는 모델 B가 더 작음.</desc>`,
    `<rect width="${width}" height="${height}" fill="#f7f7f4"/>`,
    `<text x="34" y="38" fill="#15171c" font-size="23" font-family="sans-serif" font-weight="700">${html(modelName(result.modelA))} vs ${html(modelName(result.modelB))} · ${html(result.lead)}h · ${html(variableInfo(result.variable).name)}</text>`,
    `<text x="34" y="63" fill="#5d626c" font-size="11" font-family="monospace">${html(result.date)} · same station/time/observation · absolute forecast error (${html(result.unit)})</text>`,
    `<text x="34" y="88" fill="#30343b" font-size="11" font-family="monospace">paired n ${result.stats.n}/${result.stats.totalRows} · actual times ${result.actualTimes.length} · missing obs ${result.stats.missingObservation} · A ${result.stats.missingModelA} · B ${result.stats.missingModelB}</text>`,
  ];
  for (let tick = 0; tick <= 4; tick += 1) {
    const value = maximum * tick / 4;
    const px = x(value);
    const py = y(value);
    chunks.push(`<line x1="${px}" y1="${plot.top}" x2="${px}" y2="${bottom}" stroke="#d6d8dc"/>`);
    chunks.push(`<line x1="${plot.left}" y1="${py}" x2="${right}" y2="${py}" stroke="#d6d8dc"/>`);
    chunks.push(`<text x="${px}" y="${bottom + 18}" text-anchor="middle" fill="#60656e" font-size="9" font-family="monospace">${value.toFixed(2)}</text>`);
    chunks.push(`<text x="${plot.left - 9}" y="${py + 3}" text-anchor="end" fill="#60656e" font-size="9" font-family="monospace">${value.toFixed(2)}</text>`);
  }
  chunks.push(`<rect x="${plot.left}" y="${plot.top}" width="${plot.size}" height="${plot.size}" fill="none" stroke="#aeb2b8"/>`);
  chunks.push(`<line x1="${plot.left}" y1="${bottom}" x2="${right}" y2="${plot.top}" stroke="#42474f" stroke-width="1.5" stroke-dasharray="5 4"/>`);
  pairedRows.forEach(row => {
    chunks.push(`<circle data-paired-point="${html(`${row[0]}-${row[1]}`)}" cx="${x(row[16]).toFixed(2)}" cy="${y(row[17]).toFixed(2)}" r="3.2" fill="${color(row)}" fill-opacity=".62" stroke="#fff" stroke-width=".6"><title>${html(row[2] || row[1])} (${html(row[1])}) · ${html(row[0])} · ${html(modelName(result.modelA))} |error| ${Number(row[16]).toFixed(3)} · ${html(modelName(result.modelB))} |error| ${Number(row[17]).toFixed(3)} · lower ${html(row[19] === 'tie' ? 'tie' : modelName(row[19]))} · n=${row[20]}</title></circle>`);
  });
  chunks.push(`<text x="${(plot.left + right) / 2}" y="${bottom + 43}" text-anchor="middle" fill="#30343b" font-size="11" font-family="monospace">${html(modelName(result.modelA))} absolute error (${html(result.unit)})</text>`);
  chunks.push(`<text x="20" y="${(plot.top + bottom) / 2}" text-anchor="middle" fill="#30343b" font-size="11" font-family="monospace" transform="rotate(-90 20 ${(plot.top + bottom) / 2})">${html(modelName(result.modelB))} absolute error (${html(result.unit)})</text>`);
  const sideX = 544;
  chunks.push(`<text x="${sideX}" y="145" fill="#30343b" font-size="12" font-family="sans-serif" font-weight="700">같은 표본 요약</text>`);
  chunks.push(`<circle cx="${sideX + 5}" cy="174" r="5" fill="#3b8f79"/><text x="${sideX + 18}" y="178" fill="#30343b" font-size="10" font-family="monospace">A lower |error| ${result.stats.modelALower}</text>`);
  chunks.push(`<circle cx="${sideX + 5}" cy="199" r="5" fill="#7059c7"/><text x="${sideX + 18}" y="203" fill="#30343b" font-size="10" font-family="monospace">B lower |error| ${result.stats.modelBLower}</text>`);
  chunks.push(`<circle cx="${sideX + 5}" cy="224" r="5" fill="#7a8089"/><text x="${sideX + 18}" y="228" fill="#30343b" font-size="10" font-family="monospace">tie ${result.stats.ties}</text>`);
  chunks.push(`<text x="${sideX}" y="270" fill="#3b8f79" font-size="11" font-family="monospace">A MAE ${stat(result.stats.maeA)} · RMSE ${stat(result.stats.rmseA)}</text>`);
  chunks.push(`<text x="${sideX}" y="294" fill="#7059c7" font-size="11" font-family="monospace">B MAE ${stat(result.stats.maeB)} · RMSE ${stat(result.stats.rmseB)}</text>`);
  chunks.push(`<text x="${sideX}" y="326" fill="#30343b" font-size="10" font-family="monospace">mean |error| A−B ${stat(result.stats.meanAbsoluteErrorDifference)}</text>`);
  chunks.push(`<text x="${sideX}" y="348" fill="#30343b" font-size="10" font-family="monospace">median |error| A−B ${stat(result.stats.medianAbsoluteErrorDifference)}</text>`);
  chunks.push(`<text x="${sideX}" y="396" fill="#3b8f79" font-size="10" font-family="monospace">above diagonal: A lower</text>`);
  chunks.push(`<text x="${sideX}" y="418" fill="#7059c7" font-size="10" font-family="monospace">below diagonal: B lower</text>`);
  chunks.push(`<text x="34" y="620" fill="#a45b08" font-size="11" font-family="sans-serif">같은 관측 표본만 대조했습니다. 한 날짜의 결과는 장기 모델 성능 순위가 아닙니다.</text>`);
  chunks.push(`<text x="34" y="642" fill="#5d626c" font-size="10" font-family="monospace">A=${html(result.modelA)} · B=${html(result.modelB)} · missing one side excluded from paired n</text>`);
  sourceLines.forEach((line, index) => chunks.push(`<text x="34" y="${670 + index * 18}" fill="#087f5b" font-size="10" font-family="monospace">source: ${html(line)}</text>`));
  chunks.push(`<text x="34" y="${682 + sourceLines.length * 18}" fill="#6b7079" font-size="10" font-family="monospace">source generated: ${html(result.generated)} · license: ${html(result.license)}</text>`);
  chunks.push('</svg>');
  return chunks.join('');
}

const PAIRED_FIELD_META = {
  model_a: ['-', '비교 모델 A 식별자'],
  model_b: ['-', '비교 모델 B 식별자'],
  forecast_a: ['variable unit', '모델 A 예보값'],
  forecast_b: ['variable unit', '모델 B 예보값'],
  error_a: ['variable unit', '모델 A forecast minus observation; 소수 셋째 자리'],
  error_b: ['variable unit', '모델 B forecast minus observation; 소수 셋째 자리'],
  absolute_error_a: ['variable unit', '모델 A 오차 절댓값'],
  absolute_error_b: ['variable unit', '모델 B 오차 절댓값'],
  absolute_error_a_minus_b: ['variable unit', '모델 A 절대오차 minus 모델 B 절대오차'],
  lower_absolute_error_model: ['-', '절대오차가 더 작은 모델 식별자 또는 tie; unpaired는 빈칸'],
  n: ['count', '관측과 두 모델 예보가 모두 유효하면 1, 아니면 0'],
};

async function buildPairedManifest(result) {
  const csvName = pairedFilename(result, 'csv');
  const svgName = pairedFilename(result, 'svg');
  const csvContent = csvText(result.headers, result.rows);
  const svgContent = `${pairedSvgMarkup(result)}\n`;
  const [csvHash, svgHash] = await Promise.all([sha256(csvContent), sha256(svgContent)]);
  return {
    schema: 'earthus.paired-model-comparison-manifest.v1',
    manifestVersion: 1,
    createdAt: new Date().toISOString(),
    product: 'earthus Research Paired Model Comparison 무료 미리보기',
    salesStatus: '유료 판매 잠금; 현재 공개 사례 범위만 사용',
    selection: {
      date: result.date,
      modelA: result.modelA,
      modelB: result.modelB,
      leadHour: result.lead,
      variable: result.variable,
      unit: result.unit,
      actualTimes: result.actualTimes,
      actualTimeCount: result.actualTimes.length,
    },
    statistics: result.stats,
    files: [
      {
        role: 'paired-error-data', name: csvName, mediaType: 'text/csv; charset=utf-8',
        encoding: 'UTF-8 with BOM', lineEnding: 'LF', rows: result.rows.length,
        bytes: new TextEncoder().encode(csvContent).byteLength, sha256: csvHash,
        fields: result.headers.map(name => ({
          name,
          unit: PAIRED_FIELD_META[name]?.[0] || EXTRACT_FIELD_META[name]?.[0] || TRACE_FIELD_META[name]?.[0] || '-',
          description: PAIRED_FIELD_META[name]?.[1] || EXTRACT_FIELD_META[name]?.[1] || TRACE_FIELD_META[name]?.[1] || name,
        })),
      },
      {
        role: 'paired-error-figure', name: svgName, mediaType: 'image/svg+xml; charset=utf-8',
        encoding: 'UTF-8', lineEnding: 'LF',
        bytes: new TextEncoder().encode(svgContent).byteLength, sha256: svgHash,
      },
    ],
    provenance: { source: result.source, license: result.license, sourceGeneratedAt: result.generated },
    methodology: {
      pairing: 'same valid time x station x observation; n=1 only when observation and both model forecasts are numeric',
      difference: 'error = forecast - observation; errors and absolute_error_a_minus_b store three-decimal values',
      statistics: 'all paired statistics are calculated only from n=1 CSV rows',
      lowerAbsoluteError: 'model id with smaller stored absolute error; exact equality is tie',
      missing: '한쪽이라도 결측이면 n=0이고 paired 통계·산점도에서 제외; 0으로 대체하지 않음',
      axes: 'x is model A absolute error; y is model B absolute error on the same scale',
      warning: '한 날짜의 paired 결과는 장기 모델 성능 순위가 아님',
    },
    licensePage: 'https://earthus.net/legal/data-license.ko.md',
  };
}

function buildPairedReadme(result, manifest) {
  const dataFile = manifest.files.find(file => file.role === 'paired-error-data');
  const figureFile = manifest.files.find(file => file.role === 'paired-error-figure');
  const stat = value => finite(value) ? Number(value).toFixed(3) : 'NA';
  return `# earthus Paired Model Comparison

## 선택과 같은 표본

- 날짜: ${result.date}
- 모델 A: ${modelName(result.modelA)} (\`${result.modelA}\`)
- 모델 B: ${modelName(result.modelB)} (\`${result.modelB}\`)
- 선행시간: ${result.lead}시간
- 변수: ${result.variable} (${result.unit})
- 실제 공개 시각: ${result.actualTimes.length}개
- paired n: ${result.stats.n}/${result.stats.totalRows}
- 결측 관측/A/B: ${result.stats.missingObservation}/${result.stats.missingModelA}/${result.stats.missingModelB}
- A/B/tie가 더 작은 절대오차: ${result.stats.modelALower}/${result.stats.modelBLower}/${result.stats.ties}
- A MAE/RMSE: ${stat(result.stats.maeA)} / ${stat(result.stats.rmseA)}
- B MAE/RMSE: ${stat(result.stats.maeB)} / ${stat(result.stats.rmseB)}
- 평균/중앙 \`|error| A−B\`: ${stat(result.stats.meanAbsoluteErrorDifference)} / ${stat(result.stats.medianAbsoluteErrorDifference)}

## 파일

| 역할 | 파일 | 행/바이트 | SHA-256 |
|---|---|---:|---|
| paired CSV | \`${dataFile.name}\` | ${dataFile.rows}행 / ${dataFile.bytes}바이트 | \`${dataFile.sha256}\` |
| 같은 축 산점도 SVG | \`${figureFile.name}\` | ${figureFile.bytes}바이트 | \`${figureFile.sha256}\` |

## 방법과 한계

- CSV 한 행은 같은 유효시각 × 같은 ASOS 지점 × 같은 관측값입니다.
- 관측과 두 모델 예보가 모두 숫자일 때만 n=1이며 paired 통계에 들어갑니다.
- 오차는 \`forecast - observation\`, 비교값은 \`|error A| - |error B|\`입니다.
- 한쪽 결측은 빈칸과 n=0으로 남기며 0으로 채우지 않습니다.
- 산점도 x축은 모델 A, y축은 모델 B 절대오차이며 두 축 범위는 같습니다.
- 한 날짜의 결과는 장기 모델 성능 순위가 아닙니다.
- 출처: ${result.source}
- 이용조건: ${result.license}
- 원본 생성시각: ${result.generated}

## 검증

같은 폴더에서 \`python3 ${pairedFilename(result, 'verify.py')}\`를 실행하세요.
Python 표준 라이브러리만 사용하며 파일 해시·SVG XML·CSV 열/행·선택 조건·오차·
절대오차·paired n·A/B/tie 표본 수·모든 요약 통계를 원행에서 다시 계산합니다.

이 묶음은 공식 DOI가 아닙니다. 원자료 제공기관 출처와 이용조건을 함께 표기하세요.
`;
}

function buildPairedPython(result, manifest) {
  const expectedFiles = JSON.stringify(manifest.files.map(file => ({
    role: file.role,
    name: file.name,
    sha256: file.sha256,
    rows: file.rows,
    headers: file.fields?.map(field => field.name),
  })));
  const expectedSnapshot = JSON.stringify({ selection: manifest.selection, statistics: manifest.statistics });
  return `#!/usr/bin/env python3
import csv
import hashlib
import json
import math
from pathlib import Path
from xml.etree import ElementTree

EXPECTED_FILES = json.loads(r'''${expectedFiles}''')
EXPECTED = json.loads(r'''${expectedSnapshot}''')
ROOT = Path(__file__).resolve().parent

for spec in EXPECTED_FILES:
    path = ROOT / spec["name"]
    if not path.is_file():
        raise SystemExit(f"MISSING: {path.name}")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != spec["sha256"]:
        raise SystemExit(f"SHA256 MISMATCH: {path.name} expected={spec['sha256']} actual={digest}")
    if spec["role"] == "paired-error-figure":
        try:
            ElementTree.parse(path)
        except ElementTree.ParseError as error:
            raise SystemExit(f"SVG XML INVALID: {path.name}: {error}")
    print(f"OK {path.name}: sha256={digest}")

csv_spec = next(spec for spec in EXPECTED_FILES if spec["role"] == "paired-error-data")
csv_path = ROOT / csv_spec["name"]
with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
    reader = csv.DictReader(handle)
    if reader.fieldnames != csv_spec["headers"]:
        raise SystemExit(f"HEADER MISMATCH: {csv_path.name}")
    rows = list(reader)
if len(rows) != csv_spec["rows"]:
    raise SystemExit(f"ROW COUNT MISMATCH: {csv_path.name} expected={csv_spec['rows']} actual={len(rows)}")

selection = EXPECTED["selection"]
errors_a = []
errors_b = []
absolute_a = []
absolute_b = []
differences = []
missing_observation = 0
missing_a = 0
missing_b = 0
lower_a = 0
lower_b = 0
ties = 0
actual_times = set()

def number(value):
    return None if value == "" else float(value)

for row_number, row in enumerate(rows, start=2):
    actual_times.add(row["valid_kst"])
    if row["model_a"] != selection["modelA"] or row["model_b"] != selection["modelB"]:
        raise SystemExit(f"MODEL MISMATCH: row {row_number}")
    if float(row["lead_hour"]) != float(selection["leadHour"]):
        raise SystemExit(f"LEAD MISMATCH: row {row_number}")
    if row["variable"] != selection["variable"] or row["unit"] != selection["unit"]:
        raise SystemExit(f"VARIABLE OR UNIT MISMATCH: row {row_number}")
    observation = number(row["observation"])
    forecast_a = number(row["forecast_a"])
    forecast_b = number(row["forecast_b"])
    error_a = number(row["error_a"])
    error_b = number(row["error_b"])
    abs_a = number(row["absolute_error_a"])
    abs_b = number(row["absolute_error_b"])
    difference = number(row["absolute_error_a_minus_b"])
    n = int(row["n"])
    if observation is None:
        missing_observation += 1
    if forecast_a is None:
        missing_a += 1
    if forecast_b is None:
        missing_b += 1
    valid_a = observation is not None and forecast_a is not None
    valid_b = observation is not None and forecast_b is not None
    if valid_a:
        if error_a is None or abs_a is None or abs(error_a - (forecast_a - observation)) > 0.000501:
            raise SystemExit(f"MODEL A ERROR MISMATCH: row {row_number}")
        if not math.isclose(abs_a, abs(error_a), rel_tol=0, abs_tol=1e-12):
            raise SystemExit(f"MODEL A ABSOLUTE ERROR MISMATCH: row {row_number}")
    elif error_a is not None or abs_a is not None:
        raise SystemExit(f"MODEL A MISSING SEMANTICS MISMATCH: row {row_number}")
    if valid_b:
        if error_b is None or abs_b is None or abs(error_b - (forecast_b - observation)) > 0.000501:
            raise SystemExit(f"MODEL B ERROR MISMATCH: row {row_number}")
        if not math.isclose(abs_b, abs(error_b), rel_tol=0, abs_tol=1e-12):
            raise SystemExit(f"MODEL B ABSOLUTE ERROR MISMATCH: row {row_number}")
    elif error_b is not None or abs_b is not None:
        raise SystemExit(f"MODEL B MISSING SEMANTICS MISMATCH: row {row_number}")
    paired = selection["modelA"] != selection["modelB"] and valid_a and valid_b
    if paired:
        if n != 1 or difference is None or abs(difference - (abs_a - abs_b)) > 0.000501:
            raise SystemExit(f"PAIRED DIFFERENCE MISMATCH: row {row_number}")
        expected_lower = selection["modelA"] if abs_a < abs_b else selection["modelB"] if abs_b < abs_a else "tie"
        if row["lower_absolute_error_model"] != expected_lower:
            raise SystemExit(f"LOWER ABSOLUTE ERROR MODEL MISMATCH: row {row_number}")
        errors_a.append(error_a)
        errors_b.append(error_b)
        absolute_a.append(abs_a)
        absolute_b.append(abs_b)
        differences.append(difference)
        if expected_lower == selection["modelA"]:
            lower_a += 1
        elif expected_lower == selection["modelB"]:
            lower_b += 1
        else:
            ties += 1
    elif n != 0 or difference is not None or row["lower_absolute_error_model"] != "":
        raise SystemExit(f"UNPAIRED SEMANTICS MISMATCH: row {row_number}")

if sorted(actual_times) != selection["actualTimes"]:
    raise SystemExit("ACTUAL TIMES MISMATCH")

def average(values):
    return sum(values) / len(values) if values else None

ordered_differences = sorted(differences)
middle = len(ordered_differences) // 2
median_difference = None if not ordered_differences else ordered_differences[middle] if len(ordered_differences) % 2 else (ordered_differences[middle - 1] + ordered_differences[middle]) / 2
actual_stats = {
    "totalRows": len(rows),
    "n": len(errors_a),
    "missingObservation": missing_observation,
    "missingModelA": missing_a,
    "missingModelB": missing_b,
    "modelALower": lower_a,
    "modelBLower": lower_b,
    "ties": ties,
    "meA": average(errors_a),
    "meB": average(errors_b),
    "maeA": average(absolute_a),
    "maeB": average(absolute_b),
    "rmseA": math.sqrt(average([value * value for value in errors_a])) if errors_a else None,
    "rmseB": math.sqrt(average([value * value for value in errors_b])) if errors_b else None,
    "meanAbsoluteErrorDifference": average(differences),
    "medianAbsoluteErrorDifference": median_difference,
}

def assert_same(label, actual, expected):
    if actual is None or expected is None:
        if actual is not expected:
            raise SystemExit(f"{label} MISMATCH: expected={expected} actual={actual}")
    elif not math.isclose(float(actual), float(expected), rel_tol=1e-12, abs_tol=1e-12):
        raise SystemExit(f"{label} MISMATCH: expected={expected} actual={actual}")

for key, expected in EXPECTED["statistics"].items():
    assert_same(f"STAT {key}", actual_stats[key], expected)

print(f"OK {csv_path.name}: rows={len(rows)} paired_n={len(errors_a)}")
print("VERIFIED: Paired Model Comparison CSV and SVG match this snapshot and recomputed statistics.")
`;
}

async function buildPairedBundle(result) {
  const manifest = await buildPairedManifest(result);
  const baseName = pairedFilename(result, 'csv').replace(/\.csv$/, '');
  const files = [
    { name: pairedFilename(result, 'csv'), content: csvText(result.headers, result.rows) },
    { name: pairedFilename(result, 'svg'), content: `${pairedSvgMarkup(result)}\n` },
    { name: `${baseName}.manifest.json`, content: JSON.stringify(manifest, null, 2) + '\n' },
    { name: `${baseName}.README.md`, content: buildPairedReadme(result, manifest) },
    { name: `${baseName}.verify.py`, content: buildPairedPython(result, manifest) },
  ];
  return {
    filename: `${baseName}.reproducible.zip`,
    files,
    bytes: zipArchive(files, new Date(manifest.createdAt)),
    manifest,
  };
}

function refillPairedControls(day) {
  const previous = {
    modelA: $('#pairedModelA').value,
    modelB: $('#pairedModelB').value,
    lead: $('#pairedLead').value,
    variable: $('#pairedVariable').value,
  };
  const modelOptions = (day.models || []).map(model => `<option value="${html(model)}">${html(modelName(model))}</option>`).join('');
  $('#pairedModelA').innerHTML = modelOptions;
  $('#pairedModelB').innerHTML = modelOptions;
  $('#pairedLead').innerHTML = (day.leadsHours || []).map(lead => `<option value="${html(lead)}">${html(lead)}시간</option>`).join('');
  $('#pairedVariable').innerHTML = (day.vars || []).map(variable => `<option value="${html(variable)}">${html(variableInfo(variable).name)} (${html(variableInfo(variable).unit)})</option>`).join('');
  setSelectValue('#pairedModelA', previous.modelA);
  setSelectValue('#pairedModelB', previous.modelB || day.models?.[1]);
  setSelectValue('#pairedLead', previous.lead);
  setSelectValue('#pairedVariable', previous.variable);
  if ($('#pairedModelA').value === $('#pairedModelB').value && day.models?.length > 1) {
    $('#pairedModelB').value = day.models.find(model => model !== $('#pairedModelA').value);
  }
}

function renderPaired() {
  const day = state.pairedDay;
  if (!day) return;
  const result = buildPairedResult(
    day,
    $('#pairedModelA').value,
    $('#pairedModelB').value,
    $('#pairedLead').value,
    $('#pairedVariable').value,
  );
  const markup = pairedSvgMarkup(result);
  state.pairedResult = result;
  $('.paired-canvas').innerHTML = markup || '<p class="figure-empty">서로 다른 두 모델의 유효한 같은 표본이 없습니다.</p>';
  $('#downloadPairedCsv').disabled = !result.rows.length || result.modelA === result.modelB;
  $('#downloadPairedSvg').disabled = !markup;
  $('#downloadPairedBundle').disabled = !markup;
  $('#pairedWarning').textContent = `${result.date} · ${modelName(result.modelA)} vs ${modelName(result.modelB)} · ${result.lead}시간 · ${variableInfo(result.variable).name} · paired n=${result.stats.n}/${result.stats.totalRows}`;
}

function keepPairedModelsDistinct(changed) {
  const models = state.pairedDay?.models || [];
  const modelA = $('#pairedModelA').value;
  const modelB = $('#pairedModelB').value;
  if (modelA === modelB && models.length > 1) {
    if (changed === 'a') $('#pairedModelB').value = models.find(model => model !== modelA);
    else $('#pairedModelA').value = models.find(model => model !== modelB);
  }
  renderPaired();
}

async function loadPairedDay() {
  const date = $('#pairedDate').value;
  $('#downloadPairedCsv').disabled = true;
  $('#downloadPairedSvg').disabled = true;
  $('#downloadPairedBundle').disabled = true;
  $('#pairedWarning').textContent = `${date || '날짜 없음'} 실제 공개 사례를 불러오는 중입니다.`;
  try {
    const day = state.extractCache.cases[date] || await json(state.caseIndex.dates[date].path);
    state.extractCache.cases[date] = day;
    state.pairedDay = day;
    refillPairedControls(day);
    renderPaired();
  } catch (error) {
    state.pairedDay = null;
    $('.paired-canvas').innerHTML = `<p class="figure-empty">사례 파일을 읽지 못했습니다. (${html(error.message)})</p>`;
    $('#pairedWarning').textContent = '실제 사례를 읽지 못해 모델 대조를 만들지 않았습니다.';
  }
}

function initPaired() {
  const dates = Object.keys(state.caseIndex?.dates || {}).sort();
  $('#pairedDate').innerHTML = dates.map(date => `<option value="${html(date)}">${html(date)}</option>`).join('');
  if (dates.length) $('#pairedDate').value = dates.at(-1);
  $('#pairedDate').addEventListener('change', loadPairedDay);
  $('#pairedModelA').addEventListener('change', () => keepPairedModelsDistinct('a'));
  $('#pairedModelB').addEventListener('change', () => keepPairedModelsDistinct('b'));
  ['#pairedLead', '#pairedVariable'].forEach(selector => $(selector).addEventListener('change', renderPaired));
  $('#downloadPairedCsv').addEventListener('click', () => {
    const result = state.pairedResult;
    if (!result?.rows.length || result.modelA === result.modelB) return;
    download(pairedFilename(result, 'csv'), result.headers, result.rows);
  });
  $('#downloadPairedSvg').addEventListener('click', () => {
    const result = state.pairedResult;
    const markup = result && pairedSvgMarkup(result);
    if (!markup) return;
    downloadText(pairedFilename(result, 'svg'), `${markup}\n`, 'image/svg+xml;charset=utf-8');
  });
  $('#downloadPairedBundle').addEventListener('click', async event => {
    const result = state.pairedResult;
    if (!result?.rows.length || !pairedSvgMarkup(result)) return;
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Paired 묶음 만드는 중…';
    try {
      const bundle = await buildPairedBundle(result);
      downloadBlob(bundle.filename, [bundle.bytes], 'application/zip');
    } catch (error) {
      $('#error').hidden = false;
      $('#error').textContent = `Paired 재현 묶음을 만들지 못했습니다. (${error.message})`;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
  if (dates.length) loadPairedDay();
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
  const canvas = $('#figureBuilder .figure-canvas');
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
    const svg = $('#figureBuilder .figure-canvas svg');
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
    initTrace();
    initDistribution();
    initSpatial();
    initPaired();
    initFigure();
    initWorksheet();
  } catch (error) {
    $('#error').hidden = false;
    $('#error').textContent = `Research Pack 자료를 읽지 못했습니다. (${error.message})`;
  }
}

boot();
