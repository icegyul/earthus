import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PNG } from "pngjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prototypeRoot = path.join(root, "prototype");
const out = path.resolve(
  process.env.EARTHUS_V2_VISUAL_OUTPUT ||
    path.join(root, "output/v2-real-living-earth-visual-readpixels"),
);
const moduleRef = process.env.EARTHUS_PLAYWRIGHT_MODULE;
const playwright = moduleRef
  ? await import(pathToFileURL(path.resolve(moduleRef)).href)
  : await import("playwright");
const { chromium } = playwright;
const CLOUD = "https://earthus-cache-kr.s3.us-east-2.amazonaws.com";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function server() {
  return http.createServer(async (req, res) => {
    let p;
    try {
      p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (p.startsWith("/clouds/")) {
      try {
        const r = await fetch(CLOUD + p, { cache: "no-store" }),
          b = Buffer.from(await r.arrayBuffer());
        res
          .writeHead(r.status, {
            "Content-Type":
              r.headers.get("content-type") || "application/octet-stream",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
          })
          .end(b);
      } catch (e) {
        res.writeHead(502).end(String(e));
      }
      return;
    }
    if (p === "/" || p === "/v2" || p === "/v2/") p = "/v2/index.html";
    const f = path.resolve(prototypeRoot, "." + p);
    if (!f.startsWith(prototypeRoot + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(f, (e, b) => {
      if (e) {
        res.writeHead(404).end();
        return;
      }
      res
        .writeHead(200, {
          "Content-Type": MIME[path.extname(f)] || "application/octet-stream",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        })
        .end(b);
    });
  });
}
async function wait(page, fn, ms = 45000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if (await page.evaluate(fn)) return;
    } catch {}
    await page.waitForTimeout(180);
  }
  throw new Error("READPIXELS_VISUAL_WAIT_TIMEOUT");
}
async function settle(page, ms = 2500) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await page.evaluate(() => {
      globalThis.__earthusV2VisualFidelityController?.update?.();
      window.__earthusV2?.viewer?.scene?.requestRender?.();
    });
    await page.waitForTimeout(220);
  }
}
function signal(buf, region = { x0: 0.08, x1: 0.92, y0: 0.06, y1: 0.94 }) {
  const p = PNG.sync.read(buf),
    d = p.data,
    x0 = Math.floor(p.width * region.x0),
    x1 = Math.floor(p.width * region.x1),
    y0 = Math.floor(p.height * region.y0),
    y1 = Math.floor(p.height * region.y1),
    v = [];
  let sum = 0,
    sum2 = 0,
    n = 0,
    dark = 0,
    white = 0,
    chroma = 0,
    edge = 0,
    edgeN = 0;
  const L = (x, y) => {
    const i = (y * p.width + x) * 4;
    return (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
  };
  for (let y = y0; y < y1; y += 2)
    for (let x = x0; x < x1; x += 2) {
      const i = (y * p.width + x) * 4,
        l = L(x, y),
        r = d[i] / 255,
        g = d[i + 1] / 255,
        b = d[i + 2] / 255;
      sum += l;
      sum2 += l * l;
      n++;
      v.push(l);
      chroma += Math.max(r, g, b) - Math.min(r, g, b);
      if (l < 0.02) dark++;
      if (d[i] > 248 && d[i + 1] > 248 && d[i + 2] > 248) white++;
      if (x + 4 < x1 && y + 4 < y1) {
        edge += (Math.abs(l - L(x + 4, y)) + Math.abs(l - L(x, y + 4))) * 0.5;
        edgeN++;
      }
    }
  v.sort((a, b) => a - b);
  const mean = sum / n,
    std = Math.sqrt(Math.max(0, sum2 / n - mean * mean)),
    p10 = v[Math.floor(n * 0.1)] || 0,
    p90 = v[Math.floor(n * 0.9)] || 0;
  return {
    width: p.width,
    height: p.height,
    mean: +mean.toFixed(5),
    std: +std.toFixed(5),
    range: +(p90 - p10).toFixed(5),
    darkRatio: +(dark / n).toFixed(5),
    pureWhiteRatio: +(white / n).toFixed(5),
    chromaMean: +(chroma / n).toFixed(5),
    localEdgeMean: +(edge / Math.max(1, edgeN)).toFixed(5),
  };
}
function gate(
  name,
  m,
  {
    mean = 0.01,
    std = 0.01,
    range = 0.03,
    dark = 0.9,
    white = 0.35,
    chroma = 0,
    edge = 0,
  } = {},
) {
  assert.ok(m.mean >= mean, `${name}:mean:${m.mean}`);
  assert.ok(m.std >= std, `${name}:std:${m.std}`);
  assert.ok(m.range >= range, `${name}:range:${m.range}`);
  assert.ok(m.darkRatio <= dark, `${name}:dark:${m.darkRatio}`);
  assert.ok(m.pureWhiteRatio <= white, `${name}:white:${m.pureWhiteRatio}`);
  assert.ok(m.chromaMean >= chroma, `${name}:chroma:${m.chromaMean}`);
  assert.ok(m.localEdgeMean >= edge, `${name}:edge:${m.localEdgeMean}`);
}
async function state(page) {
  return page.evaluate(() => {
    const r = window.__earthusV2?.realEarth,
      v = window.__earthusV2?.viewer,
      p = v?.camera?.positionCartographic,
      detailMeta = globalThis.__earthusV2UnderwaterDetailMeta,
      detailPrimitive = globalThis.__earthusV2UnderwaterBathymetryPrimitive,
      overviewPrimitive = globalThis.__earthusV2TrenchBathymetryPrimitive;
    return {
      terrain: r?.terrainTruth?.(),
      bathymetry: r?.bathymetryTruth?.(),
      polar: r?.polarTruth?.(),
      polarSources: r?.polarSources?.(),
      polarVisible: r?.polarVisible?.() ?? null,
      polarOpacity: r?.polarOpacity?.() ?? null,
      cloud: r?.cloudFidelity?.(),
      cth: r?.cthTruth?.(),
      cloudDiagnostics: r?.cloudDiagnostics?.(),
      depth: r?.trenchSample?.(),
      trenchMesh: r?.trenchMeshTruth?.(),
      underwaterDetail: detailMeta || null,
      underwaterDetailVisible: detailPrimitive?.show ?? null,
      trenchOverviewVisible: overviewPrimitive?.show ?? null,
      globeShow: v?.scene?.globe?.show ?? null,
      directionalLight:
        !!Cesium.DirectionalLight && v?.scene?.light instanceof Cesium.DirectionalLight,
      height: p?.height ?? null,
      lat: p ? Cesium.Math.toDegrees(p.latitude) : null,
      pitch: v ? Cesium.Math.toDegrees(v.camera.pitch) : null,
      lighting: v?.scene?.globe?.enableLighting,
      tilesLoaded: v?.scene?.globe?.tilesLoaded,
      translucency: v?.scene?.globe?.translucency?.enabled,
      front: v?.scene?.globe?.translucency?.frontFaceAlpha,
      back: v?.scene?.globe?.translucency?.backFaceAlpha,
      imageryStyles: v
        ? Array.from({ length: v.imageryLayers.length }, (_, index) => {
            const layer = v.imageryLayers.get(index);
            const provider = layer?.imageryProvider;
            return {
              url: String(provider?._resource?.url || provider?._url || provider?.url || ""),
              alpha: layer?.alpha ?? null,
              brightness: layer?.brightness ?? null,
              saturation: layer?.saturation ?? null,
              contrast: layer?.contrast ?? null,
              gamma: layer?.gamma ?? null,
            };
          })
        : [],
      badge:
        document.getElementById("earthusV2RealSources")?.textContent || null,
    };
  });
}
async function capture(page, name, metrics) {
  const data = await page.evaluate(() => {
    const v = window.__earthusV2?.viewer;
    if (!v) throw new Error("CESIUM_VIEWER_MISSING");
    const scene = v.scene;
    scene.requestRender();
    scene.render();
    const gl = scene.context?._gl;
    if (!gl) throw new Error("CESIUM_GL_MISSING");
    const w = gl.drawingBufferWidth,
      h = gl.drawingBufferHeight;
    if (!(w > 0 && h > 0)) throw new Error(`CESIUM_GL_SIZE:${w}x${h}`);
    const raw = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    const flipped = new Uint8ClampedArray(raw.length),
      row = w * 4;
    for (let y = 0; y < h; y++)
      flipped.set(raw.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const cx = cv.getContext("2d");
    if (!cx) throw new Error("READPIXELS_2D_CONTEXT_MISSING");
    cx.putImageData(new ImageData(flipped, w, h), 0, 0);
    const u = cv.toDataURL("image/png");
    return u.slice(u.indexOf(",") + 1);
  });
  const buf = Buffer.from(data, "base64");
  fs.writeFileSync(path.join(out, name + ".png"), buf);
  metrics[name] =
    name === "01-earth"
      ? signal(buf, { x0: 0.3, x1: 0.7, y0: 0.12, y1: 0.88 })
      : signal(buf);
  if (name === "01b-polar")
    metrics[name + "-center"] = signal(buf, {
      x0: 0.34,
      x1: 0.66,
      y0: 0.22,
      y1: 0.78,
    });
  if (name === "02-clouds")
    metrics[name + "-center"] = signal(buf, {
      x0: 0.25,
      x1: 0.75,
      y0: 0.18,
      y1: 0.82,
    });
  if (name === "03-trench")
    metrics[name + "-center"] = signal(buf, {
      x0: 0.22,
      x1: 0.78,
      y0: 0.15,
      y1: 0.88,
    });
  if (name === "04-underwater")
    metrics[name + "-center"] = signal(buf, {
      x0: 0.16,
      x1: 0.84,
      y0: 0.12,
      y1: 0.9,
    });
  return state(page);
}

async function captureUntil(page, name, metrics, assertion, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  let lastError = null;
  do {
    lastState = await capture(page, name, metrics);
    try {
      assertion();
      return lastState;
    } catch (error) {
      lastError = error;
    }
    await settle(page, 850);
  } while (Date.now() < deadline);
  throw lastError || new Error(`${name}:VISUAL_SETTLE_TIMEOUT`);
}

fs.mkdirSync(out, { recursive: true });
const s = server();
await new Promise((r) => s.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
  ],
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});
page.setDefaultTimeout(130000);
const states = {},
  metrics = {},
  errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
