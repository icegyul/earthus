// MCP (계약 §I 마지막 단계 · 로컬 전용) — 읽기 전용 도구 3개. 공개 전(D-A~D-H·법률 확인 대기).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIX = fileURLToPath(new URL('./fixtures/mcp/', import.meta.url));
process.env.EARTHUS_MCP_FIXTURE_DIR = FIX;
process.env.EARTHUS_MCP_NO_STDIO = '1';
const mcp = await import('../../services/earthus-mcp/server.mjs');
const SERVER = fileURLToPath(new URL('../../services/earthus-mcp/server.mjs', import.meta.url));
const src = readFileSync(SERVER, 'utf8');
const call = async (name, args = {}) => {
  const r = await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  return { isError: r.result.isError, body: r.result.isError ? r.result.content[0].text : JSON.parse(r.result.content[0].text) };
};

test('도구는 셋이고 전부 읽기 전용이다 — 실행·요청·특보 도구 없음', async () => {
  const r = await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.deepEqual(r.result.tools.map((t) => t.name).sort(), ['earthus_capabilities', 'earthus_explain_evidence', 'earthus_typhoon_intel']);
  assert.ok(!r.result.tools.some((t) => /run|request|simulate|warn/i.test(t.name)), 'D-H 전에는 특보, 계약상 실행 도구는 없다');
  assert.ok(!/writeFile|put_object|PutObject|method: 'POST'/.test(src), '쓰지 않는다');
});

test('능력표는 레지스트리 그대로 — 쓰나미만 available, 기온은 이유와 함께 not_available', async () => {
  const { body } = await call('earthus_capabilities');
  const by = Object.fromEntries(body.capabilities.map((c) => [c.phenomenonId, c]));
  assert.equal(by['hazards.tsunami'].status, 'available');
  assert.match(by['hazards.tsunami'].regions.ko, /^✅ 계산됨/);
  assert.equal(by['weather.temperature'].status, 'not_available');
  assert.match(by['weather.temperature'].questions[0].reasonKo, /기관 발표를 인용/);
  assert.match(body.notice.ko, /공식 경보가 아닙니다/);
  const none = (await call('earthus_capabilities', { phenomenonId: 'weather.uv' })).body;
  assert.equal(none.status, null);
});

test('태풍 인텔은 서술자 모양 — confidence 는 등급만, 빠진 절은 이름만', async () => {
  const list = (await call('earthus_typhoon_intel')).body;
  assert.equal(list.events[0].eventId, 'cyclone:1001322');
  const { body } = await call('earthus_typhoon_intel', { eventId: 'cyclone:1001322' });
  assert.deepEqual(body.intel.confidence, { grade: 'HIGH' });
  assert.ok(!('coverage' in body.intel));
  assert.deepEqual(body.intel.missingSections, ['anomaly']);
  assert.equal(body.intel.current.values.find((v) => v.key === 'maxWind').value, 35);
  const bad = (await call('earthus_typhoon_intel', { eventId: '../../etc' })).body;
  assert.equal(bad.intel, null, '경로 조작을 막는다');
});

test('배지 설명은 EVIDENCE_KIND 10종', async () => {
  const { body } = await call('earthus_explain_evidence');
  assert.equal(body.kinds.length, 10);
  assert.match(body.kinds.find((k) => k.kind === 'SIMULATION').ko[2], /대피·안전 판단/);
});

test('모르는 도구는 오류로, 모르는 메서드는 JSON-RPC 오류로', async () => {
  assert.equal((await call('earthus_run_simulation')).isError, true);
  const r = await mcp.handle({ jsonrpc: '2.0', id: 9, method: 'resources/list' });
  assert.equal(r.error.code, -32601);
});

test('stdio 로 실제 대화가 된다 — initialize → tools/list', async () => {
  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, EARTHUS_MCP_NO_STDIO: '' }, stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = [];
  child.stdout.on('data', (d) => lines.push(...String(d).split('\n').filter(Boolean)));
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: mcp.PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '0' } } })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
  await new Promise((res) => { const t = setInterval(() => { if (lines.length >= 2) { clearInterval(t); res(); } }, 50); setTimeout(() => { clearInterval(t); res(); }, 8000); });
  child.kill();
  const [init, list] = lines.map((l) => JSON.parse(l));
  assert.equal(init.result.serverInfo.name, 'earthus');
  assert.equal(list.result.tools.length, 3);
});
