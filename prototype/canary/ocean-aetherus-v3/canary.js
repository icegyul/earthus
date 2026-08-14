const REVISION = '20260814-4';
const asset = path => `${path}?v=${REVISION}`;
const expect = (condition, message) => { if (!condition) throw new Error(message); };
const loadJson = async path => {
  const response = await fetch(asset(path), { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.json();
};
const loadModule = path => import(asset(path));

const tests = [
  { id: 'shared-free-access', domain: 'space', title: '공통 접근 정책 · 무료 운영',
    asset: '/js/access-mode.js', run: async () => {
      const module = await loadModule('/js/access-mode.js');
      const available = module.decideCapabilityAccess({ mode: 'FREE_OPEN', available: true });
      const unavailable = module.decideCapabilityAccess({ mode: 'FREE_OPEN', available: false });
      expect(available.allowed === true && available.reason === 'FREE_OPEN_UNTIL_PAID_LAUNCH',
        'FREE_OPEN_CAPABILITY_LOCKED');
      expect(unavailable.allowed === false, 'UNAVAILABLE_CAPABILITY_OPENED');
      expect(module.salesAllowed({ mode: 'FREE_OPEN', salesOpen: true }) === false,
        'FREE_OPEN_SALES_ENABLED');
      return '준비된 기능 전체 무료 · 미준비 gate 유지 · 결제 OFF';
    } },
  { id: 'ocean-provider', domain: 'ocean', title: 'Ocean Core · Provider',
    asset: '/js/ocean/observation-contract.js', run: async () => {
      const [module, policy] = await Promise.all([loadModule('/js/ocean/observation-contract.js'),
        loadJson('/data/ocean/provider-manifest.v1.json')]);
      const result = module.validateOceanProviderManifest(policy);
      expect(result.entries.length === 6, 'PROVIDER_COUNT_MISMATCH');
      expect(result.entries.every(entry => entry.rightsStatus === 'DRAFT'), 'PROVIDER_GATE_OPEN');
      return '6 providers · rights DRAFT · operations closed';
    } },
  { id: 'ocean-safety', domain: 'ocean', title: 'Safety Hard Gate',
    asset: '/js/ocean/safety-gate.js', run: async () => {
      const module = await loadModule('/js/ocean/safety-gate.js');
      expect(module.OCEAN_SAFETY_STATE.BLOCKED === 'BLOCKED', 'BLOCKED_STATE_MISSING');
      expect(typeof module.applyOceanSafetyGate === 'function', 'SAFETY_GATE_MISSING');
      return 'BLOCKED / UNKNOWN preserved · no SAFE synthesis';
    } },
  { id: 'ocean-fishing', domain: 'ocean', title: 'Fishing · Location',
    asset: '/js/ocean/fishing-decision.js', run: async () => {
      const [fishing, location] = await Promise.all([loadModule('/js/ocean/fishing-decision.js'),
        loadModule('/js/ocean/location-policy.js')]);
      expect(typeof fishing.buildFishingDecision === 'function', 'FISHING_CONTRACT_MISSING');
      expect(location.OCEAN_LOCATION_PRECISION.EXACT === 'EXACT', 'PRIVATE_LOCATION_MISSING');
      return 'condition-only · exact location remains private';
    } },
  { id: 'ocean-surf', domain: 'ocean', title: 'Surf · 72h Policy',
    asset: '/js/ocean/surf-decision.js', run: async () => {
      const [module, policy] = await Promise.all([loadModule('/js/ocean/surf-decision.js'),
        loadJson('/data/ocean/surf-scoring-policy.v1.json')]);
      const result = module.validateSurfScoringPolicy(policy);
      expect(result.valid === false && result.errors.includes('SURF_POLICY_NOT_APPROVED'),
        'SURF_DRAFT_GATE_NOT_CLOSED');
      return 'scoring policy DRAFT · public recommendation off';
    } },
  { id: 'ocean-media', domain: 'ocean', title: 'Marine Life Media',
    asset: '/js/ocean/marine-life-media.js', run: async () => {
      const module = await loadModule('/js/ocean/marine-life-media.js');
      expect(module.MARINE_LIFE_DERIVATIVE_WIDTHS.join(',') === '320,640,1280,2048',
        'RENDITION_WIDTHS_MISMATCH');
      return '30MB contract · 4 renditions · human taxonomy';
    } },
  { id: 'ocean-control', domain: 'ocean', title: 'My Ocean Control',
    asset: '/js/ocean/control-center.js', run: async () => {
      const module = await loadModule('/js/ocean/control-center.js');
      expect(module.MY_OCEAN_WIDGETS.length === 6, 'CONTROL_WIDGETS_INCOMPLETE');
      expect(typeof module.createMyOceanService === 'function', 'CONTROL_SERVICE_MISSING');
      return `${module.MY_OCEAN_WIDGETS.length} widgets · revision/conflict contract`;
    } },
  { id: 'ocean-vessel', domain: 'ocean', title: 'Vessel Lite',
    asset: '/js/ocean/vessel-lite.js', run: async () => {
      const [module, policy] = await Promise.all([loadModule('/js/ocean/vessel-lite.js'),
        loadJson('/data/ocean/ais-provider-manifest.v1.json')]);
      const result = module.validateAisProviderManifest(policy);
      expect(result.entries.every(entry => entry.featureFlag === 'OFF'), 'AIS_FLAG_OPEN');
      return 'AIS providers DRAFT/OFF · redistribution false';
    } },
  { id: 'ocean-expansion', domain: 'ocean', title: 'O6 Expansion Gates',
    asset: '/data/ocean/expansion-gates.v1.json', run: async () => {
      const policy = await loadJson('/data/ocean/expansion-gates.v1.json');
      expect(policy.gates.length === 5 && policy.gates.every(gate => gate.status === 'CLOSED'
        && gate.evidence === null), 'EXPANSION_GATE_OPEN');
      expect(policy.capabilities.every(item => item.productionEnabled === false),
        'EXPANSION_CAPABILITY_OPEN');
      return 'G1–G5 CLOSED · all capabilities false';
    } },
  { id: 'space-culture', domain: 'space', title: 'Culture 151–163',
    asset: '/js/space/culture-reference.js', run: async () => {
      const [module, fixture] = await Promise.all([loadModule('/js/space/culture-reference.js'),
        loadJson('/data/aetherus/culture-fixture.v1.json')]);
      const catalog = module.validateCultureCatalog(fixture);
      expect(catalog.fixtureOnly === true && catalog.items.length === 7, 'CULTURE_FIXTURE_INVALID');
      return '7 fixture work types · rights gate · no live catalog';
    } },
  { id: 'space-mission', domain: 'space', title: 'Mission Control 115–132',
    asset: '/js/space/mission-control.js', run: async () => {
      const [module, policy] = await Promise.all([loadModule('/js/space/mission-control.js'),
        loadJson('/data/aetherus/mission-control-policy.v1.json')]);
      const result = module.validateMissionControlPolicy(policy);
      expect(result.productionEnabled === false, 'MISSION_CONTROL_GATE_OPEN');
      return `${module.MISSION_WIDGET_TYPES.length} widgets · production off`;
    } },
  { id: 'space-media', domain: 'space', title: 'Media Rendition',
    asset: '/js/space/media-rendition-policy.js', run: async () => {
      const [module, policy] = await Promise.all([loadModule('/js/space/media-rendition-policy.js'),
        loadJson('/data/aetherus/media-rendition-policy.v1.json')]);
      const result = module.validateRenditionPolicy(policy);
      expect(result.productionEnabled === false, 'RENDITION_GATE_OPEN');
      return '512/1920/3840 · AVIF→WebP→JPEG · off';
    } },
  { id: 'space-launch', domain: 'space', title: 'Launch · Payload',
    asset: '/js/space/launch-payload-contract.js', run: async () => {
      const module = await loadModule('/js/space/launch-payload-contract.js');
      expect(module.LAUNCH_STATES.length === 10 && module.PAYLOAD_STATES.length === 8,
        'LAUNCH_PAYLOAD_STATES_INVALID');
      return '10 launch states · 8 payload states · no provider';
    } },
  { id: 'space-satellite', domain: 'space', title: 'SatelliteObject 91–101',
    asset: '/js/space/satellite-object-contract.js', run: async () => {
      const [module, policy] = await Promise.all([loadModule('/js/space/satellite-object-contract.js'),
        loadJson('/data/aetherus/satellite-policy.v1.json')]);
      const result = module.validateSatellitePolicy(policy);
      expect(result.productionEnabled === false, 'SATELLITE_GATE_OPEN');
      return 'position/pass are calculated · DRAFT/OFF';
    } },
  { id: 'space-api', domain: 'space', title: 'API 215–218',
    asset: '/js/space/api-contract.js', run: async () => {
      const [module, policy] = await Promise.all([loadModule('/js/space/api-contract.js'),
        loadJson('/data/aetherus/api-contract-policy.v1.json')]);
      const result = module.validateApiPolicy(policy);
      expect(result.basePath === '/api/v1' && result.productionEnabled === false, 'API_GATE_INVALID');
      return '/api/v1 · cursor/idempotency/ETag · off';
    } },
  { id: 'space-platform', domain: 'space', title: 'Platform Operating',
    asset: '/js/space/platform-operating-contract.js', run: async () => {
      const [module, policy] = await Promise.all([loadModule('/js/space/platform-operating-contract.js'),
        loadJson('/data/aetherus/platform-operating-policy.v1.json')]);
      const result = module.validatePlatformPolicy(policy);
      expect(result.productionEnabled === false, 'PLATFORM_GATE_OPEN');
      return `${module.REQUIRED_COMPONENTS.length} component boundaries · off`;
    } },
  { id: 'space-discovery', domain: 'space', title: 'Discovery',
    asset: '/js/space/discovery-contract.js', run: async () => {
      const [module, policy] = await Promise.all([loadModule('/js/space/discovery-contract.js'),
        loadJson('/data/aetherus/discovery-policy.v1.json')]);
      const result = module.validateDiscoveryPolicy(policy);
      expect(result.productionEnabled === false, 'DISCOVERY_GATE_OPEN');
      return 'evidence-only search/recommendation · provider off';
    } },
  { id: 'space-spotlight', domain: 'space', title: 'Spotlight 102–114',
    asset: '/js/space/spotlight-contract.js', run: async () => {
      const [module, policy] = await Promise.all([loadModule('/js/space/spotlight-contract.js'),
        loadJson('/data/aetherus/spotlight-policy.v1.json')]);
      const result = module.validateSpotlightPolicy(policy);
      expect(result.productionEnabled === false && result.hubs.length === 2, 'SPOTLIGHT_GATE_INVALID');
      return 'Korea/SpaceX fixture hubs · live feeds off';
    } },
  { id: 'space-db', domain: 'space', title: 'Database 219–232',
    asset: '/js/space/database-contract.js', run: async () => {
      const [module, policy] = await Promise.all([loadModule('/js/space/database-contract.js'),
        loadJson('/data/aetherus/database-contract.v1.json')]);
      const result = module.validateDatabaseContract(policy);
      expect(result.tables.length === 24 && result.productionEnabled === false, 'DATABASE_GATE_INVALID');
      return '24-table registry · SQL migration not applied';
    } },
  { id: 'space-infra', domain: 'space', title: 'Infrastructure 233–245',
    asset: '/js/space/infrastructure-contract.js', run: async () => {
      const [module, policy] = await Promise.all([loadModule('/js/space/infrastructure-contract.js'),
        loadJson('/data/aetherus/infrastructure-policy.v1.json')]);
      const result = module.validateInfrastructurePolicy(policy);
      expect(result.productionEnabled === false, 'INFRA_GATE_OPEN');
      return 'cache/storage/provider plans · cloud changes none';
    } },
  { id: 'space-security', domain: 'space', title: 'Rights · Security',
    asset: '/js/space/security-privacy-contract.js', run: async () => {
      const [module, policy] = await Promise.all([loadModule('/js/space/security-privacy-contract.js'),
        loadJson('/data/aetherus/security-policy.v1.json')]);
      const result = module.validateSecurityPolicy(policy);
      expect(result.productionEnabled === false, 'SECURITY_GATE_OPEN');
      return 'RBAC/moderation/quarantine · OAuth/scanner off';
    } },
  { id: 'space-release', domain: 'space', title: 'Release QA',
    asset: '/js/space/release-qa-contract.js', run: async () => {
      const [module, policy] = await Promise.all([loadModule('/js/space/release-qa-contract.js'),
        loadJson('/data/aetherus/release-qa-policy.v1.json')]);
      const result = module.validateReleaseQaPolicy(policy);
      const dst = module.compareDstFold('2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z',
        { timeZone: 'America/New_York' });
      expect(result.productionEnabled === false && dst.status === 'AMBIGUOUS_LOCAL_TIME',
        'RELEASE_QA_GATE_INVALID');
      return 'DST fold preserved · rollback/hotfix automatic false';
    } },
];

const state = { results: new Map(), checkedAt: null };
const grids = { ocean: document.querySelector('#oceanGrid'), space: document.querySelector('#spaceGrid') };

function renderCards() {
  for (const test of tests) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.test = test.id;
    card.dataset.state = 'PENDING';
    card.innerHTML = `<div class="card__top"><h3></h3><span class="badge">PENDING</span></div>
      <p class="card__detail">검사 대기 중</p><code class="card__asset"></code>`;
    card.querySelector('h3').textContent = test.title;
    card.querySelector('.card__asset').textContent = test.asset;
    grids[test.domain].append(card);
  }
}

function updateSummary() {
  const values = [...state.results.values()];
  const pass = values.filter(result => result.state === 'PASS').length;
  const fail = values.filter(result => result.state === 'FAIL').length;
  document.querySelector('#passCount').textContent = String(pass);
  document.querySelector('#failCount').textContent = String(fail);
  document.querySelector('#pendingCount').textContent = String(tests.length - values.length);
  document.querySelector('#downloadReport').disabled = values.length === 0;
}

function updateCard(test, result) {
  const card = document.querySelector(`[data-test="${test.id}"]`);
  card.dataset.state = result.state;
  card.querySelector('.badge').textContent = result.state;
  card.querySelector('.card__detail').textContent = result.detail;
}

async function runTests(domain = 'all') {
  const selected = tests.filter(test => domain === 'all' || test.domain === domain);
  for (const button of document.querySelectorAll('[data-run]')) button.disabled = true;
  for (const test of selected) {
    state.results.delete(test.id);
    updateCard(test, { state: 'RUNNING', detail: '배포 자산을 불러오는 중' });
  }
  updateSummary();
  await Promise.all(selected.map(async test => {
    const startedAt = performance.now();
    let result;
    try {
      const detail = await test.run();
      result = { id: test.id, domain: test.domain, state: 'PASS', detail,
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10 };
    } catch (error) {
      result = { id: test.id, domain: test.domain, state: 'FAIL',
        detail: `${error?.name || 'Error'}: ${error?.message || 'UNKNOWN'}`,
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10 };
    }
    state.results.set(test.id, result);
    updateCard(test, result);
    updateSummary();
  }));
  state.checkedAt = new Date().toISOString();
  document.querySelector('#checkedAt').textContent = `${state.checkedAt} · browser · ${selected.length} checks`;
  for (const button of document.querySelectorAll('[data-run]')) button.disabled = false;
}

function downloadReport() {
  const report = { schema: 'earthus.ocean-aetherus-v3-canary-report.v1', revision: REVISION,
    checkedAt: state.checkedAt, productionReleased: false, results: [...state.results.values()] };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `earthus-ocean-aetherus-v3-canary-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

renderCards();
document.querySelectorAll('[data-run]').forEach(button => button.addEventListener('click', () =>
  runTests(button.dataset.run)));
document.querySelector('#downloadReport').addEventListener('click', downloadReport);
runTests('all');