try {
  console.log("READPIXELS STAGE earth");
  await page.goto(`http://127.0.0.1:${s.address().port}/v2/`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await wait(
    page,
    () =>
      document.documentElement.dataset.c === "1" &&
      !!window.__earthusV2?.realEarth,
    60000,
  );
  await wait(
    page,
    () => !!globalThis.__earthusV2VisualFidelityController,
    50000,
  );
  globalThis.__earthusV2VisualFidelityController?.update?.();
  await settle(page, 4200);
  states.earth = await captureUntil(page, "01-earth", metrics, () =>
    gate("earth", metrics["01-earth"], {
      mean: 0.02,
      std: 0.025,
      range: 0.07,
      dark: 0.93,
      chroma: 0.006,
      edge: 0.0025,
    }),
  );
  assert.equal(states.earth.terrain, "ESRI_TERRAIN3D");
  assert.equal(states.earth.bathymetry, "ESRI_TOPOBATHY3D");
  assert.equal(
    states.earth.polar,
    "NASA_GIBS_POLAR_STEREOGRAPHIC_HOLE_FILL_IMAGERY_ONLY",
  );
  assert.equal(states.earth.polarVisible, false);
  assert.equal(states.earth.polarOpacity, 0);
  assert.deepEqual(
    new Set(states.earth.polarSources?.map((x) => x.epsg)),
    new Set(["EPSG:3413", "EPSG:3031"]),
  );
  assert.ok(
    states.earth.polarSources?.every(
      (x) => x.geometryClass === "GEODETIC_MESH_WITH_POLAR_STEREOGRAPHIC_UV",
    ),
  );
  console.log("READPIXELS STAGE polar");
  await page.evaluate(() => {
    const v = window.__earthusV2.viewer;
    v.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(0, 89.15, 2_200_000),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
    });
    v.scene.requestRender();
    globalThis.__earthusV2VisualFidelityController?.update?.();
  });
  await settle(page, 3500);
  states.polar = await captureUntil(page, "01b-polar", metrics, () => {
    gate("polar", metrics["01b-polar"], {
      mean: 0.02,
      std: 0.02,
      range: 0.06,
      dark: 0.92,
      edge: 0.002,
    });
    gate("polar-center", metrics["01b-polar-center"], {
      mean: 0.02,
      std: 0.008,
      range: 0.02,
      dark: 0.55,
      edge: 0.0015,
    });
  });
  assert.equal(states.polar.polarVisible, true);
  assert.equal(states.polar.polarOpacity, 1);
  console.log("READPIXELS STAGE clouds");
  await page.evaluate(() => window.__earthusV2.realEarth.enterEarth());
  const ca = await page.evaluate(async () => {
    const m = await (
        await fetch("/clouds/gk2a/cth/manifest.json", { cache: "no-cache" })
      ).json(),
      result = await Promise.race([
        window.__earthusV2.realEarth.showBestCloud3d(),
        new Promise((r) => setTimeout(() => r("CLIENT_TIMEOUT"), 55000)),
      ]);
    globalThis.__earthusV2VisualFidelityController?.update?.();
    return { m, result, diag: window.__earthusV2.realEarth.cloudDiagnostics() };
  });
  states.cloudAttempt = ca;
  assert.equal(ca.m.ready, true);
  assert.equal(ca.m.synthetic, false);
  assert.equal(ca.m.truthClass, "OBSERVED_DERIVED_OFFICIAL_L2");
  assert.ok(["GLOBAL_LAYERED", "VOLUME", "LAYERED", "CTH_RELIEF"].includes(ca.result), JSON.stringify(ca));
  await settle(page, 2500);
  states.clouds = await captureUntil(page, "02-clouds", metrics, () => {
    gate("clouds", metrics["02-clouds"], {
      mean: 0.02,
      std: 0.025,
      range: 0.07,
      dark: 0.8,
      white: 0.18,
      chroma: 0.025,
      edge: 0.0025,
    });
    gate("clouds-center", metrics["02-clouds-center"], {
      mean: 0.02,
      std: 0.018,
      range: 0.05,
      dark: 0.8,
      white: 0.22,
      edge: 0.002,
    });
  });
  assert.notEqual(
    states.clouds.cloud,
    "SHELL",
    JSON.stringify(states.clouds.cloudDiagnostics),
  );
  if (states.clouds.cloud === "CTH_RELIEF") {
    assert.equal(
      states.clouds.cth?.renderModel,
      "ACTUAL_CTH_VERTICES_WITH_TRANSPARENT_NEIGHBOUR_SUPPORT_NO_VERTICAL_EXAGGERATION",
    );
    assert.ok(states.clouds.cth?.mesh?.triangleCount > 100);
    assert.ok(states.clouds.cth?.mesh?.actualCthVertexCount > 100);
    assert.ok(states.clouds.cth?.mesh?.cloudCoverage > 0);
  }
  console.log("READPIXELS STAGE trench");
  const trenchEntered = await page.evaluate(() =>
    window.__earthusV2.realEarth.enterTrench(),
  );
  assert.equal(trenchEntered, true);
  await wait(
    page,
    () =>
      window.__earthusV2.realEarth.trenchMeshTruth?.()?.truthClass ===
      "ESRI_TOPOBATHY3D_SAMPLED_SEAFLOOR_MESH",
    90000,
  );
  await page.evaluate(() =>
    globalThis.__earthusV2VisualFidelityController?.update?.(),
  );
  await settle(page, 3200);
  states.trench = await captureUntil(page, "03-trench", metrics, () => {
    gate("trench", metrics["03-trench"], {
      mean: 0.025,
      std: 0.02,
      range: 0.06,
      dark: 0.78,
      chroma: 0.006,
      edge: 0.0035,
    });
    gate("trench-center", metrics["03-trench-center"], {
      mean: 0.022,
      std: 0.017,
      range: 0.05,
      dark: 0.8,
      chroma: 0.015,
      edge: 0.003,
    });
  });
  assert.equal(states.trench.terrain, "ESRI_TOPOBATHY3D");
  assert.ok(states.trench.depth?.depthM > 8000);
  assert.equal(
    states.trench.trenchMesh?.truthClass,
    "ESRI_TOPOBATHY3D_SAMPLED_SEAFLOOR_MESH",
  );
  assert.equal(states.trench.trenchMesh?.synthetic, false);
  assert.equal(states.trench.trenchMesh?.verticalExaggeration, 1);
  assert.equal(
    states.trench.trenchMesh?.appearanceToneMap?.class,
    "SOURCE_LUMINANCE_AND_SATURATION_GRADE_ONLY",
  );
  assert.ok(
    states.trench.trenchMesh?.grid?.nx >= 81 &&
      states.trench.trenchMesh?.grid?.ny >= 65,
    JSON.stringify(states.trench.trenchMesh?.grid),
  );
  assert.ok(states.trench.trenchMesh?.deepestM > 8000);
  assert.ok(states.trench.trenchMesh?.triangleCount > 9000);
  console.log("READPIXELS STAGE underwater");
  const underwaterEntered = await page.evaluate(() =>
    window.__earthusV2.realEarth.enterUnderwater(),
  );
  assert.equal(underwaterEntered, true);
  await wait(
    page,
    () =>
      Number(window.__earthusV2.viewer.camera.positionCartographic.height) <
      -500,
    70000,
  );
  await wait(
    page,
    () =>
      globalThis.__earthusV2UnderwaterDetailMeta?.role ===
        "underwater-detail" &&
      globalThis.__earthusV2UnderwaterBathymetryPrimitive?.show === true &&
      window.__earthusV2.viewer.scene.globe.show === false,
    120000,
  );
  await page.evaluate(() =>
    globalThis.__earthusV2VisualFidelityController?.update?.(),
  );
  await settle(page, 4800);
  states.underwater = await captureUntil(page, "04-underwater", metrics, () => {
    gate("underwater", metrics["04-underwater"], {
      mean: 0.012,
      std: 0.012,
      range: 0.035,
      dark: 0.88,
      chroma: 0.012,
      edge: 0.003,
    });
    gate("underwater-center", metrics["04-underwater-center"], {
      mean: 0.01,
      std: 0.01,
      range: 0.025,
      dark: 0.9,
      chroma: 0.009,
      edge: 0.0025,
    });
  });
  assert.equal(states.underwater.terrain, "ESRI_TOPOBATHY3D");
  assert.ok(states.underwater.height < -500);
  assert.equal(states.underwater.globeShow, false);
  assert.equal(states.underwater.underwaterDetailVisible, true);
  assert.equal(states.underwater.trenchOverviewVisible, false);
  assert.equal(states.underwater.directionalLight, true);
  assert.equal(
    states.underwater.underwaterDetail?.truthClass,
    "ESRI_TOPOBATHY3D_SAMPLED_SEAFLOOR_MESH",
  );
  assert.equal(states.underwater.underwaterDetail?.role, "underwater-detail");
  assert.equal(states.underwater.underwaterDetail?.synthetic, false);
  assert.equal(states.underwater.underwaterDetail?.verticalExaggeration, 1);
  assert.ok(
    states.underwater.underwaterDetail?.grid?.nx >= 97 &&
      states.underwater.underwaterDetail?.grid?.ny >= 79,
  );
  assert.ok(states.underwater.underwaterDetail?.spacing?.eastWestM < 1800);
  assert.ok(states.underwater.underwaterDetail?.spacing?.northSouthM < 1800);
  assert.ok(states.underwater.underwaterDetail?.triangleCount > 14000);
  assert.equal(states.underwater.translucency, true);
  assert.equal(states.underwater.front, 1);
  assert.equal(states.underwater.back, 1);
  assert.equal(errors.length, 0, errors.join("\n"));
  fs.writeFileSync(
    path.join(out, "state.json"),
    JSON.stringify({ ok: true, states, metrics, errors }, null, 2),
  );
  console.log("V2 REAL LIVING EARTH READPIXELS VISUAL: PASS");
} catch (e) {
  try {
    states.failure = await state(page);
  } catch {}
  fs.writeFileSync(
    path.join(out, "state.json"),
    JSON.stringify(
      { ok: false, error: String(e?.stack || e), states, metrics, errors },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => s.close(r));
}
