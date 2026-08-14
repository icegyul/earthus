const REVISION = 'aetherus-public-safe-20260815-r2';
const asset = path => `${path}?v=${REVISION}`;
const expect = (condition, message) => { if (!condition) throw new Error(message); };
const loadJson = async path => {
  const response = await fetch(asset(path), { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP_${response.status}_${path}`);
  return response.json();
};
const loadModule = path => import(asset(path));

const tests = [
  { id: 'free-access', title: '무료 접근 정책', asset: '/js/access-mode.js', run: async () => {
    const module = await loadModule('/js/access-mode.js');
    expect(module.decideCapabilityAccess({ mode: 'FREE_OPEN', available: true }).allowed === true,
      'FREE_OPEN_CAPABILITY_LOCKED');
    expect(module.salesAllowed({ mode: 'FREE_OPEN', salesOpen: true }) === false, 'SALES_ENABLED');
    return '준비된 기능 무료 · 판매 OFF';
  } },
  { id: 'culture', title: 'Culture Layer 151–163', asset: '/js/space/culture-reference.js', run: async () => {
    const [module, fixture] = await Promise.all([loadModule('/js/space/culture-reference.js'),
      loadJson('/data/aetherus/culture-fixture.v1.json')]);
    const catalog = module.validateCultureCatalog(fixture);
    expect(catalog.fixtureOnly === true && catalog.items.length === 7, 'CULTURE_FIXTURE_INVALID');
    return '7개 합성 fixture · 권리 gate 유지';
  } },
  { id: 'mission', title: 'Mission Control 115–132', asset: '/js/space/mission-control.js', run: async () => {
    const [module, policy] = await Promise.all([loadModule('/js/space/mission-control.js'),
      loadJson('/data/aetherus/mission-control-policy.v1.json')]);
    const result = module.validateMissionControlPolicy(policy);
    expect(result.productionEnabled === false, 'MISSION_CONTROL_GATE_OPEN');
    return `${module.MISSION_WIDGET_TYPES.length}개 위젯 · 운영 동기화 OFF`;
  } },
  { id: 'media', title: 'Media Rendition', asset: '/js/space/media-rendition-policy.js', run: async () => {
    const [module, policy] = await Promise.all([loadModule('/js/space/media-rendition-policy.js'),
      loadJson('/data/aetherus/media-rendition-policy.v1.json')]);
    const result = module.validateRenditionPolicy(policy);
    expect(result.productionEnabled === false, 'RENDITION_GATE_OPEN');
    return '512/1920/3840 · AVIF→WebP→JPEG · worker OFF';
  } },
  { id: 'launch', title: 'Launch · Payload', asset: '/js/space/launch-payload-contract.js', run: async () => {
    const module = await loadModule('/js/space/launch-payload-contract.js');
    expect(module.LAUNCH_STATES.length === 10 && module.PAYLOAD_STATES.length === 8,
      'LAUNCH_PAYLOAD_STATES_INVALID');
    return '발사 10·탑재체 8개 상태 · live provider OFF';
  } },
  { id: 'satellite', title: 'SatelliteObject 91–101', asset: '/js/space/satellite-object-contract.js', run: async () => {
    const [module, policy] = await Promise.all([loadModule('/js/space/satellite-object-contract.js'),
      loadJson('/data/aetherus/satellite-policy.v1.json')]);
    const result = module.validateSatellitePolicy(policy);
    expect(result.productionEnabled === false, 'SATELLITE_GATE_OPEN');
    return '계산 계약 공개 · TLE/OMM 공급자 OFF';
  } },
  { id: 'api', title: 'API 215–218', asset: '/js/space/api-contract.js', run: async () => {
    const [module, policy] = await Promise.all([loadModule('/js/space/api-contract.js'),
      loadJson('/data/aetherus/api-contract-policy.v1.json')]);
    const result = module.validateApiPolicy(policy);
    expect(result.basePath === '/api/v1' && result.productionEnabled === false, 'API_GATE_INVALID');
    return '/api/v1 계약 · 서버 middleware OFF';
  } },
  { id: 'platform', title: 'Platform Operating', asset: '/js/space/platform-operating-contract.js', run: async () => {
    const [module, policy] = await Promise.all([loadModule('/js/space/platform-operating-contract.js'),
      loadJson('/data/aetherus/platform-operating-policy.v1.json')]);
    const result = module.validatePlatformPolicy(policy);
    expect(result.productionEnabled === false, 'PLATFORM_GATE_OPEN');
    return `${module.REQUIRED_COMPONENTS.length}개 경계 · 운영 연결 OFF`;
  } },
  { id: 'discovery', title: 'Discovery', asset: '/js/space/discovery-contract.js', run: async () => {
    const [module, policy] = await Promise.all([loadModule('/js/space/discovery-contract.js'),
      loadJson('/data/aetherus/discovery-policy.v1.json')]);
    const result = module.validateDiscoveryPolicy(policy);
    expect(result.productionEnabled === false, 'DISCOVERY_GATE_OPEN');
    return '증거 기반 탐색 계약 · 실인덱스 OFF';
  } },
  { id: 'spotlight', title: 'Spotlight 102–114', asset: '/js/space/spotlight-contract.js', run: async () => {
    const [module, policy] = await Promise.all([loadModule('/js/space/spotlight-contract.js'),
      loadJson('/data/aetherus/spotlight-policy.v1.json')]);
    const result = module.validateSpotlightPolicy(policy);
    expect(result.productionEnabled === false && result.hubs.length === 2, 'SPOTLIGHT_GATE_INVALID');
    return '한국·SpaceX fixture · live feed OFF';
  } },
  { id: 'database', title: 'Database 219–232', asset: '/js/space/database-contract.js', run: async () => {
    const [module, policy] = await Promise.all([loadModule('/js/space/database-contract.js'),
      loadJson('/data/aetherus/database-contract.v1.json')]);
    const result = module.validateDatabaseContract(policy);
    expect(result.tables.length === 24 && result.productionEnabled === false, 'DATABASE_GATE_INVALID');
    return '24개 테이블 registry · 운영 migration OFF';
  } },
  { id: 'infra', title: 'Infrastructure 233–245', asset: '/js/space/infrastructure-contract.js', run: async () => {
    const [module, policy] = await Promise.all([loadModule('/js/space/infrastructure-contract.js'),
      loadJson('/data/aetherus/infrastructure-policy.v1.json')]);
    const result = module.validateInfrastructurePolicy(policy);
    expect(result.productionEnabled === false, 'INFRA_GATE_OPEN');
    return 'cache/storage 계획 · cloud mutation 0';
  } },
  { id: 'security', title: 'Rights · Security', asset: '/js/space/security-privacy-contract.js', run: async () => {
    const [module, policy] = await Promise.all([loadModule('/js/space/security-privacy-contract.js'),
      loadJson('/data/aetherus/security-policy.v1.json')]);
    const result = module.validateSecurityPolicy(policy);
    expect(result.productionEnabled === false, 'SECURITY_GATE_OPEN');
    return 'RBAC·격리 계약 · OAuth/scanner OFF';
  } },
  { id: 'release', title: 'Release QA', asset: '/js/space/release-qa-contract.js', run: async () => {
    const [module, policy] = await Promise.all([loadModule('/js/space/release-qa-contract.js'),
      loadJson('/data/aetherus/release-qa-policy.v1.json')]);
    const result = module.validateReleaseQaPolicy(policy);
    const dst = module.compareDstFold('2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z',
      { timeZone: 'America/New_York' });
    expect(result.productionEnabled === false && dst.status === 'AMBIGUOUS_LOCAL_TIME',
      'RELEASE_QA_GATE_INVALID');
    return 'DST fold 보존 · 자동 release/rollback OFF';
  } },
];

const state = { ledger: null, results: new Map(), checkedAtUtc: null };

function renderCards() {
  const grid = document.querySelector('#checkGrid');
  for (const test of tests) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.test = test.id;
    card.dataset.state = 'PENDING';
    card.innerHTML = '<div class="card-head"><h3></h3><span class="badge">PENDING</span></div>'
      + '<p class="detail">검사 대기 중</p><code class="asset"></code>';
    card.querySelector('h3').textContent = test.title;
    card.querySelector('.asset').textContent = test.asset;
    grid.append(card);
  }
}

function updateCard(test, result) {
  const card = document.querySelector(`[data-test="${test.id}"]`);
  card.dataset.state = result.state;
  card.querySelector('.badge').textContent = result.state;
  card.querySelector('.detail').textContent = result.detail;
}

function renderLedger(ledger) {
  expect(ledger.entries.length === 296, 'LEDGER_LENGTH_INVALID');
  expect(!ledger.entries.some(entry => entry.productionStatus === 'NOT_RELEASED'),
    'UNCLASSIFIED_NOT_RELEASED_REMAINS');
  const localEvidence = ledger.entries.filter(entry => entry.productionStatus === 'LOCAL_EVIDENCE_ONLY').length;
  const partial = ledger.entries.filter(entry => entry.productionStatus === 'PARTIAL_RUNTIME').length;
  const blocked = ledger.entries.filter(entry => entry.productionStatus === 'BLOCKED_EXTERNAL').length;
  const implement = ledger.entries.filter(entry => entry.productionStatus === 'IMPLEMENTATION_REQUIRED').length;
  document.querySelector('#deployedCount').textContent = String(localEvidence);
  document.querySelector('#blockedCount').textContent = String(blocked);
  document.querySelector('#implementCount').textContent = String(partial + implement);

  const groups = new Map();
  for (const entry of ledger.entries.filter(item => item.productionStatus === 'BLOCKED_EXTERNAL')) {
    const label = entry.blockers[0] || '외부 운영 증거 필요';
    groups.set(label, (groups.get(label) || 0) + 1);
  }
  const gateGrid = document.querySelector('#gateGrid');
  gateGrid.replaceChildren();
  const blockerLabels = {
    'native visionOS target': 'visionOS 네이티브 앱',
    'Apple developer/App Store authority': 'Apple 개발자·App Store 권한',
    'production telemetry': '운영 관측·성능 지표',
    'external authority or operating evidence required': '외부 승인·운영 증거',
    'provider rights/freshness contract': '공급자 권리·갱신 계약',
    'authenticated server principal': '인증된 운영 서버 계정',
  };
  [...groups.entries()].sort((left, right) => right[1] - left[1]).slice(0, 6)
    .forEach(([label, count]) => {
      const card = document.createElement('article');
      card.className = 'gate';
      card.innerHTML = '<strong>BLOCKED_EXTERNAL</strong><h3></h3><p></p>';
      card.querySelector('h3').textContent = blockerLabels[label] || label;
      card.querySelector('p').textContent = `${count}개 시트 · 실제 증거 없이는 활성화하지 않음`;
      gateGrid.append(card);
    });
}

async function runChecks() {
  const button = document.querySelector('#runChecks');
  button.disabled = true;
  state.results.clear();
  for (const test of tests) updateCard(test, { state: 'RUNNING', detail: '공개 자산을 불러오는 중' });
  await Promise.all(tests.map(async test => {
    const startedAt = performance.now();
    let result;
    try {
      const detail = await test.run();
      result = { id: test.id, state: 'PASS', detail,
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10 };
    } catch (error) {
      result = { id: test.id, state: 'FAIL',
        detail: `${error?.name || 'Error'}: ${error?.message || 'UNKNOWN'}`,
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10 };
    }
    state.results.set(test.id, result);
    updateCard(test, result);
    document.querySelector('#passCount').textContent = String(
      [...state.results.values()].filter(item => item.state === 'PASS').length);
  }));
  state.checkedAtUtc = new Date().toISOString();
  document.querySelector('#checkedAt').textContent = `${state.checkedAtUtc} · browser · ${tests.length} checks`;
  document.querySelector('#downloadReport').disabled = false;
  button.disabled = false;
}

function downloadReport() {
  const report = {
    schema: 'earthus.aetherus-public-safe-report.v1',
    revision: REVISION,
    checkedAtUtc: state.checkedAtUtc,
    publicStaticContractsAvailable: true,
    productCompletionInferred: false,
    externalOperationsEnabled: false,
    ledger: state.ledger ? { counts: state.ledger.counts,
      productionStatuses: Object.fromEntries(['LOCAL_EVIDENCE_ONLY', 'PARTIAL_RUNTIME',
        'BLOCKED_EXTERNAL', 'IMPLEMENTATION_REQUIRED'].map(status => [status,
        state.ledger.entries.filter(entry => entry.productionStatus === status).length])) } : null,
    results: [...state.results.values()],
  };
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  link.download = `aetherus-public-safe-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

renderCards();
document.querySelector('#testCount').textContent = String(tests.length);
document.querySelector('#runChecks').addEventListener('click', runChecks);
document.querySelector('#downloadReport').addEventListener('click', downloadReport);

try {
  state.ledger = await loadJson('/data/aetherus/v3-sheet-ledger.json');
  renderLedger(state.ledger);
  await runChecks();
} catch (error) {
  document.querySelector('#checkedAt').textContent = `FAIL · ${error?.message || 'UNKNOWN'}`;
}
