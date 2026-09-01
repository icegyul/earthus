/**
 * Object detail panel: identity, live orbit values, provenance drawer and the
 * explicit NOT_COMPUTED risk section. Every value traces to an API payload.
 */

import { formatAge, formatNum, formatUtc } from "./coords.js";
import { renderBenefitSection } from "./benefit.js";
import { store } from "./state.js";

const panel = () => document.getElementById("detail-panel");
const body = () => document.getElementById("detail-body");

function esc(value) {
  return String(value ?? "—").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function badgeFor(status) {
  if (status === "OK") return `<span class="badge badge--ok">OK</span>`;
  if (status === "STALE") return `<span class="badge badge--stale">STALE</span>`;
  if (!status) return `<span class="badge badge--neutral">NO DATA</span>`;
  return `<span class="badge badge--error">${esc(status)}</span>`;
}

function formatMeters(meters) {
  if (meters == null || !Number.isFinite(Number(meters))) return null;
  const value = Number(meters);
  return value >= 1000 ? `${(value / 1000).toFixed(3)} km` : `${value.toFixed(1)} m`;
}

function pcChannelHtml(pc) {
  if (!pc) return "";
  if (pc.status === "COMPUTED" && pc.value != null) {
    return `
      <tr><th scope="row">Pc</th><td>${esc(pc.value.toExponential(4))} · ${esc(pc.method ?? "")}</td></tr>`;
  }
  const reason = pc.unavailable_reason ? ` (${esc(pc.unavailable_reason)})` : "";
  return `<tr><th scope="row">Pc</th><td><b>${esc(pc.status)}</b>${reason} — covariance is absent for PUBLIC_GP sources, so Pc is never estimated.</td></tr>`;
}

function conjunctionSection(conjunctions) {
  if (!conjunctions || conjunctions.__loading) {
    return `
      <div class="unavailable"><b>LOADING</b> — querying GET /api/v1/conjunctions…</div>`;
  }
  if (conjunctions.__error) {
    return `
      <div class="unavailable"><b>UNAVAILABLE</b> — the conjunctions API returned
      <code>${esc(conjunctions.__error)}</code>. No risk value is substituted.</div>`;
  }
  const status = conjunctions.data_status;
  const reason = conjunctions.status_reason;
  const prov = conjunctions.provenance ?? {};
  const runLine = prov.screening_run_id
    ? `<p class="risk__meta">screening run <code>${esc(String(prov.screening_run_id).slice(0, 8))}</code>
       · pairs ${esc(String(prov.pairs_before_screening))}→${esc(String(prov.pairs_after_coarse))}
       · objects ${esc(String(prov.objects_propagated))}
       · model ${esc(prov.model_id ?? "—")} v${esc(prov.model_version ?? "—")}</p>`
    : "";

  if (!status || status === "UNAVAILABLE" || status === "INSUFFICIENT_DATA") {
    return `
      <div class="unavailable">
        <b>${esc(status ?? "UNAVAILABLE")}</b>${reason ? ` — ${esc(reason)}` : ""}
        — no conjunction value exists for this object and none is invented.
        Pc stays NOT_COMPUTED without covariance.
      </div>${runLine}`;
  }

  const events = conjunctions.data?.events ?? [];
  if (!events.length) {
    return `
      <div class="unavailable">
        <b>NO CONJUNCTION EVENTS</b>${reason ? ` — ${esc(reason)}` : ""}.
        The stored screening results contain no event for this object.
      </div>${runLine}`;
  }

  const rows = events.map((event) => {
    const snap = event.latest_snapshot ?? {};
    const metrics = snap.metrics ?? {};
    const miss = formatMeters(metrics.MISS_DISTANCE?.value ?? snap.miss_distance_m);
    const speed = snap.relative_speed_mps != null
      ? `${(Number(snap.relative_speed_mps) / 1000).toFixed(3)} km/s`
      : "—";
    const boundary = snap.tca_boundary_flag
      ? '<span class="badge badge--stale">BOUNDARY TCA</span>'
      : "";
    return `
      <article class="risk-event">
        <header>
          <span class="risk-event__pair">${esc(event.primary?.catalog_id)} ↔ ${esc(event.secondary?.catalog_id)}</span>
          ${badgeFor(snap.source_grade ? "OK" : null)}
          ${boundary}
        </header>
        <table class="kv"><tbody>
          <tr><th scope="row">TCA (UTC)</th><td>${formatUtc(event.tca)}</td></tr>
          <tr><th scope="row">Miss distance</th><td>${esc(miss ?? "—")} <span class="metric__unit">(screening channel)</span></td></tr>
          <tr><th scope="row">Relative speed</th><td>${esc(speed)}</td></tr>
          ${pcChannelHtml(metrics.PC)}
          <tr><th scope="row">Source grade</th><td>${esc(snap.source_grade ?? "—")}</td></tr>
          <tr><th scope="row">Snapshot input hash</th><td class="mono">${esc(snap.input_hash ? String(snap.input_hash).slice(0, 16) + "…" : "—")}</td></tr>
        </tbody></table>
      </article>`;
  });

  return `${rows.join("")}${runLine}`;
}

export function openPanel() {
  panel().hidden = false;
  document.body.classList.add("detail-open");
  document.getElementById("detail-close").focus();
}

export function closePanel() {
  panel().hidden = true;
  document.body.classList.remove("detail-open");
}

export function renderDetail({ entry, ephemeris, timeIndex, conjunctions }) {
  if (!entry) {
    body().innerHTML = "";
    return;
  }
  const provenance = ephemeris?.provenance ?? entry.provenance;
  const sample = ephemeris?.data?.samples?.[Math.min(timeIndex, (ephemeris?.data?.sample_count ?? 1) - 1)];
  const geodetic = sample?.geodetic ?? entry.geodetic;
  const state = sample?.state ?? entry.state;
  const speed = state?.v_km_s
    ? Math.hypot(state.v_km_s[0], state.v_km_s[1], state.v_km_s[2])
    : null;

  const identityRows = [
    ["Catalog ID", entry.catalog_id],
    ["COSPAR", entry.cospar_id],
    ["Object type", entry.object_type],
    ["Origin", entry.origin_code ?? "UNSPECIFIED"],
    ["Canonical UUID", entry.object_id],
  ];

  const provRows = provenance
    ? [
        ["Sources", (provenance.source_ids ?? []).join(", ") || "—"],
        ["Solution epoch", formatUtc(provenance.source_snapshot_at ?? provenance.orbit_solution_epoch)],
        ["Retrieved at", formatUtc(provenance.retrieved_at)],
        ["Data age", `${formatAge(provenance.data_age_s)}${provenance.stale ? " · STALE" : ""}`],
        ["Model", `${provenance.model_id ?? "—"} v${provenance.model_version ?? "—"}`],
        ["Frame / time", `${provenance.frame ?? "TEME"} / ${provenance.time_system ?? "UTC"}`],
        ["Quality grade", provenance.quality_grade ?? "—"],
        ["Input artifact", (provenance.input_artifact_hashes ?? [])[0] ?? "—"],
        ["Config hash", provenance.config_hash ?? "—"],
        ["Solution ID", provenance.orbit_solution_id ?? "—"],
      ]
    : [];

  body().innerHTML = `
    <p class="detail__eyebrow">Object detail · API-derived</p>
    <h2 class="detail__name">${esc(entry.canonical_name ?? entry.catalog_id)}</h2>
    <p class="detail__ids">${esc(entry.cospar_id ?? "no COSPAR")} · ${esc(entry.object_type ?? "type unspecified")}</p>

    <div class="detail__grid">
      <div class="metric">
        <span class="metric__label">Altitude</span>
        <span class="metric__value">${formatNum(geodetic?.alt_km, 1)}<span class="metric__unit">km</span></span>
      </div>
      <div class="metric">
        <span class="metric__label">Speed</span>
        <span class="metric__value">${formatNum(speed, 2)}<span class="metric__unit">km/s</span></span>
      </div>
      <div class="metric">
        <span class="metric__label">Ground position</span>
        <span class="metric__value" style="font-size:12px">${formatNum(geodetic?.lat_deg, 2)}°, ${formatNum(geodetic?.lon_deg, 2)}°</span>
      </div>
      <div class="metric">
        <span class="metric__label">Data age</span>
        <span class="metric__value">${formatAge(provenance?.data_age_s)}</span>
      </div>
    </div>

    <section class="detail__section" id="risk-section" data-testid="risk-section">
      <h3 class="detail__section-title">Conjunction risk</h3>
      ${conjunctionSection(conjunctions)}
      <p class="detail__note">Risk values come only from
      <code>GET /api/v1/conjunctions</code>. Pc is computed exclusively from a
      valid CDM covariance; SOCRATES MaxProbability and screening metrics are
      separate channels and are never relabelled as Pc.</p>
    </section>

    ${renderBenefitSection(store, entry)}

    <section class="detail__section">
      <h3 class="detail__section-title">Identity</h3>
      <table class="kv"><tbody>
        ${identityRows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${esc(v)}</td></tr>`).join("")}
      </tbody></table>
    </section>

    <section class="detail__section">
      <h3 class="detail__section-title">Live orbit ${badgeFor(entry.position_status)}</h3>
      <table class="kv"><tbody>
        <tr><th scope="row">Sample time (UTC)</th><td>${formatUtc(sample?.sample_time ?? entry.sample_time)}</td></tr>
        <tr><th scope="row">State frame</th><td>${esc(state?.frame ?? "—")} · r = [${(state?.r_km ?? []).map((v) => formatNum(v, 1)).join(", ")}] km</td></tr>
        <tr><th scope="row">Ephemeris window</th><td>${ephemeris ? `${formatUtc(ephemeris.data.window.start)} → ${formatUtc(ephemeris.data.window.stop)} @ ${ephemeris.data.window.step_s}s` : "not loaded"}</td></tr>
        <tr><th scope="row">Output hash</th><td>${esc(ephemeris?.data?.output_sha256 ?? "—")}</td></tr>
      </tbody></table>
    </section>

    <section class="detail__section">
      <h3 class="detail__section-title">Provenance ${provenance?.stale ? badgeFor("STALE") : badgeFor("OK")}</h3>
      ${
        provRows.length
          ? `<table class="kv"><tbody>
              ${provRows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${esc(v)}</td></tr>`).join("")}
             </tbody></table>`
          : `<div class="unavailable"><b>UNAVAILABLE</b> — no stored orbit solution provenance for this object.</div>`
      }
    </section>

    ${
      (provenance?.limitations ?? entry.warnings ?? []).length
        ? `<section class="detail__section">
            <h3 class="detail__section-title">Limitations &amp; warnings</h3>
            <ul class="warnings">
              ${(provenance?.limitations ?? entry.warnings ?? []).map((w) => `<li>${esc(w)}</li>`).join("")}
            </ul>
           </section>`
        : ""
    }

    <p class="detail__note">All values on this panel are read from
    <code>GET /api/v1/objects/${esc(entry.catalog_id)}/ephemeris</code> and
    <code>GET /api/v1/catalog/snapshot</code>. The client computes no orbital state.</p>
  `;
}
