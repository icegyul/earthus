// EARTHUS V2 Research Simulation foundation.
// 기존 V1/V2 메뉴와 Intelligence를 건드리지 않고 Simulation을 additive layer로 붙인다.
// 이 모듈은 브라우저에서 연구 계획/데이터 준비 상태를 표현하고,
// 실제 수치 계산은 서버 worker가 담당한다.

const SCHEMA_VERSION = '1.0';

const STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  READY: 'READY',
  BLOCKED: 'BLOCKED',
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

const GATES = Object.freeze([
  'coverage',
  'crs',
  'verticalDatum',
  'resolution',
  'temporal',
  'nodata',
  'units',
  'quality',
  'version',
  'license',
]);

const DOMAIN_CAPABILITIES = Object.freeze({
  FLOOD: Object.freeze({
    simulation: true,
    observationComparison: true,
    scenarios: true,
    calibration: false,
    uncertainty: false,
  }),
});

const MODEL_REGISTRY = Object.freeze({
  'lisflood-fp': Object.freeze({
    id: 'lisflood-fp',
    domain: 'FLOOD',
    status: 'CANDIDATE',
    displayName: 'LISFLOOD-FP',
    capabilities: ['fluvial_flood', 'pluvial_flood', 'urban_flood', 'coastal_flood'],
    requiredInputs: ['dem', 'timeWindow'],
    optionalInputs: ['rainfall', 'boundary', 'initialDepth', 'manningN', 'riverNetwork', 'structures'],
    outputs: ['maxDepth', 'waterDepthTimeSeries', 'waterSurfaceElevation', 'massBalance'],
    browserExecution: false,
    gpuExecution: true,
    limitation: '실제 모델 버전, 입력자료 적합성, 검증 범위와 라이선스를 실행 전에 확인해야 한다.',
    license: 'GPL',
  }),
});

function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCheck(check) {
  return Object.freeze({
    gate: check.gate,
    status: ['PASS', 'WARN', 'FAIL'].includes(check.status) ? check.status : 'FAIL',
    message: String(check.message || ''),
    source: check.source || null,
    checkedAt: check.checkedAt || nowIso(),
  });
}

export function createSimulationPlan(input = {}) {
  const plan = {
    schemaVersion: SCHEMA_VERSION,
    planId: id('plan'),
    createdAt: nowIso(),
    status: STATUS.DRAFT,
    question: String(input.question || '').trim(),
    hypothesis: String(input.hypothesis || '').trim(),
    domain: input.domain || null,
    aoi: input.aoi || null,
    timeWindow: input.timeWindow || null,
    datasets: Array.isArray(input.datasets) ? clone(input.datasets) : [],
    model: input.model ? clone(input.model) : null,
    parameters: Array.isArray(input.parameters) ? clone(input.parameters) : [],
    validationPlan: input.validationPlan ? clone(input.validationPlan) : null,
    assumptions: Array.isArray(input.assumptions) ? clone(input.assumptions) : [],
    approvals: [],
  };
  return Object.freeze(plan);
}

export function evaluateDataReadiness(checks = []) {
  const normalized = GATES.map(gate => normalizeCheck(
    checks.find(check => check?.gate === gate) || {
      gate,
      status: 'FAIL',
      message: '검사가 아직 수행되지 않았습니다.',
    },
  ));
  const failed = normalized.filter(check => check.status === 'FAIL');
  const warnings = normalized.filter(check => check.status === 'WARN');
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    status: failed.length ? 'BLOCKED' : 'READY',
    checks: normalized,
    failedGates: failed.map(check => check.gate),
    warningGates: warnings.map(check => check.gate),
    checkedAt: nowIso(),
  });
}

export function canRunSimulation(plan, readiness) {
  if (!plan?.question) return { allowed: false, reason: '연구 질문이 없습니다.' };
  if (!plan?.aoi) return { allowed: false, reason: 'AOI가 없습니다.' };
  if (!plan?.timeWindow) return { allowed: false, reason: '시간 범위가 없습니다.' };
  if (!plan?.model?.id) return { allowed: false, reason: '모델이 선택되지 않았습니다.' };
  if (!readiness || readiness.status !== 'READY') {
    return { allowed: false, reason: 'Data Readiness Gate를 통과하지 못했습니다.' };
  }
  return { allowed: true, reason: null };
}

export function createSimulationJob(plan, readiness, options = {}) {
  const gate = canRunSimulation(plan, readiness);
  if (!gate.allowed) throw new Error(gate.reason);

  const model = MODEL_REGISTRY[plan.model.id];
  if (!model) throw new Error(`등록되지 않은 모델입니다: ${plan.model.id}`);

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    jobId: id('sim'),
    createdAt: nowIso(),
    status: STATUS.QUEUED,
    plan: clone(plan),
    readiness: clone(readiness),
    model: clone(model),
    computeEstimate: options.computeEstimate || null,
    approvalToken: options.approvalToken || null,
    idempotencyKey: options.idempotencyKey || id('idem'),
  });
}

export function snapshotReproducibility(job, runtime = {}) {
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    snapshotId: id('repro'),
    capturedAt: nowIso(),
    plan: clone(job.plan),
    readiness: clone(job.readiness),
    model: clone(job.model),
    runtime: {
      browser: runtime.browser || null,
      workerImageDigest: runtime.workerImageDigest || null,
      modelCommit: runtime.modelCommit || null,
      randomSeed: runtime.randomSeed ?? null,
      hardwareProfile: runtime.hardwareProfile || null,
    },
  });
}

export function modelCapability(modelId) {
  const model = MODEL_REGISTRY[modelId];
  return model ? clone(model) : null;
}

export function listSimulationModels(domain = null) {
  return Object.values(MODEL_REGISTRY)
    .filter(model => !domain || model.domain === domain)
    .map(clone);
}

export const SimulationStatus = STATUS;
export const SimulationGates = GATES;
export const SimulationCapabilities = DOMAIN_CAPABILITIES;


export function createSimulationRuntime({ eventTarget = document } = {}) {
  let initialized = false;
  let plan = null;
  let readiness = null;
  const listeners = new Set();

  const emit = type => {
    const detail = { type, plan: plan ? clone(plan) : null, readiness: readiness ? clone(readiness) : null };
    listeners.forEach(listener => listener(detail));
    if (typeof CustomEvent === 'function') {
      eventTarget?.dispatchEvent?.(new CustomEvent('earthus:simulation', { detail }));
    }
  };

  const api = {
    init() {
      initialized = true;
      emit('simulation.runtime.ready');
      return api;
    },
    setPlan(input) {
      plan = createSimulationPlan(input);
      emit('simulation.plan.changed');
      return clone(plan);
    },
    setReadiness(checks) {
      readiness = evaluateDataReadiness(checks);
      emit('simulation.readiness.changed');
      return clone(readiness);
    },
    canRun() {
      return canRunSimulation(plan, readiness);
    },
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('listener must be a function');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return {
        initialized,
        schemaVersion: SCHEMA_VERSION,
        plan: plan ? clone(plan) : null,
        readiness: readiness ? clone(readiness) : null,
        canRun: canRunSimulation(plan, readiness),
      };
    },
  };

  return Object.freeze(api);
}
