#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'prototype/js/admin-health.js'), 'utf8');
const { normalizeCollectorHealth } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const health = normalizeCollectorHealth({
  schema: 2,
  generated: '2026-08-14T00:00:00Z',
  revision: 'fixture',
  operationalOverall: 'AGING',
  summary: '3개 중 정상 1개',
  limitations: ['CloudWatch UNKNOWN'],
  items: [
    { state: 'ok', operationalState: 'HEALTHY' },
    { state: 'late', operationalState: 'PARTIAL' },
    { state: 'missing' },
  ],
});

assert.equal(health.operationalOverall, 'AGING');
assert.equal(health.counts.HEALTHY, 1);
assert.equal(health.counts.PARTIAL, 1);
assert.equal(health.counts.UNKNOWN, 1);
assert.equal(health.items.length, 3);

const html = fs.readFileSync(path.join(root, 'prototype/admin.html'), 'utf8');
assert.match(html, /id="healthCard" hidden/);
assert.match(html, /id="memberCard" hidden/);
assert.match(html, /id="recentCard" hidden/);
assert.match(html, /showCollectorHealth\(\)/);
assert.match(html, /known[\s\S]+showCollectorHealth\(\)/);
assert.doesNotMatch(html, /contentsdalur@gmail\.com/);
assert.doesNotMatch(html, /Supabase 키가 없습니다/);
assert.doesNotMatch(html, /<div class="n" id="n(?:All|Paid|Found|Wait)">—<\/div>/);
assert.doesNotMatch(html, /tb\.innerHTML\s*=/);
assert.match(source, /HEALTHY[\s\S]+AGING[\s\S]+STALE[\s\S]+PARTIAL[\s\S]+FAILED[\s\S]+POLICY_BLOCKED[\s\S]+UNKNOWN/);
assert.match(source, /quota[\s\S]+estimatedCost/);
assert.doesNotMatch(source, /innerHTML\s*=/);

console.log('N1 admin health tests: 20 passed');
