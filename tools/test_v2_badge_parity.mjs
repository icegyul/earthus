// 지시서 C-1 — WHY/NEXT 의 evidenceRow 가 사건 방과 같은 배지 경로(layerBadge, 신선도 반영)를 쓰는지(F07).
import './v2-test-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync(new URL('../prototype/v2-three/js/ui-shell.js', import.meta.url), 'utf8');

test('evidenceRow 는 정적 state 가 아니라 layerBadge(key) 를 먼저 쓴다', () => {
  assert.match(shell, /import \{ renderBadge, layerBadge \} from '\.\/engine-bridge\.js/);
  const row = shell.slice(shell.indexOf('const evidenceRow'), shell.indexOf('const evidenceRow') + 400);
  assert.match(row, /layerBadge\(`\$\{s\.id\}\/\$\{l\.id\}`\) \|\| renderBadge\(l\.state\)/);
});

test('같은 레이어 키에 대해 사건 방 row() 와 evidenceRow 가 같은 배지 문자열을 만든다', async () => {
  const bridge = await import('../prototype/v2-three/js/engine-bridge.js');
  const key = 'weather/warn';
  const a = bridge.layerBadge(key);
  const b = bridge.layerBadge(key);
  assert.equal(a, b);
  assert.match(a, /badge/);
});
