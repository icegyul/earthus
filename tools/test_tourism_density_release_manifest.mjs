#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, chmod } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(os.tmpdir(), 'earthus-tourism-density-release-'));
const awsLog = path.join(temp, 'aws-calls.jsonl');
const fakeAws = path.join(temp, 'aws');
await writeFile(fakeAws, `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
appendFileSync(process.env.EARTHUS_FAKE_AWS_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.argv[2] === 'cloudfront') process.stdout.write('{"Invalidation":{"Id":"FAKE"}}\\n');
`, 'utf8');
await chmod(fakeAws, 0o755);

const result = spawnSync('bash', [path.join(root, 'tools/deploy_tourism_density.sh')], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    PATH: `${temp}${path.delimiter}${process.env.PATH || ''}`,
    EARTHUS_FAKE_AWS_LOG: awsLog,
  },
});
assert.equal(result.status, 0,
  `deploy script exit ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

const calls = (await readFile(awsLog, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
const uploads = [
  ['index.html', 'text/html; charset=utf-8'],
  ['sw.js', 'text/javascript; charset=utf-8'],
  ['css/tourism-flow.css', 'text/css; charset=utf-8'],
  ['css/v8-shell.css', 'text/css; charset=utf-8'],
  ['js/tourism-flow-contract.js', 'text/javascript; charset=utf-8'],
  ['js/tourism-density-grid.js', 'text/javascript; charset=utf-8'],
  ['js/tourism-density-labels.js', 'text/javascript; charset=utf-8'],
  ['js/layers/tourism-flow.js', 'text/javascript; charset=utf-8'],
  ['js/layers/registry.js', 'text/javascript; charset=utf-8'],
  ['js/i18n.js', 'text/javascript; charset=utf-8'],
  ['js/layerbar.js', 'text/javascript; charset=utf-8'],
  ['js/main.js', 'text/javascript; charset=utf-8'],
  ['js/ui-tourism.js', 'text/javascript; charset=utf-8'],
  ['js/ui-source.js', 'text/javascript; charset=utf-8'],
  ['js/v8/provenance-dock.js', 'text/javascript; charset=utf-8'],
];

const expectedUploadCalls = uploads.map(([publicPath, contentType]) => [
  's3', 'cp', path.join(root, 'prototype', publicPath),
  `s3://earthus-cache-kr/app/${publicPath}`,
  '--region', 'us-east-2',
  '--content-type', contentType,
  '--cache-control', 'no-cache',
  '--metadata-directive', 'REPLACE',
  '--only-show-errors',
]);
assert.deepEqual(calls.slice(0, -1), expectedUploadCalls,
  'deploy must upload exactly the scoped tourism-density manifest with explicit MIME/no-cache');

assert.deepEqual(calls.at(-1), [
  'cloudfront', 'create-invalidation',
  '--distribution-id', 'E193CZEBLWEB56',
  '--paths', '/', ...uploads.map(([publicPath]) => `/${publicPath}`),
  '--output', 'json',
], 'deploy must invalidate only the root alias and exact scoped public paths');
assert.equal(calls.length, uploads.length + 1, 'no extra aws calls are allowed');

console.log(`tourism density release manifest: PASS (${uploads.length} scoped uploads)`);
