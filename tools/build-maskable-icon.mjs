#!/usr/bin/env node
// maskable 512 아이콘 만들기 (2026-09-24, 지시서 §3-7 · Phase 1 '전용 maskable 아이콘')
//
//   node tools/build-maskable-icon.mjs            → prototype/icon-maskable-512.png
//   (playwright 가 이 저장소 node_modules 에 없으면 EARTHUS_NODE_MODULES=<경로> 로 알려 준다)
//
// ⚠️ 새로 그리지 않는다(기억 brand-assets-v5-only). 정본 v5 SVG(prototype/logo/earthus-appicon.svg)를
//    **그대로** 512×512 로 래스터화하고, SVG 의 둥근 모서리 밖만 SVG 안의 배경색(#0A0A0A)으로 채운다.
//    maskable 은 가장자리까지 배경이 차야 한다 — 지금 icon-512.png 는 모서리가 투명해 런처가 깎으면 검은 틈이 난다.
// ⚠️ 모노그램은 120 격자에서 x 29→91, y 27→93(clip) — 중심에서 가장 먼 점이 약 46 으로, maskable 안전 원(반지름 48 = 40%)
//    안에 든다. 그래서 크기를 줄이지 않고 원본 비율 그대로 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = process.env.EARTHUS_NODE_MODULES || path.join(REPO, 'node_modules');
const { chromium } = createRequire(nm.endsWith(path.sep) ? nm : nm + path.sep)('playwright');

const svgPath = path.join(REPO, 'prototype', 'logo', 'earthus-appicon.svg');
const out = path.join(REPO, 'prototype', 'icon-maskable-512.png');
const svg = fs.readFileSync(svgPath, 'utf8');
const bg = (svg.match(/<rect[^>]*fill="(#[0-9A-Fa-f]{6})"/) || [])[1];
if (!bg) throw new Error('배경색을 SVG 에서 못 읽었다 — 정본 SVG 가 바뀌었는지 확인');

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  await page.setContent(`<!doctype html><html><body style="margin:0;background:${bg}">`
    + `<img src="${dataUrl}" width="512" height="512" style="display:block"></body></html>`);
  await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 512, height: 512 } });
  console.log(`wrote ${path.relative(REPO, out)} (bg ${bg}, from ${path.relative(REPO, svgPath)})`);
} finally {
  await browser.close();
}
