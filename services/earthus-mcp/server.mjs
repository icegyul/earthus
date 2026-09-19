#!/usr/bin/env node
// EARTHUS MCP 서버 — 읽기 전용 도구 3개 (계약 §I MCP · MASTER DECISION §6 M-MCP · 2026-09-20)
//
// ⚠️⚠️ 아직 공개하지 않는다. 계약: "P3 뒤 · PD 승인 조건부 · 9/30 이후". 미결정 D-A·D-B·D-C·D-E·D-H 와
//    법률 확인(기상법 예보 발표 제한 · 공공누리 재배포 범위 · MCP 이용 기록의 위치정보 처리)이 끝나기 전에는
//    원격 끝점으로 올리지 않는다. 지금은 PD 가 자기 기기(Claude Desktop 등)에서 stdio 로 붙여 보는 용도다.
//
// 불변식 (계약 §A·§B·§D)
//   · 도구는 **읽기만** 한다. 계산하지 않고, 시뮬레이션을 실행하지 않고, 쓰지 않는다.
//     외부 AI 는 EARTHUS 를 부를 수 있다 — 계산은 EARTHUS 엔진이 이미 해 둔 것을 돌려줄 뿐이다.
//   · 값은 EARTHUS 가 이미 공개한 파일(earthus.net)의 것 그대로다. 요약·재서술하지 않는다.
//   · 인텔 패킷은 서술자에게 넘기는 모양(§C-1)으로만 — confidence 는 등급만, 빠진 절은 이름만.
//   · 모든 응답에 출처·시각·'공식 경보 아님'을 붙인다. 특보 도구는 D-H 결정 전이라 **넣지 않았다.**
//
// 도구
//   earthus_capabilities       — 현상별 시뮬레이션 능력(available/limited/not_available + 이유·지역 한 줄)
//   earthus_typhoon_intel      — 진행 중 태풍의 인텔 패킷 v1(서술자 모양). 패킷이 없으면 없다고
//   earthus_explain_evidence   — 배지 10종의 뜻과 '하지 말 것'
//
// 실행: node services/earthus-mcp/server.mjs   (stdio, JSON-RPC 2.0 · 한 줄에 메시지 하나)
// 시험: EARTHUS_MCP_FIXTURE_DIR=<dir> 이면 네트워크 대신 그 폴더의 파일을 읽는다.

import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const HERE = new URL('.', import.meta.url);
const ROOT = new URL('../../', HERE);
const { SIM_CAPABILITIES } = await import(new URL('prototype/v2-three/js/sim-questions.js', ROOT));
const { KIND_INFO } = await import(new URL('prototype/v2-three/js/evidence-popover.js', ROOT));
const VOCAB = JSON.parse(readFileSync(new URL('aws/_shared/contracts/intel-vocab.json', ROOT), 'utf8'));

export const PROTOCOL_VERSION = '2025-06-18';
const BASE = process.env.EARTHUS_MCP_BASE || 'https://earthus.net';
const FIXTURE_DIR = process.env.EARTHUS_MCP_FIXTURE_DIR || null;
const NOTICE = {
  ko: 'EARTHUS 가 이미 공개한 자료를 그대로 돌려줍니다. 이 도구는 계산·예보를 하지 않으며 공식 경보가 아닙니다. 행동은 기관 발표를 따르세요.',
  en: 'Returns data EARTHUS has already published, as is. This tool does not compute or forecast and is not an official warning. Follow agency guidance for any action.',
};

