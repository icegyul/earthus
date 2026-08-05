/* earthus 예보 검증
 *
 * ⚠️ 이 화면은 기관·모델 순위를 만들지 않는다. 저장된 예보와 같은 시각의 관측을
 *    맞춰 계산한 값, 기간, 표본 수, 출처만 보여준다. 표본이 없는 칸은 0이 아니라 빈칸이다.
 */

const DATA_URL = '/wind/series/verify-daily.json';
const MODELS = [
  { id: 'gfs_seamless', name: 'GFS', detail: 'NOAA Global Forecast System', className: 'gfs' },
  { id: 'ecmwf_ifs025', name: 'ECMWF IFS', detail: 'ECMWF Integrated Forecasting System', className: 'ecmwf' },
];
const VARIABLES = {
  temperature_2m: { label: '2m 기온', unit: '°C', digits: 2 },
  wind_speed_10m: { label: '10m 풍속', unit: 'm/s', digits: 2 },
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const SVG_NS = 'http://www.w3.org/2000/svg';

const state = {
  doc: null,
  days: [],
  variable: 'temperature_2m',
  lead: 24,
  day: null,
};

function svg(tag, attrs = {}, text = null) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text != null) node.textContent = text;
  return node;
}

function recordKey(model, variable = state.variable, lead = state.lead) {
  return `${model}|${variable}|${lead}h`;
}

function record(day, model) {
  return state.doc?.days?.[day]?.[recordKey(model)] || null;
}

