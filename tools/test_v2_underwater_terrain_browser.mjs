import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  prototypeRoot = path.join(root, "prototype"),
  out = path.resolve(
    process.env.EARTHUS_V2_UNDERWATER_OUTPUT ||
      path.join(root, "output/v2-underwater-terrain-visual"),
  ),
  moduleRef = process.env.EARTHUS_PLAYWRIGHT_MODULE;
const { chromium } = moduleRef
  ? await import(pathToFileURL(path.resolve(moduleRef)).href)
  : await import("playwright");
const pngModuleRef = process.env.EARTHUS_PNGJS_MODULE;
const { PNG } = pngModuleRef
  ? await import(pathToFileURL(path.resolve(pngModuleRef)).href)
  : await import("pngjs");
const CLOUD = "https://earthus-cache-kr.s3.us-east-2.amazonaws.com",
  MIME = {
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
    fs.readFile(f, (e, b) =>
      e
        ? res.writeHead(404).end()
        : res
            .writeHead(200, {
              "Content-Type":
                MIME[path.extname(f)] || "application/octet-stream",
              "Cache-Control": "no-store",
              "Access-Control-Allow-Origin": "*",
            })
            .end(b),
    );
  });
}
async function wait(page, fn, ms = 120000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if (await page.evaluate(fn)) return true;
    } catch {}
    await page.waitForTimeout(180);
  }
  throw new Error("UNDERWATER_VISUAL_WAIT_TIMEOUT");
}
async function pixels(page) {
  const b64 = await page.evaluate(() => {
    const v = window.__earthusV2?.viewer,
      s = v?.scene;
    if (!s) throw new Error("SCENE_MISSING");
    globalThis.__earthusV2VisualFidelityController?.update?.();
    s.requestRender();
    s.render();
    const gl = s.context?._gl,
      w = gl?.drawingBufferWidth,
      h = gl?.drawingBufferHeight;
    if (!(w > 0 && h > 0)) throw new Error("GL_MISSING");
    const raw = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    const flipped = new Uint8ClampedArray(raw.length),
      row = w * 4;
    for (let y = 0; y < h; y++)
      flipped.set(raw.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    cv.getContext("2d").putImageData(new ImageData(flipped, w, h), 0, 0);
    return cv.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(b64, "base64");
}
function metric(buf, region = { x0: 0.08, x1: 0.92, y0: 0.06, y1: 0.94 }) {
  const p = PNG.sync.read(buf),
    d = p.data,
    x0 = Math.floor(p.width * region.x0),
    x1 = Math.floor(p.width * region.x1),
    y0 = Math.floor(p.height * region.y0),
    y1 = Math.floor(p.height * region.y1),
    vals = [];
  let n = 0,
    sum = 0,
    sum2 = 0,
    dark = 0,
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
      n++;
      sum += l;
      sum2 += l * l;
      vals.push(l);
      chroma += Math.max(r, g, b) - Math.min(r, g, b);
      if (l < 0.02) dark++;
      if (x + 4 < x1 && y + 4 < y1) {
        edge += (Math.abs(l - L(x + 4, y)) + Math.abs(l - L(x, y + 4))) * 0.5;
        edgeN++;
      }
    }
  vals.sort((a, b) => a - b);
  const mean = sum / n,
    std = Math.sqrt(Math.max(0, sum2 / n - mean * mean)),
    p10 = vals[Math.floor(vals.length * 0.1)] || 0,
    p90 = vals[Math.floor(vals.length * 0.9)] || 0;
  return {
    mean,
    std,
    range: p90 - p10,
    darkRatio: dark / n,
    chromaMean: chroma / n,
    localEdgeMean: edge / Math.max(1, edgeN),
  };
}
function gate(name, m, { mean, std, range, dark, chroma, edge }) {
  assert.ok(m.mean >= mean, `${name}:mean:${m.mean}`);
  assert.ok(m.std >= std, `${name}:std:${m.std}`);
  assert.ok(m.range >= range, `${name}:range:${m.range}`);
  assert.ok(m.darkRatio <= dark, `${name}:dark:${m.darkRatio}`);
  assert.ok(m.chromaMean >= chroma, `${name}:chroma:${m.chromaMean}`);
  assert.ok(m.localEdgeMean >= edge, `${name}:edge:${m.localEdgeMean}`);
}
fs.mkdirSync(out, { recursive: true });
const srv = server();
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.EARTHUS_CHROMIUM_EXECUTABLE || undefined,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(160000);
const state = {};
try {
  await page.goto(`http://127.0.0.1:${srv.address().port}/v2/`, {
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
  state.entered = await page.evaluate(() =>
    window.__earthusV2.realEarth.enterUnderwater(),
  );
  assert.equal(state.entered, true);
  await wait(
    page,
    () =>
      window.__earthusV2.realEarth.terrainTruth?.() === "ESRI_TOPOBATHY3D" &&
      Number(window.__earthusV2.viewer.camera.positionCartographic.height) <
        -500,
    90000,
  );
  await wait(
    page,
    () =>
      globalThis.__earthusV2UnderwaterDetailMeta?.role ===
        "underwater-detail" &&
      globalThis.__earthusV2UnderwaterDetailMeta?.grid?.nx >= 129 &&
      globalThis.__earthusV2UnderwaterBathymetryPrimitive?.show === true &&
      window.__earthusV2.viewer.scene.globe.show === false,
    150000,
  );
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => {
      globalThis.__earthusV2VisualFidelityController?.update?.();
      window.__earthusV2.viewer.scene.requestRender();
    });
    await page.waitForTimeout(550);
  }
  const buf = await pixels(page);
  fs.writeFileSync(path.join(out, "underwater.png"), buf);
  state.metrics = {
    full: metric(buf),
    center: metric(buf, { x0: 0.16, x1: 0.84, y0: 0.12, y1: 0.9 }),
  };
  state.runtime = await page.evaluate(() => {
    const r = window.__earthusV2.realEarth,
      v = window.__earthusV2.viewer,
      g = v.scene.globe,
      overview = globalThis.__earthusV2TrenchBathymetryPrimitive,
      detail = globalThis.__earthusV2UnderwaterBathymetryPrimitive,
      detailMeta = globalThis.__earthusV2UnderwaterDetailMeta;
    return {
      terrain: r.terrainTruth(),
      height: v.camera.positionCartographic.height,
      pitch: Cesium.Math.toDegrees(v.camera.pitch),
      globeShow: g.show,
      directionalLight:
        !!Cesium.DirectionalLight &&
        v.scene.light instanceof Cesium.DirectionalLight,
      overviewVisible: overview?.show ?? null,
      detailVisible: detail?.show ?? null,
      translucency: g.translucency.enabled,
      front: g.translucency.frontFaceAlpha,
      back: g.translucency.backFaceAlpha,
      overviewMesh: r.trenchMeshTruth?.(),
      underwaterDetail: detailMeta,
      sample: r.trenchSample?.(),
      ocean: r.oceanSurfaceSnapshot?.() || null,
      atmosphere: r.atmosphereLightSnapshot?.() || null,
    };
  });
  assert.equal(state.runtime.terrain, "ESRI_TOPOBATHY3D");
  assert.ok(state.runtime.height < -500);
  assert.equal(state.runtime.globeShow, false);
  assert.equal(state.runtime.directionalLight, true);
  assert.equal(state.runtime.overviewVisible, false);
  assert.equal(state.runtime.detailVisible, true);
  assert.equal(state.runtime.translucency, true);
  assert.equal(state.runtime.front, 1);
  assert.equal(state.runtime.back, 1);
  assert.equal(state.runtime.ocean?.visible, false);
  assert.equal(state.runtime.atmosphere?.mode, "UNDERWATER");
  assert.equal(state.runtime.atmosphere?.atmosphere?.show, false);
  assert.equal(state.runtime.atmosphere?.cityLights?.show, false);
  assert.equal(
    state.runtime.underwaterDetail?.truthClass,
    "ESRI_TOPOBATHY3D_SAMPLED_SEAFLOOR_MESH",
  );
  assert.equal(state.runtime.underwaterDetail?.role, "underwater-detail");
  assert.equal(state.runtime.underwaterDetail?.synthetic, false);
  assert.equal(state.runtime.underwaterDetail?.verticalExaggeration, 1);
  assert.ok(state.runtime.underwaterDetail?.grid?.nx >= 193);
  assert.ok(state.runtime.underwaterDetail?.grid?.ny >= 157);
  assert.ok(state.runtime.underwaterDetail?.spacing?.eastWestM < 650);
  assert.ok(state.runtime.underwaterDetail?.spacing?.northSouthM < 650);
  assert.ok(state.runtime.underwaterDetail?.triangleCount > 59000);
  assert.ok(
    state.runtime.underwaterDetail?.appearanceToneMap?.hillshadeAlpha >= 0.35,
  );
  assert.ok(
    state.runtime.underwaterDetail?.appearanceToneMap?.targetMean >= 0.17,
  );
  gate("underwater", state.metrics.full, {
    mean: 0.06,
    std: 0.04,
    range: 0.1,
    dark: 0.3,
    chroma: 0.08,
    edge: 0.003,
  });
  gate("underwater-center", state.metrics.center, {
    mean: 0.055,
    std: 0.035,
    range: 0.09,
    dark: 0.35,
    chroma: 0.08,
    edge: 0.0025,
  });
  fs.writeFileSync(
    path.join(out, "state.json"),
    JSON.stringify({ ok: true, ...state }, null, 2),
  );
  console.log(
    "V2 SUB-KILOMETER REAL UNDERWATER DETAIL VISUAL: PASS",
    JSON.stringify(state),
  );
} catch (error) {
  fs.writeFileSync(
    path.join(out, "state.json"),
    JSON.stringify(
      { ok: false, error: String(error?.stack || error), ...state },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
  await new Promise((r) => srv.close(r));
}