async function getJson(path) {
  if (FIXTURE_DIR) return JSON.parse(readFileSync(join(FIXTURE_DIR, path.replace(/^\//, '').replace(/\//g, '__')), 'utf8'));
  const r = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': 'earthus-mcp/0.1' } });
  if (!r.ok) throw new Error(`${path} HTTP ${r.status}`);
  return r.json();
}

// §C-1 서술자 모양 — intel_contract.narrator_view 와 같은 규칙(confidence 는 등급만, missing 은 이름만).
export function narratorView(packet) {
  if (!packet || packet.schema !== 1) return null;
  const out = {};
  for (const [k, v] of Object.entries(packet)) {
    if (k === 'coverage' || k === 'confidence') continue;
    out[k] = v;
  }
  if (packet.confidence && VOCAB.CONFIDENCE_GRADE.includes(packet.confidence.grade)) out.confidence = { grade: packet.confidence.grade };
  out.missingSections = ((packet.coverage || {}).missing || []).map((m) => m.section).sort();
  return out;
}

export const TOOLS = [
  {
    name: 'earthus_capabilities',
    description: 'EARTHUS 현상별 시뮬레이션 능력표(읽기 전용). status 는 available(기록 남는 검증된 계산) · limited(기관 인용·장면) · not_available(엔진 없음, 이유 동봉). 지역 한 줄은 어디서 되는지 말한다.',
    inputSchema: { type: 'object', properties: { phenomenonId: { type: 'string', description: '예: hazards.tsunami. 없으면 전부' } }, additionalProperties: false },
  },
  {
    name: 'earthus_typhoon_intel',
    description: '진행 중 태풍의 EARTHUS 인텔 패킷(v1) — 기관 실황·변화·함께 나타난 조건·기관 예보 인용·출처. 원인 주장·확률·EARTHUS 예보가 아니다. 패킷이 없는 사건은 없다고 답한다.',
    inputSchema: { type: 'object', properties: { eventId: { type: 'string', description: '예: cyclone:1001322. 없으면 진행 중 사건 목록' } }, additionalProperties: false },
  },
  {
    name: 'earthus_explain_evidence',
    description: 'EARTHUS 배지(EVIDENCE_KIND 10종)의 뜻과 그 값으로 하지 말아야 할 것.',
    inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: VOCAB.EVIDENCE_KIND } }, additionalProperties: false },
  },
];

async function callTool(name, args = {}) {
  if (name === 'earthus_capabilities') {
    const pick = args.phenomenonId ? { [args.phenomenonId]: SIM_CAPABILITIES[args.phenomenonId] } : SIM_CAPABILITIES;
    if (args.phenomenonId && !SIM_CAPABILITIES[args.phenomenonId]) {
      return { notice: NOTICE, phenomenonId: args.phenomenonId, status: null, reason: '능력표에 없는 현상 — 시뮬레이션 질문이 없다' };
    }
    const rows = Object.entries(pick).map(([id, e]) => ({
      phenomenonId: id, status: e.status, engineRef: e.engineRef || null, regions: e.regions || null,
      questions: e.questions.map((q) => ({ id: q.id, ko: q.ko, en: q.en, status: q.status, reasonKo: q.reasonKo || null, reasonEn: q.reasonEn || null })),
    }));
    return { notice: NOTICE, source: 'prototype/v2-three/js/sim-questions.js', capabilities: rows };
  }
  if (name === 'earthus_typhoon_intel') {
    const idx = await getJson('/ocean/cyclone-events.json');
    if (!args.eventId) {
      return { notice: NOTICE, source: `${BASE}/ocean/cyclone-events.json`, generated: idx.generated,
        events: (idx.events || []).map((e) => ({ eventId: e.eventId, name: e.name, status: e.status, lastRevisionAt: e.lastRevisionAt })) };
    }
    const id = String(args.eventId).replace(/^cyclone:/, '');
    if (!/^\d+$/.test(id)) return { notice: NOTICE, eventId: args.eventId, intel: null, reason: '사건 id 모양이 아니다(cyclone:<숫자>)' };
    const doc = await getJson(`/ocean/cyclone-events/${id}.json`);
    const view = narratorView(doc.intel);
    return { notice: NOTICE, source: `${BASE}/ocean/cyclone-events/${id}.json`, eventId: doc.eventId, name: doc.name,
      intel: view, reason: view ? null : '이 사건에는 인텔 패킷이 아직 없다(v1 계약을 통과한 패킷만 싣는다)' };
  }
  if (name === 'earthus_explain_evidence') {
    const kinds = args.kind ? [args.kind] : VOCAB.EVIDENCE_KIND;
    return { notice: NOTICE, kinds: kinds.filter((k) => KIND_INFO[k]).map((k) => ({ kind: k, ko: KIND_INFO[k].ko, en: KIND_INFO[k].en })) };
  }
  throw Object.assign(new Error(`모르는 도구: ${name}`), { code: -32602 });
}

export async function handle(msg) {
  const { id, method, params } = msg || {};
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  try {
    if (method === 'initialize') {
      return ok({ protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'earthus', version: '0.1.0-local' },
        instructions: NOTICE.ko });
    }
    if (method === 'notifications/initialized' || (method && method.startsWith('notifications/'))) return null;
    if (method === 'ping') return ok({});
    if (method === 'tools/list') return ok({ tools: TOOLS });
    if (method === 'tools/call') {
      const result = await callTool(params && params.name, (params && params.arguments) || {});
      return ok({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: false });
    }
    return err(-32601, `지원하지 않는 메서드: ${method}`);
  } catch (e) {
    if (method === 'tools/call') {
      return ok({ content: [{ type: 'text', text: `실패: ${e.message}` }], isError: true });
    }
    return err(e.code || -32603, e.message);
  }
}

// stdio 로 돌 때만 — 시험은 handle() 을 직접 부른다.
// ⚠️ 저장소 경로에 '##' 이 있다 — 'file://' 문자열을 손으로 만들면 '#' 가 조각(fragment)으로 읽혀 경로가 잘린다.
//    pathToFileURL 이 '#' 를 %23 으로 바꿔 준다.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && !process.env.EARTHUS_MCP_NO_STDIO) {
  const rl = createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch (_) {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })}\n`);
      return;
    }
    const res = await handle(msg);
    if (res) process.stdout.write(`${JSON.stringify(res)}\n`);
  });
}
