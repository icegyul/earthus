/**
 * API client for the Aetherus backend.
 *
 * Every scientific value the UI shows passes through here; the module keeps
 * an append-only log of requests and responses so tests (and the on-page
 * provenance drawer) can prove where each number came from.
 */

const API_LOG_LIMIT = 200;
const log = [];

async function request(path, options = {}) {
  const entry = {
    method: options.method ?? "GET",
    path,
    requestedAt: new Date().toISOString(),
  };
  log.push(entry);
  if (log.length > API_LOG_LIMIT) log.shift();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);
  entry.url = new URL(path, window.location.origin).toString();
  try {
    const response = await fetch(path, { ...options, signal: controller.signal });
    entry.status = response.status;
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 400) };
    }
    entry.response = body;
    if (!response.ok) {
      const error = new Error(body?.message || `API request failed (${response.status})`);
      error.apiStatus = body?.status || `HTTP_${response.status}`;
      error.httpStatus = response.status;
      error.details = body?.details || null;
      error.requestId = body?.request_id || null;
      throw error;
    }
    return body;
  } catch (error) {
    if (error.name === "AbortError") {
      error.apiStatus = "TIMEOUT";
      error.httpStatus = 0;
      error.message = "The API did not respond in time.";
    }
    entry.error = error.message;
    throw error;
  } finally {
    clearTimeout(timer);
    document.dispatchEvent(new CustomEvent("aetherus:api-log", { detail: entry }));
  }
}

export const api = {
  catalogSnapshot({ at, bbox, limit } = {}) {
    const params = new URLSearchParams();
    if (at) params.set("at", at);
    if (bbox) params.set("bbox", bbox);
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();
    return request(`/api/v1/catalog/snapshot${qs ? `?${qs}` : ""}`);
  },
  catalogStatus() {
    return request("/api/v1/catalog/status");
  },
  objectEphemeris(objectRef, { start, stop, stepS } = {}) {
    const params = new URLSearchParams({ start, stop });
    if (stepS) params.set("step_s", String(stepS));
    return request(`/api/v1/objects/${encodeURIComponent(objectRef)}/ephemeris?${params}`);
  },
  conjunctions({ object } = {}) {
    const params = new URLSearchParams();
    if (object) params.set("object", object);
    const qs = params.toString();
    return request(`/api/v1/conjunctions${qs ? `?${qs}` : ""}`);
  },
  buildBaseline({ horizonHours } = {}) {
    const params = new URLSearchParams();
    if (horizonHours) params.set("horizon_hours", String(horizonHours));
    const qs = params.toString();
    return request(`/api/v1/baselines${qs ? `?${qs}` : ""}`, { method: "POST" });
  },
  createScenario({ kind, target, baselineSnapshotId, metricTypes } = {}) {
    return request("/api/v1/scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        target,
        baseline_snapshot_id: baselineSnapshotId ?? null,
        metric_types: metricTypes ?? null,
      }),
    });
  },
  runScenario(scenarioId, { recomputeMode } = {}) {
    const qs = recomputeMode ? `?recompute_mode=${encodeURIComponent(recomputeMode)}` : "";
    return request(`/api/v1/scenarios/${encodeURIComponent(scenarioId)}/run${qs}`, {
      method: "POST",
    });
  },
  scenarioBenefits(scenarioId) {
    return request(`/api/v1/scenarios/${encodeURIComponent(scenarioId)}/benefits`);
  },
  health() {
    return request("/health");
  },
  apiLog() {
    return [...log];
  },
};
