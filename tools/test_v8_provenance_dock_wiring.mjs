import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [sourceUi, css, html] = await Promise.all([
  read('prototype/js/ui-source.js'),
  read('prototype/css/v8-shell.css'),
  read('prototype/index.html'),
]);

assert.match(sourceUi, /import \{ attachProvenanceDock \} from '\.\/v8\/provenance-dock\.js'/);
assert.match(sourceUi, /attachProvenanceDock\(this\.root\)/);
assert.match(css, /#provenanceDock/);
assert.match(css, /#provenanceDock #srcNote\[hidden\]/);
assert.match(css, /\.pd-credits/);
assert.match(css, /@media \(max-width:\s*640px\)/);
assert.match(css, /prefers-reduced-motion/);
assert.match(html, /css\/v8-shell\.css\?v=/);

console.log('EARTHUS v8 provenance dock wiring: PASS');
