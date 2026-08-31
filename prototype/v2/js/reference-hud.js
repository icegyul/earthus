/* EARTHUS V2 — 승인 레퍼런스 HUD (REF_APPROVED_DIRECTION_Base_Earth / Weather_Ocean).
 * 화면 구성만 레퍼런스를 따르고 모든 수치는 실제 런타임 값이다.
 * 값이 없으면 "—"와 사유를 보여준다. 지어내는 수치는 없다.
 */

const REFRESH_MS = 4000;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function fmtUtc(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function coverageRow(realEarth) {
  const fidelity = realEarth.cloudFidelity?.() || "OFF";
  if (fidelity === "OFF") {
    const diag = realEarth.cloudDiagnostics?.();
    return {
      value: "—",
      sub: diag?.global === "NOT_REQUESTED_BELOW_GLOBAL_SCOPE"
        ? "구름 레이어 대기"
        : "구름 미로드 · WEATHER→Clouds",
    };
  }
  const meta = realEarth.globalCloudTruth?.();
  if (meta?.layers?.length === 3) {
    const pct = meta.layers.map(layer =>
      `${Math.round((Number(layer.coverage) || 0) * 100)}%`);
    return {
      value: `${pct[0]} · ${pct[1]} · ${pct[2]}`,
      sub: `NOAA GFS L·M·H · ${String(meta.validAt).slice(0, 16)}Z`,
    };
  }
  return { value: fidelity, sub: "관측 3D 구름 활성" };
}

export function installReferenceHud({ root = globalThis } = {}) {
  const api = root.__earthusV2;
  if (!api?.viewer || !api?.realEarth) {
    setTimeout(() => installReferenceHud({ root }), 250);
    return null;
  }
  const { viewer, realEarth } = api;
  const ui = document.getElementById("ui");
  if (!ui || document.getElementById("refReadouts")) return null;

  /* ── 우측 실측 리드아웃 (Base_Earth 레퍼런스) ── */
  const readouts = el("aside", "", null);
  readouts.id = "refReadouts";
  const rows = [
    { key: "cloud", label: "CLOUD COVERAGE" },
    { key: "atmos", label: "ATMOSPHERE" },
    { key: "terrain", label: "TERRAIN" },
    { key: "ocean", label: "OCEAN" },
  ];
  const refs = {};
  for (const row of rows) {
    const box = el("div", "ro");
    box.append(el("small", "", row.label));
    const value = el("b", "", "—");
    const sub = el("span", "", "");
    box.append(value, sub);
    refs[row.key] = { value, sub };
    readouts.append(box);
  }
  ui.append(readouts);

  /* ── 좌하단 LIVE 라인 ── */
  const live = el("div", "", null);
  live.id = "refLive";
  const liveDot = el("i", "", "");
  const liveText = el("b", "", "LIVE");
  const liveTime = el("span", "", "");
  live.append(liveDot, liveText, liveTime);
  ui.append(live);

  /* ── 하단 타임라인 (Weather_Ocean 레퍼런스) — 조명 시각 스크럽 ──
   * 태양 위치는 시각에 대한 결정론적 천문 계산이라 스크럽이 진실을 해치지 않는다.
   * 관측 레이어(구름 등)는 각자의 관측시각을 유지하며 이 바가 예보를 만들지 않는다. */
  const timebar = el("div", "", null);
  timebar.id = "refTimebar";
  const nowBtn = el("button", "", "Now");
  const range = document.createElement("input");
  range.type = "range";
  range.min = "-2880";
  range.max = "2880";
  range.step = "10";
  range.value = "0";
  const timeLabel = el("span", "", "조명 시각 · 지금");
  timebar.append(nowBtn, range, timeLabel);
  ui.append(timebar);

  let scrubOffsetMin = 0;
  function applyScrub() {
    const iso = new Date(Date.now() + scrubOffsetMin * 60000).toISOString();
    try {
      realEarth.setAtmosphereTime?.(iso);
    } catch (_) {}
    timeLabel.textContent = scrubOffsetMin === 0
      ? "조명 시각 · 지금"
      : `조명 시각 · ${scrubOffsetMin > 0 ? "+" : ""}${(scrubOffsetMin / 60).toFixed(1)}h (태양 위치 계산)`;
  }
  range.addEventListener("input", () => {
    scrubOffsetMin = Number(range.value) || 0;
    applyScrub();
  });
  nowBtn.addEventListener("click", () => {
    range.value = "0";
    scrubOffsetMin = 0;
    applyScrub();
  });

  /* ── 주기 갱신: 전부 실제 런타임 값 ── */
  let disposed = false;
  function refresh() {
    if (disposed) return;
    const cloud = coverageRow(realEarth);
    refs.cloud.value.textContent = cloud.value;
    refs.cloud.sub.textContent = cloud.sub;

    const atmos = realEarth.atmosphereLightSnapshot?.();
    if (atmos?.timeIso) {
      refs.atmos.value.textContent = atmos.anchor?.phase || "PHYSICAL";
      refs.atmos.sub.textContent = `산란광 · ${String(atmos.timeIso).slice(11, 16)}Z`;
    } else {
      refs.atmos.value.textContent = "—";
      refs.atmos.sub.textContent = "대기 런타임 대기";
    }

    const terrain = realEarth.terrainTruth?.();
    refs.terrain.value.textContent = terrain ? "3D" : "—";
    refs.terrain.sub.textContent = terrain === "ESRI_TERRAIN3D"
      ? "Esri Terrain3D geometry" : (terrain || "지형 대기");

    const water = realEarth.waterTruth?.();
    refs.ocean.value.textContent = water ? "0m 3D" : "—";
    refs.ocean.sub.textContent = water
      ? "독립 수면 · Fresnel" : "수면 대기";

    liveTime.textContent = `${fmtUtc(new Date())} UTC`;
    setTimeout(refresh, REFRESH_MS);
  }
  refresh();

  window.addEventListener("pagehide", () => {
    disposed = true;
  }, { once: true });

  root.__earthusV2ReferenceHud = Object.freeze({
    contract: "earthus.reference-hud.v1",
    scrubOffsetMinutes: () => scrubOffsetMin,
  });
  return root.__earthusV2ReferenceHud;
}
