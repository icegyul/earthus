// EARTHUS 새 탭 확장 아이콘 — v5 정본 SVG 를 크기만 맞춰 PNG 로 굽는다 (2026-09-24 · 지시서 §4-3 · §4-7)
//
// ⚠️ 로고를 새로 그리지 않는다(기억 brand-assets-v5-only). prototype/logo/earthus-appicon.svg 를 <img> 로 그대로 띄우고
//   Playwright 요소 스크린샷으로 찍는다 — 선·비율은 원본 SVG 그대로다.
//   · 16/32/48: 캔버스 전체에 원본 아이콘(검은 둥근 사각 + 흰 모노그램).
//   · 128: CWS 규격 '그림 96 + 사방 여백 16'(지시서 §4-7 images, 읽음) — 투명 여백 안에 96 px 로.
//   16 px 에서 선 두께는 6.07/120×16 ≈ 0.8 px(지시서 추정과 같음) — 흐리게 보일 수 있다. PD 눈 확인 대상이다.
//
// 실행: node tools/build-chrome-ext-icons.mjs  (Playwright 는 저장소 루트 node_modules 를 쓴다 — 배포와 무관한 로컬 굽기)
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const nm = process.env.EARTHUS_NODE_MODULES || 'D:/## APP/EARTHUS v2_APP/node_modules/';
const { chromium } = createRequire(nm.endsWith('/') ? nm : nm + '/')('playwright');

const svg = readFileSync(path.join(repo, 'prototype/logo/earthus-appicon.svg'), 'utf8');
const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const outDir = path.join(repo, 'apps/chrome-newtab/icons');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
try {
  for (const size of [16, 32, 48, 128]) {
    const art = size === 128 ? 96 : size;
    const pad = (size - art) / 2;
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
      <div id="box" style="width:${size}px;height:${size}px;position:relative">
        <img id="i" src="${dataUrl}" width="${art}" height="${art}" style="position:absolute;left:${pad}px;top:${pad}px">
      </div></body></html>`);
    await page.waitForFunction(() => document.getElementById('i').complete);
    await page.locator('#box').screenshot({ path: path.join(outDir, `${size}.png`), omitBackground: true });
    await page.close();
    console.log(`icons/${size}.png  (그림 ${art}px)`);
  }
} finally {
  await browser.close();
}
