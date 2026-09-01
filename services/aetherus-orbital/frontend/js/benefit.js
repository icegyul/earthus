/**
 * P5 REMOVE simulation: IDEALIZED_REMOVAL counterfactual entry for the
 * Explore detail panel.
 *
 * Every displayed value comes from the real Aetherus API chain:
 *   POST /api/v1/baselines → POST /api/v1/scenarios
 *   → POST /api/v1/scenarios/{id}/run → GET /api/v1/scenarios/{id}/benefits
 *
 * The UI never computes a benefit and never hides the simulation nature of
 * the result: IDEALIZED_REMOVAL, input snapshot/model/horizon provenance and
 * explicit unavailable states are always rendered verbatim from payloads.
 */

function esc(value) {
  return String(value ?? "—").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

export function initialBenefitState() {
  return { __state: "idle" };
}

export async function runRemoveSimulation(api, target) {
  const baseline = await api.buildBaseline();
  const edgesAvailable =
    baseline?.data?.edges_available === true &&
    Number(baseline?.data?.edge_count) > 0;
  if (!edgesAvailable) {
    // Zero-edge live catalog: do not create a scenario destined for
    // BASELINE_MISSING; surface the explicit backend state instead.
    return {
      __state: "unavailable",
      baseline,
      error: {
        apiStatus: baseline?.data_status ?? "INSUFFICIENT_DATA",
        httpStatus: null,
        message:
          "The stored P4 catalog contains no operational conjunction events "
          + "for this horizon, so no REMOVE counterfactual can be computed.",
        details: { status_reason: baseline?.status_reason ?? null },
      },
    };
  }
  const scenario = await api.createScenario({
    kind: "REMOVE",
    target: target.catalog_id,
    baselineSnapshotId: baseline.data.baseline_snapshot_id,
  });
  const scenarioId = scenario.data.scenario_id;
  const run = await api.runScenario(scenarioId);
  const benefits = await api.scenarioBenefits(scenarioId);
  return { __state: "result", baseline, scenario, run, benefits };
}

function formatMetric(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  if (num !== 0 && Math.abs(num) < 1e-3) return num.toExponential(4);
  return Number.isInteger(num) ? String(num) : num.toFixed(6);
}

function confirmBlock(entry) {
  return `
    <div class="benefit-sim__confirm" id="benefit-confirm">
      <p class="benefit-sim__assumption"><b>ASSUMPTION:</b>
        <code>IDEALIZED_REMOVAL</code> — this is a counterfactual simulation.
        <b>No actual object is removed</b>, no maneuver or command is executed,
        and no orbital state changes.</p>
      <table class="kv"><tbody>
        <tr><th scope="row">Target</th><td>${esc(entry.canonical_name ?? entry.catalog_id)} (CATNR ${esc(entry.catalog_id)})</td></tr>
        <tr><th scope="row">Horizon</th><td>24 h (server configuration)</td></tr>
        <tr><th scope="row">Metric channels</th><td>PC · MAX_PC · CONJUNCTION_EXPOSURE (separate; never merged)</td></tr>
        <tr><th scope="row">Beneficiary rule</th><td>non-target objects with Benefit<sub>i</sub> &gt; threshold(metric)</td></tr>
      </tbody></table>
      <div class="benefit-sim__actions">
        <button class="btn" id="benefit-confirm-run" type="button">Run simulation via API</button>
        <button class="btn btn--ghost" id="benefit-cancel" type="button">Cancel</button>
      </div>
    </div>`;
}

function runningBlock() {
  return `
    <div class="unavailable"><b>COMPUTING</b> — POST /api/v1/baselines →
    POST /api/v1/scenarios → …/run against the stored P4 screening record…
    No placeholder value is shown while waiting.</div>`;
}

function unavailableBlock(benefit) {
  const error = benefit.error ?? {};
  return `
    <div class="unavailable">
      <b>${esc(error.apiStatus ?? "UNAVAILABLE")}</b>
      ${error.httpStatus ? `<span class="mono">(HTTP ${esc(error.httpStatus)})</span>` : ""}
      — ${esc(error.message ?? "The benefit API could not produce a result.")}
      No benefit value is substituted.
      ${error.details ? `<br><code>${esc(JSON.stringify(error.details))}</code>` : ""}
    </div>`;
}

function resultBlock(benefit) {
  const run = benefit.run;
  const data = run?.data ?? {};
  const status = run?.data_status ?? "UNAVAILABLE";
  if (status !== "OK" || !data.beneficiaries || data.beneficiaries.length === 0) {
    return `
      <div class="unavailable">
        <b>${esc(status)}</b>${run?.status_reason ? ` — ${esc(run.status_reason)}` : ""}.
        The stored P4 catalog contains no removable risk edge for this target,
        so no beneficiary exists and none is invented.
      </div>`;
  }
  const rows = data.beneficiaries.map((row) => {
    const prov = row.provenance ?? {};
    return `
      <tr>
        <td>${esc(row.canonical_name ?? row.catalog_id ?? row.beneficiary_object_id)}${row.catalog_id ? ` <span class="metric__unit">CATNR ${esc(row.catalog_id)}</span>` : ""}</td>
        <td>${esc(row.metric_type)}</td>
        <td class="mono">${formatMetric(row.baseline_value)}</td>
        <td class="mono">${formatMetric(row.scenario_value)}</td>
        <td class="mono benefit-sim__delta">${formatMetric(row.benefit_value)}</td>
        <td>${esc(String(prov.threshold ?? row.threshold ?? "—"))}</td>
        <td>${esc(row.benefit_class ?? "")}</td>
      </tr>`;
  }).join("");
  const prov = run.provenance ?? {};
  const accounting = data.edge_accounting ?? {};
  const performance = data.performance ?? {};
  return `
    <p class="benefit-sim__banner"><b>SIMULATION RESULT · IDEALIZED_REMOVAL</b> —
    no actual removal occurred.</p>
    <table class="kv benefit-sim__prov"><tbody>
      <tr><th scope="row">Baseline graph</th><td class="mono">${esc(String(data.baseline_snapshot_id ?? prov.baseline_snapshot_id ?? "—"))}</td></tr>
      <tr><th scope="row">Graph hash</th><td class="mono">${esc(shortHash(prov.baseline_graph_hash))}</td></tr>
      <tr><th scope="row">Model</th><td>${esc(prov.model_id ?? "—")} v${esc(prov.model_version ?? "—")}</td></tr>
      <tr><th scope="row">Input / config hash</th><td class="mono">${esc(shortHash(prov.input_hash))} · ${esc(shortHash(prov.config_hash))}</td></tr>
      <tr><th scope="row">Result hash</th><td class="mono">${esc(shortHash(prov.result_hash))}</td></tr>
      <tr><th scope="row">Edges removed / reused</th><td>${esc(String(accounting.affected_edge_count ?? "—"))} / ${esc(String(accounting.reused_baseline_edge_count ?? "—"))} (baseline ${esc(String(accounting.baseline_edge_count ?? "—"))})</td></tr>
      <tr><th scope="row">Compute</th><td>${esc(String(performance.compute_ms ?? "—"))} ms · peak ${(Number(performance.peak_memory_bytes ?? 0) / 1024).toFixed(1)} KiB</td></tr>
    </tbody></table>
    <table class="kv benefit-sim__rows"><thead>
      <tr><th>Beneficiary</th><th>Metric</th><th>R(G₀)</th><th>R(Gₛ)</th><th>Benefit</th><th>Threshold</th><th>Class</th></tr>
    </thead><tbody>${rows}</tbody></table>
    ${(run.warnings ?? []).map((w) => `<p class="detail__note">${esc(w.message ?? w.code ?? String(w))}</p>`).join("")}`;
}

function shortHash(value) {
  if (!value) return "—";
  return `${String(value).slice(0, 16)}…`;
}

export function renderBenefitSection(store, entry) {
  const benefit = store.benefit;
  let inner;
  if (!benefit || benefit.__state === "idle") {
    inner = `
      <p class="benefit-sim__hint">
        Research simulation only. Requires a baseline built from stored P4
        conjunction events; the live catalog may legitimately contain none.</p>
      <button class="btn" id="simulate-removal-btn" type="button"
        data-testid="simulate-removal">SIMULATE REMOVAL…</button>`;
  } else {
    switch (benefit.__state) {
      case "confirm":
        inner = confirmBlock(entry);
        break;
      case "running":
        inner = runningBlock();
        break;
      case "unavailable":
        inner = unavailableBlock(benefit);
        break;
      case "result":
        inner = resultBlock(benefit);
        break;
      default:
        inner = "";
    }
    inner += `
      <button class="btn btn--ghost" id="benefit-reset" type="button">Reset</button>`;
  }
  return `
    <section class="detail__section" id="benefit-section" data-testid="benefit-section">
      <h3 class="detail__section-title">REMOVE simulation
        <span class="badge badge--sim">IDEALIZED_REMOVAL</span></h3>
      ${inner}
      <p class="detail__note">Values come only from
      <code>POST /api/v1/baselines</code>,
      <code>POST /api/v1/scenarios</code>,
      <code>POST /api/v1/scenarios/&#123;id&#125;/run</code> and
      <code>GET /api/v1/scenarios/&#123;id&#125;/benefits</code>.
      This panel never executes a removal, maneuver, or command.</p>
    </section>`;
}
