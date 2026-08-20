import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../aws/configure-tourism-flow-operations.sh', import.meta.url), 'utf8');

assert.match(source, /tourism-flow-kto-visitors-daily/);
assert.match(source, /cron\(35 19 \* \* \? \*\)/);
assert.match(source, /KTO_VISITORS_DAILY/);
assert.match(source, /--state DISABLED/);
assert.match(source, /KTO P0 Smoke[^\n]*통과/);
assert.doesNotMatch(source, /DATA_GO_KR_SERVICE_KEY\s*=/);

console.log('KTO EventBridge operations config: PASS');