function formatValue(value, signed = false) {
  if (!Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  const prefix = signed && number > 0 ? '+' : '';
  return `${prefix}${number.toFixed(VARIABLES[state.variable].digits)}`;
}

function formatKst(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '시각 없음';
  return `${new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Seoul',
  }).format(date)} KST`;
}

function shortDay(day) {
  const date = new Date(`${day}T00:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? day : new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric', day: 'numeric', timeZone: 'Asia/Seoul',
  }).format(date);
}

function renderArchiveStrip() {
  const strip = $('#archiveStrip');
  const first = state.days[0];
  const last = state.days[state.days.length - 1];
  const items = [
    `${first || '시작일 없음'} → ${last || '종료일 없음'}`,
    `${state.doc.count ?? state.days.length}일`,
    `ASOS ${state.doc.stationCount ?? '—'}지점`,
    'GFS · ECMWF IFS',
    `생성 ${formatKst(state.doc.generated)}`,
  ];
  strip.innerHTML = '';
  items.forEach(text => {
    const span = document.createElement('span');
    span.textContent = text;
    strip.append(span);
  });
}

function renderDayPicker() {
  const picker = $('#dayPicker');
  picker.innerHTML = '';
  [...state.days].reverse().forEach(day => {
    const option = document.createElement('option');
    option.value = day;
    option.textContent = day;
    picker.append(option);
  });
  picker.value = state.day || '';
}

function chartSeries(model) {
  return state.days.map(day => {
    const value = record(day, model)?.mae;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  });
}

function pathFor(values, x, y) {
  let path = '';
  let open = false;
  values.forEach((value, index) => {
    if (value == null) { open = false; return; }
    path += `${open ? ' L' : ' M'} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`;
    open = true;
  });
  return path.trim();
}

function renderChart() {
  const chart = $('#trendChart');
  chart.innerHTML = '';
  const width = 900, height = 340;
  const pad = { left: 68, right: 28, top: 24, bottom: 54 };
  const series = MODELS.map(model => ({ model, values: chartSeries(model.id) }));
  const values = series.flatMap(item => item.values).filter(value => value != null);
  if (!values.length) {
    chart.append(svg('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', class: 'chart-empty' }, '이 조건의 채점 자료가 없습니다.'));
    return;
  }
  const max = Math.max(...values);
  const yMax = Math.max(.5, Math.ceil(max * 1.2 * 2) / 2);
  const x = index => pad.left + (state.days.length <= 1 ? 0 : index / (state.days.length - 1)) * (width - pad.left - pad.right);
  const y = value => pad.top + (1 - value / yMax) * (height - pad.top - pad.bottom);

  for (let step = 0; step <= 4; step++) {
    const value = yMax * (1 - step / 4);
    const yy = pad.top + step / 4 * (height - pad.top - pad.bottom);
    chart.append(svg('line', { x1: pad.left, y1: yy, x2: width - pad.right, y2: yy, class: 'chart-grid' }));
    chart.append(svg('text', { x: pad.left - 12, y: yy + 6, 'text-anchor': 'end', class: 'chart-axis' }, value.toFixed(1)));
  }

  const tickIndexes = [...new Set([0, Math.floor((state.days.length - 1) / 2), state.days.length - 1])];
  tickIndexes.forEach(index => chart.append(svg('text', {
    x: x(index), y: height - 16, 'text-anchor': index === 0 ? 'start' : index === state.days.length - 1 ? 'end' : 'middle', class: 'chart-axis',
  }, shortDay(state.days[index]))));

  series.forEach(({ model, values: modelValues }) => {
    const d = pathFor(modelValues, x, y);
    if (d) chart.append(svg('path', { d, class: `chart-line ${model.className}` }));
    modelValues.forEach((value, index) => {
      if (value == null) return;
      const point = svg('circle', { cx: x(index), cy: y(value), r: 6, class: `chart-point ${model.className}` });
      point.append(svg('title', {}, `${state.days[index]} · ${model.name} MAE ${formatValue(value)} ${VARIABLES[state.variable].unit}`));
      chart.append(point);
    });
  });
  $('#chartDesc').textContent = `${VARIABLES[state.variable].label} · ${state.lead}시간 전 예보의 MAE (${VARIABLES[state.variable].unit}). 낮을수록 관측값과 가까웠다는 뜻이지만, 현재 기간으로 장기 성능이나 우승자를 뜻하지 않습니다.`;
}

function metricCell(label, value) {
  const box = document.createElement('div');
  const span = document.createElement('span');
  const strong = document.createElement('strong');
  span.textContent = label;
  strong.textContent = value;
  box.append(span, strong);
  return box;
}

function renderCards() {
  $('#selectedDate').textContent = `${state.day || '날짜 없음'} · ${state.lead}시간 전 예보`;
  const grid = $('#modelGrid');
  grid.innerHTML = '';
  let found = false;
  MODELS.forEach(model => {
    const item = record(state.day, model.id);
    if (!item) return;
    found = true;
    const card = document.createElement('article');
    card.className = `model-card ${model.className}`;
    const head = document.createElement('header');
    const h3 = document.createElement('h3');
    const detail = document.createElement('span');
    h3.textContent = model.name;
    detail.textContent = model.detail;
    head.append(h3, detail);
    const primary = document.createElement('div');
    primary.className = 'primary-metric';
    const value = document.createElement('strong');
    const label = document.createElement('span');
    value.textContent = formatValue(item.mae);
    label.textContent = `${VARIABLES[state.variable].unit} MAE`;
    primary.append(value, label);
    const metrics = document.createElement('div');
    metrics.className = 'metric-list';
    metrics.append(
      metricCell('편향 ME', `${formatValue(item.me, true)} ${VARIABLES[state.variable].unit}`),
      metricCell('RMSE', `${formatValue(item.rmse)} ${VARIABLES[state.variable].unit}`),
      metricCell('표본 n', Number.isFinite(Number(item.n)) ? Number(item.n).toLocaleString('ko-KR') : '—'),
    );
    card.append(head, primary, metrics);
    grid.append(card);
  });
  if (!found) {
    const empty = document.createElement('div');
    empty.className = 'missing-card';
    empty.textContent = '이 날짜와 조건에는 채점 가능한 표본이 없습니다. 0으로 바꾸지 않고 빈칸으로 둡니다.';
    grid.append(empty);
  }
}

function tableValue(item, field, signed = false) {
  if (!item || !Number.isFinite(Number(item[field]))) return '—';
  return field === 'n' ? Number(item[field]).toLocaleString('ko-KR') : formatValue(item[field], signed);
}

function renderTable() {
  const body = $('#dailyRows');
  body.innerHTML = '';
  [...state.days].reverse().forEach(day => {
    const gfs = record(day, 'gfs_seamless');
    const ecmwf = record(day, 'ecmwf_ifs025');
    const row = document.createElement('tr');
    row.classList.toggle('selected', day === state.day);
    const dateCell = document.createElement('td');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = day;
    button.addEventListener('click', () => {
      state.day = day;
      $('#dayPicker').value = day;
      renderSelection();
      $('#selectedTitle').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
    dateCell.append(button);
    row.append(dateCell);
    [tableValue(gfs, 'mae'), tableValue(gfs, 'me', true), tableValue(gfs, 'n'),
      tableValue(ecmwf, 'mae'), tableValue(ecmwf, 'me', true), tableValue(ecmwf, 'n')]
      .forEach(text => {
        const cell = document.createElement('td');
        cell.textContent = text;
        if (text === '—') cell.className = 'na';
        row.append(cell);
      });
    body.append(row);
  });
  $('#unitLabel').textContent = `${VARIABLES[state.variable].label} · ${VARIABLES[state.variable].unit} · ${state.lead}시간`;
}

function renderSelection() {
  renderCards();
  renderTable();
}

function renderAll() {
  renderArchiveStrip();
  renderDayPicker();
  renderChart();
  renderSelection();
  $('#sourceLine').textContent = `출처 · ${state.doc.source || '출처 자료 없음'}`;
  $('#generatedLine').textContent = `자료 생성 · ${formatKst(state.doc.generated)} · 결측 관측 제외 · 채점 조합별 n 공개`;
}

function bindControls() {
  $('#variablePicker').addEventListener('click', event => {
    const button = event.target.closest('[data-variable]');
    if (!button) return;
    state.variable = button.dataset.variable;
    $$('#variablePicker button').forEach(item => item.classList.toggle('active', item === button));
    renderChart();
    renderSelection();
  });
  $('#leadPicker').addEventListener('click', event => {
    const button = event.target.closest('[data-lead]');
    if (!button) return;
    state.lead = Number(button.dataset.lead);
    $$('#leadPicker button').forEach(item => item.classList.toggle('active', item === button));
    renderChart();
    renderSelection();
  });
  $('#dayPicker').addEventListener('change', event => {
    state.day = event.target.value;
    renderSelection();
  });
}

async function boot() {
  bindControls();
  try {
    const response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const doc = await response.json();
    if (!doc || typeof doc.days !== 'object') throw new Error('days 자료가 없습니다');
    state.doc = doc;
    state.days = Object.keys(doc.days).sort();
    state.day = state.days[state.days.length - 1] || null;
    if (!state.days.length) throw new Error('아직 채점된 날짜가 없습니다');
    renderAll();
  } catch (error) {
    const banner = $('#errorBanner');
    banner.hidden = false;
    banner.textContent = `예보 검증 자료를 읽지 못했습니다. 자료 없음과 읽기 실패를 구분합니다. (${error.message})`;
    $('#archiveStrip').innerHTML = '<span>자료 읽기 실패</span>';
  }
}

boot();
