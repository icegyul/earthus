import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));const root=path.resolve(here,'../..');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const files=walk(path.join(root,'prototype','js','earthus2')).concat(walk(path.join(root,'prototype','v2'))).filter(f=>/\.(js|html|css)$/.test(f));
const content=files.map(f=>[f,fs.readFileSync(f,'utf8')]);
test('v2 code never constructs a second Cesium Viewer',()=>{for(const[f,s]of content)assert.equal(/new\s+Cesium\.Viewer\s*\(/.test(s),false,f);});
test('v2 code does not use clampToGround',()=>{for(const[f,s]of content)assert.equal(s.includes('clampToGround'),false,f);});
test('v2 accelerator modules do not add endless setInterval animation',()=>{for(const[f,s]of content)if(f.includes(`${path.sep}earthus2${path.sep}`))assert.equal(/setInterval\s*\(/.test(s),false,f);});
test('v2 index is isolated and noindex',()=>{const s=fs.readFileSync(path.join(root,'prototype','v2','index.html'),'utf8');assert.match(s,/noindex,nofollow/);assert.equal(/type="module"/.test(s)||/import\s*\(/.test(s),true,'v2 index must boot as ES module or dynamic module import');});
test('v2 index does not script-include root 1.0 runtime',()=>{const s=fs.readFileSync(path.join(root,'prototype','v2','index.html'),'utf8');assert.equal(/<script[^>]+src="\.\.\/js\//.test(s),false,'v2 must not load prototype/js 1.0 scripts directly');});
